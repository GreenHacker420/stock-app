import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";

async function calculateExpectedCash(cashSessionId, openingCash, cashHandover = 0) {
  const cashPayments = await prisma.payment.aggregate({
    where: {
      cashSessionId,
      paymentMode: "CASH",
      status: { not: "CANCELLED" },
    },
    _sum: { amount: true },
  });

  return (
    Number(openingCash || 0) +
    Number(cashPayments._sum.amount || 0) -
    Number(cashHandover || 0)
  );
}

export async function openSession(user, { shopId }) {
  await assertShopAccess(user, shopId);

  const existingOpen = await prisma.cashSession.findFirst({
    where: {
      shopId,
      status: "OPEN",
    },
  });

  if (existingOpen) {
    throw new ApiError(400, "A cash session is already open for this shop");
  }

  const previousSession = await prisma.cashSession.findFirst({
    where: {
      shopId,
      status: { in: ["CLOSED", "REVIEWED", "LOCKED"] },
    },
    orderBy: [{ closedAt: "desc" }, { openedAt: "desc" }],
  });

  const previousActual = Number(previousSession?.actualCash || 0);
  const previousHandover = Number(previousSession?.cashHandover || 0);
  const openingCash = previousSession
    ? Math.max(previousActual - previousHandover, 0)
    : 0;

  const session = await prisma.cashSession.create({
    data: {
      shopId,
      staffId: user.id,
      previousSessionId: previousSession?.id,
      openingCash,
      expectedCash: openingCash,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      shopId,
      action: AuditAction.CREATED,
      entityType: EntityType.CASH_SESSION,
      entityId: session.id,
      newValueJson: session,
    }
  });

  return session;
}

export async function getCurrentSession(user, { shopId }) {
  await assertShopAccess(user, shopId);

  return prisma.cashSession.findFirst({
    where: {
      shopId,
      status: "OPEN",
    },
    include: {
      payments: {
        where: { paymentMode: "CASH" },
        orderBy: { receivedAt: "desc" },
      },
    },
    orderBy: { openedAt: "desc" },
  });
}

export async function closeSession(user, sessionId, data) {
  const existing = await prisma.cashSession.findUnique({ where: { id: sessionId } });
  if (!existing) throw new ApiError(404, "Cash session not found");
  await assertShopAccess(user, existing.shopId);

  if (existing.status !== "OPEN") {
    throw new ApiError(400, "Only an open cash session can be closed");
  }

  const expectedCash = await calculateExpectedCash(
    sessionId,
    existing.openingCash,
    data.cashHandover,
  );
  const difference = Number(data.actualCash) - expectedCash;

  if (difference !== 0 && !data.differenceReason) {
    throw new ApiError(400, "Difference reason is required when cash does not match");
  }

  const session = await prisma.cashSession.update({
    where: { id: sessionId },
    data: {
      expectedCash,
      actualCash: data.actualCash,
      cashHandover: data.cashHandover ?? 0,
      difference,
      differenceReason: data.differenceReason,
      status: "CLOSED",
      closedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      shopId: existing.shopId,
      action: AuditAction.UPDATED,
      entityType: EntityType.CASH_SESSION,
      entityId: session.id,
      oldValueJson: existing,
      newValueJson: session,
      reason: data.differenceReason,
    }
  });

  return session;
}

export async function reviewSession(user, sessionId) {
  const existing = await prisma.cashSession.findUnique({ where: { id: sessionId } });
  if (!existing) throw new ApiError(404, "Cash session not found");
  await assertShopAccess(user, existing.shopId);

  if (user.role !== "OWNER") {
    throw new ApiError(403, "Owner access required");
  }

  const session = await prisma.cashSession.update({
    where: { id: sessionId },
    data: {
      status: "REVIEWED",
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      shopId: existing.shopId,
      action: AuditAction.REVIEWED,
      entityType: EntityType.CASH_SESSION,
      entityId: session.id,
    }
  });

  return session;
}

export async function listSessions(user, { shopId, status }) {
  await assertShopAccess(user, shopId);
  return prisma.cashSession.findMany({
    where: {
      shopId,
      status: status || undefined,
    },
    include: {
      staff: {
        select: { id: true, name: true, mobile: true }
      }
    },
    orderBy: { openedAt: "desc" },
  });
}
