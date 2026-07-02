import jwt from "jsonwebtoken";
import prisma from "../lib/db.js";
import Redis from "ioredis";
import { OWNER_PERMISSIONS, STAFF_PERMISSIONS } from "./permissions.js";
import { getJwtSecret } from "./env.js";
import {
  disconnectDevicePresence,
  updateDevicePresence,
} from "../services/device-presence.service.js";

const MAX_SYNC_EVENTS = 100;

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
let redisPub;
let redisSub;
let realtimeIo;

export const REALTIME_EVENTS = {
  ORDER_UPDATED: "order:updated",
  SALE_UPDATED: "sale:updated",
  DELIVERY_MEMO_UPDATED: "delivery-memo:updated",
  PAYMENT_UPDATED: "payment:updated",
  CASH_SESSION_UPDATED: "cash-session:updated",
  STOCK_UPDATED: "stock:updated",
  DAILY_SUMMARY_UPDATED: "daily-summary:updated",
  SHOP_UPDATED: "shop:updated",
  NOTIFICATION_CREATED: "notification:created",
};

async function getSocketUser(token) {
  if (!token) return null;

  const payload = jwt.verify(token, getJwtSecret());
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user || user.status !== "ACTIVE") return null;

  return {
    id: user.id,
    role: user.role,
    permissions: user.role === "OWNER" ? OWNER_PERMISSIONS : STAFF_PERMISSIONS,
  };
}

export async function canAccessShop(user, shopId) {
  if (!user || !shopId) return false;

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: {
      staffAccesses: {
        where: { staffId: user.id },
        select: { id: true },
      },
    },
  });

  if (!shop || shop.status !== "ACTIVE") return false;
  const hasAccessEntry = shop.staffAccesses.length > 0;
  return (user.role === "OWNER" && (shop.ownerId === user.id || hasAccessEntry)) || (user.role === "STAFF" && hasAccessEntry);
}

export async function getShopAccess(user, shopId) {
  if (!user || !shopId) return null;
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: {
      staffAccesses: {
        where: { staffId: user.id },
        select: { id: true },
      },
    },
  });
  if (!shop || shop.status !== "ACTIVE") return null;
  const hasAccessEntry = shop.staffAccesses.length > 0;
  if (user.role === "OWNER" && (shop.ownerId === user.id || hasAccessEntry)) return { shop, roleRoom: "owners" };
  if (user.role === "STAFF" && hasAccessEntry) return { shop, roleRoom: "staff" };
  return null;
}

export async function canUseDeviceRoom(userId, deviceId) {
  if (!userId || !deviceId) return false;
  const device = await prisma.userDevice.findFirst({
    where: { id: deviceId, userId, revokedAt: null },
    select: { id: true },
  });
  return Boolean(device);
}

export async function getRealtimeSyncPayload(user, { shopId, since, limit = MAX_SYNC_EVENTS } = {}) {
  if (!shopId || !(await canAccessShop(user, shopId))) {
    return { error: "Shop access denied" };
  }

  const take = Math.min(Number(limit) || MAX_SYNC_EVENTS, MAX_SYNC_EVENTS);
  const where = {
    shopId,
    status: "delivered",
    ...(since ? { createdAt: { gt: new Date(since) } } : {}),
  };
  const outbox = await prisma.domainEventOutbox.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take,
    select: { createdAt: true, eventJson: true },
  });

  return {
    events: outbox.map((row) => row.eventJson),
    nextCursor: outbox.length > 0
      ? outbox[outbox.length - 1].createdAt.toISOString()
      : since || null,
  };
}

