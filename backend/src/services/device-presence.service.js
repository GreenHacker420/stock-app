import Redis from "ioredis";
import prisma from "../lib/db.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const PRESENCE_TTL_SECONDS = 75;
let redis;

function getRedis() {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
  }
  return redis;
}

function deviceKey(deviceId) {
  return `presence:device:${deviceId}`;
}

function shopKey(shopId) {
  return `presence:shop:${shopId}`;
}

export async function updateDevicePresence({
  deviceId,
  userId,
  shopId,
  state,
  available,
  socketId = null,
}) {
  const device = await prisma.userDevice.findFirst({
    where: { id: deviceId, userId, revokedAt: null },
    select: { id: true },
  });
  if (!device) return null;

  const now = new Date();
  const payload = {
    deviceId,
    userId,
    shopId,
    state,
    available: Boolean(available),
    socketId,
    lastSeenAt: now.toISOString(),
  };
  const client = getRedis();
  if (client.status === "wait") await client.connect();
  const expiresAt = Date.now() + PRESENCE_TTL_SECONDS * 1000;
  await client
    .multi()
    .set(deviceKey(deviceId), JSON.stringify(payload), "EX", PRESENCE_TTL_SECONDS)
    .zadd(shopKey(shopId), expiresAt, deviceId)
    .expire(shopKey(shopId), PRESENCE_TTL_SECONDS * 2)
    .exec();

  await prisma.userDevice.update({
    where: { id: deviceId },
    data: { lastShopId: shopId, lastSeenAt: now },
  });
  return payload;
}

export async function disconnectDevicePresence({ deviceId, userId, shopId, socketId }) {
  if (!deviceId || !shopId) return;
  const current = await getDevicePresence(deviceId);
  if (!current || current.userId !== userId || current.socketId !== socketId) return;
  await updateDevicePresence({
    deviceId,
    userId,
    shopId,
    state: "DISCONNECTED",
    available: false,
    socketId: null,
  });
}

export async function getDevicePresence(deviceId) {
  const client = getRedis();
  if (client.status === "wait") await client.connect();
  const value = await client.get(deviceKey(deviceId));
  return value ? JSON.parse(value) : null;
}

export async function listShopPresence(shopId) {
  const client = getRedis();
  if (client.status === "wait") await client.connect();
  const now = Date.now();
  await client.zremrangebyscore(shopKey(shopId), 0, now);
  const deviceIds = await client.zrangebyscore(shopKey(shopId), now, "+inf");
  if (!deviceIds.length) return [];
  const values = await client.mget(deviceIds.map(deviceKey));
  return values.flatMap((value) => (value ? [JSON.parse(value)] : []));
}

export async function removeDevicePresence(deviceId, shopId) {
  const client = getRedis();
  if (client.status === "wait") await client.connect();
  await client.multi().del(deviceKey(deviceId)).zrem(shopKey(shopId), deviceId).exec();
}

export const devicePresenceTtlSeconds = PRESENCE_TTL_SECONDS;

export async function closePresenceRedis() {
  if (redis) {
    try {
      await redis.quit();
    } catch (err) {}
    redis = null;
  }
}
