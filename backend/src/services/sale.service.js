import axios from "axios";
import FormData from "form-data";
import { getWaCredentials } from "../lib/wa-cache.js";
import { NON_DIGIT_REGEX } from "../lib/validate.js";
import { generateAndUploadSaleInvoicePdf, getInvoicePdfBuffer } from "./pdf.service.js";
import { whatsappService } from "./whatsapp.service.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import {
  calculateItemTotals,
  createStockOut,
  createStockIn,
  generateRecordNumber,
  getBillPaymentStatus,
} from "./transactionHelpers.js";
import { applyPayments } from "./payment-accounting.service.js";
import prisma from "../lib/db.js";

import { money, sub, add } from "../utils/money.js";
import { checkAndLockAvailableStock, expandStockRequirements } from "./stock.service.js";
import { captureCustomer, getOrCreateWalkIn } from "./customer.service.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";
import { createDomainEvent, enqueueDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";
import { postLedgerEntry, reverseLedgerEntry } from "./customer-ledger.service.js";

const getIndiaDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const resolveSaleDate = (value) => {
  if (!value) return new Date();
  if (value > getIndiaDateKey()) {
    throw new ApiError(400, "Sale date cannot be in the future");
  }
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, "Invalid sale date");
  }
  return date;
};

export async function createSale(user, data) {
  await assertShopAccess(user, data.shopId);

  const { items, subtotal, discountAmount, totalAmount } = calculateItemTotals(data.items);
  const saleDate = resolveSaleDate(data.saleDate);

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
      date: saleDate,
      dateField: "saleDate",
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
        saleDate,
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

    // Every non-walkin sale posts a SALE_POSTED DEBIT to CustomerLedger
    if (customer.type !== "WALK_IN") {
      await postLedgerEntry(tx, {
        shopId: data.shopId,
        customerId: customer.id,
        sourceType: "SALE",
        sourceId: sale.id,
        entryType: "SALE_POSTED",
        direction: "DEBIT",
        amount: totalVal,
        createdById: user.id,
        effectiveAt: data.saleDate || new Date(),
      });
    }


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
      include: {
        customer: true,
        items: {
          include: {
            item: { include: { category: true, brand: true } },
          },
        },
        payments: {
          include: {
            details: true,
            receivedBy: { select: { id: true, name: true } },
            verifiedBy: { select: { id: true, name: true } },
          },
        },
        staff: { select: { id: true, name: true, role: true } },
      },
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
      saleDate: dateFrom || dateTo
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
      cancelledAt: true,
      cancelReason: true,
      gstRequired: true,
      gstInvoiceStatus: true,
      gstInvoiceNumber: true,
      gstInvoiceGeneratedAt: true,
      saleDate: true,
      createdAt: true,
      customer: { select: { id: true, name: true, phone: true, city: true, type: true } },
      staff: { select: { id: true, name: true, role: true } },
      _count: { select: { items: true, payments: true } },
    },
    orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
    skip,
    take,
  });
}

export async function getSale(user, id) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { 
      customer: true, 
      items: { 
        include: { 
          item: { 
            include: { 
              category: true, 
              brand: true 
            } 
          } 
        } 
      },
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

  // Compute real-time balance from actual payment records 
  const verifiedPaid = sale.payments
    .filter((p) => p.status === "VERIFIED")
    .reduce((sum, p) => add(sum, p.amount), money(0));
  const recordedPaid = sale.payments
    .filter((p) => p.status === "RECORDED")
    .reduce((sum, p) => add(sum, p.amount), money(0));
  const computedBalance = money(Math.max(0, Number(sub(sale.totalAmount, verifiedPaid))));

  return {
    ...sale,
    balanceAmount: computedBalance,
    verifiedPaidAmount: verifiedPaid,
    recordedPaymentAmount: recordedPaid,
  };
}

