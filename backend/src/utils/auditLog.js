import prisma from "../lib/db.js";

export async function writeAuditLog({
  userId,
  role,
  shopId,
  action,
  entityType,
  entityId,
  oldValueJson,
  newValueJson,
  reason,
  deviceInfo,
}) {
  return prisma.auditLog.create({
    data: {
      userId,
      role,
      shopId,
      action,
      entityType,
      entityId,
      oldValueJson,
      newValueJson,
      reason,
      deviceInfo,
    },
  });
}
