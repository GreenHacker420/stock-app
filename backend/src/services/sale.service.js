import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import {
  applyPayments,
  calculateItemTotals,
  createStockOut,
  generateRecordNumber,
  prisma,
  increaseCustomerDebt,
  decreaseCustomerDebt,
  getBillPaymentStatus,
} from "./transactionHelpers.js";
import { money, sub } from "../utils/money.js";
import { checkAndLockAvailableStock, expandStockRequirements } from "./stock.service.js";
import { captureCustomer, getOrCreateWalkIn } from "./customer.service.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";
import { createDomainEvent, enqueueDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";

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

    await checkAndLockAvailableStock(tx, data.shopId, items);

    // Validate serial numbers if required by the item
    for (const item of items) {
      const dbItem = await tx.item.findUnique({ where: { id: item.itemId } });
      if (!dbItem) {
        throw new ApiError(400, `Item not found: ${item.itemId}`);
      }
      if (dbItem.requiresSerialNumber) {
        if (!item.serialNumbers || !Array.isArray(item.serialNumbers) || item.serialNumbers.length !== Number(item.quantity)) {
          throw new ApiError(
            400,
            `Product "${dbItem.name}" requires exactly ${item.quantity} serial number(s). Scanned: ${item.serialNumbers ? item.serialNumbers.length : 0}`
          );
        }
      }
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
        customerSignature: data.customerSignature || null,
        items: {
          create: items.map((item) => {
            const snList = item.serialNumbers || [];
            const desc = item.description || (snList.length > 0 ? `S/N: ${snList.join(", ")}` : null);
            return {
              itemId: item.itemId,
              quantity: item.quantity,
              rate: money(item.rate),
              discountAmount: money(item.discountAmount),
              totalAmount: money(item.lineTotal),
              serialNumbers: snList.length > 0 ? snList : null,
              description: desc,
            };
          }),
        },
      },
    });

    const stockRequirements = await expandStockRequirements(tx, data.shopId, items);
    for (const item of stockRequirements) {
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

    await enqueueManyDomainEvents(tx, [
      createDomainEvent({
        shopId: data.shopId,
        entity: "sale",
        action: "created",
        entityId: sale.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
        notification: user.role === "STAFF"
          ? {
              sendPush: true,
              title: "New sale recorded",
              body: `A staff sale was recorded for ₹${Number(updatedSale.totalAmount).toLocaleString("en-IN")}.`,
              severity: "success",
              deepLink: `stock://sales/${sale.id}`,
            }
          : undefined,
      }),
      createDomainEvent({
        shopId: data.shopId,
        entity: "stock",
        action: "updated",
        entityId: sale.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: data.shopId,
        entity: "customer",
        action: "updated",
        entityId: customer.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: data.shopId,
        entity: "dashboard",
        action: "updated",
        entityId: data.shopId,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      ...((data.payments || []).length > 0 ? [createDomainEvent({
        shopId: data.shopId,
        entity: "payment",
        action: "created",
        entityId: sale.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
        notification: user.role === "STAFF"
          ? {
              sendPush: true,
              title: "Payment recorded",
              body: "A payment was recorded with a sale.",
              severity: "info",
              deepLink: `stock://sales/${sale.id}`,
            }
          : undefined,
      })] : []),
    ]);

    return updatedSale;
  });
}

