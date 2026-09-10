const ASSET_MEDIA_PATH = /^\/(?:api\/)?assets\/media\/([^/?#]+)\/?$/;

export function buildAssetMediaPath(assetId) {
  return `/assets/media/${encodeURIComponent(assetId)}`;
}

export function buildAssetThumbnailPath(assetId, shopId) {
  const params = new URLSearchParams({ shopId });
  return `/assets/${encodeURIComponent(assetId)}/thumbnail?${params.toString()}`;
}

export function extractAssetIdFromUrl(value) {
  if (!value) return null;
  try {
    const pathname = new URL(String(value), "https://shopcontrol.local").pathname;
    const match = pathname.match(ASSET_MEDIA_PATH);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function extractAssetIdsFromImageUrl(imageUrl) {
  if (!imageUrl) return [];
  return Array.from(new Set(
    String(imageUrl)
      .split(",")
      .map((value) => extractAssetIdFromUrl(value.trim()))
      .filter(Boolean),
  ));
}
