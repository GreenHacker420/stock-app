import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";
import { money } from "../utils/money.js";
import { createDomainEvent, enqueueDomainEvent } from "./domain-event.service.js";

export async function createExpense(user, data) {
  await assertShopAccess(user, data.shopId);

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        shopId: data.shopId,
        amount: money(data.amount),
        category: data.category,
        note: data.note,
        photoUrl: data.photoUrl,
        createdById: user.id,
      }
    });



    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: data.shopId,
        action: AuditAction.CREATED,
        entityType: EntityType.EXPENSE,
        entityId: expense.id,
        newValueJson: expense,
      },
    });

    return expense;
  });
}

export async function listExpenses(user, { shopId }) {
  await assertShopAccess(user, shopId);
  return prisma.expense.findMany({
    where: { shopId },
    include: {
      createdBy: { select: { id: true, name: true } },
      verifiedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function verifyExpense(user, id, { status, note }) {
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Owner access required");
  }

  const existing = await prisma.expense.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  if (!existing) throw new ApiError(404, "Expense not found");
  await assertShopAccess(user, existing.shopId);

  if (!["APPROVED", "REJECTED"].includes(status)) {
    throw new ApiError(400, "Invalid expense verification status");
  }

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.update({
      where: { id },
      data: {
        status,
        verificationNote: note,
        verifiedById: user.id,
        verifiedAt: new Date(),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        verifiedBy: { select: { id: true, name: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: existing.shopId,
        action: status === "APPROVED" ? AuditAction.APPROVED : AuditAction.REJECTED,
        entityType: EntityType.EXPENSE,
        entityId: id,
        oldValueJson: existing,
        newValueJson: expense,
        reason: note,
      },
    });

    await enqueueDomainEvent(tx, createDomainEvent({
      shopId: existing.shopId,
      entity: "expense",
      action: status.toLowerCase(),
      entityId: id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true, targetUserIds: [existing.createdById] },
    }));

    return expense;
  });
}
