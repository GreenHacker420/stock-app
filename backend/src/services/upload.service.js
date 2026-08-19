import crypto from "crypto";
import { z } from "zod";
import prisma from "../lib/db.js";
import { uploadBuffer, createUploadSession, getObjectPublicUrl, deleteObject } from "../lib/storage-manager.js";
import { getOneDriveSharingUrl, deleteOneDriveObject, downloadOneDriveObjectBuffer } from "../lib/onedrive-storage.js";
import { createPresignedPutUrl, verifyS3Object, getBucketName, deleteS3Object, getPublicS3ObjectUrl } from "./s3.service.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";

export const PRODUCT_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Domain-based MIME allowlists
const DOMAIN_MIME_ALLOWLISTS = {
  PRODUCT: new Set(["image/jpeg", "image/png", "image/webp"]),
  CUSTOMER_LEDGER: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  PAYMENT: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  EXPENSE: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  DISPATCH: new Set(["image/jpeg", "image/png", "application/pdf"]),
  SALE_INVOICE: new Set(["application/pdf", "image/jpeg", "image/png"]),
  OTHER: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]),
};

const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

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
      kind: file.mimetype.startsWith("image/") ? "IMAGE" : "DOC",
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

    const updated = await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: "READY",
        storageProvider: stored.storageProvider,
        storageBucket: stored.storageBucket,
        storageKey: stored.storageKey,
        externalId: stored.externalId,
        remoteUrl: stored.url,
        readyAt: new Date(),
      },
    });

    return {
      assetId: updated.id,
      storageProvider: updated.storageProvider,
      bucket: updated.storageBucket,
      key: updated.storageKey,
      url: updated.remoteUrl,
      fileName: updated.fileName,
      mimeType: updated.mimeType,
      sizeBytes: Number(updated.sizeBytes),
      checksumSha256,
      status: updated.status,
    };
  } catch (error) {
    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: "FAILED",
        errorMessage: error?.message || "Direct upload failed",
      },
    }).catch(() => {});
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

    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: "READY",
        storageProvider: stored.storageProvider,
        storageBucket: stored.storageBucket,
        storageKey: stored.storageKey,
        externalId: stored.externalId,
        remoteUrl: stored.url,
        readyAt: new Date(),
      },
    });

    return {
      assetId: asset.id,
      storageProvider: stored.storageProvider,
      bucket: stored.storageBucket,
      key: stored.storageKey,
      url: stored.url,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      checksumSha256,
    };
  } catch (error) {
    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: "FAILED",
        errorMessage: error?.message || "Product photo upload failed",
      },
    }).catch(() => {});
    throw error;
  }
}

