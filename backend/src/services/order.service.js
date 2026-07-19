import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { createNotification } from "./notification.service.js";
import { createDomainEvent, enqueueDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";
import { checkAndLockAvailableStock } from "./stock.service.js";
import {
  applyPayments,
  calculateItemTotals,
  createStockOut,
  generateRecordNumber,
  getBillPaymentStatus,
  prisma,
  increaseCustomerDebt,
  postCustomerReceivable,
} from "./transactionHelpers.js";
import { reserveStockForOrder, expandStockRequirements } from "./stock.service.js";
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

async function assertStaffAssignableToShop(owner, shopId, staffId) {
  if (owner.role !== "OWNER") {
    throw new ApiError(403, "Owner access required to assign staff");
  }

  const staff = await prisma.user.findUnique({
    where: { id: staffId },
    select: { id: true, role: true, status: true, staffOwnerId: true },
  });
  if (!staff || staff.role !== "STAFF" || staff.staffOwnerId !== owner.id) {
    throw new ApiError(400, "Staff does not belong to your business");
  }
  if (staff.status !== "ACTIVE") {
    throw new ApiError(400, "Staff is not active");
  }

  const access = await prisma.staffShopAccess.findUnique({
    where: { staffId_shopId: { staffId, shopId } },
    select: { id: true },
  });
  if (!access) throw new ApiError(400, "Staff is not assigned to this shop");
}

export async function getOrderShopForAction(user, orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, shopId: true },
  });
  if (!order) throw new ApiError(404, "Order not found");
  await assertShopAccess(user, order.shopId);
  return order.shopId;
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

  if (data.assignedStaffId) {
    await assertStaffAssignableToShop(user, data.shopId, data.assignedStaffId);
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

    const events = [
      createDomainEvent({
        shopId: data.shopId,
        entity: "order",
        action: "created",
        entityId: order.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      })
    ];

    if (data.assignedStaffId) {
      events.push(createDomainEvent({
        shopId: data.shopId,
        entity: "order",
        action: "assigned",
        entityId: order.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { targetUserIds: [data.assignedStaffId], owners: true, staff: false },
        notification: {
          sendPush: true,
          title: "New order assigned",
          body: `New order #${order.orderNumber} assigned to you for packing.`,
          severity: "info",
          deepLink: `stock://orders/${order.id}`
        }
      }));
    }

    await enqueueManyDomainEvents(tx, events);

    return order;
  });
}

export async function listOrders(user, { shopId, customerId, status, dateFrom, dateTo, page = 1, limit = 50 }) {
  await assertShopAccess(user, shopId);
  const take = Math.min(Number(limit) || 50, 200);
  const skip = (Math.max(Number(page), 1) - 1) * take;

  return prisma.order.findMany({
    where: {
      shopId,
      customerId: customerId || undefined,
      status: status || undefined,
      assignedStaffId: user.role === "STAFF" ? user.id : undefined,
      createdAt: dateFrom || dateTo
        ? {
            gte: dateFrom ? new Date(dateFrom) : undefined,
            lte: dateTo ? new Date(dateTo) : undefined,
          }
        : undefined,
    },
    include: { customer: true, items: { include: { item: true } } },
    orderBy: { createdAt: "desc" },
    skip,
    take,
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

    await enqueueManyDomainEvents(tx, [
      createDomainEvent({
        shopId: order.shopId,
        entity: "order",
        action: "confirmed",
        entityId: order.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      }),
      createDomainEvent({
        shopId: order.shopId,
        entity: "stock",
        action: "reservation_updated",
        entityId: order.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      }),
    ]);

    return updated;
  });
}

