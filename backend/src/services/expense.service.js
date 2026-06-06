import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
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

    await tx.verificationQueue.create({
      data: {
        shopId: data.shopId,
        entityType: "EXPENSE",
        entityId: expense.id,
        action: "CREATE",
        status: "PENDING",
        requestedById: user.id,
        notes: data.note
      }
    });

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: data.shopId,
      action: "expense.created",
      entityType: "Expense",
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
