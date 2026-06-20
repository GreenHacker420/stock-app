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

async function deliverNotification(notificationId) {
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
    data: {
      notificationId: notification.id,
      shopId: notification.shopId,
      triggerEvent: notification.triggerEvent,
      entityType: notification.entityType,
      entityId: notification.entityId,
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
        },
      });
    }
  }));

  return { delivered: tickets.filter((ticket) => ticket.status === "ok").length };
}

export function startNotificationPushWorker() {
  const worker = new Worker(
    "notification-push",
    async (job) => deliverNotification(job.data.notificationId),
    { connection, concurrency: 5 },
  );
  worker.on("failed", (job, error) => {
    console.error(`[Notification Push Worker] Job ${job?.id || "unknown"} failed:`, error.message);
  });
  return worker;
}
