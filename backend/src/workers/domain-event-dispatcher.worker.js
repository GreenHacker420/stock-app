import Redis from "ioredis";
import prisma from "../lib/db.js";
import { emitDomainEvent } from "../utils/realtime.js";
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
  await Promise.all(targetUserIds.map((userId) => createNotification(prisma, {
    userId,
    shopId: event.shopId,
    triggerEvent: notificationTriggerFor(event),
    entityType: ENTITY_TYPE_MAP[event.entity] || "SHOP",
    entityId: event.entityId,
    message: event.notification.body || event.notification.title || "New activity",
  }).catch((error) => {
    console.error("[DomainEvent] Push notification creation failed", {
      eventId: event.eventId,
      userId,
      error: error.message,
    });
  })));
}

async function publishEvent(event) {
  await getRedis().publish(DOMAIN_EVENT_CHANNEL, JSON.stringify(event));
  emitDomainEvent(event);
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
      const event = row.eventJson;
      try {
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
        const attempts = row.attempts + 1;
        await prisma.domainEventOutbox.update({
          where: { id: row.id },
          data: {
            status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
            attempts,
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
