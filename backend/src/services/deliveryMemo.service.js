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

export async function createDeliveryMemo(user, data) {
  await assertShopAccess(user, data.shopId);

  const customer = data.customerId ? await prisma.customer.findUnique({ where: { id: data.customerId } }) : null;
  if (data.customerId && (!customer || customer.shopId !== data.shopId)) {
    throw new ApiError(400, "Customer does not belong to this shop");
  }

  const { items, totalAmount } = calculateItemTotals(data.items);

  return prisma.$transaction(async (tx) => {
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
        customerId: data.customerId,
        estimatedAmount: totalVal,
        balanceAmount: totalVal,
        expectedPaymentDate: data.expectedPaymentDate,
        status: "CREATED",
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
        movementType: "DM",
        referenceType: "DeliveryMemo",
        referenceId: dm.id,
        reason: "Direct DM",
        userId: user.id,
      });
    }

    if (data.customerId) {
      // Increase global customer debt (decreases advance or increases outstanding)
      await increaseCustomerDebt(tx, data.customerId, totalVal);
    }

    const paymentResult = await applyPayments(tx, {
      user,
      shopId: data.shopId,
      dmId: dm.id,
      customerId: data.customerId,
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
        customerId: data.customerId,
        shopId: data.shopId,
        dispatchedById: user.id,
        status: "DISPATCHED",
      },
    });

    return updated;
  });
}

export async function listDeliveryMemos(user, { shopId, customerId }) {
  await assertShopAccess(user, shopId);
  return prisma.deliveryMemo.findMany({
    where: {
      shopId,
      customerId: customerId || undefined,
      staffId: user.role === "STAFF" ? user.id : undefined,
    },
    include: { customer: true, items: { include: { item: true } }, payments: true },
    orderBy: { createdAt: "desc" },
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