export async function listSales(user, { shopId, customerId, page = 1, limit = 50, dateFrom, dateTo }) {
  await assertShopAccess(user, shopId);
  const take = Math.min(Number(limit) || 50, 200);
  const skip = (Number(page) - 1) * take;

  return prisma.sale.findMany({
    where: {
      shopId,
      customerId: customerId || undefined,
      staffId: user.role === "STAFF" ? user.id : undefined,
      createdAt: dateFrom || dateTo
        ? {
            gte: dateFrom ? new Date(dateFrom) : undefined,
            lte: dateTo ? new Date(dateTo) : undefined,
          }
        : undefined,
    },
    select: {
      id: true,
      saleNumber: true,
      shopId: true,
      customerId: true,
      isWalkin: true,
      subtotal: true,
      discountAmount: true,
      totalAmount: true,
      paidAmount: true,
      balanceAmount: true,
      paymentStatus: true,
      saleStatus: true,
      gstRequired: true,
      gstInvoiceStatus: true,
      gstInvoiceNumber: true,
      gstInvoiceGeneratedAt: true,
      createdAt: true,
      customer: { select: { id: true, name: true, phone: true, city: true, type: true } },
      staff: { select: { id: true, name: true, role: true } },
      _count: { select: { items: true, payments: true } },
    },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
}

export async function getSale(user, id) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { 
      customer: true, 
      items: { include: { item: true } }, 
      payments: { 
        include: { 
          details: true,
          receivedBy: { select: { id: true, name: true } },
          verifiedBy: { select: { id: true, name: true } }
        } 
      },
      staff: { select: { id: true, name: true, role: true } }
    },
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

  return prisma.$transaction(async (tx) => {
    const updated = await tx.sale.update({
      where: { id },
      data: {
        gstInvoiceStatus: "GENERATED",
        gstInvoiceNumber,
        gstInvoiceGeneratedAt: new Date(),
      },
      include: { customer: true, items: { include: { item: true } }, payments: true },
    });

    await enqueueDomainEvent(tx, {
      shopId: sale.shopId,
      entity: "sale",
      action: "updated",
      entityId: id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });

    return updated;
  });
}


export async function updateSale(user, id, data) {
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Only owners can update sale details");
  }

  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { items: true, payments: true }
  });
  if (!sale) throw new ApiError(404, "Sale not found");

  await assertShopAccess(user, sale.shopId);

  return prisma.$transaction(async (tx) => {
    // 1. Revert previous stock movements for this sale
    await tx.stockLedger.deleteMany({
      where: {
        shopId: sale.shopId,
        referenceType: "Sale",
        referenceId: sale.id,
      }
    });

    // 2. Revert previous customer debt increase
    await decreaseCustomerDebt(tx, sale.customerId, sale.totalAmount);

    // 3. Process items updates if provided, otherwise keep existing items
    let updatedItems = sale.items;
    if (data.items) {
      updatedItems = data.items;
    }

    // 4. Calculate new subtotal, discount, and totals
    const { items: newItems, subtotal, discountAmount: itemsDiscount, totalAmount } = calculateItemTotals(
      updatedItems.map(item => ({
        itemId: item.itemId,
        quantity: item.quantity,
        rate: item.rate,
        discountAmount: item.discountAmount || 0,
        serialNumbers: item.serialNumbers,
        description: item.description,
      }))
    );

    const newDiscountAmount = data.discountAmount !== undefined ? data.discountAmount : Number(sale.discountAmount);
    const newSubtotal = subtotal;
    const newTotalAmount = Math.max(0, Number(newSubtotal) - Number(newDiscountAmount));

    // 5. Check and Lock available stock for new items
    await checkAndLockAvailableStock(tx, sale.shopId, newItems);

    // Validate serial numbers if required by the items
    for (const item of newItems) {
      const dbItem = await tx.item.findUnique({ where: { id: item.itemId } });
      if (!dbItem) {
        throw new ApiError(400, `Item not found: ${item.itemId}`);
      }
      if (dbItem.requiresSerialNumber) {
        if (!item.serialNumbers || !Array.isArray(item.serialNumbers) || item.serialNumbers.length !== Number(item.quantity)) {
          throw new ApiError(
            400,
            `Product "${dbItem.name}" requires exactly ${item.quantity} serial number(s).`
          );
        }
      }
    }

    // 6. Delete old SaleItem entries and create new ones
    await tx.saleItem.deleteMany({
      where: { saleId: sale.id }
    });

    // 7. Write new StockOut entries
    const stockRequirements = await expandStockRequirements(tx, sale.shopId, newItems);
    for (const item of stockRequirements) {
      await createStockOut(tx, {
        shopId: sale.shopId,
        itemId: item.itemId,
        quantity: item.quantity,
        movementType: "SALE",
        referenceType: "Sale",
        referenceId: sale.id,
        reason: "Sale edited by Owner",
        userId: user.id,
      });
    }

    // 8. Calculate new payment status and balance
    const totalVal = money(newTotalAmount);
    const subtotalVal = money(newSubtotal);
    const discountVal = money(newDiscountAmount);

    const paidAmount = sale.payments
      .filter(p => p.status === "VERIFIED" || p.status === "APPROVED" || p.status === "RECEIVED")
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const paidVal = money(paidAmount);
    const balanceVal = money(Math.max(0, newTotalAmount - paidAmount));
    const newPaymentStatus = getBillPaymentStatus(totalVal, paidVal);

    // 9. Increase new customer debt
    await increaseCustomerDebt(tx, sale.customerId, totalVal);

    // 10. Update the Sale row
    const newGstRequired = data.gstRequired !== undefined ? data.gstRequired : sale.gstRequired;
    const newGstInvoiceNumber = data.gstInvoiceNumber !== undefined ? data.gstInvoiceNumber : sale.gstInvoiceNumber;
    let newGstStatus = "NOT_REQUIRED";
    if (newGstRequired) {
      newGstStatus = newGstInvoiceNumber ? "GENERATED" : "PENDING";
    }

    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: {
        gstRequired: newGstRequired,
        gstInvoiceStatus: newGstStatus,
        gstInvoiceNumber: newGstInvoiceNumber || null,
        gstInvoiceGeneratedAt: newGstInvoiceNumber ? new Date() : null,
        subtotal: subtotalVal,
        discountAmount: discountVal,
        totalAmount: totalVal,
        paidAmount: paidVal,
        balanceAmount: balanceVal,
        paymentStatus: newPaymentStatus,
        saleStatus: newPaymentStatus === "PAID" ? "PAID" : "CONFIRMED",
        notes: data.notes !== undefined ? data.notes : sale.notes,
        items: {
          create: newItems.map((item) => {
            const snList = item.serialNumbers || [];
            const desc = item.description || (snList.length > 0 ? `S/N: ${snList.join(", ")}` : null);
            return {
              itemId: item.itemId,
              quantity: item.quantity,
              rate: money(item.rate),
              discountAmount: money(item.discountAmount),
              totalAmount: money(item.lineTotal),
              serialNumbers: snList.length > 0 ? snList : null,
              description: desc,
            };
          }),
        },
      },
      include: { customer: true, items: { include: { item: true } }, payments: true },
    });

    // 11. Create Audit Log
    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: sale.shopId,
        action: AuditAction.UPDATED,
        entityType: EntityType.SALE,
        entityId: sale.id,
        details: `Sale edited by Owner: total changed from ${sale.totalAmount} to ${newTotalAmount}`,
      },
    });

    // 12. Emit domain events
    await enqueueDomainEvent(tx, {
      shopId: sale.shopId,
      entity: "sale",
      action: "updated",
      referenceId: sale.id,
      payload: { totalAmount: newTotalAmount },
    });

    return updatedSale;
  });
}
