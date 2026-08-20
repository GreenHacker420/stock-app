import crypto from "crypto";
import prisma from "../lib/db.js";
import {
  uploadBuffer,
  createUploadSession,
  getObjectDownloadUrl,
  getObjectThumbnailUrl,
  verifyObject,
  deleteObject,
} from "../lib/storage-manager.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";

export const PRODUCT_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const DOMAIN_MIME_ALLOWLISTS = {
  PRODUCT: new Set(["image/jpeg", "image/png", "image/webp"]),
  CUSTOMER_LEDGER: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  PAYMENT: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  EXPENSE: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  DISPATCH: new Set(["image/jpeg", "image/png", "application/pdf"]),
  SALE_INVOICE: new Set(["application/pdf", "image/jpeg", "image/png"]),
  DAILY_SUMMARY: new Set(["application/pdf", "text/plain"]),
  WHATSAPP: new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "video/mp4",
    "video/3gpp",
    "audio/aac",
    "audio/amr",
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg",
  ]),
  OTHER: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]),
};

const MAX_SIZE_BYTES = 15 * 1024 * 1024;
const DOWNLOAD_URL_TTL_SECONDS = 300;

function safeFileName(value, fallback = "upload") {
  return String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || fallback;
}

function extensionForMimeType(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function normalizeAssetKind(kind, mimeType) {
  if (kind === "DOC") return "DOCUMENT";
  if (kind) return kind;
  if (mimeType?.startsWith("image/")) return "IMAGE";
  if (mimeType?.startsWith("video/")) return "VIDEO";
  if (mimeType?.startsWith("audio/")) return "AUDIO";
  return "DOCUMENT";
}

function validateChecksumSha256(checksumSha256) {
  const normalized = String(checksumSha256 || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new ApiError(400, "checksumSha256 is required and must be a 64-character hex SHA-256 digest");
  }
  return normalized;
}

function isPersistableRemoteUrl(domain, stored) {
  return domain === "PRODUCT" && stored.storageProvider === "S3";
}

export function isPublicAsset(asset) {
  return Boolean(
    asset &&
    asset.domain === "PRODUCT" &&
    asset.kind === "IMAGE" &&
    asset.status === "READY" &&
    !asset.deletedAt
  );
}

export function assertProductImageFile(file) {
  if (!file) throw new ApiError(400, "Image file is required");
  if (!PRODUCT_IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw new ApiError(400, "Only JPG, PNG, and WebP product photos are supported");
  }
}

export function buildProductImageKey({ shopId, categoryPath, itemPath, file }) {
  const extension = extensionForMimeType(file.mimetype);
  const originalBaseName = safeFileName(file.originalname, "photo").replace(/\.[^.]+$/, "");
  const fileName = `${Date.now()}-${crypto.randomUUID()}-${originalBaseName}.${extension}`;
  return [
    "shops",
    shopId,
    "categories",
    categoryPath || "uncategorised",
    "items",
    itemPath || "new",
    fileName,
  ].join("/");
}

async function markAssetFailed(assetId, message) {
  await prisma.asset.update({
    where: { id: assetId },
    data: { status: "FAILED", errorMessage: message },
  }).catch(() => {});
}

async function deleteRejectedUpload(asset) {
  if (!asset.storageKey || !asset.storageProvider) return;
  await deleteObject({
    key: asset.storageKey,
    provider: asset.storageProvider,
    externalId: asset.externalId,
  }).catch(() => {});
}

export async function uploadDirectAsset({ user, shopId, domain = "OTHER", file, provider }) {
  await assertShopAccess(user, shopId);
  if (!file) throw new ApiError(400, "File is required");

  const allowedMimes = DOMAIN_MIME_ALLOWLISTS[domain] || DOMAIN_MIME_ALLOWLISTS.OTHER;
  if (!allowedMimes.has(file.mimetype)) {
    throw new ApiError(400, `MIME type "${file.mimetype}" is not allowed for domain "${domain}". Allowed: ${[...allowedMimes].join(", ")}`);
  }

  const baseName = safeFileName(file.originalname, "file");
  const storageKey = `shops/${shopId}/${domain.toLowerCase()}/${crypto.randomUUID()}-${baseName}`;
  const checksumSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");

  const asset = await prisma.asset.create({
    data: {
      shopId,
      createdById: user.id,
      domain,
      kind: normalizeAssetKind(null, file.mimetype),
      source: "INTERNAL",
      status: "UPLOADING",
      mimeType: file.mimetype,
      fileName: file.originalname,
      sizeBytes: BigInt(file.size),
      checksumSha256,
    },
  });

  try {
    const stored = await uploadBuffer({
      body: file.buffer,
      key: storageKey,
      mimeType: file.mimetype,
      domain,
      provider,
    });
    const remoteUrl = isPersistableRemoteUrl(domain, stored) ? stored.url : null;

    const updated = await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: "READY",
        storageProvider: stored.storageProvider,
        storageBucket: stored.storageBucket,
        storageKey: stored.storageKey,
        externalId: stored.externalId,
        remoteUrl,
        readyAt: new Date(),
      },
    });

    return {
      assetId: updated.id,
      storageProvider: updated.storageProvider,
      bucket: updated.storageBucket,
      key: updated.storageKey,
      url: remoteUrl,
      fileName: updated.fileName,
      mimeType: updated.mimeType,
      sizeBytes: Number(updated.sizeBytes),
      checksumSha256,
      status: updated.status,
    };
  } catch (error) {
    await markAssetFailed(asset.id, error?.message || "Direct upload failed");
    throw error;
  }
}