export async function updateSale(user, id, data) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { items: true, payments: true }
  });
  if (!sale) throw new ApiError(404, "Sale not found");
  await assertShopAccess(user, sale.shopId);

  const hasItemsChanged = (data.items !== undefined || data.discountAmount !== undefined);

  if (sale.saleStatus !== "DRAFT") {
    if (user.role !== "OWNER") {
      throw new ApiError(403, "Only owners can edit confirmed sales");
    }
    if (hasItemsChanged) {
      throw new ApiError(400, "Cannot directly edit a confirmed sale. Use the amendments endpoint instead.");
    }
  }

  return prisma.$transaction(async (tx) => {
    let newItems = [];
    let subtotalVal = sale.subtotal;
    let discountVal = sale.discountAmount;
    let totalVal = sale.totalAmount;
    let balanceVal = sale.balanceAmount;
    let newPaymentStatus = sale.paymentStatus;

    if (hasItemsChanged) {
      let updatedItems = sale.items;
      if (data.items) {
        const existingItemsById = new Map(sale.items.map((item) => [item.itemId, item]));
        updatedItems = data.items.map((item) => {
          const existingItem = existingItemsById.get(item.itemId);
          return {
            ...item,
            discountAmount: item.discountAmount ?? existingItem?.discountAmount ?? 0,
            serialNumbers: item.serialNumbers ?? existingItem?.serialNumbers ?? undefined,
            description: item.description ?? existingItem?.description ?? undefined,
          };
        });
      }

      const { items: processedItems, subtotal: computedSubtotal, totalAmount: computedTotal } = calculateItemTotals(
        updatedItems.map(item => ({
          itemId: item.itemId,
          quantity: item.quantity,
          rate: item.rate,
          discountAmount: item.discountAmount || 0,
          serialNumbers: item.serialNumbers,
          description: item.description,
        }))
      );

      newItems = processedItems;
      const newDiscountAmount = data.discountAmount !== undefined ? data.discountAmount : Number(sale.discountAmount);
      const newTotalAmount = Math.max(0, Number(computedSubtotal) - Number(newDiscountAmount));

      subtotalVal = money(computedSubtotal);
      discountVal = money(newDiscountAmount);
      totalVal = money(newTotalAmount);

      const paidAmount = sale.payments
        .filter(p => p.status === "VERIFIED" || p.status === "APPROVED" || p.status === "RECEIVED")
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const paidVal = money(paidAmount);
      balanceVal = money(Math.max(0, newTotalAmount - paidAmount));
      newPaymentStatus = getBillPaymentStatus(totalVal, paidVal);

      await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
    }

    const newGstRequired = data.gstRequired !== undefined ? data.gstRequired : sale.gstRequired;
    let newGstInvoiceNumber = data.gstInvoiceNumber !== undefined ? data.gstInvoiceNumber : sale.gstInvoiceNumber;
    let newGstStatus = "NOT_REQUIRED";
    if (newGstRequired) {
      newGstStatus = newGstInvoiceNumber ? "GENERATED" : "PENDING";
    } else {
      newGstInvoiceNumber = null;
    }

    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: {
        gstRequired: newGstRequired,
        gstInvoiceStatus: newGstStatus,
        gstInvoiceNumber: newGstInvoiceNumber,
        gstInvoiceGeneratedAt: newGstInvoiceNumber ? (sale.gstInvoiceGeneratedAt || new Date()) : null,
        subtotal: subtotalVal,
        discountAmount: discountVal,
        totalAmount: totalVal,
        balanceAmount: balanceVal,
        paymentStatus: newPaymentStatus,
        saleStatus: (sale.saleStatus !== "DRAFT") ? sale.saleStatus : (newPaymentStatus === "PAID" ? "PAID" : "DRAFT"),
        ...(hasItemsChanged ? {
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
        } : {})
      },
      include: { customer: true, items: { include: { item: true } }, payments: true },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: sale.shopId,
        action: AuditAction.UPDATED,
        entityType: EntityType.SALE,
        entityId: sale.id,
        reason: `Sale updated by ${user.role}. GST Required: ${newGstRequired}, Invoice Number: ${newGstInvoiceNumber || "None"}. Notes: ${data.notes || "None"}`,
      },
    });

    await enqueueDomainEvent(tx, {
      shopId: sale.shopId,
      entity: "sale",
      action: "updated",
      entityId: sale.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true },
    });

    return updatedSale;
  });
}