export async function assignStaff(user, id, staffId) {
  const order = await assertOrderAccess(user, id);
  await assertStaffAssignableToShop(user, order.shopId, staffId);

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

    await enqueueDomainEvent(tx, createDomainEvent({
      shopId: order.shopId,
      entity: "order",
      action: "assigned",
      entityId: order.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { targetUserIds: [staffId], owners: true, staff: false },
      notification: {
        sendPush: true,
        title: "New order assigned",
        body: `New order #${order.orderNumber} assigned to you for packing.`,
        severity: "info",
        deepLink: `stock://orders/${order.id}`
      }
    }));

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

    await enqueueDomainEvent(tx, createDomainEvent({
      shopId: order.shopId,
      entity: "order",
      action: "packing_started",
      entityId: order.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true }
    }));

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
    // Update StockReservation packedQty for all component reservations proportionally
    const reservations = await tx.stockReservation.findMany({
      where: { orderItemId }
    });
    for (const res of reservations) {
      const ratio = qty(res.reservedQty).dividedBy(qty(item.quantityOrdered));
      const resNextPacked = qty(nextPacked).times(ratio);
      await tx.stockReservation.update({
        where: { id: res.id },
        data: { packedQty: resNextPacked }
      });
    }

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

    await enqueueDomainEvent(tx, createDomainEvent({
      shopId: order.shopId,
      entity: "order",
      action: "item_packed",
      entityId: order.id,
      actorUserId: user.id,
      actorRole: user.role,
      visibility: { owners: true, staff: true }
    }));
  });

  return getOrder(user, id);
}

