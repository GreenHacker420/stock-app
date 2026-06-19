import axios from "axios";
import crypto from "crypto";
import prisma from "../lib/db.js";
import { getWaCredentials } from "../lib/wa-cache.js";
import { getSignedMediaUrl, uploadToS3 } from "../lib/wa-media.js";
import { validateWhatsAppMedia } from "./whatsapp.media-policy.js";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

const ASSET_KIND_BY_MESSAGE_KIND = {
  image: "IMAGE",
  video: "VIDEO",
  audio: "AUDIO",
  document: "DOCUMENT",
  sticker: "STICKER",
};

export async function getPublicAsset(asset) {
  if (!asset) return null;

  let url = asset.remoteUrl || null;
  if (asset.storageKey && asset.status === "READY") {
    url = await getSignedMediaUrl(asset.storageKey);
  }

  return {
    id: asset.id,
    kind: asset.kind,
    status: asset.status,
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    size: asset.sizeBytes == null ? undefined : Number(asset.sizeBytes),
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    url,
  };
}

export async function serializeMessageWithAsset(message) {
  if (!message) return message;
  const { asset, ...safeMessage } = message;
  return {
    ...safeMessage,
    asset: await getPublicAsset(asset),
  };
}

export async function resolveOutboundMediaAsset({ shopId, message }) {
  if (!ASSET_KIND_BY_MESSAGE_KIND[message.kind]) {
    return { assetId: null, message };
  }

  if (message.link) {
    const asset = await prisma.asset.create({
      data: {
        shopId,
        kind: ASSET_KIND_BY_MESSAGE_KIND[message.kind],
        source: "WHATSAPP_OUTBOUND",
        status: "READY",
        remoteUrl: message.link,
        mimeType: message.mimeType || "application/octet-stream",
        fileName: message.kind === "document" ? message.filename : undefined,
        readyAt: new Date(),
      },
    });
    return {
      assetId: asset.id,
      message,
    };
  }

  const asset = await prisma.asset.findFirst({
    where: {
      id: message.assetId,
      shopId,
      status: "READY",
    },
  });
  if (!asset) {
    throw new Error("Media asset was not found, is not ready, or belongs to another shop");
  }

  const expectedKind = ASSET_KIND_BY_MESSAGE_KIND[message.kind];
  if (expectedKind !== asset.kind) {
    throw new Error(`Media asset kind ${asset.kind} cannot be sent as ${message.kind}`);
  }
  const providerReference = asset.externalProvider === "META_WHATSAPP" && asset.externalId
    ? { id: asset.externalId }
    : asset.remoteUrl
      ? { link: asset.remoteUrl }
      : null;
  if (!providerReference) throw new Error("Media asset is not available in WhatsApp");

  return {
    assetId: asset.id,
    message: {
      ...message,
      ...providerReference,
      mimeType: asset.mimeType,
      filename: message.kind === "document"
        ? message.filename || asset.fileName || undefined
        : undefined,
    },
  };
}

export async function uploadWhatsAppMedia({ shopId, createdById, kind, file }) {
  const parsedKind = validateWhatsAppMedia({ kind, file });
  const integration = await getWaCredentials(shopId);
  if (!integration) {
    throw new Error("WhatsApp integration not connected for this shop");
  }

  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `shops/${shopId}/assets/${crypto.randomUUID()}-${safeName}`;
  const checksumSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const asset = await prisma.asset.create({
    data: {
      shopId,
      createdById,
      kind: ASSET_KIND_BY_MESSAGE_KIND[parsedKind],
      source: "WHATSAPP_OUTBOUND",
      status: "UPLOADING",
      mimeType: file.mimetype,
      fileName: file.originalname,
      sizeBytes: BigInt(file.size),
      checksumSha256,
    },
  });

  try {
    const stored = await uploadToS3(file.buffer, storageKey, file.mimetype);
    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        storageProvider: "S3",
        storageKey: stored.key,
        storageBucket: stored.bucket,
      },
    });

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", file.mimetype);
    form.append(
      "file",
      new Blob([file.buffer], { type: file.mimetype }),
      file.originalname,
    );

    const response = await axios.post(
      `${BASE_URL}/${integration.phoneNumberId}/media`,
      form,
      {
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
        },
        maxBodyLength: Infinity,
      },
    );

    const readyAsset = await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: "READY",
        externalProvider: "META_WHATSAPP",
        externalId: response.data.id,
        readyAt: new Date(),
      },
    });

    return getPublicAsset(readyAsset);
  } catch (error) {
    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: "FAILED",
        errorMessage: error.response?.data?.error?.message || error.message,
      },
    });
    throw error;
  }
}
