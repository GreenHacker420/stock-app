const DEFAULT_ASSET_CDN_URL = "https://assets.evergreenclassic.in";

type LegacyOneDriveReference = {
  itemId: string;
  revision: string;
};

function extractOneDriveReference(value: string): LegacyOneDriveReference | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (!hostname.endsWith("mediap.svc.ms")) return null;

    const documentUrl = url.searchParams.get("docid");
    if (!documentUrl) return null;

    const match = documentUrl.match(/\/items\/([^/?#]+)/i);
    if (!match?.[1]) return null;

    const cacheBuster = url.searchParams.get("cb") || "1";
    const revision = /^\d{1,16}$/.test(cacheBuster) ? cacheBuster : "1";
    return { itemId: decodeURIComponent(match[1]), revision };
  } catch {
    return null;
  }
}

/**
 * Converts legacy expiring Microsoft thumbnail URLs into the stable Cloudflare
 * asset route. Other URLs are returned unchanged, including the working S3
 * delivery URLs.
 */
export function normalizeProductImageUrl(value: string): string {
  const oneDrive = extractOneDriveReference(value);
  if (!oneDrive) return value;

  const assetCdnUrl = (
    process.env.EXPO_PUBLIC_ASSET_CDN_URL || DEFAULT_ASSET_CDN_URL
  ).replace(/\/+$/, "");
  return `${assetCdnUrl}/a/${encodeURIComponent(oneDrive.itemId)}/thumbnail.webp?v=${oneDrive.revision}`;
}
