import Redis from "ioredis";
import prisma from "../lib/db.js";
import { listShopPresence } from "../services/device-presence.service.js";
import { createNotification } from "../services/notification.service.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const DOMAIN_EVENT_CHANNEL = "domain-events";
const POLL_INTERVAL_MS = Number(process.env.DOMAIN_EVENT_POLL_INTERVAL_MS || 1500);
const MAX_ATTEMPTS = Number(process.env.DOMAIN_EVENT_MAX_ATTEMPTS || 8);
let redisPub;
let dispatcherTimer;
let dispatching = false;

const ENTITY_TYPE_MAP = {
  sale: "SALE",
  payment: "PAYMENT",
  item: "ITEM",
  stock: "STOCK_LEDGER",
  deliveryMemo: "DELIVERY_MEMO",
  order: "ORDER",
  customer: "CUSTOMER",
  cashSession: "CASH_SESSION",
  approval: "APPROVAL_REQUEST",
  notification: "APPROVAL_REQUEST",
  dashboard: "SHOP",
};

function notificationTriggerFor(event) {
  if (event.entity === "payment") return "PAYMENT_MISMATCH";
  if (event.entity === "cashSession" && event.action === "review_required") return "APPROVAL_REQUESTED";
  if (event.entity === "cashSession") return "APPROVAL_RESOLVED";
  if (event.entity === "stock" && event.action === "low_stock") return "LOW_STOCK";
  if (event.entity === "approval" && event.action === "created") return "APPROVAL_REQUESTED";
  if (event.entity === "approval") return "APPROVAL_RESOLVED";
  return "TEST_NOTIFICATION";
}

function getRedis() {
  if (!redisPub) redisPub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  return redisPub;
}

async function getTargetUserIds(event) {
  const ids = new Set(event.visibility?.targetUserIds || []);

  if (event.visibility?.owners) {
    const shop = await prisma.shop.findUnique({
      where: { id: event.shopId },
      select: { ownerId: true },
    });
    if (shop?.ownerId) ids.add(shop.ownerId);
  }

  if (event.visibility?.staff) {
    const staff = await prisma.staffShopAccess.findMany({
      where: { shopId: event.shopId },
      select: { staffId: true },
    });
    for (const row of staff) ids.add(row.staffId);
  }

  return [...ids];
}

async function queuePushNotifications(event) {
  if (!event.notification?.sendPush) return;
  const targetUserIds = await getTargetUserIds(event);

  // Get active device presences in the shop to evaluate suppression
  const activePresences = await listShopPresence(event.shopId).catch(() => []);
  const foregroundUserIds = new Set(
    activePresences
      .filter((p) => p.state === "FOREGROUND")
      .map((p) => p.userId)
  );

  const severity = event.notification.severity || "info";

  await Promise.all(targetUserIds.map(async (userId) => {
    const isForeground = foregroundUserIds.has(userId);

    // Suppress non-critical push notifications if user is currently active in foreground
    if (isForeground && severity !== "critical") {
      console.log(`[DomainEventDispatcher] Suppressing push notification for userId=${userId} due to active foreground presence (severity=${severity})`);
      return;
    }

    try {
      await createNotification(prisma, {
        userId,
        shopId: event.shopId,
        triggerEvent: notificationTriggerFor(event),
        entityType: ENTITY_TYPE_MAP[event.entity] || "SHOP",
        entityId: event.entityId,
        message: event.notification.body || event.notification.title || "New activity",
        domainEventId: event.eventId,
      });
    } catch (error) {
      console.error("[DomainEventDispatcher] Push notification creation failed", {
        eventId: event.eventId,
        userId,
        error: error.message,
      });
    }
  }));
}

async function publishEvent(event) {
  await getRedis().publish(DOMAIN_EVENT_CHANNEL, JSON.stringify(event));
  await queuePushNotifications(event);
}

async function claimRows() {
  const rows = await prisma.domainEventOutbox.findMany({
    where: {
      OR: [
        { status: "pending" },
        { status: "failed", attempts: { lt: MAX_ATTEMPTS } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  const claimed = [];
  for (const row of rows) {
    const updated = await prisma.domainEventOutbox.updateMany({
      where: { id: row.id, status: row.status },
      data: { status: "publishing" },
    });
    if (updated.count === 1) claimed.push(row);
  }
  return claimed;
}

export async function dispatchPendingDomainEvents() {
  if (dispatching) return { skipped: true, processed: 0 };
  dispatching = true;
  let processed = 0;

  try {
    const rows = await claimRows();
    for (const row of rows) {
      let event;
      try {
        event = row.eventJson;
      } catch (err) {
        await prisma.domainEventOutbox.update({
          where: { id: row.id },
          data: {
            status: "failed",
            attempts: MAX_ATTEMPTS,
            lastError: "Malformed event JSON",
          },
        });
        continue;
      }

      try {
        if (!event || typeof event !== "object") {
          throw new Error("Event is not a valid object");
        }
        if (!event.shopId || !event.entity || !event.action || !event.eventId) {
          throw new Error(`Missing required fields: shopId=${event.shopId}, entity=${event.entity}, action=${event.action}, eventId=${event.eventId}`);
        }

        console.log(`[DomainEventDispatcher] Dispatching event: id=${event.eventId}, shopId=${event.shopId}, entity=${event.entity}, action=${event.action}`);
        await publishEvent(event);

        await prisma.domainEventOutbox.update({
          where: { id: row.id },
          data: {
            status: "published",
            attempts: { increment: 1 },
            lastError: null,
            publishedAt: new Date(),
          },
        });
        processed += 1;
      } catch (error) {
        console.error(`[DomainEventDispatcher] Failed to dispatch event=${row.id}:`, error.message);
        const attempts = row.attempts + 1;
        const isValidationError = error.message.includes("Missing required fields") || error.message.includes("not a valid object");
        const nextStatus = (attempts >= MAX_ATTEMPTS || isValidationError) ? "failed" : "pending";
        const nextAttempts = isValidationError ? MAX_ATTEMPTS : attempts;

        await prisma.domainEventOutbox.update({
          where: { id: row.id },
          data: {
            status: nextStatus,
            attempts: nextAttempts,
            lastError: error instanceof Error ? error.message : "Unknown dispatch error",
          },
        });
      }
    }
    return { skipped: false, processed };
  } finally {
    dispatching = false;
  }
}

export function startDomainEventDispatcherWorker() {
  if (dispatcherTimer) return { close: () => clearInterval(dispatcherTimer) };
  dispatcherTimer = setInterval(() => {
    dispatchPendingDomainEvents().catch((error) => {
      console.error("[DomainEvent] Dispatcher tick failed:", error.message);
    });
  }, POLL_INTERVAL_MS);
  dispatchPendingDomainEvents().catch((error) => {
    console.error("[DomainEvent] Initial dispatch failed:", error.message);
  });
  return {
    close: () => {
      clearInterval(dispatcherTimer);
      dispatcherTimer = null;
    },
  };
}

export async function closeRedis() {
  if (redisPub) {
    try {
      await redisPub.quit();
    } catch (err) {
      console.error("[DomainEventDispatcher] Error closing Redis:", err.message);
    }
    redisPub = null;
  }
}
