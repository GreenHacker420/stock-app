import { Router } from "express";
import { z } from "zod";
import * as notificationController from "../controllers/notification.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
  validate(z.object({
    query: z.object({
      shopId: z.string().optional(),
      unread: z.enum(["true", "false"]).optional(),
    }),
    params: z.object({}).optional(),
    body: z.object({}).optional(),
  })),
  notificationController.listNotifications,
);

router.post(
  "/mark-all-read",
  requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
  validate(z.object({
    body: z.object({ shopId: z.string().optional() }).optional(),
    params: z.object({}).optional(),
    query: z.object({}).optional(),
  })),
  notificationController.markAllRead,
);

router.post(
  "/test-push",
  requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
  validate(z.object({
    body: z.object({
      shopId: z.string().min(1),
      message: z.string().trim().min(1).max(180).optional(),
    }),
    params: z.object({}).optional(),
    query: z.object({}).optional(),
  })),
  notificationController.sendTestPush,
);

router.post(
  "/:id/mark-read",
  requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
  validate(z.object({ params: z.object({ id: z.string().min(1) }) })),
  notificationController.markRead,
);

export default router;