export async function uploadProductImageAsset({
  shopId,
  createdById,
  categoryPath,
  itemPath,
  file,
  provider,
}) {
  assertProductImageFile(file);

  const storageKey = buildProductImageKey({ shopId, categoryPath, itemPath, file });
  const checksumSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");

  const asset = await prisma.asset.create({
    data: {
      shopId,
      createdById,
      domain: "PRODUCT",
      kind: "IMAGE",
      source: "INTERNAL",
      status: "UPLOADING",
      mimeType: file.mimetype,
      fileName: file.originalname,
      sizeBytes: BigInt(file.size),
      checksumSha256,
      metadata: {
        domain: "PRODUCT",
        categoryPath: categoryPath || "uncategorised",
        itemPath: itemPath || "new",
      },
    },
  });

  try {
    const stored = await uploadBuffer({
      body: file.buffer,
      key: storageKey,
      mimeType: file.mimetype,
      domain: "PRODUCT",
      provider,
    });
    const remoteUrl = isPersistableRemoteUrl("PRODUCT", stored) ? stored.url : null;

    const updated = await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: "READY",
        storageProvider: stored.storageProvider,
        storageBucket: stored.storageBucket,
        storageKey: stored.storageKey,
        externalId: stored.externalId,
        remoteUrl,
        readyAt: new Date(),
      },
    });

    const url = remoteUrl || await getObjectThumbnailUrl({
      key: updated.storageKey,
      provider: updated.storageProvider,
      externalId: updated.externalId,
      size: "large",
    });

    return {
      assetId: updated.id,
      storageProvider: updated.storageProvider,
      bucket: updated.storageBucket,
      key: updated.storageKey,
      url,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      checksumSha256,
    };
  } catch (error) {
    await markAssetFailed(asset.id, error?.message || "Product photo upload failed");
    throw error;
  }
}

