const ASSET_MEDIA_PATH = /^\/(?:api\/)?assets\/media\/([^/?#]+)\/?$/;
const ASSET_CDN_PATH = /^\/a\/([^/?#]+)\/[^/?#]+\/?$/;

export function buildAssetMediaPath(assetId: string): string {
  const assetCdnBaseUrl = process.env.ASSET_CDN_BASE_URL?.replace(/\/+$/, "");
  if (assetCdnBaseUrl) {
    return `${assetCdnBaseUrl}/a/${encodeURIComponent(assetId)}/asset?v=1`;
  }
  return `/assets/media/${encodeURIComponent(assetId)}`;
}

export function buildAssetThumbnailPath(assetId: string, shopId: string): string {
  const params = new URLSearchParams({ shopId });
  return `/assets/${encodeURIComponent(assetId)}/thumbnail?${params.toString()}`;
}

export function extractAssetIdFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const pathname = new URL(String(value), "https://shopcontrol.local").pathname;
    const match = pathname.match(ASSET_MEDIA_PATH) ?? pathname.match(ASSET_CDN_PATH);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function extractAssetIdsFromImageUrl(imageUrl: string | null | undefined): string[] {
  if (!imageUrl) return [];
  return Array.from(new Set(
    String(imageUrl)
      .split(",")
      .map((value) => extractAssetIdFromUrl(value.trim()))
      .filter((assetId): assetId is string => assetId !== null),
  ));
}
