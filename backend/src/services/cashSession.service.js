import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";

async function calculateExpectedCash(cashSessionId, openingCash, otherDeductionsAmount = 0, cashHandover = 0) {
  const cashPayments = await prisma.payment.aggregate({
    where: {
      cashSessionId,
      paymentMode: "CASH",
      verificationStatus: { notIn: ["CANCELLED", "REFUNDED"] },
    },
    _sum: { amount: true },
  });

  return (
    Number(openingCash || 0) +
    Number(cashPayments._sum.amount || 0) -
    Number(otherDeductionsAmount || 0) -
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

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  const previousActual = Number(previousSession?.actualCash || 0);
  const previousHandover = Number(previousSession?.cashHandover || 0);
  const openingCash = previousSession
    ? Math.max(previousActual - previousHandover, 0)
    : Number(shop.openingCash || 0);

  const session = await prisma.cashSession.create({
    data: {
      shopId,
      staffId: user.id,
      previousSessionId: previousSession?.id,
      openingCash,
      expectedCash: openingCash,
    },
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId,
    action: "cash_session.opened",
    entityType: "CashSession",
    entityId: session.id,
    newValueJson: session,
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

  if (data.otherDeductionsAmount > 0 && !data.otherDeductionsReason) {
    throw new ApiError(400, "Other deductions reason is required");
  }

  const expectedCash = await calculateExpectedCash(
    sessionId,
    existing.openingCash,
    data.otherDeductionsAmount,
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
      otherDeductionsAmount: data.otherDeductionsAmount ?? 0,
      otherDeductionsReason: data.otherDeductionsReason,
      difference,
      differenceReason: data.differenceReason,
      status: "CLOSED",
      closedAt: new Date(),
    },
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId: existing.shopId,
    action: "cash_session.closed",
    entityType: "CashSession",
    entityId: session.id,
    oldValueJson: existing,
    newValueJson: session,
    reason: data.differenceReason,
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

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId: existing.shopId,
    action: "cash_session.reviewed",
    entityType: "CashSession",
    entityId: session.id,
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
