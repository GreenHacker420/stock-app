import {
  enqueueLedgerMutation,
  getPendingMutations,
  updateMutationStatus,
  clearConfirmedMutations,
  QueuedLedgerMutation,
} from "../database/offlineLedgerQueue";
import {
  postOpeningBalance,
  postLedgerAdjustment,
  createUploadIntent,
  completeAssetUpload,
} from "../api/ledger.api";
import { ApiError } from "../api/client";
import { File } from "expo-file-system";

const PERMANENT_STATUS = new Set([400, 401, 403, 404]);
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function classifyError(error: unknown): "FAILED_RETRYABLE" | "FAILED_PERMANENT" {
  if (error instanceof ApiError) {
    if (PERMANENT_STATUS.has(error.status)) return "FAILED_PERMANENT";
    if (error.status === 409) {
      const msg = String(error.message || "").toLowerCase();
      if (msg.includes("idempotency") || msg.includes("opening balance has already")) {
        return "FAILED_PERMANENT";
      }
      return "FAILED_PERMANENT";
    }
    if (RETRYABLE_STATUS.has(error.status) || error.status >= 500) return "FAILED_RETRYABLE";
    return "FAILED_PERMANENT";
  }
  return "FAILED_RETRYABLE";
}

async function uploadAttachmentsIfNeeded(payload: any): Promise<any> {
  const pending = payload?.pendingLocalAttachments;
  if (!Array.isArray(pending) || pending.length === 0) {
    return payload;
  }

  const uploaded: { assetId: string; purpose?: string; sortOrder?: number }[] = [
    ...(payload.attachmentAssetIds || []),
  ];

  for (const local of pending) {
    const file = new File(local.uri);
    const info = file.info ? await Promise.resolve(file.info()) : null;
    const sizeBytes = Number(info?.size ?? local.sizeBytes);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new Error(`Cannot determine file size for attachment ${local.uri}`);
    }
    if (!local.checksumSha256) {
      throw new Error(`Missing SHA-256 checksum for attachment ${local.uri}`);
    }

    const intent = await createUploadIntent({
      shopId: payload.shopId,
      domain: "CUSTOMER_LEDGER",
      kind: local.kind || "IMAGE",
      fileName: local.fileName,
      mimeType: local.mimeType,
      sizeBytes,
      checksumSha256: local.checksumSha256,
    });

    const uploadTask = file.createUploadTask(intent.uploadUrl, {
      httpMethod: "PUT",
      uploadType: 0, // BINARY_CONTENT
      headers: {
        "Content-Type": local.mimeType,
        ...(intent.headers || {}),
      },
    } as any);
    await uploadTask.uploadAsync();
    await completeAssetUpload(intent.assetId, { shopId: payload.shopId });
    uploaded.push({
      assetId: intent.assetId,
      purpose: local.purpose || "OTHER",
      sortOrder: local.sortOrder ?? uploaded.length,
    });
  }

  return {
    ...payload,
    attachmentAssetIds: uploaded,
    pendingLocalAttachments: undefined,
  };
}

async function submitMutation(mutation: QueuedLedgerMutation, payload: any) {
  if (mutation.type === "OPENING_BALANCE") {
    return postOpeningBalance(mutation.customerId, {
      shopId: mutation.shopId,
      direction: payload.direction,
      amount: payload.amount,
      effectiveAt: payload.effectiveAt,
      notes: payload.notes,
      clientMutationId: mutation.clientMutationId,
      attachmentAssetIds: payload.attachmentAssetIds,
    });
  }
  if (mutation.type === "MANUAL_ADJUSTMENT") {
    return postLedgerAdjustment(mutation.customerId, {
      shopId: mutation.shopId,
      direction: payload.direction,
      amount: payload.amount,
      reason: payload.reason,
      effectiveAt: payload.effectiveAt,
      clientMutationId: mutation.clientMutationId,
      attachmentAssetIds: payload.attachmentAssetIds,
    });
  }
  throw new Error(`Unsupported offline mutation type: ${mutation.type}`);
}

let processing = false;

export async function processLedgerMutationQueue(shopId: string): Promise<{
  processed: number;
  confirmed: number;
  failed: number;
}> {
  if (processing) return { processed: 0, confirmed: 0, failed: 0 };
  processing = true;

  let processed = 0;
  let confirmed = 0;
  let failed = 0;

  try {
    const pending = await getPendingMutations(shopId);
    for (const mutation of pending) {
      // Never silently process reversals offline
      if (mutation.type === "REVERSE_ENTRY") {
        await updateMutationStatus(mutation.id, "FAILED_PERMANENT", "Reversals require connectivity and are not auto-synced");
        failed += 1;
        processed += 1;
        continue;
      }

      try {
        await updateMutationStatus(mutation.id, "UPLOADING_ATTACHMENTS");
        let payload = JSON.parse(mutation.payloadJson);
        payload = await uploadAttachmentsIfNeeded(payload);

        await updateMutationStatus(mutation.id, "SUBMITTING");
        await submitMutation(mutation, {
          ...payload,
          clientMutationId: mutation.clientMutationId,
        });

        await updateMutationStatus(mutation.id, "CONFIRMED");
        confirmed += 1;
      } catch (error: any) {
        const status = classifyError(error);
        await updateMutationStatus(mutation.id, status, error?.message || String(error));
        failed += 1;
      }
      processed += 1;
    }

    await clearConfirmedMutations(shopId);
  } finally {
    processing = false;
  }

  return { processed, confirmed, failed };
}

export async function queueLedgerMutationOrSubmitOnline(opts: {
  online: boolean;
  id: string;
  type: "OPENING_BALANCE" | "MANUAL_ADJUSTMENT";
  shopId: string;
  customerId: string;
  clientMutationId: string;
  payload: any;
  submitOnline: () => Promise<any>;
}): Promise<{ queued: boolean; result?: any }> {
  if (opts.online) {
    try {
      const result = await opts.submitOnline();
      return { queued: false, result };
    } catch (error) {
      if (classifyError(error) !== "FAILED_RETRYABLE") throw error;
    }
  }

  await enqueueLedgerMutation({
    id: opts.id,
    type: opts.type,
    shopId: opts.shopId,
    customerId: opts.customerId,
    clientMutationId: opts.clientMutationId,
    payload: opts.payload,
  });
  return { queued: true };
}