export async function reportShortage(user, id, { orderItemId, availableQuantity, reason }) {
  const order = await assertOrderAccess(user, id);
  const item = order.items.find((row) => row.id === orderItemId);
  if (!item) throw new ApiError(404, "Order item not found");

  await prisma.$transaction(async (tx) => {
    // Truncate reservation quantity and release shortage back to Available pool proportionally for all component reservations
    const reservations = await tx.stockReservation.findMany({
      where: { orderItemId }
    });
    for (const res of reservations) {
      const ratio = qty(res.reservedQty).dividedBy(qty(item.quantityOrdered));
      const resAv = qty(availableQuantity).times(ratio);
      await tx.stockReservation.update({
        where: { id: res.id },
        data: {
          reservedQty: resAv,
          packedQty: resAv,
          releasedAt: new Date(),
          releasedReason: "SHORTAGE"
        }
      });
    }

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

    await enqueueManyDomainEvents(tx, [
      createDomainEvent({
        shopId: order.shopId,
        entity: "order",
        action: "shortage_reported",
        entityId: order.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      }),
      createDomainEvent({
        shopId: order.shopId,
        entity: "stock",
        action: "reservation_updated",
        entityId: order.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      }),
    ]);
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

    await enqueueManyDomainEvents(tx, [
      createDomainEvent({
        shopId: order.shopId,
        entity: "order",
        action: "payment_added",
        entityId: order.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      }),
      createDomainEvent({
        shopId: order.shopId,
        entity: "payment",
        action: "created",
        entityId: order.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      })
    ]);

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
    const reservations = await tx.stockReservation.findMany({
      where: { orderItemId: item.orderItemId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    let toRelease = qty(item.quantity);
    for (const reservation of reservations) {
      if (toRelease.lte(0)) break;
      const reserved = qty(reservation.reservedQty);
      const released = toRelease.gte(reserved) ? reserved : toRelease;
      const remaining = reserved.minus(released);
      await tx.stockReservation.update({
        where: { id: reservation.id },
        data: remaining.lte(0)
          ? { reservedQty: 0, status: "DISPATCHED", releasedAt: new Date(), releasedReason: "DISPATCH" }
          : { reservedQty: remaining },
      });
      toRelease = toRelease.minus(released);
    }

    const orderItem = await tx.orderItem.findUnique({ where: { id: item.orderItemId } });
    const remainingAfterDispatch = qty(orderItem.quantityOrdered)
      .minus(qty(orderItem.quantityDispatched))
      .minus(qty(item.quantity));
    await tx.orderItem.update({
      where: { id: item.orderItemId },
      data: {
        quantityDispatched: { increment: item.quantity },
        quantityPending: remainingAfterDispatch.lt(0) ? 0 : remainingAfterDispatch,
        status: remainingAfterDispatch.lte(0) ? "DISPATCHED" : "PARTIALLY_PACKED",
      },
    });
  }

  return dispatch;
}

export async function createDmFromOrder(user, id, data) {
  const order = await assertOrderAccess(user, id);
  if (order.status === "DISPATCHED") {
    throw new ApiError(400, "Order has already been dispatched");
  }
  const selectedItems = data.items?.length
    ? data.items
    : order.items.map((item) => ({
        orderItemId: item.id,
        itemId: item.itemId,
        quantity: Math.max(0, Number(item.quantityOrdered) - Number(item.quantityDispatched)),
        rate: Number(item.rate),
        discountAmount: Number(item.discountAmount || 0),
      }));

  const { items, totalAmount } = calculateItemTotals(selectedItems);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
    const lockedOrder = await tx.order.findUnique({ where: { id }, include: { items: true } });
    for (const item of items) {
      const orderItem = lockedOrder.items.find((line) => line.id === item.orderItemId && line.itemId === item.itemId);
      if (!orderItem) throw new ApiError(400, "Dispatch item does not belong to this order", { code: "INVALID_ORDER_LINE" });
      const remaining = qty(orderItem.quantityOrdered).minus(qty(orderItem.quantityDispatched));
      if (qty(item.quantity).gt(remaining)) {
        throw new ApiError(409, `Dispatch quantity exceeds the remaining ${remaining.toString()} units`, { code: "ORDER_OVER_DISPATCH" });
      }
      const product = await tx.item.findUnique({ where: { id: item.itemId } });
      const serials = (item.serialNumbers || []).map((value) => String(value).trim().toUpperCase()).filter(Boolean);
      if (product?.requiresSerialNumber && serials.length !== Number(item.quantity)) {
        throw new ApiError(400, `${product.name} requires exactly ${item.quantity} serial number(s)`, { code: "SERIAL_COUNT_MISMATCH" });
      }
      item.serialNumbers = serials;
    }

    const dmNumber = await generateRecordNumber(tx, {
      shopId: order.shopId,
      model: "deliveryMemo",
      field: "dmNumber",
      prefix: "DM",
    });

    await checkAndLockAvailableStock(tx, order.shopId, items, { excludeOrderId: order.id });

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
        documentPurpose: "CREDIT_DELIVERY",
        lifecycleStatus: "DISPATCHED",
        postedAt: new Date(),
        status: "CREATED",
        items: {
          create: items.map((item) => ({
            itemId: item.itemId,
            orderItemId: item.orderItemId,
            quantity: item.quantity,
            rate: item.rate,
            discountAmount: item.discountAmount,
            totalAmount: item.lineTotal,
            serialNumbers: item.serialNumbers?.length ? item.serialNumbers : null,
          })),
        },
      },
    });

    for (const item of items) {
      for (const serialNumber of item.serialNumbers || []) {
        try {
          await tx.deliveryMemoSerialAssignment.create({ data: {
            shopId: order.shopId,
            dmId: dm.id,
            itemId: item.itemId,
            serialNumber,
            activeKey: `${order.shopId}:${item.itemId}:${serialNumber}`,
            assignedById: user.id,
          } });
        } catch (error) {
          if (error?.code === "P2002") throw new ApiError(409, `Serial ${serialNumber} is already allocated`, { code: "SERIAL_ALREADY_ALLOCATED" });
          throw error;
        }
      }
    }

    const stockRequirements = await expandStockRequirements(tx, order.shopId, items);
    for (const req of stockRequirements) {
      await createStockOut(tx, {
        shopId: order.shopId,
        itemId: req.itemId,
        quantity: req.quantity,
        movementType: "DM",
        referenceType: "DeliveryMemo",
        referenceId: dm.id,
        reason: "DM from order",
        userId: user.id,
      });
    }
    
    // Increase global customer debt
    const receivable = await postCustomerReceivable(tx, order.customerId, totalAmount);
    await tx.customerLedgerEntry.create({ data: {
      shopId: order.shopId,
      customerId: order.customerId,
      sourceType: "DELIVERY_MEMO",
      sourceId: dm.id,
      entryType: "DM_POSTED",
      direction: "DEBIT",
      amount: totalAmount,
      createdById: user.id,
      notes: `Posted ${dmNumber} from order ${order.orderNumber}`,
    } });
    if (receivable.advanceApplied.gt(0)) {
      await tx.customerLedgerEntry.create({ data: {
        shopId: order.shopId,
        customerId: order.customerId,
        sourceType: "DELIVERY_MEMO",
        sourceId: dm.id,
        entryType: "ADVANCE_APPLIED",
        direction: "CREDIT",
        amount: receivable.advanceApplied,
        createdById: user.id,
        notes: `Advance applied to ${dmNumber}`,
      } });
      await tx.deliveryMemo.update({
        where: { id: dm.id },
        data: {
          paidAmount: receivable.advanceApplied,
          balanceAmount: receivable.outstandingCreated,
          paymentStatus: receivable.outstandingCreated.lte(0) ? "PAID" : "PARTIALLY_PAID",
          status: receivable.outstandingCreated.lte(0) ? "FULLY_PAID" : "PARTIALLY_PAID",
        },
      });
    }

    await createDispatchFromOrder(tx, user, order, items, { dmId: dm.id });
    const remainingLines = await tx.orderItem.count({
      where: { orderId: id, status: { not: "DISPATCHED" } },
    });
    await tx.order.update({
      where: { id },
      data: { status: remainingLines === 0 ? "DISPATCHED" : "PARTIALLY_DISPATCHED" },
    });

    await enqueueManyDomainEvents(tx, [
      createDomainEvent({
        shopId: order.shopId,
        entity: "deliveryMemo",
        action: "created",
        entityId: dm.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      }),
      createDomainEvent({
        shopId: order.shopId,
        entity: "stock",
        action: "updated",
        entityId: dm.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      }),
      createDomainEvent({
        shopId: order.shopId,
        entity: "order",
        action: "updated",
        entityId: order.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      })
    ]);

    return dm;
  });
}