export async function amendSale(user, id, data) {
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Only owners can amend confirmed sales");
  }

  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { items: { include: { item: true } }, payments: true }
  });
  if (!sale) throw new ApiError(404, "Sale not found");
  await assertShopAccess(user, sale.shopId);

  return prisma.$transaction(async (tx) => {
    // 1. Optimistic Concurrency check
    const result = await tx.sale.updateMany({
      where: {
        id,
        version: data.expectedVersion,
      },
      data: {
        version: {
          increment: 1,
        },
      },
    });

    if (result.count !== 1) {
      throw new ApiError(
        409,
        "This sale was modified by another user. Please refresh and review the latest version."
      );
    }

    // 2. Parse new items configuration. Existing immutable product details are
    // inherited when an amount-only edit comes from an older client.
    const beforeMap = new Map(sale.items.map(item => [item.itemId, item]));
    const requestedItems = data.items.map((item) => {
      const beforeItem = beforeMap.get(item.itemId);
      return {
        ...item,
        discountAmount: item.discountAmount ?? beforeItem?.discountAmount ?? 0,
        serialNumbers: item.serialNumbers ?? beforeItem?.serialNumbers ?? undefined,
        description: item.description ?? beforeItem?.description ?? undefined,
      };
    });

    const { items: newItems, subtotal, discountAmount: itemsDiscount, totalAmount } = calculateItemTotals(
      requestedItems.map(item => ({
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

    // 3. Compute delta and validate stock
    const afterMap = new Map(newItems.map(item => [item.itemId, item]));
    const allItemIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    
    const stockDeltas = [];
    for (const itemId of allItemIds) {
      const beforeItem = beforeMap.get(itemId);
      const afterItem = afterMap.get(itemId);

      const beforeQty = beforeItem ? Number(beforeItem.quantity) : 0;
      const afterQty = afterItem ? Number(afterItem.quantity) : 0;
      const deltaQty = afterQty - beforeQty;

      if (deltaQty !== 0) {
        stockDeltas.push({
          itemId,
          name: afterItem?.name || beforeItem?.item?.name || "Product",
          beforeQty,
          afterQty,
          deltaQty,
        });
      }
    }

    // Check available stock for positive deltas
    for (const change of stockDeltas) {
      if (change.deltaQty > 0) {
        await checkAndLockAvailableStock(tx, sale.shopId, [{
          itemId: change.itemId,
          quantity: change.deltaQty,
        }]);
      }
    }

    // 4. Validate serial numbers for new configuration
    for (const item of newItems) {
      const dbItem = await tx.item.findUnique({ where: { id: item.itemId } });
      if (!dbItem) throw new ApiError(400, `Item not found: ${item.itemId}`);
      if (dbItem.requiresSerialNumber) {
        if (!item.serialNumbers || !Array.isArray(item.serialNumbers) || item.serialNumbers.length !== Number(item.quantity)) {
          throw new ApiError(
            400,
            `Product "${dbItem.name}" requires exactly ${item.quantity} serial number(s).`
          );
        }
      }
    }

    // 5. Append Stock Ledger (Append-only)
    for (const change of stockDeltas) {
      if (change.deltaQty > 0) {
        await createStockOut(tx, {
          shopId: sale.shopId,
          itemId: change.itemId,
          quantity: change.deltaQty,
          movementType: "SALE",
          referenceType: "Sale",
          referenceId: sale.id,
          reason: `Sale Amendment: quantity increased by ${change.deltaQty} (Reason: ${data.reason})`,
          userId: user.id,
        });
      } else if (change.deltaQty < 0) {
        await tx.stockLedger.create({
          data: {
            shopId: sale.shopId,
            itemId: change.itemId,
            movementType: "SALE",
            quantityIn: Math.abs(change.deltaQty),
            quantityOut: 0,
            referenceType: "Sale",
            referenceId: sale.id,
            reason: `Sale Amendment: quantity decreased by ${Math.abs(change.deltaQty)} (Reason: ${data.reason})`,
            createdById: user.id,
          }
        });
      }
    }

    // 6. Create SaleAmendment record FIRST — its ID is the sourceId for all ledger entries
    const prevTotal = Number(sale.totalAmount);
    const financialDelta = newTotalAmount - prevTotal;

    const beforeSnapshot = sale.items.map(item => ({
      itemId: item.itemId,
      quantity: Number(item.quantity),
      rate: Number(item.rate),
      discountAmount: Number(item.discountAmount),
    }));

    const afterSnapshot = newItems.map(item => ({
      itemId: item.itemId,
      quantity: Number(item.quantity),
      rate: Number(item.rate),
      discountAmount: Number(item.discountAmount),
    }));

    // 7. Recalculate Payment Statuses
    const totalVal = money(newTotalAmount);
    const subtotalVal = money(newSubtotal);
    const discountVal = money(newDiscountAmount);

    const paidAmount = sale.payments
      .filter(p => p.status === "VERIFIED" || p.status === "APPROVED" || p.status === "RECEIVED")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const paidVal = money(paidAmount);
    const balanceVal = money(Math.max(0, newTotalAmount - paidAmount));
    const newPaymentStatus = getBillPaymentStatus(totalVal, paidVal);

    // 8. Replace SaleItem records
    await tx.saleItem.deleteMany({ where: { saleId: sale.id } });

    const newGstRequired = data.gstRequired !== undefined ? data.gstRequired : sale.gstRequired;
    let newGstInvoiceNumber = data.gstInvoiceNumber !== undefined ? data.gstInvoiceNumber : sale.gstInvoiceNumber;
    let newGstStatus = "NOT_REQUIRED";
    if (newGstRequired) {
      newGstStatus = newGstInvoiceNumber ? "GENERATED" : "PENDING";
    } else {
      newGstInvoiceNumber = null;
    }

    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: {
        gstRequired: newGstRequired,
        gstInvoiceStatus: newGstStatus,
        gstInvoiceNumber: newGstInvoiceNumber,
        gstInvoiceGeneratedAt: newGstInvoiceNumber ? (sale.gstInvoiceGeneratedAt || new Date()) : null,
        subtotal: subtotalVal,
        discountAmount: discountVal,
        totalAmount: totalVal,
        paidAmount: paidVal,
        balanceAmount: balanceVal,
        paymentStatus: newPaymentStatus,
        saleStatus: newPaymentStatus === "PAID" ? "PAID" : "CONFIRMED",
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

    // 9. Save Amendment log FIRST — use amendment.id as ledger sourceId (prevents collision on multi-amendment)
    const saleAmendment = await tx.saleAmendment.create({
      data: {
        saleId: sale.id,
        version: updatedSale.version,
        previousSubtotal: sale.subtotal,
        newSubtotal: subtotalVal,
        previousTotal: sale.totalAmount,
        newTotal: totalVal,
        reason: data.reason,
        createdById: user.id,
        beforeSnapshot,
        afterSnapshot,
        stockDelta: stockDeltas,
        financialDelta: {
          previousTotal: prevTotal,
          newTotal: newTotalAmount,
          difference: financialDelta,
        },
      }
    });

    // 10. Post financial delta to customer ledger using amendment.id as sourceId
    if (Math.abs(financialDelta) > 0.001 && sale.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: sale.customerId } });
      if (customer && customer.type !== "WALK_IN") {
        if (financialDelta > 0) {
          await postLedgerEntry(tx, {
            shopId: sale.shopId,
            customerId: sale.customerId,
            sourceType: "SALE_AMENDMENT",
            sourceId: saleAmendment.id,
            entryType: "SALE_VALUE_INCREASE",
            direction: "DEBIT",
            amount: Math.abs(financialDelta),
            createdById: user.id,
            notes: `Sale Amendment (v${updatedSale.version}) value increase: ${data.reason}`,
            metadata: { saleId: sale.id, amendmentId: saleAmendment.id },
          });
        } else {
          await postLedgerEntry(tx, {
            shopId: sale.shopId,
            customerId: sale.customerId,
            sourceType: "SALE_AMENDMENT",
            sourceId: saleAmendment.id,
            entryType: "SALE_VALUE_DECREASE",
            direction: "CREDIT",
            amount: Math.abs(financialDelta),
            createdById: user.id,
            notes: `Sale Amendment (v${updatedSale.version}) value decrease: ${data.reason}`,
            metadata: { saleId: sale.id, amendmentId: saleAmendment.id },
          });
        }
      }
    }

    // 11. Audit Log and Event outbox
    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: sale.shopId,
        action: AuditAction.UPDATED,
        entityType: EntityType.SALE,
        entityId: sale.id,
        reason: `Sale amended (Version ${updatedSale.version}): total changed from ${prevTotal} to ${newTotalAmount} (Reason: ${data.reason})`,
      },
    });

    await enqueueDomainEvent(tx, {
      shopId: sale.shopId,
      entity: "sale",
      action: "amended",
      entityId: sale.id,
      actorUserId: user.id,
      actorRole: user.role,
      payload: { totalAmount: newTotalAmount, version: updatedSale.version },
    });

    return updatedSale;
  });
}


