import { Router } from "express";
import { z } from "zod";
import * as userController from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";

const router = Router();
const empty = z.object({}).optional();

const pushTokenSchema = z.object({
  body: z.object({ pushToken: z.string().min(1) }),
  params: empty,
  query: empty,
});

const deviceSchema = z.object({
  body: z.object({
    installationId: z.string().min(16).max(200),
    platform: z.enum(["IOS", "ANDROID", "WEB"]),
    pushToken: z.string().min(1).max(500).optional().nullable(),
    nativePushToken: z.string().min(1).max(500).optional().nullable(),
    voipToken: z.string().min(1).max(500).optional().nullable(),
    appVersion: z.string().max(50).optional().nullable(),
    buildVersion: z.string().max(50).optional().nullable(),
    deviceName: z.string().max(200).optional().nullable(),
    osVersion: z.string().max(100).optional().nullable(),
    notificationsEnabled: z.boolean().optional(),
    voipEnabled: z.boolean().optional(),
    metadata: z.record(z.string(), z.any()).optional().nullable(),
  }),
  params: empty,
  query: empty,
});

const heartbeatSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    state: z.enum(["FOREGROUND", "BACKGROUND", "IN_CALL", "UNAVAILABLE", "DISCONNECTED"]),
    available: z.boolean(),
  }),
  params: z.object({ deviceId: z.string().min(1) }),
  query: empty,
});

const deviceIdSchema = z.object({
  body: empty,
  params: z.object({ deviceId: z.string().min(1) }),
  query: empty,
});

router.use(requireAuth);
router.get("/devices", userController.listDevices);
router.post("/devices", validate(deviceSchema), userController.registerDevice);
router.post("/devices/:deviceId/heartbeat", validate(heartbeatSchema), userController.heartbeatDevice);
router.delete("/devices/:deviceId", validate(deviceIdSchema), userController.revokeDevice);
router.post("/push-token", validate(pushTokenSchema), userController.registerPushToken);

export default router;
