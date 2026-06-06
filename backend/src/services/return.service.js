import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { money, qty, ZERO } from "../utils/money.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { generateRecordNumber, decreaseCustomerDebt } from "./transactionHelpers.js";

export async function createReturn(user, data) {
  await assertShopAccess(user, data.shopId);

  if (!data.items || data.items.length === 0) {
    throw new ApiError(400, "Return must contain at least one item");
  }

  // Validate customer
  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
  if (!customer || customer.shopId !== data.shopId) {
    throw new ApiError(400, "Customer does not belong to this shop");
  }

  // Validate sale or DM reference
  if (data.sourceType === "SALE") {
    if (!data.saleId) throw new ApiError(400, "Sale ID is required for SALE returns");
    const sale = await prisma.sale.findUnique({
      where: { id: data.saleId },
      include: { items: true }
    });
    if (!sale || sale.shopId !== data.shopId) throw new ApiError(404, "Sale not found");

    // Validate quantities
    for (const item of data.items) {
      if (!item.saleItemId) throw new ApiError(400, "saleItemId is required for Sale returns");
      const saleItem = sale.items.find((si) => si.id === item.saleItemId);
      if (!saleItem) throw new ApiError(404, `Sale item not found: ${item.saleItemId}`);
      
      // Calculate already returned quantity
      const alreadyReturned = await prisma.inventoryReturnItem.aggregate({
        where: {
          saleItemId: item.saleItemId,
          return: { status: { in: ["APPROVED", "COMPLETED"] }, isVoided: false }
        },
        _sum: { quantity: true }
      });
      const returnedQtySum = qty(alreadyReturned._sum.quantity || 0);
      const remainingQty = qty(saleItem.quantity).minus(returnedQtySum);

      if (qty(item.quantity).gt(remainingQty)) {
        throw new ApiError(
          400,
          `Return quantity (${item.quantity}) exceeds remaining purchase quantity (${remainingQty.toString()})`
        );
      }
    }
  } else if (data.sourceType === "DELIVERY_MEMO") {
    if (!data.dmId) throw new ApiError(400, "Delivery Memo ID is required for DM returns");
    const dm = await prisma.deliveryMemo.findUnique({
      where: { id: data.dmId },
      include: { items: true }
    });
    if (!dm || dm.shopId !== data.shopId) throw new ApiError(404, "Delivery Memo not found");

    for (const item of data.items) {
      if (!item.deliveryMemoItemId) throw new ApiError(400, "deliveryMemoItemId is required for DM returns");
      const dmItem = dm.items.find((dmi) => dmi.id === item.deliveryMemoItemId);
      if (!dmItem) throw new ApiError(404, `Delivery Memo item not found: ${item.deliveryMemoItemId}`);

      // Calculate already returned quantity
      const alreadyReturned = await prisma.inventoryReturnItem.aggregate({
        where: {
          deliveryMemoItemId: item.deliveryMemoItemId,
          return: { status: { in: ["APPROVED", "COMPLETED"] }, isVoided: false }
        },
        _sum: { quantity: true }
      });
      const returnedQtySum = qty(alreadyReturned._sum.quantity || 0);
      const remainingQty = qty(dmItem.quantity).minus(returnedQtySum);

      if (qty(item.quantity).gt(remainingQty)) {
        throw new ApiError(
          400,
          `Return quantity (${item.quantity}) exceeds remaining memo quantity (${remainingQty.toString()})`
        );
      }
    }
  } else {
    throw new ApiError(400, `Invalid return source type: ${data.sourceType}`);
  }

  // Calculate totals
  let subtotalAmount = ZERO;
  const itemsData = [];

  for (const item of data.items) {
    const rateVal = money(item.rate);
    const qtyVal = qty(item.quantity);
    const totalAmountVal = money(qtyVal.times(rateVal));
    subtotalAmount = subtotalAmount.plus(totalAmountVal);

    itemsData.push({
      itemId: item.itemId,
      saleItemId: item.saleItemId || null,
      deliveryMemoItemId: item.deliveryMemoItemId || null,
      quantity: qtyVal,
      rate: rateVal,
      totalAmount: totalAmountVal,
    });
  }

  const adjAmountVal = money(data.adjustmentAmount || 0);
  const netAmountVal = subtotalAmount.plus(adjAmountVal);

  return prisma.$transaction(async (tx) => {
    const returnNumber = await generateRecordNumber(tx, {
      shopId: data.shopId,
      model: "inventoryReturn",
      field: "returnNumber",
      prefix: "RT",
    });

    const invReturn = await tx.inventoryReturn.create({
      data: {
        returnNumber,
        shopId: data.shopId,
        customerId: data.customerId,
        saleId: data.saleId || null,
        dmId: data.dmId || null,
        sourceType: data.sourceType,
        subtotalAmount,
        adjustmentAmount: adjAmountVal,
        netAmount: netAmountVal,
        status: "PENDING",
        notes: data.notes,
        createdById: user.id,
        items: {
          create: itemsData
        }
      },
      include: { items: true }
    });

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: data.shopId,
      action: "return.created",
      entityType: "InventoryReturn",
      entityId: invReturn.id,
      newValueJson: invReturn
    });

    return invReturn;
  });
}

