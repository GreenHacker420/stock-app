import prisma from "../lib/db.js";

export async function writeAuditLog({
  userId,
  shopId,
  action,
  entityType,
  entityId,
  oldValueJson,
  newValueJson,
  reason,
}) {
  return prisma.auditLog.create({
    data: {
      userId,
      shopId,
      action,
      entityType,
      entityId,
      oldValueJson,
      newValueJson,
      reason,
    },
  });
}
