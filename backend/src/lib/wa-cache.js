import { LRUCache } from "lru-cache";
import Redis from "ioredis";
import prisma from "../lib/db.js";
import { decrypt } from "./wa-crypto.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new Redis(REDIS_URL);

// Level 1: In-process memory caches (4 minutes TTL)
const credsMemCache = new LRUCache({
  max: 500,
  ttl: 4 * 60 * 1000,
});

const tenantMemCache = new LRUCache({
  max: 500,
  ttl: 4 * 60 * 1000,
});


export async function getWaCredentials(shopId) {
  const cacheKey = `wa:creds:${shopId}`;
  
  // 1. LRU Cache Hit
  const memCached = credsMemCache.get(cacheKey);
  if (memCached) return memCached;
  
  // 2. Redis Cache Hit
  try {
    const redisCached = await redis.get(cacheKey);
    if (redisCached) {
      const parsed = JSON.parse(redisCached);
      credsMemCache.set(cacheKey, parsed);
      return parsed;
    }
  } catch (err) {
    console.error("[WhatsApp Cache] Redis read error (creds):", err.message);
  }
  
  // 3. Database Fallback
  const integration = await prisma.waIntegration.findUnique({
    where: { shopId },
    select: { accessToken: true, phoneNumberId: true, appSecret: true, businessAccountId: true, status: true },
  });
  
  if (!integration || integration.status !== "CONNECTED") {
    return null;
  }
  
  const credentials = {
    accessToken: decrypt(integration.accessToken),
    phoneNumberId: integration.phoneNumberId,
    appSecret: integration.appSecret,
    businessAccountId: integration.businessAccountId,
  };
  
  // 4. Update Caches (Redis TTL: 4 hours)
  try {
    await redis.setex(cacheKey, 4 * 60 * 60, JSON.stringify(credentials));
  } catch (err) {
    console.error("[WhatsApp Cache] Redis write error (creds):", err.message);
  }
  credsMemCache.set(cacheKey, credentials);
  
  return credentials;
}


export async function getTenantByPhoneNumberId(phoneNumberId) {
  const cacheKey = `wa:tenant:${phoneNumberId}`;
  
  // 1. LRU Cache Hit
  const memCached = tenantMemCache.get(cacheKey);
  if (memCached) return memCached;
  
  // 2. Redis Cache Hit
  try {
    const redisCached = await redis.get(cacheKey);
    if (redisCached) {
      tenantMemCache.set(cacheKey, redisCached);
      return { shopId: redisCached };
    }
  } catch (err) {
    console.error("[WhatsApp Cache] Redis read error (tenant):", err.message);
  }
  
  // 3. Database Fallback
  const integration = await prisma.waIntegration.findFirst({
    where: { phoneNumberId },
    select: { shopId: true },
  });
  
  if (!integration) {
    return null;
  }
  
  const shopId = integration.shopId;
  
  // 4. Update Caches (Redis TTL: 4 hours)
  try {
    await redis.setex(cacheKey, 4 * 60 * 60, shopId);
  } catch (err) {
    console.error("[WhatsApp Cache] Redis write error (tenant):", err.message);
  }
  tenantMemCache.set(cacheKey, shopId);
  
  return { shopId };
}

export async function invalidateWaCredentials(shopId) {
  const credsKey = `wa:creds:${shopId}`;
  credsMemCache.delete(credsKey);
  
  try {
    await redis.del(credsKey);
  } catch (err) {
    console.error("[WhatsApp Cache] Redis delete error (creds):", err.message);
  }
  
  const integration = await prisma.waIntegration.findUnique({
    where: { shopId },
    select: { phoneNumberId: true },
  });
  
  if (integration?.phoneNumberId) {
    const tenantKey = `wa:tenant:${integration.phoneNumberId}`;
    tenantMemCache.delete(tenantKey);
    try {
      await redis.del(tenantKey);
    } catch (err) {
      console.error("[WhatsApp Cache] Redis delete error (tenant):", err.message);
    }
  }
}


export async function warmTenantCache() {
  try {
    const integrations = await prisma.waIntegration.findMany({
      where: { status: "CONNECTED" },
      select: { shopId: true, phoneNumberId: true, accessToken: true, appSecret: true, businessAccountId: true },
    });
    
    console.log(`[WhatsApp Cache] Pre-warming credentials cache for ${integrations.length} shops...`);
    
    for (const integration of integrations) {
      const credsKey = `wa:creds:${integration.shopId}`;
      const tenantKey = `wa:tenant:${integration.phoneNumberId}`;
      
      const credentials = {
        accessToken: decrypt(integration.accessToken),
        phoneNumberId: integration.phoneNumberId,
        appSecret: integration.appSecret,
        businessAccountId: integration.businessAccountId,
      };
      
      credsMemCache.set(credsKey, credentials);
      tenantMemCache.set(tenantKey, integration.shopId);
      
      await redis.setex(credsKey, 4 * 60 * 60, JSON.stringify(credentials));
      await redis.setex(tenantKey, 4 * 60 * 60, integration.shopId);
    }
    
    console.log("[WhatsApp Cache] Pre-warming complete.");
  } catch (err) {
    console.error("[WhatsApp Cache] Pre-warming failed:", err.message);
  }
}

export async function closeWaCacheRedis() {
  if (redis) {
    try {
      await redis.quit();
    } catch (err) {}
  }
}