export async function createPresignedUploadIntent(user, {
  shopId,
  domain = "OTHER",
  kind,
  fileName,
  mimeType,
  sizeBytes,
  checksumSha256,
  provider,
}) {
  await assertShopAccess(user, shopId);

  if (!fileName) throw new ApiError(400, "fileName is required");
  if (!mimeType) throw new ApiError(400, "mimeType is required");
  if (!sizeBytes || Number(sizeBytes) <= 0) {
    throw new ApiError(400, "sizeBytes is required and must be positive");
  }
  if (Number(sizeBytes) > MAX_SIZE_BYTES) {
    throw new ApiError(400, "File size exceeds maximum allowed limit (15MB)");
  }

  const normalizedChecksum = validateChecksumSha256(checksumSha256);
  const allowedMimes = DOMAIN_MIME_ALLOWLISTS[domain] || DOMAIN_MIME_ALLOWLISTS.OTHER;
  if (!allowedMimes.has(mimeType)) {
    throw new ApiError(400, `MIME type "${mimeType}" is not allowed for domain "${domain}". Allowed: ${[...allowedMimes].join(", ")}`);
  }

  const baseName = safeFileName(fileName, "file");
  const storageKey = `shops/${shopId}/${domain.toLowerCase()}/${crypto.randomUUID()}-${baseName}`;

  const session = await createUploadSession({
    key: storageKey,
    mimeType,
    sizeBytes: Number(sizeBytes),
    checksumSha256: normalizedChecksum,
    domain,
    provider,
    expiresInSeconds: 600,
  });

  const asset = await prisma.asset.create({
    data: {
      shopId,
      createdById: user.id,
      domain,
      kind: normalizeAssetKind(kind, mimeType),
      source: "INTERNAL",
      status: "UPLOADING",
      storageProvider: session.storageProvider,
      storageBucket: session.bucket,
      storageKey: session.key,
      mimeType,
      fileName,
      sizeBytes: BigInt(sizeBytes),
      checksumSha256: normalizedChecksum,
    },
  });

  return {
    assetId: asset.id,
    storageProvider: session.storageProvider,
    uploadUrl: session.uploadUrl,
    bucket: session.bucket,
    key: session.key,
    expiresInSeconds: session.expiresInSeconds ?? 600,
    expiry: session.expiry || null,
    headers: session.headers || {},
    isMock: session.isMock || false,
  };
}

export async function completeUploadIntent(user, { assetId, shopId }) {
  await assertShopAccess(user, shopId);
  const asset = await prisma.asset.findFirst({ where: { id: assetId, shopId } });
  if (!asset) throw new ApiError(404, "Asset intent not found");

  if (asset.status === "READY") return { success: true, asset };
  if (asset.status !== "UPLOADING") {
    throw new ApiError(400, `Asset is not in UPLOADING status (status: ${asset.status})`);
  }
  if (!asset.storageProvider || !asset.storageKey) {
    throw new ApiError(400, "Asset upload session is missing storage metadata");
  }

  let verification;
  try {
    verification = await verifyObject({
      key: asset.storageKey,
      bucket: asset.storageBucket,
      provider: asset.storageProvider,
      externalId: asset.externalId,
    });
  } catch (err) {
    await markAssetFailed(assetId, `Storage verification failed: ${err.message}`);
    throw err;
  }

  if (!verification.isMock && asset.sizeBytes != null && verification.contentLength != null) {
    const declaredSize = Number(asset.sizeBytes);
    const actualSize = Number(verification.contentLength);
    if (actualSize !== declaredSize) {
      await deleteRejectedUpload(asset);
      await markAssetFailed(assetId, `File size mismatch: declared ${declaredSize}B, uploaded ${actualSize}B`);
      throw new ApiError(400, `File size mismatch: declared ${declaredSize} bytes, uploaded ${actualSize} bytes. Upload rejected.`);
    }
  }

  if (!verification.isMock && asset.mimeType && verification.contentType) {
    const declaredMime = asset.mimeType.split(";")[0].trim();
    const actualMime = verification.contentType.split(";")[0].trim();
    if (declaredMime !== actualMime) {
      await deleteRejectedUpload(asset);
      await markAssetFailed(assetId, `MIME type mismatch: declared ${declaredMime}, uploaded ${actualMime}`);
      throw new ApiError(400, `MIME type mismatch: declared "${declaredMime}", actual "${actualMime}". Upload rejected.`);
    }
  }

  if (!verification.isMock && asset.checksumSha256 && verification.checksumSha256) {
    const expected = String(asset.checksumSha256).toLowerCase();
    const actual = String(verification.checksumSha256).toLowerCase().replace(/[^a-f0-9]/g, "");
    if (actual && actual !== expected) {
      await deleteRejectedUpload(asset);
      await markAssetFailed(assetId, `Checksum mismatch: declared ${expected}, uploaded ${actual}`);
      throw new ApiError(400, "Checksum mismatch. Upload rejected.");
    }
  }

  const updated = await prisma.asset.update({
    where: { id: assetId },
    data: {
      status: "READY",
      externalId: verification.externalId || asset.externalId,
      remoteUrl: asset.domain === "PRODUCT" && asset.storageProvider === "S3"
        ? asset.remoteUrl
        : null,
      sizeBytes: verification.contentLength != null
        ? BigInt(verification.contentLength)
        : asset.sizeBytes,
      mimeType: verification.contentType || asset.mimeType,
      readyAt: new Date(),
      errorMessage: null,
    },
  });

  return { success: true, asset: updated };
}