export async function issueInvoice(user, id, data) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { items: { include: { item: true } }, customer: true }
  });
  if (!sale) throw new ApiError(404, "Sale not found");
  await assertShopAccess(user, sale.shopId);

  return prisma.$transaction(async (tx) => {
    // Frozen snapshot of the sale
    const saleSnapshot = {
      saleNumber: sale.saleNumber,
      customer: {
        name: sale.customer.name,
        gstin: sale.customer.gstin,
        phone: sale.customer.phone,
        address: sale.customer.address,
      },
      items: sale.items.map(item => ({
        name: item.item.name,
        sku: item.item.sku,
        quantity: Number(item.quantity),
        rate: Number(item.rate),
        discountAmount: Number(item.discountAmount),
        totalAmount: Number(item.totalAmount),
      })),
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discountAmount),
      totalAmount: Number(sale.totalAmount),
    };

    const sub = Number(sale.subtotal);
    const disc = Number(sale.discountAmount);
    const taxable = Math.max(0, sub - disc);
    
    // In India, Local GST is split as CGST + SGST (9% each for standard 18% slab)
    const cgst = taxable * 0.09;
    const sgst = taxable * 0.09;

    const invoice = await tx.invoice.create({
      data: {
        saleId: sale.id,
        invoiceNumber: data.invoiceNumber,
        status: "ISSUED",
        issuedAt: data.issuedAt || new Date(),
        saleSnapshot,
        subtotal: sub,
        discountAmount: disc,
        taxableAmount: taxable,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: 0,
        grandTotal: taxable + cgst + sgst,
      }
    });

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        gstInvoiceStatus: "GENERATED",
        gstInvoiceNumber: data.invoiceNumber,
        gstInvoiceGeneratedAt: data.issuedAt || new Date(),
      }
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: sale.shopId,
        action: AuditAction.APPROVED,
        entityType: EntityType.SALE,
        entityId: sale.id,
        reason: `Invoice issued for sale #${sale.saleNumber}: ${data.invoiceNumber}`,
      },
    });

    return invoice;
  });
}

