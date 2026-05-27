import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";

export async function createNotification(txOrPrisma, { userId, shopId, triggerEvent, entityType, entityId, message }) {
  return txOrPrisma.notification.create({
    data: {
      userId,
      shopId,
      triggerEvent,
      entityType,
      entityId,
      message,
    },
  });
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