export async function getAssetDownloadUrl(user, { assetId, shopId }) {
  await assertShopAccess(user, shopId);
  const asset = await prisma.asset.findFirst({ where: { id: assetId, shopId } });
  if (!asset) throw new ApiError(404, "Asset not found");
  if (asset.status !== "READY") throw new ApiError(400, "Asset is not ready for download");
  if (asset.storageDeletedAt || asset.deletionStatus === "COMPLETED") {
    throw new ApiError(410, "Asset storage has been deleted");
  }
  if (!asset.storageKey || !asset.storageProvider) {
    throw new ApiError(400, "Asset has no storage object");
  }

  const delivery = await getObjectDownloadUrl({
    key: asset.storageKey,
    bucket: asset.storageBucket,
    provider: asset.storageProvider,
    externalId: asset.externalId,
    fallbackUrl: asset.remoteUrl,
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
  });
  if (!delivery?.url) throw new ApiError(500, "Failed to generate download URL");

  return {
    downloadUrl: delivery.url,
    expiresInSeconds: delivery.expiresInSeconds ?? null,
  };
}

export async function requestAssetDeletion(user, { assetId, shopId, reason }) {
  await assertShopAccess(user, shopId);
  const asset = await prisma.asset.findFirst({ where: { id: assetId, shopId } });
  if (!asset) throw new ApiError(404, "Asset not found");
  if (["REQUESTED", "PROCESSING", "COMPLETED"].includes(asset.deletionStatus)) {
    return { success: true, asset, alreadyRequested: true };
  }

  const ledgerRefs = await prisma.customerLedgerAttachment.count({ where: { assetId } });
  if (ledgerRefs > 0) {
    throw new ApiError(409, "This file is linked to a financial ledger entry and cannot be deleted.", {
      code: "FINANCIAL_ASSET_REFERENCED",
      referenceCount: ledgerRefs,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.asset.update({
      where: { id: assetId },
      data: {
        deletionStatus: "REQUESTED",
        deleteRequestedAt: new Date(),
        deleteRequestedById: user.id,
        deleteReason: reason || null,
      },
    });

    await tx.assetDeletionOutbox.create({
      data: {
        shopId,
        assetId,
        storageBucket: asset.storageBucket,
        storageKey: asset.storageKey,
        status: "REQUESTED",
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId,
        action: "DELETE_REQUESTED",
        entityType: "ASSET",
        entityId: assetId,
        reason: reason || "Asset delete requested",
      },
    });

    return next;
  });

  try {
    const { enqueueAssetDeletion } = await import("./asset-deletion.queue.js");
    const outbox = await prisma.assetDeletionOutbox.findFirst({
      where: { assetId, status: "REQUESTED" },
      orderBy: { createdAt: "desc" },
    });
    if (outbox) await enqueueAssetDeletion(outbox.id);
  } catch (err) {
    console.error("[AssetDelete] Failed to enqueue deletion job:", err.message);
  }

  return { success: true, asset: updated };
}

export async function streamAssetFile(assetId, res) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!isPublicAsset(asset) || !asset.storageKey || !asset.storageProvider) {
    return res.status(404).json({ success: false, message: "Asset not found" });
  }

  res.setHeader("Cache-Control", "no-store");

  if (asset.storageProvider === "ONEDRIVE") {
    const thumbnailUrl = await getObjectThumbnailUrl({
      key: asset.storageKey,
      provider: asset.storageProvider,
      externalId: asset.externalId,
      size: "large",
    });
    if (thumbnailUrl) return res.redirect(302, thumbnailUrl);
  }

  const delivery = await getObjectDownloadUrl({
    key: asset.storageKey,
    bucket: asset.storageBucket,
    provider: asset.storageProvider,
    externalId: asset.externalId,
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
  });
  if (!delivery?.url) {
    throw new ApiError(500, "Failed to generate asset URL");
  }

  return res.redirect(302, delivery.url);
}
