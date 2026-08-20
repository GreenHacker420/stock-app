import { UnrecoverableError, Worker } from "bullmq";
import Redis from "ioredis";
import prisma from "../lib/db.js";
import { expoPushTokenSchema } from "../lib/validate.js";
import { enqueueNotificationPush } from "../services/notification.push.queue.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const RECEIPT_RETENTION_MS = 24 * 60 * 60 * 1000;
const PUSH_RECOVERY_INTERVAL_MS = 30 * 1000;

function isExpoPushToken(token) {
  return expoPushTokenSchema.safeParse(token || "").success;
}

async function sendExpo(messages) {
  const headers = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(messages),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.errors?.[0]?.message || `Expo push failed with HTTP ${response.status}`;
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      throw new UnrecoverableError(message);
    }
    throw new Error(message);
  }
  return Array.isArray(payload.data) ? payload.data : [];
}

async function recoverUnqueuedNotifications() {
  const recentCutoff = new Date(Date.now() - RECEIPT_RETENTION_MS);
  const notifications = await prisma.notification.findMany({
    where: {
      createdAt: { gte: recentCutoff },
      pushDeliveries: { none: {} },
      user: {
        devices: {
          some: {
            revokedAt: null,
            notificationsEnabled: true,
            pushToken: { not: null },
          },
        },
      },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  for (const notification of notifications) {
    await enqueueNotificationPush(notification.id).catch((error) => {
      console.error(
        `[Notification Push Worker] Could not recover push enqueue for ${notification.id}:`,
        error.message,
      );
    });
  }
}

async function checkExpoPushReceipts() {
  const now = Date.now();
  const pendingDeliveries = await prisma.notificationPushDelivery.findMany({
    where: {
      status: "SENT",
      ticketId: { not: null },
      sentAt: {
        gte: new Date(now - RECEIPT_RETENTION_MS),
        lte: new Date(now - RECEIPT_DELAY_MS),
      },
    },
    take: 100,
  });

  const ticketIds = pendingDeliveries.map((d) => d.ticketId).filter(Boolean);
  if (!ticketIds.length) return;

  console.log(`[Notification Push Worker] Checking push receipts for ${ticketIds.length} tickets...`);

  try {
    const headers = {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };
    if (process.env.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    }

    const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers,
      body: JSON.stringify({ ids: ticketIds }),
    });

    if (!response.ok) {
      throw new Error(`Expo receipts endpoint failed with HTTP ${response.status}`);
    }

    const payload = await response.json();
    const receipts = payload.data || {};

    for (const delivery of pendingDeliveries) {
      const receipt = receipts[delivery.ticketId];
      if (!receipt) continue;

      if (receipt.status === "ok") {
        await prisma.notificationPushDelivery.update({
          where: { id: delivery.id },
          // A successful provider receipt is terminal for our polling lifecycle.
          // sentAt remains as the audit timestamp; clearing the ticket prevents
          // re-checking the same successful receipt for the next 24 hours.
          data: { status: "SENT", ticketId: null },
        });
      } else if (receipt.status === "error") {
        const errorCode = receipt.details?.error || null;
        const errorMessage = receipt.message || "Expo delivery error";

        console.warn(`[Notification Push Worker] Ticket ${delivery.ticketId} delivery failed: errorCode=${errorCode}, message=${errorMessage}`);

        const retryable = errorCode === "MessageRateExceeded";
        const updatedDelivery = await prisma.notificationPushDelivery.update({
          where: { id: delivery.id },
          data: {
            status: retryable ? "PENDING" : "FAILED",
            ticketId: null,
            errorCode,
            errorMessage,
          },
        });

        if (retryable) {
          await enqueueNotificationPush(delivery.notificationId, {
            delay: 2_000,
            jobIdSuffix: `receipt-${delivery.id}-${updatedDelivery.attemptCount + 1}`,
          }).catch((error) => {
            console.error(
              `[Notification Push Worker] Could not requeue rate-limited receipt ${delivery.id}:`,
              error.message,
            );
          });
        }

        if (errorCode === "DeviceNotRegistered" || (errorMessage && errorMessage.toLowerCase().includes("invalid"))) {
          console.warn(`[Notification Push Worker] Deactivating push token on device ${delivery.deviceId} due to permanent delivery failure`);
          await prisma.userDevice.update({
            where: { id: delivery.deviceId },
            data: {
              pushToken: null,
              notificationsEnabled: false,
              pushDisabledAt: new Date(),
              lastPushError: errorCode || errorMessage,
            },
          });
        }
      }
    }
  } catch (error) {
    console.error("[Notification Push Worker] Failed to check push receipts:", error.message);
  }
}

function whatsappPushData(notification, event) {
  if (!event || event.entity !== "waMessage") return null;
  return {
    type: "WHATSAPP_MESSAGE",
    shopId: notification.shopId,
    integrationId: event.integrationId,
    phoneNumberId: event.phoneNumberId,
    conversationId: event.conversationId,
    messageId: event.entityId,
    eventId: event.eventId,
  };
}

export async function deliverNotification(notificationId) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      shop: { select: { name: true } },
      user: {
        select: {
          devices: {
            where: {
              revokedAt: null,
              notificationsEnabled: true,
              pushToken: { not: null },
            },
          },
        },
      },
    },
  });
  if (!notification) return { skipped: "NOT_FOUND" };
  const outbox = notification.domainEventId
    ? await prisma.domainEventOutbox.findUnique({
        where: { id: notification.domainEventId },
        select: { eventJson: true },
      })
    : null;
  const whatsappData = whatsappPushData(notification, outbox?.eventJson);
  const whatsappNotification = whatsappData ? outbox?.eventJson?.notification : null;
  if (whatsappData?.conversationId) {
    const conversation = await prisma.waConversation.findUnique({
      where: { id: whatsappData.conversationId },
      select: { isMuted: true, mutedUntil: true },
    });
    const muteIsActive = conversation?.isMuted
      && (!conversation.mutedUntil || conversation.mutedUntil > new Date());
    if (muteIsActive) return { skipped: "WHATSAPP_CONVERSATION_MUTED" };
  }
  const devices = notification.user.devices.filter((device) => isExpoPushToken(device.pushToken));
  if (!devices.length) return { skipped: "NO_PUSH_DEVICES" };

  const deliveries = await Promise.all(devices.map((device) => prisma.notificationPushDelivery.upsert({
    where: {
      notificationId_deviceId: {
        notificationId: notification.id,
        deviceId: device.id,
      },
    },
    create: { notificationId: notification.id, deviceId: device.id },
    update: {},
  })));

  const pending = devices
    .map((device, index) => ({ device, delivery: deliveries[index] }))
    .filter(({ delivery }) => delivery.status === "PENDING");
  if (!pending.length) return { skipped: "NO_PENDING_DELIVERIES" };

  const tickets = await sendExpo(pending.map(({ device }) => ({
    to: device.pushToken,
    sound: "default",
    title: whatsappNotification?.title || notification.shop?.name || "ShopControl",
    body: whatsappNotification?.body || notification.message,
    channelId: "default",
    data: whatsappData || {
      notificationId: notification.id,
      shopId: notification.shopId,
      triggerEvent: notification.triggerEvent,
      entityType: notification.entityType,
      entityId: notification.entityId,
      eventId: notification.domainEventId,
    },
  })));

  let shouldRetry = false;
  await Promise.all(pending.map(async ({ delivery }, index) => {
    const ticket = tickets[index];
    if (!ticket) {
      shouldRetry = true;
      await prisma.notificationPushDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "PENDING",
          ticketId: null,
          attemptCount: { increment: 1 },
          errorCode: "MISSING_EXPO_TICKET",
          errorMessage: "Expo did not return a push ticket",
          sentAt: null,
        },
      });
      return;
    }

    const failed = ticket.status !== "ok";
    const errorCode = ticket.details?.error || null;
    const retryable = failed && errorCode === "MessageRateExceeded";
    if (retryable) shouldRetry = true;

    await prisma.notificationPushDelivery.update({
      where: { id: delivery.id },
      data: {
        status: retryable ? "PENDING" : (failed ? "FAILED" : "SENT"),
        ticketId: failed ? null : ticket.id,
        attemptCount: { increment: 1 },
        errorCode,
        errorMessage: failed ? ticket.message || "Expo rejected notification" : null,
        sentAt: failed ? null : new Date(),
      },
    });
    if (errorCode === "DeviceNotRegistered") {
      await prisma.userDevice.update({
        where: { id: delivery.deviceId },
        data: {
          pushToken: null,
          notificationsEnabled: false,
          pushDisabledAt: new Date(),
          lastPushError: "DeviceNotRegistered",
        },
      });
    }
  }));

  if (shouldRetry) {
    throw new Error("Expo push delivery needs retry for one or more devices");
  }

  return { delivered: tickets.filter((ticket) => ticket?.status === "ok").length };
}

