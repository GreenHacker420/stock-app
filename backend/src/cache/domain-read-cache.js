import { canonicalizeQuery, generationKey, queryKey, ttlSeconds } from "./cache-keys.js";
import { getReadCacheRedis } from "./redis-read-cache.js";

const stats = {
  hit: 0,
  miss: 0,
  fill: 0,
  invalidate: 0,
  redis_error: 0,
  db_fallback: 0,
};

const EVENT_DOMAIN_MAP = {
  customer: ["customers"],
  item: ["items"],
  category: ["categories", "items"],
  brand: ["brands", "items"],
  stock: ["items"],
};

function record(metric) {
  if (Object.prototype.hasOwnProperty.call(stats, metric)) {
    stats[metric] += 1;
  }
}

function warnRedisError(operation, domain, error) {
  record("redis_error");
  console.warn("[ReadCache] Redis error", {
    operation,
    domain,
    message: error instanceof Error ? error.message : String(error),
  });
}

async function getGeneration(redis, shopId, domain) {
  const key = generationKey({ shopId, domain });
  const current = await redis.get(key);
  if (current) return current;
  await redis.set(key, "1");
  return "1";
}

export async function readThroughDomainCache({ shopId, domain, query, loader }) {
  const canonicalQuery = canonicalizeQuery(query);
  let redis;
  let cacheKey;

  try {
    redis = await getReadCacheRedis();
    const generation = await getGeneration(redis, shopId, domain);
    cacheKey = queryKey({ shopId, domain, generation, query: canonicalQuery });
    const cached = await redis.get(cacheKey);
    if (cached) {
      record("hit");
      return JSON.parse(cached);
    }
    record("miss");
  } catch (error) {
    warnRedisError("get", domain, error);
    record("db_fallback");
    redis = null;
  }

  const value = await loader();

  if (redis && cacheKey) {
    try {
      await redis.set(cacheKey, JSON.stringify(value), "EX", ttlSeconds());
      record("fill");
    } catch (error) {
      warnRedisError("set", domain, error);
    }
  }

  return value;
}

export function domainsForReadCacheEvent(event) {
  const domains = EVENT_DOMAIN_MAP[event?.entity] || [];
  return [...new Set(domains)];
}

export async function invalidateDomainReadCache({ shopId, domains }) {
  const uniqueDomains = [...new Set(domains || [])];
  if (!shopId || uniqueDomains.length === 0) return { invalidated: 0 };

  const redis = await getReadCacheRedis();
  for (const domain of uniqueDomains) {
    await redis.incr(generationKey({ shopId, domain }));
    record("invalidate");
  }
  return { invalidated: uniqueDomains.length };
}

export async function invalidateForDomainEvent(event) {
  const domains = domainsForReadCacheEvent(event);
  return invalidateDomainReadCache({ shopId: event?.shopId, domains });
}

export async function bestEffortInvalidateForDomainEvent(event) {
  try {
    return await invalidateForDomainEvent(event);
  } catch (error) {
    warnRedisError("invalidate", event?.entity, error);
    return { invalidated: 0, error };
  }
}

export function getReadCacheStats() {
  return { ...stats };
}

export function resetReadCacheStatsForTests() {
  for (const key of Object.keys(stats)) stats[key] = 0;
}
