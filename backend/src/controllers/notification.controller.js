import { asyncHandler } from "../utils/asyncHandler.js";
import * as notificationService from "../services/notification.service.js";
import { emitShopEvent, REALTIME_EVENTS } from "../utils/realtime.js";

export const listNotifications = asyncHandler(async (req, res) => {
  const notifications = await notificationService.listNotifications(req.user, req.validated.query);
  res.json({ success: true, data: notifications });
});

export const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.user, req.validated.params.id);
  emitShopEvent(req, notification.shopId, REALTIME_EVENTS.NOTIFICATION_CREATED, { notificationId: notification.id, action: "read" });
  res.json({ success: true, data: notification });
});

export const markAllRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllRead(req.user, req.validated.body ?? {});
  res.json({ success: true, data: result });
});

export const sendTestPush = asyncHandler(async (req, res) => {
  const notification = await notificationService.createTestNotification(req.user, req.validated.body);
  emitShopEvent(req, notification.shopId, REALTIME_EVENTS.NOTIFICATION_CREATED, {
    notificationId: notification.id,
    triggerEvent: notification.triggerEvent,
    message: notification.message,
  });
  res.status(202).json({ success: true, data: notification });
});
