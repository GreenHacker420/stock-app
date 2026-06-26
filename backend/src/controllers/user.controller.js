import crypto from "crypto";
import { asyncHandler } from "../utils/asyncHandler.js";
import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import {
  getDevicePresence,
  removeDevicePresence,
  updateDevicePresence,
} from "../services/device-presence.service.js";

function publicDevice(device) {
  return {
    id: device.id,
    installationId: device.installationId,
    platform: device.platform,
    appVersion: device.appVersion,
    buildVersion: device.buildVersion,
    deviceName: device.deviceName,
    osVersion: device.osVersion,
    notificationsEnabled: device.notificationsEnabled,
    voipEnabled: device.voipEnabled,
    lastShopId: device.lastShopId,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt,
    hasPushToken: Boolean(device.pushToken),
    hasNativePushToken: Boolean(device.nativePushToken),
    hasVoipToken: Boolean(device.voipToken),
  };
}

export const registerDevice = asyncHandler(async (req, res) => {
  const input = req.validated.body;
  const device = await prisma.$transaction(async (tx) => {
    const upserted = await tx.userDevice.upsert({
      where: {
        userId_installationId: {
          userId: req.user.id,
          installationId: input.installationId,
        },
      },
      create: {
        userId: req.user.id,
        ...input,
        lastSeenAt: new Date(),
      },
      update: {
        ...input,
        revokedAt: null,
        lastSeenAt: new Date(),
      },
    });

    if (input.pushToken) {
      const user = await tx.user.findUnique({
        where: { id: req.user.id },
        select: { pushToken: true },
      });
      if (user?.pushToken !== input.pushToken) {
        await tx.user.update({
          where: { id: req.user.id },
          data: { pushToken: input.pushToken },
        });
      }
    }

    return upserted;
  });

  res.json({ success: true, data: publicDevice(device) });
});

export const listDevices = asyncHandler(async (req, res) => {
  const devices = await prisma.userDevice.findMany({
    where: { userId: req.user.id },
    orderBy: { lastSeenAt: "desc" },
  });
  const data = await Promise.all(devices.map(async (device) => ({
    ...publicDevice(device),
    presence: device.revokedAt ? null : await getDevicePresence(device.id),
  })));
  res.json({ success: true, data });
});

export const heartbeatDevice = asyncHandler(async (req, res) => {
  const { deviceId } = req.validated.params;
  const { shopId, state, available } = req.validated.body;
  await assertShopAccess(req.user, shopId);
  const presence = await updateDevicePresence({
    deviceId,
    userId: req.user.id,
    shopId,
    state,
    available,
  });
  if (!presence) {
    return res.status(404).json({ success: false, message: "Device not found", details: null });
  }
  res.json({ success: true, data: presence });
});

export const revokeDevice = asyncHandler(async (req, res) => {
  const { deviceId } = req.validated.params;
  const device = await prisma.userDevice.findFirst({
    where: { id: deviceId, userId: req.user.id },
  });
  if (!device) {
    return res.status(404).json({ success: false, message: "Device not found", details: null });
  }
  await prisma.userDevice.update({
    where: { id: device.id },
    data: {
      revokedAt: new Date(),
      pushToken: null,
      nativePushToken: null,
      voipToken: null,
      notificationsEnabled: false,
      voipEnabled: false,
    },
  });
  if (device.lastShopId) await removeDevicePresence(device.id, device.lastShopId);
  res.status(204).send();
});

export const registerPushToken = asyncHandler(async (req, res) => {
  const { pushToken } = req.validated.body;
  const installationId = `legacy-${crypto.createHash("sha256").update(pushToken).digest("hex").slice(0, 32)}`;
  const device = await prisma.userDevice.upsert({
    where: {
      userId_installationId: {
        userId: req.user.id,
        installationId,
      },
    },
    create: {
      userId: req.user.id,
      installationId,
      platform: "ANDROID",
      pushToken,
      notificationsEnabled: true,
    },
    update: {
      pushToken,
      notificationsEnabled: true,
      revokedAt: null,
      lastSeenAt: new Date(),
    },
  });
  await prisma.user.update({
    where: { id: req.user.id },
    data: { pushToken },
  });
  res.json({ success: true, data: publicDevice(device) });
});
