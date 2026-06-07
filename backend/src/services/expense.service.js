import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";
import { money } from "../utils/money.js";

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
        vendorName: data.vendorName,
        createdById: user.id,
      }
    });



    await writeAuditLog({
      userId: user.id,
      shopId: data.shopId,
      action: AuditAction.CREATED,
      entityType: EntityType.EXPENSE,
      entityId: expense.id,
      newValueJson: expense
    });

    return expense;
  });
}

export async function listExpenses(user, { shopId }) {
  await assertShopAccess(user, shopId);
  return prisma.expense.findMany({
    where: { shopId },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}