export async function approveReturn(user, id) {
  const invReturn = await prisma.inventoryReturn.findUnique({
    where: { id },
    include: { items: true }
  });
  if (!invReturn) throw new ApiError(404, "Return not found");
  await assertShopAccess(user, invReturn.shopId);
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  if (invReturn.status !== "PENDING") throw new ApiError(400, "Only pending returns can be approved");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.inventoryReturn.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date()
      },
      include: { items: true }
    });

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: invReturn.shopId,
      action: "return.approved",
      entityType: "InventoryReturn",
      entityId: id,
      newValueJson: updated
    });

    return updated;
  });
}

export async function completeReturn(user, id) {
  const invReturn = await prisma.inventoryReturn.findUnique({
    where: { id },
    include: { items: true }
  });
  if (!invReturn) throw new ApiError(404, "Return not found");
  await assertShopAccess(user, invReturn.shopId);
  if (invReturn.status !== "APPROVED") throw new ApiError(400, "Only approved returns can be completed");

  return prisma.$transaction(async (tx) => {
    // 1. Restore stock physically in StockLedger
    for (const item of invReturn.items) {
      await tx.stockLedger.create({
        data: {
          shopId: invReturn.shopId,
          itemId: item.itemId,
          movementType: "RETURN",
          quantityIn: item.quantity,
          quantityOut: ZERO,
          referenceType: "InventoryReturn",
          referenceId: invReturn.id,
          reason: `Stock returned via ${invReturn.returnNumber}`,
          createdById: user.id,
          approvedById: user.id
        }
      });
    }

    // 2. Adjust Financial Balance
    if (invReturn.sourceType === "SALE") {
      // Decrease customer outstanding balance (increases advance or reduces outstanding)
      await decreaseCustomerDebt(tx, invReturn.customerId, invReturn.netAmount);
    } else if (invReturn.sourceType === "DELIVERY_MEMO") {
      // Decrease customer debt + Update DeliveryMemoItem returnedQty
      await decreaseCustomerDebt(tx, invReturn.customerId, invReturn.netAmount);

      for (const item of invReturn.items) {
        if (item.deliveryMemoItemId) {
          const dmItem = await tx.deliveryMemoItem.findUnique({
            where: { id: item.deliveryMemoItemId }
          });
          if (dmItem) {
            const newReturnedQty = qty(dmItem.returnedQty).plus(qty(item.quantity));
            
            await tx.deliveryMemoItem.update({
              where: { id: item.deliveryMemoItemId },
              data: {
                returnedQty: newReturnedQty
              }
            });
          }
        }
      }
    }

    const completed = await tx.inventoryReturn.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date()
      },
      include: { items: true }
    });

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      shopId: invReturn.shopId,
      action: "return.completed",
      entityType: "InventoryReturn",
      entityId: id,
      newValueJson: completed
    });

    return completed;
  });
}
