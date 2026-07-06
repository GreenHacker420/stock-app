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
import { getOrCreateWalkIn } from "./customer.service.js";
import { createDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";
import { checkAndLockAvailableStock, expandStockRequirements } from "./stock.service.js";

export async function createDeliveryMemo(user, data) {
  await assertShopAccess(user, data.shopId);

  const { items, totalAmount } = calculateItemTotals(data.items);

  return prisma.$transaction(async (tx) => {
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

    let customerId = data.customerId;
    if (!customerId) {
      const walkin = await getOrCreateWalkIn(data.shopId, user.id);
      customerId = walkin.id;
    }

    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.shopId !== data.shopId) {
      throw new ApiError(400, "Customer does not belong to this shop");
    }

    const dmNumber = await generateRecordNumber(tx, {
      shopId: data.shopId,
      model: "deliveryMemo",
      field: "dmNumber",
      prefix: "DM",
    });

    const totalVal = money(totalAmount);

    const dm = await tx.deliveryMemo.create({
      data: {
        dmNumber,
        shopId: data.shopId,
        staffId: user.id,
        customerId: customer.id,
        estimatedAmount: totalVal,
        balanceAmount: totalVal,
        expectedPaymentDate: data.expectedPaymentDate,
        status: "CREATED",
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
        movementType: "DM",
        referenceType: "DeliveryMemo",
        referenceId: dm.id,
        reason: "Direct DM",
        userId: user.id,
      });
    }

    // Increase global customer debt (decreases advance or increases outstanding)
    await increaseCustomerDebt(tx, customer.id, totalVal);

    const paymentResult = await applyPayments(tx, {
      user,
      shopId: data.shopId,
      dmId: dm.id,
      customerId: customer.id,
      totalAmount: totalVal,
      payments: data.payments || [],
    });

    const updated = await tx.deliveryMemo.update({
      where: { id: dm.id },
      data: {
        paidAmount: paymentResult.paidAmount,
        balanceAmount: paymentResult.balanceAmount,
        paymentStatus: paymentResult.paymentStatus,
        status:
          paymentResult.paymentStatus === "PAID"
            ? "FULLY_PAID"
            : "PARTIALLY_PAID",
      },
      include: { items: true, payments: true },
    });

    await tx.dispatch.create({
      data: {
        dmId: dm.id,
        customerId: customer.id,
        shopId: data.shopId,
        dispatchedById: user.id,
        status: "DISPATCHED",
      },
    });

    await enqueueManyDomainEvents(tx, [
      createDomainEvent({
        shopId: data.shopId,
        entity: "deliveryMemo",
        action: "created",
        entityId: dm.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
        notification: user.role === "STAFF"
          ? {
              sendPush: true,
              title: "New Delivery Memo",
              body: `A delivery memo was recorded for ₹${Number(updated.estimatedAmount).toLocaleString("en-IN")}.`,
              severity: "success",
              deepLink: `stock://delivery-memos/${dm.id}`,
            }
          : undefined,
      }),
      createDomainEvent({
        shopId: data.shopId,
        entity: "stock",
        action: "updated",
        entityId: dm.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: data.shopId,
        entity: "customer",
        action: "updated",
        entityId: customerId,
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
        entityId: dm.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      })] : []),
    ]);

    return updated;
  });
}

export async function listDeliveryMemos(user, { shopId, customerId, status, dateFrom, dateTo, page = 1, limit = 50 }) {
  await assertShopAccess(user, shopId);
  const take = Math.min(Number(limit) || 50, 200);
  const skip = (Math.max(Number(page), 1) - 1) * take;

  return prisma.deliveryMemo.findMany({
    where: {
      shopId,
      customerId: customerId || undefined,
      status: status || undefined,
      staffId: user.role === "STAFF" ? user.id : undefined,
      createdAt: dateFrom || dateTo
        ? {
            gte: dateFrom ? new Date(dateFrom) : undefined,
            lte: dateTo ? new Date(dateTo) : undefined,
          }
        : undefined,
    },
    include: { customer: true, items: { include: { item: true } }, payments: true },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
}

export async function getDeliveryMemo(user, id) {
  const dm = await prisma.deliveryMemo.findUnique({
    where: { id },
    include: { customer: true, items: { include: { item: true } }, payments: { include: { details: true } } },
  });
  if (!dm) throw new ApiError(404, "Delivery memo not found");
  await assertShopAccess(user, dm.shopId);
  if (user.role === "STAFF" && dm.staffId !== user.id) throw new ApiError(403, "You can view only your own DMs");
  return dm;
}