export async function cancelInvoice(user, id, data) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { invoices: { where: { status: "ISSUED" } } }
  });
  if (!sale) throw new ApiError(404, "Sale not found");
  await assertShopAccess(user, sale.shopId);

  const activeInvoice = sale.invoices[0];
  if (!activeInvoice) throw new ApiError(400, "No active issued invoice found for this sale");

  return prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: activeInvoice.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      }
    });

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        gstInvoiceStatus: "PENDING",
        gstInvoiceNumber: null,
      }
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: sale.shopId,
        action: AuditAction.VOIDED,
        entityType: EntityType.SALE,
        entityId: sale.id,
        reason: `Invoice ${activeInvoice.invoiceNumber} cancelled for sale #${sale.saleNumber}`,
      },
    });

    return { success: true };
  });
}

export async function cancelSale(user, id, { reason = "Cancelled by owner" } = {}) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { items: true, payments: true, customer: true },
  });

  if (!sale) {
    throw new ApiError(404, "Sale not found");
  }
  await assertShopAccess(user, sale.shopId);

  if (sale.saleStatus === "CANCELLED") {
    throw new ApiError(400, "Sale is already cancelled");
  }

  return prisma.$transaction(async (tx) => {
    // 1. Restore Stock
    for (const item of sale.items) {
      await createStockIn(tx, {
        shopId: sale.shopId,
        itemId: item.itemId,
        quantity: item.quantity,
        movementType: "RETURN",
        referenceType: "Sale",
        referenceId: sale.id,
        reason: `Sale ${sale.saleNumber} cancelled: ${reason}`,
        userId: user.id,
      });
    }

    // 2. Revert Customer Debt by reversing original SALE_POSTED debit entry
    // Walk-in sales have no receivable ledger entry — skip ledger lookup.
    const customerType = sale.customer?.type
      || (sale.customerId
        ? (await tx.customer.findUnique({ where: { id: sale.customerId }, select: { type: true } }))?.type
        : null);

    if (sale.customerId && customerType && customerType !== "WALK_IN") {
      // DM-originated sales must not reverse SALE_POSTED (debt came from DM)
      if (sale.receivableOrigin === "DELIVERY_MEMO") {
        // No SALE_POSTED to reverse — DM debit remains until DM is cancelled/reversed separately
      } else {
        const originalEntry = await tx.customerLedgerEntry.findFirst({
          where: { shopId: sale.shopId, sourceType: "SALE", sourceId: sale.id, entryType: "SALE_POSTED" },
        });
        if (!originalEntry) {
          throw new ApiError(409, "Original SALE_POSTED ledger entry is missing; sale cannot be cancelled", {
            code: "LEDGER_ENTRY_MISSING",
          });
        }
        await reverseLedgerEntry(tx, {
          shopId: sale.shopId,
          entryId: originalEntry.id,
          reversalReason: reason,
          createdById: user.id,
        });
      }
    }


    // 3. Mark Sale as CANCELLED
    const updatedSale = await tx.sale.update({
      where: { id },
      data: {
        saleStatus: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason,
      },
      include: { items: true, payments: true },
    });

    // 4. Audit log & Domain Events
    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: sale.shopId,
        action: AuditAction.VOIDED,
        entityType: EntityType.SALE,
        entityId: sale.id,
        newValueJson: { status: "CANCELLED", reason },
      },
    });

    await enqueueManyDomainEvents(tx, [
      createDomainEvent({
        shopId: sale.shopId,
        entity: "sale",
        action: "updated",
        entityId: sale.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: sale.shopId,
        entity: "stock",
        action: "updated",
        entityId: sale.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
    ]);

    return updatedSale;
  });
}

