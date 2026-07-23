import { Worker } from "bullmq";
import Redis from "ioredis";
import prisma from "../lib/db.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function isExpoPushToken(token) {
  return /^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(token || "");
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
  if (!response.ok) throw new Error(payload.errors?.[0]?.message || `Expo push failed with HTTP ${response.status}`);
  return Array.isArray(payload.data) ? payload.data : [];
}

async function checkExpoPushReceipts() {
  const pendingDeliveries = await prisma.notificationPushDelivery.findMany({
    where: {
      status: "SENT",
      ticketId: { not: null },
      updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
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
          data: { status: "SENT" },
        });
      } else if (receipt.status === "error") {
        const errorCode = receipt.details?.error || null;
        const errorMessage = receipt.message || "Expo delivery error";

        console.warn(`[Notification Push Worker] Ticket ${delivery.ticketId} delivery failed: errorCode=${errorCode}, message=${errorMessage}`);

        await prisma.notificationPushDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "FAILED",
            errorCode,
            errorMessage,
          },
        });

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

  const tickets = await sendExpo(devices.map((device) => ({
    to: device.pushToken,
    sound: "default",
    title: notification.shop?.name || "ShopControl",
    body: notification.message,
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

  await Promise.all(deliveries.map(async (delivery, index) => {
    const ticket = tickets[index] || { status: "error", message: "Missing Expo ticket" };
    const failed = ticket.status !== "ok";
    await prisma.notificationPushDelivery.update({
      where: { id: delivery.id },
      data: {
        status: failed ? "FAILED" : "SENT",
        ticketId: ticket.id,
        attemptCount: { increment: 1 },
        errorCode: ticket.details?.error || null,
        errorMessage: failed ? ticket.message || "Expo rejected notification" : null,
        sentAt: failed ? null : new Date(),
      },
    });
    if (ticket.details?.error === "DeviceNotRegistered") {
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

  return { delivered: tickets.filter((ticket) => ticket.status === "ok").length };
}

let receiptTimer;

export function startNotificationPushWorker() {
  const worker = new Worker(
    "notification-push",
    async (job) => deliverNotification(job.data.notificationId),
    { connection, concurrency: 5 },
  );
  worker.on("failed", (job, error) => {
    console.error(`[Notification Push Worker] Job ${job?.id || "unknown"} failed:`, error.message);
  });

  // Run receipt check every 5 minutes
  receiptTimer = setInterval(() => {
    checkExpoPushReceipts().catch((error) => {
      console.error("[Notification Push Worker] Receipt check failed:", error.message);
    });
  }, 5 * 60 * 1000);

  // Bind custom close method to clear interval
  const originalClose = worker.close.bind(worker);
  worker.close = async () => {
    clearInterval(receiptTimer);
    await originalClose();
  };

  return worker;
}
