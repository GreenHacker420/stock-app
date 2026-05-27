import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";

export async function listAuditLogs(user, { shopId, entityType, action, userId, dateFrom, dateTo }) {
  if (shopId) await assertShopAccess(user, shopId);

  const createdAt = {};
  if (dateFrom) createdAt.gte = new Date(dateFrom);
  if (dateTo) createdAt.lte = new Date(dateTo);

  return prisma.auditLog.findMany({
    where: {
      shopId: shopId || undefined,
      entityType: entityType || undefined,
      action: action || undefined,
      userId: userId || undefined,
      createdAt: Object.keys(createdAt).length ? createdAt : undefined,
    },
    include: {
      user: { select: { id: true, name: true, mobile: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

export function toCsv(rows) {
  const headers = ["createdAt", "user", "role", "shopId", "action", "entityType", "entityId", "reason"];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.createdAt?.toISOString?.() ?? row.createdAt,
        row.user?.name ?? row.userId ?? "System",
        row.role,
        row.shopId,
        row.action,
        row.entityType,
        row.entityId,
        row.reason,
      ].map(escape).join(","),
    ),
  ].join("\n");
}
