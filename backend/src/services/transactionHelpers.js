import { ApiError } from "../utils/ApiError.js";
import { formatRecordNumber } from "../utils/recordNumber.js";
import { getDayRange } from "../utils/dateRange.js";
import { money, add, sub, mul, div, isZero } from "../utils/money.js";
import { createNotification, notifyShopOwner } from "./notification.service.js";

export async function generateRecordNumber(tx, { shopId, model, field, prefix, date = new Date(), dateField = "createdAt" }) {
  const { start, end } = getDayRange(date);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`record-number:${shopId}:${model}`}))`;
  const datePrefix = formatRecordNumber(prefix, date, 0).replace(/000$/, "");
  const rows = await tx[model].findMany({
    where: {
      shopId,
      [dateField]: {
        gte: start,
        lt: end,
      },
      [field]: { startsWith: datePrefix },
    },
    select: { [field]: true },
  });
  const maxCounter = rows.reduce((max, row) => {
    const counter = Number(String(row[field] || "").slice(datePrefix.length));
    return Number.isFinite(counter) ? Math.max(max, counter) : max;
  }, 0);
  return formatRecordNumber(prefix, date, maxCounter + 1);
}

export async function getCurrentQuantity(tx, shopId, itemId) {
  const result = await tx.stockLedger.aggregate({
    where: { shopId, itemId },
    _sum: {
      quantityIn: true,
      quantityOut: true,
    },
  });

  return Number(result._sum.quantityIn || 0) - Number(result._sum.quantityOut || 0);
}

export async function assertStockAvailable(tx, shopId, itemId, quantity) {
  const currentQuantity = await getCurrentQuantity(tx, shopId, itemId);
  if (currentQuantity < Number(quantity)) {
    throw new ApiError(400, "Insufficient stock for one or more items");
  }
}

export async function createStockOut(tx, { shopId, itemId, quantity, movementType, referenceType, referenceId, reason, userId }) {
  await assertStockAvailable(tx, shopId, itemId, quantity);

  const movement = await tx.stockLedger.create({
    data: {
      shopId,
      itemId,
      movementType,
      quantityIn: 0,
      quantityOut: quantity,
      referenceType,
      referenceId,
      reason,
      createdById: userId,
    },
  });

  // Check low stock alert status
  try {
    const item = await tx.item.findUnique({
      where: { id: itemId },
      select: { name: true, minimumStock: true, unit: true }
    });
    if (item && item.minimumStock !== null) {
      const currentQuantity = await getCurrentQuantity(tx, shopId, itemId);
      if (currentQuantity <= Number(item.minimumStock)) {
        const msg = `Low stock alert: ${item.name} is down to ${currentQuantity} ${item.unit || ""} (Minimum: ${item.minimumStock}).`;
        
        // Notify all owners
        await notifyShopOwner(tx, {
          shopId,
          triggerEvent: "LOW_STOCK",
          entityType: "ITEM",
          entityId: itemId,
          message: msg,
        });

        // Notify active staff member who triggered the stockout if they are not the primary owner
        const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { ownerId: true } });
        if (userId && shop && userId !== shop.ownerId) {
          await createNotification(tx, {
            userId,
            shopId,
            triggerEvent: "LOW_STOCK",
            entityType: "ITEM",
            entityId: itemId,
            message: msg,
          });
        }
      }
    }
  } catch (err) {
    console.error(`[LowStockAlert] Error triggering low stock check for item ${itemId}:`, err.message);
  }

  return movement;
}


export async function createStockIn(tx, { shopId, itemId, quantity, movementType, referenceType, referenceId, reason, userId }) {
  const movement = await tx.stockLedger.create({
    data: {
      shopId,
      itemId,
      movementType,
      quantityIn: quantity,
      quantityOut: 0,
      referenceType,
      referenceId,
      reason,
      createdById: userId,
    },
  });

  return movement;
}



export function calculateItemTotals(items) {
  const normalizedItems = items.map((item) => {
    const quantity = Number(item.quantity ?? item.quantityOrdered);
    const rate = Number(item.rate);
    const discountAmount = Number(item.discountAmount || 0);
    const lineTotal = quantity * rate - discountAmount;

    if (quantity <= 0 || rate <= 0 || lineTotal < 0) {
      throw new ApiError(400, "Invalid item quantity, rate, or discount");
    }

    return {
      ...item,
      quantity,
      rate,
      discountAmount,
      lineTotal,
    };
  });

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const discountAmount = normalizedItems.reduce((sum, item) => sum + item.discountAmount, 0);
  const totalAmount = subtotal - discountAmount;

  return { items: normalizedItems, subtotal, discountAmount, totalAmount };
}

export function getBillPaymentStatus(totalAmount, paidAmount) {
  const total = money(totalAmount);
  const paid = money(paidAmount);
  if (paid.lte(0)) return "UNPAID";
  if (paid.gte(total)) return "PAID";
  return "PARTIALLY_PAID";
}

