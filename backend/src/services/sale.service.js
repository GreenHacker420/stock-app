import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import {
  applyPayments,
  calculateItemTotals,
  createStockOut,
  generateRecordNumber,
  prisma,
} from "./transactionHelpers.js";

export async function createSale(user, data) {
  await assertShopAccess(user, data.shopId);

  if (data.isWalkin && data.customerId) {
    throw new ApiError(400, "Walk-in sale cannot have a customer");
  }

  if (!data.isWalkin && data.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer || customer.shopId !== data.shopId) {
      throw new ApiError(400, "Customer does not belong to this shop");
    }
  }

  if (data.isWalkin && data.payments?.some((payment) => payment.paymentMode === "CREDIT")) {
    throw new ApiError(400, "Walk-in sale cannot use credit payment");
  }

  const { items, subtotal, discountAmount, totalAmount } = calculateItemTotals(data.items);

  return prisma.$transaction(async (tx) => {
    const saleNumber = await generateRecordNumber(tx, {
      shopId: data.shopId,
      model: "sale",
      field: "saleNumber",
      prefix: "SAL",
    });

    const sale = await tx.sale.create({
      data: {
        saleNumber,
        shopId: data.shopId,
        staffId: user.id,
        customerId: data.customerId,
        isWalkin: !!data.isWalkin,
        subtotal,
        discountAmount,
        totalAmount,
        balanceAmount: totalAmount,
        dueDate: data.dueDate,
        saleStatus: "CONFIRMED",
        customerSignature: data.customerSignature || undefined,
        items: {
          create: items.map((item) => ({
            itemId: item.itemId,
            quantity: item.quantity,
            rate: item.rate,
            discountAmount: item.discountAmount,
            totalAmount: item.lineTotal,
          })),
        },
      },
    });

    for (const item of items) {
      await createStockOut(tx, {
        shopId: data.shopId,
        itemId: item.itemId,
        quantity: item.quantity,
        movementType: "SALE",
        referenceType: "Sale",
        referenceId: sale.id,
        reason: "Sale created",
        userId: user.id,
      });
    }

    const paymentResult = await applyPayments(tx, {
      user,
      shopId: data.shopId,
      saleId: sale.id,
      customerId: data.customerId,
      totalAmount,
      payments: data.payments || [],
    });

    if (data.isWalkin && paymentResult.paymentStatus !== "PAID") {
      throw new ApiError(400, "Walk-in sale must be fully paid");
    }

    if (paymentResult.balanceAmount > 0 && data.customerId) {
      await tx.creditOutstanding.create({
        data: {
          shopId: data.shopId,
          customerId: data.customerId,
          saleId: sale.id,
          pendingAmount: paymentResult.balanceAmount,
          dueDate: data.dueDate,
          status: "PENDING",
          createdById: user.id,
        },
      });
    }

    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: {
        paidAmount: paymentResult.paidAmount,
        balanceAmount: paymentResult.balanceAmount,
        paymentStatus: paymentResult.paymentStatus,
        saleStatus: paymentResult.paymentStatus === "PAID" ? "PAID" : "PENDING_PAYMENT",
      },
      include: { items: true, payments: true },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        shopId: data.shopId,
        action: data.isWalkin ? "sale.walkin_created" : "sale.created",
        entityType: "Sale",
        entityId: sale.id,
        newValueJson: updatedSale,
      },
    });

    return updatedSale;
  });
}

export async function listSales(user, { shopId }) {
  await assertShopAccess(user, shopId);

  return prisma.sale.findMany({
    where: {
      shopId,
      staffId: user.role === "STAFF" ? user.id : undefined,
    },
    include: { customer: true, items: { include: { item: true } }, payments: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSale(user, id) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { customer: true, items: { include: { item: true } }, payments: { include: { details: true } } },
  });
  if (!sale) throw new ApiError(404, "Sale not found");
  await assertShopAccess(user, sale.shopId);
  if (user.role === "STAFF" && sale.staffId !== user.id) {
    throw new ApiError(403, "You can view only your own sales");
  }
  return sale;
}
