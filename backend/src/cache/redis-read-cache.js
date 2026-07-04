import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redis;

export async function getReadCacheRedis() {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
  }
  if (redis.status === "wait" && typeof redis.connect === "function") {
    await redis.connect();
  }
  return redis;
}

export function setReadCacheRedisForTests(client) {
  redis = client;
}

export async function closeReadCacheRedis() {
  if (!redis) return;
  const client = redis;
  redis = null;
  if (typeof client.quit === "function") {
    await client.quit();
  }
}