export function configureRealtime(io) {
  realtimeIo = io;
  // Initialize Redis pub/sub clients
  if (!redisSub) {
    redisSub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    redisSub.subscribe("whatsapp:events", "domain-events", (err) => {
      if (err) {
        console.error("[Realtime] Failed to subscribe to Redis channels:", err.message);
      } else {
        console.log("[Realtime] Subscribed to Redis channels (whatsapp:events, domain-events)");
      }
    });

    redisSub.on("message", (channel, message) => {
      if (channel === "whatsapp:events") {
        try {
          const { shopId, event, data } = JSON.parse(message);
          io.to(`shop:${shopId}`).emit(event, data);
        } catch (err) {
          console.error("[Realtime] Error processing whatsapp pub/sub message:", err.message);
        }
      } else if (channel === "domain-events") {
        try {
          const event = JSON.parse(message);
          emitDomainEventLocal(event);
        } catch (err) {
          console.error("[Realtime] Error processing domain-events message:", err.message);
        }
      }
    });
  }

  if (!redisPub) {
    redisPub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const user = await getSocketUser(token);
      if (!user) return next(new Error("Authentication required"));
      socket.user = user;
      socket.deviceId = typeof socket.handshake.auth?.deviceId === "string"
        ? socket.handshake.auth.deviceId
        : null;
      socket.join(`user:${user.id}`);
      if (socket.deviceId && await canUseDeviceRoom(user.id, socket.deviceId)) {
        socket.join(`device:${socket.deviceId}`);
      } else if (socket.deviceId) {
        console.warn("[Realtime] Unauthorized device room join attempt", { userId: user.id, deviceId: socket.deviceId });
        socket.deviceId = null;
      }
      return next();
    } catch {
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("shop:join", async ({ shopId } = {}) => {
      const access = await getShopAccess(socket.user, shopId);
      if (access) {
        socket.join(`shop:${shopId}`);
        socket.join(`shop:${shopId}:${access.roleRoom}`);
        socket.activeShopId = shopId;
        if (socket.deviceId) {
          await updateDevicePresence({
            deviceId: socket.deviceId,
            userId: socket.user.id,
            shopId,
            state: "FOREGROUND",
            available: true,
            socketId: socket.id,
          });
        }
        socket.emit("shop:joined", { shopId });
      } else {
        console.warn("[Realtime] Unauthorized shop room join attempt", { userId: socket.user?.id, shopId });
        socket.emit("shop:join_error", { shopId, message: "Shop access denied" });
      }
    });

    socket.on("shop:leave", async ({ shopId } = {}) => {
      if (shopId) {
        socket.leave(`shop:${shopId}`);
        socket.leave(`shop:${shopId}:owners`);
        socket.leave(`shop:${shopId}:staff`);
      }
      await disconnectDevicePresence({
        deviceId: socket.deviceId,
        userId: socket.user.id,
        shopId,
        socketId: socket.id,
      });
      if (socket.activeShopId === shopId) socket.activeShopId = null;
    });

    socket.on("presence:heartbeat", async ({ shopId, state = "FOREGROUND", available = true } = {}) => {
      if (!socket.deviceId || !(await canAccessShop(socket.user, shopId))) return;
      socket.activeShopId = shopId;
      await updateDevicePresence({
        deviceId: socket.deviceId,
        userId: socket.user.id,
        shopId,
        state,
        available,
        socketId: socket.id,
      });
      socket.emit("presence:ack", { shopId, state, available, at: new Date().toISOString() });
    });

    socket.on("sync:request", async ({ shopId, since } = {}) => {
      if (!shopId || !(await canAccessShop(socket.user, shopId))) {
        socket.emit("sync:error", { shopId, message: "Shop access denied" });
        return;
      }
      try {
        const payload = await getRealtimeSyncPayload(socket.user, { shopId, since });
        if (payload.error) {
          socket.emit("sync:error", { shopId, message: payload.error });
          return;
        }
        const { events, nextCursor } = payload;
        // Emit each missed event individually — client deduplication handles duplicates
        for (const event of events) {
          socket.emit("domain:event", event);
        }
        socket.emit("sync:complete", { shopId, count: events.length, nextCursor });
      } catch (err) {
        console.error("[Realtime] sync:request error:", err.message);
        socket.emit("sync:error", { shopId, message: "Sync failed" });
      }
    });

    socket.on("disconnect", async () => {
      await disconnectDevicePresence({
        deviceId: socket.deviceId,
        userId: socket.user.id,
        shopId: socket.activeShopId,
        socketId: socket.id,
      });
    });
  });
}

export function emitShopEvent(req, shopId, event, payload = {}) {
  const io = req.app.get("io");
  if (!io || !shopId) return;

  io.to(`shop:${shopId}`).emit(event, {
    ...payload,
    shopId,
    emittedAt: new Date().toISOString(),
  });
}

export function getDomainEventRooms(event) {
  const targets = new Set();
  
  if (event.visibility?.owners && event.visibility?.staff) {
    targets.add(`shop:${event.shopId}`);
  } else {
    if (event.visibility?.owners) targets.add(`shop:${event.shopId}:owners`);
    if (event.visibility?.staff) targets.add(`shop:${event.shopId}:staff`);
  }

  for (const userId of event.visibility?.targetUserIds || []) {
    targets.add(`user:${userId}`);
  }
  for (const deviceId of event.visibility?.targetDeviceIds || []) {
    targets.add(`device:${deviceId}`);
  }
  return [...targets];
}

export function emitDomainEvent(event) {
  if (!realtimeIo || !event?.shopId) return;
  const rooms = getDomainEventRooms(event);
  for (const room of rooms) {
    realtimeIo.to(room).emit("domain:event", event);
  }
}

export function emitDomainEventLocal(event) {
  if (!realtimeIo || !event?.shopId) return;
  const rooms = getDomainEventRooms(event);
  for (const room of rooms) {
    realtimeIo.local.to(room).emit("domain:event", event);
  }
}

export async function publishWhatsAppEvent(shopId, event, data) {
  try {
    if (!redisPub) {
      redisPub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    }
    await redisPub.publish("whatsapp:events", JSON.stringify({ shopId, event, data }));
  } catch (err) {
    console.error("[Realtime] Failed to publish whatsapp event:", err.message);
  }
}
