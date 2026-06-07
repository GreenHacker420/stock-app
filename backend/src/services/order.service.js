import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { createNotification } from "./notification.service.js";
import {
  applyPayments,
  calculateItemTotals,
  createStockOut,
  generateRecordNumber,
  getBillPaymentStatus,
  prisma,
  increaseCustomerDebt,
} from "./transactionHelpers.js";
import { reserveStockForOrder } from "./stock.service.js";
import { qty, money } from "../utils/money.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";

async function assertOrderAccess(user, orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) throw new ApiError(404, "Order not found");
  await assertShopAccess(user, order.shopId);

  if (user.role === "STAFF" && order.assignedStaffId && order.assignedStaffId !== user.id) {
    throw new ApiError(403, "This order is assigned to another staff member");
  }

  return order;
}

export async function createOrder(user, data) {
  await assertShopAccess(user, data.shopId);

  if (!data.items?.length) {
    throw new ApiError(400, "Order must have at least one item");
  }

  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
  if (!customer || customer.shopId !== data.shopId) {
    throw new ApiError(400, "Customer does not belong to this shop");
  }

  const { items, subtotal, discountAmount, totalAmount } = calculateItemTotals(
    data.items.map((item) => ({ ...item, quantity: item.quantityOrdered })),
  );

  return prisma.$transaction(async (tx) => {
    const orderNumber = await generateRecordNumber(tx, {
      shopId: data.shopId,
      model: "order",
      field: "orderNumber",
      prefix: "ORD",
    });

    const initialStatus = "DRAFT";

    const order = await tx.order.create({
      data: {
        orderNumber,
        shopId: data.shopId,
        customerId: data.customerId,
        createdById: user.id,
        assignedStaffId: data.assignedStaffId,
        expectedDispatchDate: data.expectedDispatchDate,
        priority: data.priority || "NORMAL",
        status: initialStatus,
        subtotal,
        discountAmount,
        totalAmount,
        paidAmount: 0,
        balanceAmount: totalAmount,
        ownerNotes: data.ownerNotes,
        items: {
          create: items.map((item) => ({
            itemId: item.itemId,
            quantityOrdered: item.quantity,
            quantityPending: item.quantity,
            rate: item.rate,
            discountAmount: item.discountAmount,
            lineTotal: item.lineTotal,
          })),
        },
        events: {
          create: {
            eventType: "ORDER_CREATED",
            newStatus: initialStatus,
            createdById: user.id,
            note: data.ownerNotes,
          },
        },
      },
      include: { items: true },
    });

    if (data.assignedStaffId) {
      await tx.packingTask.create({
        data: {
          id: `${order.id}:${data.assignedStaffId}`,
          orderId: order.id,
          shopId: data.shopId,
          staffId: data.assignedStaffId,
        },
      });

      await createNotification(tx, {
        userId: data.assignedStaffId,
        shopId: data.shopId,
        triggerEvent: "ORDER_ASSIGNED",
        entityType: EntityType.ORDER,
        entityId: order.id,
        message: `New order #${order.orderNumber} assigned to you for packing.`,
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: data.shopId,
        action: AuditAction.CREATED,
        entityType: EntityType.ORDER,
        entityId: order.id,
        newValueJson: order,
      },
    });

    return order;
  });
}

export async function listOrders(user, { shopId, customerId, status }) {
  await assertShopAccess(user, shopId);

  return prisma.order.findMany({
    where: {
      shopId,
      customerId: customerId || undefined,
      status: status || undefined,
      assignedStaffId: user.role === "STAFF" ? user.id : undefined,
    },
    include: { customer: true, items: { include: { item: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrder(user, id) {
  await assertOrderAccess(user, id);

  return prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      assignedStaff: { select: { id: true, name: true, mobile: true } },
      items: { include: { item: true } },
      events: { orderBy: { createdAt: "asc" } },
      payments: true,
      dispatches: { include: { items: true } },
    },
  });
}

export async function confirmOrder(user, id) {
  const order = await assertOrderAccess(user, id);
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");
  if (order.status !== "DRAFT") throw new ApiError(400, "Only draft orders can be confirmed");

  return prisma.$transaction(async (tx) => {
    // Reserve stock first (locks rows and checks availability)
    await reserveStockForOrder(tx, order.shopId, order.id, order.items);

    const updated = await tx.order.update({
      where: { id },
      data: { status: "CONFIRMED" },
    });

    await tx.orderEvent.create({
      data: {
        orderId: id,
        eventType: "ORDER_CONFIRMED",
        oldStatus: order.status,
        newStatus: "CONFIRMED",
        createdById: user.id,
      },
    });

    return updated;
  });
}

export async function assignStaff(user, id, staffId) {
  const order = await assertOrderAccess(user, id);
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required");

  const access = await prisma.staffShopAccess.findUnique({
    where: { staffId_shopId: { staffId, shopId: order.shopId } },
  });
  if (!access) throw new ApiError(400, "Staff is not assigned to this shop");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: {
        assignedStaffId: staffId,
      },
    });

    await tx.packingTask.upsert({
      where: { id: `${id}:${staffId}` },
      update: {},
      create: {
        id: `${id}:${staffId}`,
        orderId: id,
        shopId: order.shopId,
        staffId,
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: id,
        eventType: "ORDER_ASSIGNED",
        oldStatus: order.status,
        newStatus: updated.status,
        createdById: user.id,
      },
    });

    return updated;
  });
}

