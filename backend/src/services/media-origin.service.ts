import path from "node:path";

import prisma from "../lib/db.js";
import { getObjectDownloadUrl } from "../lib/storage-manager.js";
import { ApiError } from "../utils/ApiError.js";

type StorageProvider = "S3" | "ONEDRIVE";

export type PublicMediaOrigin = {
  provider: Lowercase<StorageProvider>;
  providerKey: string | null;
  originUrl: string | null;
  visibility: "public";
  mimeType: string;
  filename: string;
  cacheControl: string;
  cacheTag: string;
  contentRevision: number;
};

function safeFilename(value: string | null, assetId: string): string {
  const basename = path.basename(value || `asset-${assetId}`);
  return basename.replace(/[\r\n"]/g, "_").slice(0, 180) || `asset-${assetId}`;
}

function isPublicProductImage(asset: {
  domain: string;
  kind: string;
  mimeType: string;
  status: string;
  deletedAt: Date | null;
  storageDeletedAt: Date | null;
  itemAssets: Array<{ id: string }>;
}): boolean {
  return Boolean(
    (asset.domain === "PRODUCT" || asset.itemAssets.length > 0)
      && (asset.kind === "IMAGE" || asset.mimeType.startsWith("image/"))
      && asset.status === "READY"
      && !asset.deletedAt
      && !asset.storageDeletedAt,
  );
}

async function findPublicAsset(identifier: string) {
  const asset = await prisma.asset.findFirst({
    where: {
      OR: [
        { id: identifier },
        { externalId: identifier },
        { storageKey: identifier },
      ],
    },
    include: { itemAssets: { select: { id: true }, take: 1 } },
  });

  if (!asset || !isPublicProductImage(asset)) {
    throw new ApiError(404, "Asset not found");
  }
  if (!asset.storageProvider || !asset.storageKey) {
    throw new ApiError(404, "Asset storage object not found");
  }

  return asset;
}

export async function resolvePublicMediaOrigin(identifier: string): Promise<PublicMediaOrigin> {
  const asset = await findPublicAsset(identifier);
  const provider = asset.storageProvider as StorageProvider;
  const contentRevision = Math.max(1, Math.floor(asset.updatedAt.getTime() / 1000));

  // URLs are generated just-in-time and immediately consumed by the Worker;
  // they are never returned to the mobile app or persisted for delivery.
  const delivery = await getObjectDownloadUrl({
    key: asset.storageKey,
    bucket: asset.storageBucket,
    provider,
    externalId: asset.externalId,
    fallbackUrl: undefined,
    expiresInSeconds: 300,
  });
  if (!delivery?.url) {
    throw new ApiError(502, "Storage provider did not return a download URL");
  }

  return {
    provider: provider.toLowerCase() as Lowercase<StorageProvider>,
    providerKey: asset.storageKey,
    originUrl: delivery.url,
    visibility: "public",
    mimeType: asset.mimeType,
    filename: safeFilename(asset.fileName, asset.id),
    cacheControl: "public, max-age=31536000, immutable",
    cacheTag: `asset:${asset.id}`,
    contentRevision,
  };
}

export async function resolveLegacyMediaAlias(provider: string, key: string) {
  const normalizedProvider = provider.toUpperCase();
  if (normalizedProvider !== "S3" && normalizedProvider !== "ONEDRIVE") {
    throw new ApiError(404, "Alias not found");
  }

  const asset = await prisma.asset.findFirst({
    where: {
      storageProvider: normalizedProvider,
      OR: [{ storageKey: key }, { externalId: key }, { id: key }],
    },
    include: { itemAssets: { select: { id: true }, take: 1 } },
  });
  if (!asset || !isPublicProductImage(asset)) {
    throw new ApiError(404, "Alias not found");
  }

  const baseUrl = (process.env.ASSET_CDN_BASE_URL || "https://assets.evergreenclassic.in")
    .replace(/\/+$/, "");
  const revision = Math.max(1, Math.floor(asset.updatedAt.getTime() / 1000));
  const filename = encodeURIComponent(safeFilename(asset.fileName, asset.id));

  return {
    redirectUrl: `${baseUrl}/a/${encodeURIComponent(asset.id)}/${filename}?v=${revision}`,
  };
}
