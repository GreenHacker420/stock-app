type MediaProvider = "s3" | "onedrive";

type MediaOrigin = {
  provider: MediaProvider;
  originUrl: string;
  mimeType: string;
  filename: string;
  cacheControl: string;
  cacheTag: string;
  contentRevision: number;
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

const MICROSOFT_ORIGIN_SUFFIXES = [
  ".sharepoint.com",
  ".sharepoint-df.com",
  ".svc.ms",
  ".1drv.com",
  ".1drv.ms",
  ".office.com",
  ".live.com",
];

const S3_ORIGIN_SUFFIXES = [".amazonaws.com"];

function jsonError(status: number, message: string): Response {
  return Response.json(
    { success: false, error: { message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return typeof value === "object" && value !== null && "success" in value;
}

function isMediaOrigin(value: unknown): value is MediaOrigin {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<MediaOrigin>;
  return (
    (candidate.provider === "s3" || candidate.provider === "onedrive")
    && typeof candidate.originUrl === "string"
    && typeof candidate.mimeType === "string"
    && typeof candidate.filename === "string"
    && typeof candidate.cacheControl === "string"
  );
}

function isAllowedOrigin(originUrl: URL, provider: MediaProvider): boolean {
  if (originUrl.protocol !== "https:" || originUrl.username || originUrl.password) return false;
  const hostname = originUrl.hostname.toLowerCase();
  const suffixes = provider === "onedrive" ? MICROSOFT_ORIGIN_SUFFIXES : S3_ORIGIN_SUFFIXES;
  return suffixes.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix));
}

function safeDispositionFilename(filename: string): string {
  return filename.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "asset";
}

async function fetchOriginDescriptor(identifier: string, env: Env): Promise<MediaOrigin | Response> {
  const endpoint = new URL(
    `/api/media/internal/origin/${encodeURIComponent(identifier)}`,
    env.ORIGIN_API_BASE_URL,
  );
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "x-asset-origin-token": env.ASSET_ORIGIN_TOKEN_V2,
    },
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isApiEnvelope(payload) && payload.error?.message
      ? payload.error.message
      : `Asset origin returned HTTP ${response.status}`;
    return jsonError(response.status, message);
  }
  if (!isApiEnvelope(payload) || !payload.success || !isMediaOrigin(payload.data)) {
    return jsonError(502, "Asset origin returned an invalid response");
  }
  return payload.data;
}

async function resolveLegacyAlias(pathname: string, env: Env): Promise<Response> {
  const endpoint = new URL("/api/media/internal/alias", env.ORIGIN_API_BASE_URL);
  endpoint.searchParams.set("path", pathname);
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "x-asset-origin-token": env.ASSET_ORIGIN_TOKEN_V2,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isApiEnvelope(payload) && payload.error?.message
      ? payload.error.message
      : `Asset alias returned HTTP ${response.status}`;
    return jsonError(response.status, message);
  }

  const data = isApiEnvelope(payload) ? payload.data : null;
  const redirectUrl = typeof data === "object" && data !== null && "redirectUrl" in data
    ? data.redirectUrl
    : null;
  if (typeof redirectUrl !== "string") return jsonError(502, "Asset alias returned an invalid response");

  const target = new URL(redirectUrl);
  if (target.protocol !== "https:" || target.hostname !== env.CANONICAL_HOST) {
    return jsonError(502, "Asset alias returned an invalid destination");
  }
  return Response.redirect(target.toString(), 302);
}

async function deliverAsset(
  request: Request,
  identifier: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache = await caches.open("evergreen-assets-v1");
  const cacheKey = new Request(request.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const descriptor = await fetchOriginDescriptor(identifier, env);
  if (descriptor instanceof Response) return descriptor;

  const originUrl = new URL(descriptor.originUrl);
  if (!isAllowedOrigin(originUrl, descriptor.provider)) {
    console.error(JSON.stringify({
      message: "blocked asset origin hostname",
      provider: descriptor.provider,
      hostname: originUrl.hostname,
      identifier,
    }));
    return jsonError(502, "Storage provider returned an unsupported origin");
  }

  const originResponse = await fetch(originUrl, {
    headers: { Accept: "image/*" },
    redirect: "manual",
  });
  if (!originResponse.ok || !originResponse.body) {
    console.error(JSON.stringify({
      message: "storage provider fetch failed",
      provider: descriptor.provider,
      status: originResponse.status,
      identifier,
    }));
    return jsonError(502, `Storage provider returned HTTP ${originResponse.status}`);
  }

  const headers = new Headers();
  headers.set("Content-Type", originResponse.headers.get("Content-Type") || descriptor.mimeType);
  headers.set("Cache-Control", descriptor.cacheControl);
  headers.set("Content-Disposition", `inline; filename="${safeDispositionFilename(descriptor.filename)}"`);
  headers.set("X-Content-Type-Options", "nosniff");
  const etag = originResponse.headers.get("ETag");
  if (etag) headers.set("ETag", etag);

  const delivered = new Response(originResponse.body, { status: 200, headers });
  ctx.waitUntil(cache.put(cacheKey, delivered.clone()));
  return delivered;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonError(405, "Method not allowed");
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json(
        { status: "ok", environment: env.ENVIRONMENT },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const canonicalMatch = url.pathname.match(/^\/a\/([^/]+)\/[^/]+$/);
    if (canonicalMatch?.[1]) {
      let identifier: string;
      try {
        identifier = decodeURIComponent(canonicalMatch[1]);
      } catch {
        return jsonError(400, "Invalid asset identifier");
      }
      return deliverAsset(request, identifier, env, ctx);
    }

    if (/^\/(?:s3|onedrive)\/.+$/i.test(url.pathname)) {
      return resolveLegacyAlias(url.pathname, env);
    }

    return jsonError(404, "Asset not found");
  },
} satisfies ExportedHandler<Env>;
