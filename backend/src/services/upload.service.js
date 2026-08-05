import crypto from "crypto";
import prisma from "../lib/db.js";
import { uploadBufferToS3 } from "../lib/s3-storage.js";
import { createPresignedPutUrl, verifyS3Object, getBucketName } from "./s3.service.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";

export const PRODUCT_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

export async function uploadProductImageAsset({
  shopId,
  createdById,
  categoryPath,
  itemPath,
  file,
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
    const stored = await uploadBufferToS3({
      body: file.buffer,
      key: storageKey,
      mimeType: file.mimetype,
      cacheControl: "public, max-age=31536000, immutable",
    });

    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: "READY",
        storageProvider: "S3",
        storageBucket: stored.bucket,
        storageKey: stored.key,
        readyAt: new Date(),
      },
    });

    return {
      assetId: asset.id,
      bucket: stored.bucket,
      key: stored.key,
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

export async function createPresignedUploadIntent(user, { shopId, domain = "OTHER", kind = "IMAGE", fileName, mimeType, sizeBytes }) {
  await assertShopAccess(user, shopId);
  const maxAllowedBytes = 15 * 1024 * 1024;
  if (sizeBytes && Number(sizeBytes) > maxAllowedBytes) {
    throw new ApiError(400, "File size exceeds maximum allowed limit (15MB)");
  }

  const asset = await prisma.asset.create({
    data: {
      shopId,
      createdById: user.id,
      domain,
      kind,
      source: "INTERNAL",
      status: "UPLOADING",
      mimeType,
      fileName,
      sizeBytes: sizeBytes ? BigInt(sizeBytes) : undefined,
    },
  });

  const baseName = safeFileName(fileName, "file");
  const storageKey = `shops/${shopId}/${domain.toLowerCase()}/${asset.id}/${baseName}`;
  const bucketName = getBucketName();

  const presigned = await createPresignedPutUrl({
    key: storageKey,
    mimeType,
    expiresInSeconds: 600,
    bucket: bucketName,
  });

  await prisma.asset.update({
    where: { id: asset.id },
    data: {
      storageProvider: "S3",
      storageBucket: presigned.bucket,
      storageKey: presigned.key,
    },
  });

  return {
    assetId: asset.id,
    uploadUrl: presigned.uploadUrl,
    bucket: presigned.bucket,
    key: presigned.key,
    expiresInSeconds: 600,
  };
}

export async function completeUploadIntent(user, { assetId, shopId }) {
  await assertShopAccess(user, shopId);
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, shopId },
  });
  if (!asset) {
    throw new ApiError(404, "Asset intent not found");
  }

  if (asset.status === "READY") {
    return { success: true, asset };
  }

  if (asset.status !== "UPLOADING") {
    throw new ApiError(400, `Asset is not in UPLOADING status (status: ${asset.status})`);
  }

  const verification = await verifyS3Object({
    key: asset.storageKey,
    bucket: asset.storageBucket,
  });

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
