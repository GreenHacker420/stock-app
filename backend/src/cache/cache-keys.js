import crypto from "node:crypto";

const PREFIX = "srv-cache:v1";
const ALLOWED_DOMAINS = new Set(["customers", "items", "categories", "brands", "approvals"]);

function assertDomain(domain) {
  if (!ALLOWED_DOMAINS.has(domain)) {
    throw new Error(`Unsupported read-cache domain: ${domain}`);
  }
}

function stableStringify(value) {
  if (value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalizeQuery(query = {}) {
  return JSON.parse(stableStringify(query));
}

export function hashCanonicalQuery(query = {}) {
  return crypto
    .createHash("sha256")
    .update(stableStringify(canonicalizeQuery(query)))
    .digest("hex")
    .slice(0, 32);
}

export function generationKey({ shopId, domain }) {
  assertDomain(domain);
  return `${PREFIX}:shop:${shopId}:${domain}:generation`;
}

export function queryKey({ shopId, domain, generation, query }) {
  assertDomain(domain);
  return `${PREFIX}:shop:${shopId}:${domain}:g:${generation}:q:${hashCanonicalQuery(query)}`;
}

export function ttlSeconds() {
  const configured = Number(process.env.SERVER_READ_CACHE_TTL_SECONDS || 120);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 120;
}