export async function sendSaleWhatsAppReceipt(user, id, { recipientPhone } = {}) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      items: { include: { item: { include: { brand: true } } } },
      customer: true,
      shop: true,
      payments: {
        include: {
          details: true,
          receivedBy: { select: { id: true, name: true } },
        },
      },
      staff: { select: { id: true, name: true } },
    },
  });

  if (!sale) {
    throw new ApiError(404, "Sale not found");
  }
  await assertShopAccess(user, sale.shopId);

  const targetPhone = recipientPhone || sale.customer?.phone;
  if (!targetPhone) {
    throw new ApiError(400, "Customer phone number is required to send WhatsApp receipt");
  }

  const creds = await getWaCredentials(sale.shopId);
  if (!creds || !creds.accessToken || !creds.phoneNumberId) {
    throw new ApiError(400, "WhatsApp Business API is not configured or connected for this shop");
  }

  const shopName = sale.shop?.name || "Vardaman Sales";
  const customerName = sale.isWalkin ? "Customer" : (sale.customer?.name || "Valued Customer");
  let normalizedPhone = targetPhone.replace(NON_DIGIT_REGEX, "");
  if (normalizedPhone.startsWith("0")) normalizedPhone = normalizedPhone.slice(1);
  if (normalizedPhone.length === 10) normalizedPhone = `91${normalizedPhone}`;
  if (normalizedPhone.length !== 12 || !normalizedPhone.startsWith("91")) {
    throw new ApiError(400, "A valid Indian WhatsApp mobile number is required");
  }

  let invoiceAsset;
  let mediaId;
  try {
    invoiceAsset = await generateAndUploadSaleInvoicePdf({
      sale,
      shop: sale.shop,
    });

    mediaId = invoiceAsset.externalId;
    if (!mediaId) {
      const pdfBuffer = await getInvoicePdfBuffer(invoiceAsset);
      const mediaForm = new FormData();
      mediaForm.append("messaging_product", "whatsapp");
      mediaForm.append("file", pdfBuffer, {
        filename: invoiceAsset.fileName,
        contentType: "application/pdf",
        knownLength: pdfBuffer.length,
      });

      const mediaUrl = `https://graph.facebook.com/v25.0/${creds.phoneNumberId}/media`;
      const mediaResponse = await axios.post(mediaUrl, mediaForm, {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          ...mediaForm.getHeaders(),
        },
        maxBodyLength: Infinity,
      });
      mediaId = mediaResponse.data?.id;
      if (!mediaId) {
        throw new Error("WhatsApp media upload did not return a media ID");
      }
      await prisma.asset.update({
        where: { id: invoiceAsset.assetId },
        data: {
          externalProvider: "META_WHATSAPP",
          externalId: mediaId,
        },
      });
    }
  } catch (error) {
    console.error("[WhatsApp] Sale receipt PDF preparation failed:", error?.message || error);
    throw new ApiError(502, "The invoice PDF could not be prepared for WhatsApp", {
      code: "WHATSAPP_RECEIPT_PDF_FAILED",
    });
  }

  const template = {
      name: "sale_receipt_v1",
      language: { code: "en_US" },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: {
                id: mediaId,
                filename: invoiceAsset.fileName,
              },
            },
          ],
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: customerName },
            { type: "text", text: sale.saleNumber },
            { type: "text", text: `₹${Number(sale.totalAmount).toLocaleString("en-IN")}` },
            { type: "text", text: sale.paymentStatus || "PAID" },
            { type: "text", text: shopName },
          ],
        },
      ],
  };

  const customerPhoneDigits = String(sale.customer?.phone || "").replace(NON_DIGIT_REGEX, "").slice(-10);
  const recipientMatchesCustomer = customerPhoneDigits.length === 10
    && customerPhoneDigits === normalizedPhone.slice(-10);

  let queuedMessage;
  try {
    queuedMessage = await whatsappService.sendMessage({
      shopId: sale.shopId,
      integrationId: creds.id,
      to: `+${normalizedPhone}`,
      customerId: recipientMatchesCustomer ? sale.customerId : undefined,
      skipCustomerAutoLink: !recipientMatchesCustomer,
      actorUserId: user.id,
      message: {
        kind: "template",
        template,
        localPreview: {
          title: "Sale receipt",
          body: `${customerName}\nSale #${sale.saleNumber} · ₹${Number(sale.totalAmount).toLocaleString("en-IN")} · ${sale.paymentStatus || "PAID"}`,
          documentFilename: invoiceAsset.fileName,
          documentAssetId: invoiceAsset.assetId,
        },
      },
    });
  } catch (error) {
    console.error("[WhatsApp] Sale receipt template queue failed:", error?.message || error);
    throw new ApiError(502, error?.message || "The WhatsApp receipt could not be queued", {
      code: "WHATSAPP_RECEIPT_TEMPLATE_FAILED",
    });
  }

  return {
    success: true,
    status: "QUEUED",
    messageId: queuedMessage.id,
    recipientPhone: `+${normalizedPhone}`,
    receiptAssetRetained: true,
  };
}
