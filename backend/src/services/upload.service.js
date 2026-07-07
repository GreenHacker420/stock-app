import crypto from "crypto";
import prisma from "../lib/db.js";
import { uploadBufferToS3 } from "../lib/s3-storage.js";
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
      kind: "IMAGE",
      source: "INTERNAL",
      status: "UPLOADING",
      mimeType: file.mimetype,
      fileName: file.originalname,
      sizeBytes: BigInt(file.size),
      checksumSha256,
      metadata: {
        domain: "product",
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