export async function convertOrderToSale(user, id, data) {
  const order = await assertOrderAccess(user, id);
  if (order.status === "DISPATCHED") {
    throw new ApiError(400, "Order has already been dispatched");
  }
  const existingDispatch = await prisma.dispatch.findFirst({
    where: { orderId: id },
    select: { id: true },
  });
  if (existingDispatch) {
    throw new ApiError(400, "Order has already been dispatched");
  }
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
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
    const existingDispatchInTx = await tx.dispatch.findFirst({
      where: { orderId: id },
      select: { id: true },
    });
    if (existingDispatchInTx) {
      throw new ApiError(400, "Order has already been dispatched");
    }

    const saleNumber = await generateRecordNumber(tx, {
      shopId: order.shopId,
      model: "sale",
      field: "saleNumber",
      prefix: "SAL",
    });

    await checkAndLockAvailableStock(tx, order.shopId, items, { excludeOrderId: order.id });

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

    const stockRequirements = await expandStockRequirements(tx, order.shopId, items);
    for (const req of stockRequirements) {
      await createStockOut(tx, {
        shopId: order.shopId,
        itemId: req.itemId,
        quantity: req.quantity,
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

    await enqueueManyDomainEvents(tx, [
      createDomainEvent({
        shopId: order.shopId,
        entity: "sale",
        action: "created",
        entityId: sale.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      }),
      createDomainEvent({
        shopId: order.shopId,
        entity: "stock",
        action: "updated",
        entityId: sale.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      }),
      createDomainEvent({
        shopId: order.shopId,
        entity: "order",
        action: "updated",
        entityId: order.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      }),
      ...((data.payments || []).length > 0 ? [createDomainEvent({
        shopId: order.shopId,
        entity: "payment",
        action: "created",
        entityId: sale.id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true }
      })] : [])
    ]);

    return updatedSale;
  });
}

export async function cancelOrder(user, id, data = {}) {
  const order = await assertOrderAccess(user, id);
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Owner access required to cancel orders");
  }

  // If already CANCELLED, return order (idempotent)
  if (order.status === "CANCELLED") {
    return order;
  }

  // Cannot cancel completed/converted/dispatched final orders
  if (order.status === "DISPATCHED") {
    throw new ApiError(400, "Cannot cancel a dispatched order");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: data.reason || "Order cancelled",
      },
      include: {
        items: true,
      },
    });

    // Release reservations
    await tx.stockReservation.updateMany({
      where: {
        orderId: id,
        status: "ACTIVE",
      },
      data: {
        status: "CANCELLED",
        releasedAt: new Date(),
        releasedReason: "CANCEL",
      },
    });

    // Cancel pending/in-progress packing tasks
    await tx.packingTask.updateMany({
      where: {
        orderId: id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: {
        status: "CANCELLED",
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        userId: user.id,
        shopId: order.shopId,
        action: AuditAction.UPDATED,
        entityType: EntityType.ORDER,
        entityId: id,
        oldValueJson: order,
        newValueJson: updated,
        reason: data.reason || "Order cancelled",
      },
    });

    await enqueueManyDomainEvents(tx, [
      createDomainEvent({
        shopId: order.shopId,
        entity: "order",
        action: "updated",
        entityId: id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
      createDomainEvent({
        shopId: order.shopId,
        entity: "stock",
        action: "reservation_updated",
        entityId: id,
        actorUserId: user.id,
        actorRole: user.role,
        visibility: { owners: true, staff: true },
      }),
    ]);

    return updated;
  });
}
