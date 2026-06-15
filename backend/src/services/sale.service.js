import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import {
  applyPayments,
  calculateItemTotals,
  createStockOut,
  generateRecordNumber,
  prisma,
  increaseCustomerDebt,
  getBillPaymentStatus,
} from "./transactionHelpers.js";
import { money, sub } from "../utils/money.js";
import { checkAndLockStockForWalkin } from "./stock.service.js";
import { captureCustomer, getOrCreateWalkIn } from "./customer.service.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";

export async function createSale(user, data) {
  await assertShopAccess(user, data.shopId);

  const { items, subtotal, discountAmount, totalAmount } = calculateItemTotals(data.items);

  return prisma.$transaction(async (tx) => {
    // Resolve Customer based on Strategy
    let customer;
    if (data.customerInfo) {
      customer = await captureCustomer(user, { 
        shopId: data.shopId, 
        ...data.customerInfo 
      });
    } else if (data.customerId) {
      customer = await tx.customer.findUnique({ where: { id: data.customerId } });
      if (!customer || customer.shopId !== data.shopId) {
        throw new ApiError(400, "Customer does not belong to this shop");
      }
    } else {
      customer = await getOrCreateWalkIn(data.shopId, user.id);
    }

    // If it's a walk-in sale, check and lock available stock
    if (data.isWalkin) {
      await checkAndLockStockForWalkin(tx, data.shopId, items);
    }

    const saleNumber = await generateRecordNumber(tx, {
      shopId: data.shopId,
      model: "sale",
      field: "saleNumber",
      prefix: "SAL",
    });

    const totalVal = money(totalAmount);
    const subtotalVal = money(subtotal);
    const discountVal = money(discountAmount);

    const sale = await tx.sale.create({
      data: {
        saleNumber,
        shopId: data.shopId,
        staffId: user.id,
        customerId: customer.id,
        isWalkin: !!data.isWalkin || customer.type === "WALK_IN",
        gstRequired: !!data.gstRequired,
        gstInvoiceStatus: data.gstRequired ? "PENDING" : "NOT_REQUIRED",
        subtotal: subtotalVal,
        discountAmount: discountVal,
        totalAmount: totalVal,
        balanceAmount: totalVal,
        saleStatus: "CONFIRMED",
        items: {
          create: items.map((item) => ({
            itemId: item.itemId,
            quantity: item.quantity,
            rate: money(item.rate),
            discountAmount: money(item.discountAmount),
            totalAmount: money(item.lineTotal),
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

    // Every sale increases debt/reduces advance for the linked customer
    await increaseCustomerDebt(tx, customer.id, totalVal);

    const paymentResult = await applyPayments(tx, {
      user,
      shopId: data.shopId,
      saleId: sale.id,
      customerId: customer.id,
      totalAmount: totalVal,
      payments: (data.payments || []).map((p) => ({
        ...p,
        notes: p.notes || data.notes,
      })),
    });

    if (data.isWalkin && paymentResult.paymentStatus !== "PAID") {
      throw new ApiError(400, "Walk-in sale must be fully paid");
    }

    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: {
        paidAmount: paymentResult.paidAmount,
        balanceAmount: paymentResult.balanceAmount,
        paymentStatus: paymentResult.paymentStatus,
        saleStatus: paymentResult.paymentStatus === "PAID" ? "PAID" : "CONFIRMED",
      },
      include: { items: true, payments: true },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: data.shopId,
        action: data.isWalkin ? AuditAction.WALKIN_CREATED : AuditAction.CREATED,
        entityType: EntityType.SALE,
        entityId: sale.id,
        newValueJson: updatedSale,
      },
    });

    return updatedSale;
  });
}

export async function listSales(user, { shopId, customerId }) {
  await assertShopAccess(user, shopId);

  return prisma.sale.findMany({
    where: {
      shopId,
      customerId: customerId || undefined,
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

export async function updateGstInvoice(user, id, { gstInvoiceNumber }) {
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Only owners can update GST invoice status");
  }

  const sale = await prisma.sale.findUnique({ where: { id } });
  if (!sale) throw new ApiError(404, "Sale not found");

  await assertShopAccess(user, sale.shopId);

  return prisma.sale.update({
    where: { id },
    data: {
      gstInvoiceStatus: "GENERATED",
      gstInvoiceNumber,
      gstInvoiceGeneratedAt: new Date(),
    },
    include: { customer: true, items: { include: { item: true } }, payments: true },
  });
}
