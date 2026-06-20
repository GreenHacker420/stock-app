import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { enqueueNotificationPush } from "./notification.push.queue.js";

export async function createNotification(txOrPrisma, { userId, shopId, triggerEvent, entityType, entityId, message }) {
  const notification = await txOrPrisma.notification.create({
    data: {
      userId,
      shopId,
      triggerEvent,
      entityType,
      entityId,
      message,
    },
  });
  enqueueNotificationPush(notification.id).catch((error) => {
    console.error(`[Notification] Could not enqueue push for ${notification.id}:`, error.message);
  });
  return notification;
}

export async function notifyShopOwner(txOrPrisma, { shopId, triggerEvent, entityType, entityId, message }) {
  const shop = await txOrPrisma.shop.findUnique({ where: { id: shopId }, select: { ownerId: true } });
  if (!shop) return null;
  return createNotification(txOrPrisma, {
    userId: shop.ownerId,
    shopId,
    triggerEvent,
    entityType,
    entityId,
    message,
  });
}

export async function listNotifications(user, { shopId, unread }) {
  if (shopId) await assertShopAccess(user, shopId);

  return prisma.notification.findMany({
    where: {
      userId: user.id,
      shopId: shopId || undefined,
      isRead: unread === "true" ? false : undefined,
    },
    include: { shop: { select: { id: true, name: true, city: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function markRead(user, id) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) throw new ApiError(404, "Notification not found");
  if (notification.userId !== user.id) throw new ApiError(403, "You can mark only your notifications");

  return prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
}

export async function markAllRead(user, { shopId }) {
  if (shopId) await assertShopAccess(user, shopId);

  await prisma.notification.updateMany({
    where: { userId: user.id, shopId: shopId || undefined, isRead: false },
    data: { isRead: true },
  });

  return { markedRead: true };
}

export async function createTestNotification(user, { shopId, message }) {
  await assertShopAccess(user, shopId);
  return createNotification(prisma, {
    userId: user.id,
    shopId,
    triggerEvent: "TEST_NOTIFICATION",
    entityType: "WHATSAPP",
    entityId: null,
    message: message || "ShopControl notifications are configured correctly.",
  });
}