export async function startPacking(user, id) {
  const order = await assertOrderAccess(user, id);
  if (!order.assignedStaffId) throw new ApiError(400, "Assign staff before packing");

  return prisma.$transaction(async (tx) => {
    await tx.packingTask.updateMany({
      where: { orderId: id, staffId: order.assignedStaffId },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });

    const updated = await tx.order.update({
      where: { id },
      data: { status: "PACKING" },
    });

    await tx.orderEvent.create({
      data: {
        orderId: id,
        eventType: "PACKING_STARTED",
        oldStatus: order.status,
        newStatus: "PACKING",
        createdById: user.id,
      },
    });

    return updated;
  });
}

export async function markItemPacked(user, id, { orderItemId, quantityPacked }) {
  const order = await assertOrderAccess(user, id);
  const item = order.items.find((row) => row.id === orderItemId);
  if (!item) throw new ApiError(404, "Order item not found");

  const nextPacked = Number(item.quantityPacked) + Number(quantityPacked);
  if (nextPacked > Number(item.quantityOrdered)) {
    throw new ApiError(400, "Packed quantity cannot exceed ordered quantity");
  }

  await prisma.$transaction(async (tx) => {
    // Update StockReservation packedQty
    await tx.stockReservation.update({
      where: { orderItemId },
      data: {
        packedQty: qty(nextPacked)
      }
    });

    await tx.orderItem.update({
      where: { id: orderItemId },
      data: {
        quantityPacked: nextPacked,
        quantityPending: Number(item.quantityOrdered) - nextPacked,
        status: nextPacked === Number(item.quantityOrdered) ? "PACKED" : "PARTIALLY_PACKED",
      },
    });

    const freshItems = await tx.orderItem.findMany({ where: { orderId: id } });
    const allPacked = freshItems.every((row) => Number(row.quantityPacked) >= Number(row.quantityOrdered));
    const anyPacked = freshItems.some((row) => Number(row.quantityPacked) > 0);

    await tx.order.update({
      where: { id },
      data: { status: allPacked ? "PACKED" : anyPacked ? "PARTIALLY_PACKED" : order.status },
    });

    await tx.orderEvent.create({
      data: {
        orderId: id,
        eventType: "ITEM_PACKED",
        createdById: user.id,
        note: `Packed ${quantityPacked}`,
      },
    });
  });

  return getOrder(user, id);
}

export async function reportShortage(user, id, { orderItemId, availableQuantity, reason }) {
  const order = await assertOrderAccess(user, id);
  const item = order.items.find((row) => row.id === orderItemId);
  if (!item) throw new ApiError(404, "Order item not found");

  await prisma.$transaction(async (tx) => {
    // Truncate reservation quantity and release shortage back to Available pool
    await tx.stockReservation.update({
      where: { orderItemId },
      data: {
        reservedQty: qty(availableQuantity),
        packedQty: qty(availableQuantity),
        releasedAt: new Date(),
        releasedReason: "SHORTAGE"
      }
    });

    await tx.orderItem.update({
      where: { id: orderItemId },
      data: {
        quantityPacked: availableQuantity,
        quantityPending: Number(item.quantityOrdered) - Number(availableQuantity),
        status: "SHORTAGE",
      },
    });

    await tx.order.update({ where: { id }, data: { status: "PARTIALLY_PACKED" } });
    await tx.orderEvent.create({
      data: {
        orderId: id,
        eventType: "SHORTAGE_REPORTED",
        createdById: user.id,
        note: reason,
      },
    });
  });

  return getOrder(user, id);
}

export async function addPayment(user, id, payments) {
  const order = await assertOrderAccess(user, id);

  return prisma.$transaction(async (tx) => {
    const paymentResult = await applyPayments(tx, {
      user,
      shopId: order.shopId,
      orderId: id,
      customerId: order.customerId,
      totalAmount: Number(order.totalAmount),
      existingPaidAmount: Number(order.paidAmount),
      payments,
    });

    const updated = await tx.order.update({
      where: { id },
      data: {
        paidAmount: paymentResult.paidAmount,
        balanceAmount: paymentResult.balanceAmount,
        paymentStatus: paymentResult.paymentStatus,
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: id,
        eventType: "PAYMENT_ADDED",
        createdById: user.id,
      },
    });

    return updated;
  });
}

