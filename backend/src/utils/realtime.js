import jwt from "jsonwebtoken";
import prisma from "../lib/db.js";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
let redisPub;
let redisSub;

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

  const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      role: {
        include: { permissions: true },
      },
    },
  });

  if (!user || user.status !== "ACTIVE") return null;

  return {
    id: user.id,
    role: user.role.name,
    permissions: user.role.permissions.map((permission) => permission.action),
  };
}

async function canAccessShop(user, shopId) {
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
  return (user.role === "OWNER" && shop.ownerId === user.id) || (user.role === "STAFF" && shop.staffAccesses.length > 0);
}

export function configureRealtime(io) {
  // Initialize Redis pub/sub clients
  if (!redisSub) {
    redisSub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    redisSub.subscribe("whatsapp:events", (err) => {
      if (err) {
        console.error("[Realtime] Failed to subscribe to whatsapp:events channel:", err.message);
      } else {
        console.log("[Realtime] Subscribed to whatsapp:events channel");
      }
    });

    redisSub.on("message", (channel, message) => {
      if (channel === "whatsapp:events") {
        try {
          const { shopId, event, data } = JSON.parse(message);
          io.to(`shop:${shopId}`).emit(event, data);
        } catch (err) {
          console.error("[Realtime] Error processing pub/sub message:", err.message);
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
      socket.join(`user:${user.id}`);
      return next();
    } catch {
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("shop:join", async ({ shopId } = {}) => {
      if (await canAccessShop(socket.user, shopId)) {
        socket.join(`shop:${shopId}`);
        socket.emit("shop:joined", { shopId });
      } else {
        socket.emit("shop:join_error", { shopId, message: "Shop access denied" });
      }
    });

    socket.on("shop:leave", ({ shopId } = {}) => {
      if (shopId) socket.leave(`shop:${shopId}`);
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