let receiptTimer;
let recoveryTimer;

export function startNotificationPushWorker() {
  const worker = new Worker(
    "notification-push",
    async (job) => deliverNotification(job.data.notificationId),
    { connection, concurrency: 5 },
  );
  worker.on("failed", async (job, error) => {
    console.error(`[Notification Push Worker] Job ${job?.id || "unknown"} failed:`, error.message);
    if (!job) return;
    const attempts = job.opts.attempts || 1;
    const terminal = error instanceof UnrecoverableError || job.attemptsMade >= attempts;
    if (!terminal) return;
    await prisma.notificationPushDelivery.updateMany({
      where: {
        notificationId: job.data.notificationId,
        status: "PENDING",
      },
      data: {
        status: "FAILED",
        errorMessage: error.message || "Push delivery failed after retries",
      },
    }).catch(() => undefined);
  });

  // Recover the DB->BullMQ boundary if notification creation succeeded but queue
  // enqueue was temporarily unavailable. The deterministic default job ID keeps
  // this scan idempotent while a job is already queued/active.
  recoveryTimer = setInterval(() => {
    recoverUnqueuedNotifications().catch((error) => {
      console.error("[Notification Push Worker] Recovery scan failed:", error.message);
    });
  }, PUSH_RECOVERY_INTERVAL_MS);
  void recoverUnqueuedNotifications().catch(() => undefined);

  // Expo recommends checking receipts after roughly 15 minutes.
  receiptTimer = setInterval(() => {
    checkExpoPushReceipts().catch((error) => {
      console.error("[Notification Push Worker] Receipt check failed:", error.message);
    });
  }, RECEIPT_DELAY_MS);

  const originalClose = worker.close.bind(worker);
  worker.close = async () => {
    clearInterval(receiptTimer);
    clearInterval(recoveryTimer);
    await originalClose();
  };

  return worker;
}