async function createDispatchFromOrder(tx, user, order, items, { saleId, dmId }) {
  const dispatch = await tx.dispatch.create({
    data: {
      orderId: order.id,
      saleId,
      dmId,
      customerId: order.customerId,
      shopId: order.shopId,
      dispatchedById: user.id,
      status: "DISPATCHED",
      items: {
        create: items.map((item) => ({
          orderItemId: item.orderItemId,
          itemId: item.itemId,
          quantityDispatched: item.quantity,
        })),
      },
    },
  });

  for (const item of items) {
    // Transition StockReservation status to DISPATCHED
    await tx.stockReservation.updateMany({
      where: {
        orderItemId: item.orderItemId,
        status: "ACTIVE",
      },
      data: {
        status: "DISPATCHED",
        releasedAt: new Date(),
        releasedReason: "DISPATCH",
      },
    });

    await tx.orderItem.update({
      where: { id: item.orderItemId },
      data: {
        quantityDispatched: { increment: item.quantity },
        quantityPending: { decrement: item.quantity },
        status: "DISPATCHED",
      },
    });
  }

  return dispatch;
}

export async function createDmFromOrder(user, id, data) {
  const order = await assertOrderAccess(user, id);
  const selectedItems = data.items?.length
    ? data.items
    : order.items.map((item) => ({
        orderItemId: item.id,
        itemId: item.itemId,
        quantity: Number(item.quantityPacked) || Number(item.quantityOrdered),
        rate: Number(item.rate),
        discountAmount: Number(item.discountAmount || 0),
      }));

  const { items, totalAmount } = calculateItemTotals(selectedItems);

  return prisma.$transaction(async (tx) => {
    const dmNumber = await generateRecordNumber(tx, {
      shopId: order.shopId,
      model: "deliveryMemo",
      field: "dmNumber",
      prefix: "DM",
    });

    const customer = await tx.customer.findUnique({ where: { id: order.customerId } });
    const dm = await tx.deliveryMemo.create({
      data: {
        dmNumber,
        shopId: order.shopId,
        orderId: order.id,
        staffId: user.id,
        customerId: order.customerId,
        estimatedAmount: totalAmount,
        balanceAmount: totalAmount,
        expectedPaymentDate: data.expectedPaymentDate,
        status: "PARTIALLY_PAID", // Default status
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
        shopId: order.shopId,
        itemId: item.itemId,
        quantity: item.quantity,
        movementType: "DM",
        referenceType: "DeliveryMemo",
        referenceId: dm.id,
        reason: "DM from order",
        userId: user.id,
      });
    }
    
    // Increase global customer debt
    await increaseCustomerDebt(tx, order.customerId, totalAmount);

    await createDispatchFromOrder(tx, user, order, items, { dmId: dm.id });
    await tx.order.update({ where: { id }, data: { status: "DISPATCHED" } });

    return dm;
  });
}

export async function convertOrderToSale(user, id, data) {
  const order = await assertOrderAccess(user, id);
  const selectedItems = data.items?.length
    ? data.items
    : order.items.map((item) => ({
        orderItemId: item.id,
        itemId: item.itemId,
        quantity: Number(item.quantityPacked) || Number(item.quantityOrdered),
        rate: Number(item.rate),
        discountAmount: Number(item.discountAmount || 0),
      }));

  const { items, subtotal, discountAmount, totalAmount } = calculateItemTotals(selectedItems);

  return prisma.$transaction(async (tx) => {
    const saleNumber = await generateRecordNumber(tx, {
      shopId: order.shopId,
      model: "sale",
      field: "saleNumber",
      prefix: "SAL",
    });

    const sale = await tx.sale.create({
      data: {
        saleNumber,
        shopId: order.shopId,
        staffId: user.id,
        customerId: order.customerId,
        orderId: order.id,
        gstRequired: !!data.gstRequired,
        gstInvoiceStatus: data.gstRequired ? "PENDING" : "NOT_REQUIRED",
        subtotal,
        discountAmount,
        totalAmount,
        paidAmount: 0,
        balanceAmount: totalAmount,
        paymentStatus: "UNPAID",
        saleStatus: "CONFIRMED",
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
        shopId: order.shopId,
        itemId: item.itemId,
        quantity: item.quantity,
        movementType: "SALE",
        referenceType: "Sale",
        referenceId: sale.id,
        reason: "Sale from order",
        userId: user.id,
      });
    }

    // Increase global customer debt
    await increaseCustomerDebt(tx, order.customerId, totalAmount);

    const paymentResult = await applyPayments(tx, {
      user,
      shopId: order.shopId,
      saleId: sale.id,
      customerId: order.customerId,
      totalAmount,
      payments: data.payments || [],
    });

    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: {
        paidAmount: paymentResult.paidAmount,
        balanceAmount: paymentResult.balanceAmount,
        paymentStatus: paymentResult.paymentStatus,
        saleStatus: paymentResult.paymentStatus === "PAID" ? "PAID" : "CONFIRMED",
      },
    });

    await createDispatchFromOrder(tx, user, order, items, { saleId: sale.id });
    await tx.order.update({
      where: { id },
      data: {
        status: "DISPATCHED",
        paymentStatus: getBillPaymentStatus(Number(order.totalAmount), Number(order.paidAmount)),
      },
    });

    return updatedSale;
  });
}