export async function createPresignedUploadIntent(user, {
  shopId,
  domain = "OTHER",
  kind = "IMAGE",
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
  if (!z.hash("sha256").safeParse(checksumSha256).success) {
    throw new ApiError(400, "checksumSha256 is required and must be a 64-character hex SHA-256 digest");
  }

  // Validate MIME against domain allowlist
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
    domain,
    provider,
    expiresInSeconds: 600,
  });

  const asset = await prisma.asset.create({
    data: {
      shopId,
      createdById: user.id,
      domain,
      kind,
      source: "INTERNAL",
      status: "UPLOADING",
      storageProvider: session.storageProvider,
      storageBucket: session.bucket,
      storageKey: session.key,
      mimeType,
      fileName,
      sizeBytes: BigInt(sizeBytes),
      checksumSha256: checksumSha256.toLowerCase(),
    },
  });

  return {
    assetId: asset.id,
    storageProvider: session.storageProvider,
    uploadUrl: session.uploadUrl,
    bucket: session.bucket,
    key: session.key,
    expiresInSeconds: 600,
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

  if (asset.storageProvider === "ONEDRIVE") {
    const publicUrl = await getOneDriveSharingUrl(asset.storageKey, asset.externalId);
    const updated = await prisma.asset.update({
      where: { id: assetId },
      data: {
        status: "READY",
        remoteUrl: publicUrl,
        readyAt: new Date(),
        errorMessage: null,
      },
    });
    return { success: true, asset: updated };
  }

  let verification;
  try {
    verification = await verifyS3Object({ key: asset.storageKey, bucket: asset.storageBucket });
  } catch (err) {
    // Mark the asset FAILED and rethrow
    await prisma.asset.update({
      where: { id: assetId },
      data: { status: "FAILED", errorMessage: `S3 verification failed: ${err.message}` },
    }).catch(() => {});
    throw err;
  }

  // Exact size match — no tolerance
  if (!verification.isMock && asset.sizeBytes != null && verification.contentLength != null) {
    const declaredSize = Number(asset.sizeBytes);
    const actualSize = Number(verification.contentLength);
    if (actualSize !== declaredSize) {
      await deleteS3Object({ key: asset.storageKey, bucket: asset.storageBucket }).catch(() => {});
      await prisma.asset.update({
        where: { id: assetId },
        data: { status: "FAILED", errorMessage: `File size mismatch: declared ${declaredSize}B, uploaded ${actualSize}B` },
      }).catch(() => {});
      throw new ApiError(400, `File size mismatch: declared ${declaredSize} bytes, uploaded ${actualSize} bytes. Upload rejected.`);
    }
  }

  // MIME mismatch check
  if (!verification.isMock && asset.mimeType && verification.contentType) {
    const declaredMime = asset.mimeType.split(";")[0].trim();
    const actualMime = verification.contentType.split(";")[0].trim();
    if (declaredMime !== actualMime) {
      await deleteS3Object({ key: asset.storageKey, bucket: asset.storageBucket }).catch(() => {});
      await prisma.asset.update({
        where: { id: assetId },
        data: { status: "FAILED", errorMessage: `MIME type mismatch: declared ${declaredMime}, uploaded ${actualMime}` },
      }).catch(() => {});
      throw new ApiError(400, `MIME type mismatch: declared "${declaredMime}", actual "${actualMime}". Upload rejected.`);
    }
  }

  // Checksum verification when S3 returns checksum metadata
  if (!verification.isMock && asset.checksumSha256 && verification.checksumSha256) {
    const expected = String(asset.checksumSha256).toLowerCase();
    const actual = String(verification.checksumSha256).toLowerCase().replace(/[^a-f0-9]/g, "");
    if (actual && actual !== expected) {
      await deleteS3Object({ key: asset.storageKey, bucket: asset.storageBucket }).catch(() => {});
      await prisma.asset.update({
        where: { id: assetId },
        data: { status: "FAILED", errorMessage: `Checksum mismatch: declared ${expected}, uploaded ${actual}` },
      }).catch(() => {});
      throw new ApiError(400, "Checksum mismatch. Upload rejected.");
    }
  }

  const updated = await prisma.asset.update({
    where: { id: assetId },
    data: {
      status: "READY",
      sizeBytes: verification.contentLength ? BigInt(verification.contentLength) : asset.sizeBytes,
      mimeType: verification.contentType || asset.mimeType,
      readyAt: new Date(),
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
  if (!asset.storageKey) throw new ApiError(400, "Asset has no storage key");

  const downloadUrl = await getObjectPublicUrl({
    key: asset.storageKey,
    provider: asset.storageProvider,
    externalId: asset.externalId,
    fallbackUrl: asset.remoteUrl,
  });
  if (!downloadUrl) throw new ApiError(500, "Failed to generate download URL");

  return { downloadUrl, expiresInSeconds: 300 };
}

export async function requestAssetDeletion(user, { assetId, shopId, reason }) {
  await assertShopAccess(user, shopId);
  const asset = await prisma.asset.findFirst({ where: { id: assetId, shopId } });
  if (!asset) throw new ApiError(404, "Asset not found");
  if (["REQUESTED", "PROCESSING", "COMPLETED"].includes(asset.deletionStatus)) {
    return { success: true, asset, alreadyRequested: true };
  }

  // Financial evidence protection
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

  // Enqueue async deletion (non-blocking; failures are retried by worker)
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
  if (!asset || asset.deletedAt || asset.status !== "READY") {
    return res.status(404).json({ success: false, message: "Asset not found" });
  }

  res.setHeader("Content-Type", asset.mimeType || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");

  if (asset.storageProvider === "ONEDRIVE") {
    try {
      const buffer = await downloadOneDriveObjectBuffer(asset.storageKey, asset.externalId);
      return res.send(buffer);
    } catch (err) {
      console.error(`[Asset Proxy] Error fetching OneDrive asset ${assetId}:`, err.message);
      try {
        const freshUrl = await getOneDriveSharingUrl(asset.storageKey, asset.externalId);
        if (freshUrl) return res.redirect(302, freshUrl);
      } catch (_) {}
      return res.status(502).json({ success: false, message: "Failed to stream asset from OneDrive" });
    }
  }

  if (asset.remoteUrl && !asset.remoteUrl.includes("tempauth=")) {
    return res.redirect(302, asset.remoteUrl);
  }
  const publicUrl = getPublicS3ObjectUrl(asset.storageKey);
  return res.redirect(302, publicUrl);
}
