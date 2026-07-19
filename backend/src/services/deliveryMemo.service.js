import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import {
  applyPayments,
  calculateItemTotals,
  createStockOut,
  generateRecordNumber,
  prisma,
  postCustomerReceivable,
  getBillPaymentStatus,
} from "./transactionHelpers.js";
import { money, sub } from "../utils/money.js";
import { getOrCreateWalkIn } from "./customer.service.js";
import { createDomainEvent, enqueueManyDomainEvents } from "./domain-event.service.js";
import { checkAndLockAvailableStock, expandStockRequirements } from "./stock.service.js";
import { EntityType, AuditAction } from "../generated/prisma/index.js";
import {
  legacyDeliveryMemoStatusForPayment,
  withDerivedMemoState,
  purposeCreatesReceivable,
} from "./deliveryMemo.domain.js";
export {
  legacyDeliveryMemoStatusForPayment,
  deriveDeliveryMemoDueStatus,
  withDerivedMemoState,
} from "./deliveryMemo.domain.js";

const RECEIVABLE_PURPOSES = { has: purposeCreatesReceivable };
const IMPLEMENTED_PURPOSE = "CREDIT_DELIVERY";

function assertImplementedPurpose(purpose) {
  const normalized = purpose || IMPLEMENTED_PURPOSE;
  if (normalized !== IMPLEMENTED_PURPOSE) {
    throw new ApiError(400, "This delivery purpose requires a separate custody workflow that is not available yet", {
      code: "UNSUPPORTED_DELIVERY_MEMO_PURPOSE",
    });
  }
  return normalized;
}

function normalizeSerial(value) {
  return String(value || "").trim().toUpperCase();
}

async function validateMemoItems(tx, shopId, items, { requireCompleteSerials, enforceStaffMinimum = false }) {
  const itemIds = [...new Set(items.map((item) => item.itemId))];
  const products = await tx.item.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      shopId: true,
      name: true,
      status: true,
      requiresSerialNumber: true,
      minimumAllowedPrice: true,
    },
  });
  const byId = new Map(products.map((item) => [item.id, item]));
  const seenSerials = new Set();

  for (const line of items) {
    const product = byId.get(line.itemId);
    if (!product || product.shopId !== shopId || product.status !== "ACTIVE") {
      throw new ApiError(400, `Product is unavailable in this shop: ${line.itemId}`, { code: "INVALID_DM_ITEM" });
    }
    const serials = (line.serialNumbers || []).map(normalizeSerial).filter(Boolean);
    if (new Set(serials).size !== serials.length) {
      throw new ApiError(400, `Duplicate serial number entered for ${product.name}`, { code: "DUPLICATE_SERIAL" });
    }
    for (const serial of serials) {
      const key = `${line.itemId}:${serial}`;
      if (seenSerials.has(key)) {
        throw new ApiError(400, `Serial ${serial} is entered more than once`, { code: "DUPLICATE_SERIAL" });
      }
      seenSerials.add(key);
    }
    if (requireCompleteSerials && product.requiresSerialNumber && serials.length !== Number(line.quantity)) {
      throw new ApiError(
        400,
        `Product "${product.name}" requires exactly ${line.quantity} serial number(s). Scanned: ${serials.length}`,
        { code: "SERIAL_COUNT_MISMATCH" },
      );
    }
    if (enforceStaffMinimum && product.minimumAllowedPrice != null && money(line.rate).lt(money(product.minimumAllowedPrice))) {
      throw new ApiError(403, `${product.name} cannot be dispatched below its minimum allowed price`, {
        code: "PRICE_BELOW_ALLOWED_MINIMUM",
      });
    }
    line.serialNumbers = serials;
  }
}

async function assignMemoSerials(tx, user, dm, items) {
  for (const line of items) {
    for (const serialNumber of line.serialNumbers || []) {
      const activeKey = `${dm.shopId}:${line.itemId}:${normalizeSerial(serialNumber)}`;
      try {
        await tx.deliveryMemoSerialAssignment.create({
          data: {
            shopId: dm.shopId,
            dmId: dm.id,
            itemId: line.itemId,
            serialNumber: normalizeSerial(serialNumber),
            activeKey,
            assignedById: user.id,
          },
        });
      } catch (error) {
        if (error?.code === "P2002") {
          throw new ApiError(409, `Serial number ${serialNumber} has already been dispatched`, {
            code: "SERIAL_ALREADY_ALLOCATED",
          });
        }
        throw error;
      }
    }
  }
}

async function appendCustomerLedger(tx, { shopId, customerId, sourceId, entryType, direction, amount, userId, notes }) {
  if (!customerId || money(amount).lte(0)) return;
  await tx.customerLedgerEntry.create({
    data: {
      shopId,
      customerId,
      sourceType: "DELIVERY_MEMO",
      sourceId,
      entryType,
      direction,
      amount: money(amount),
      createdById: userId,
      notes,
    },
  });
}

export async function createDeliveryMemoDraft(user, data) {
  await assertShopAccess(user, data.shopId);
  const documentPurpose = assertImplementedPurpose(data.documentPurpose);
  const { items, totalAmount } = calculateItemTotals(data.items);
  return prisma.$transaction(async (tx) => {
    await validateMemoItems(tx, data.shopId, items, { requireCompleteSerials: false });
    const customer = await tx.customer.findUnique({ where: { id: data.customerId } });
    if (!customer || customer.shopId !== data.shopId || customer.status !== "ACTIVE") {
      throw new ApiError(400, "Customer does not belong to this shop", { code: "INVALID_CUSTOMER" });
    }
    if (purposeCreatesReceivable(documentPurpose) && customer.type === "WALK_IN") {
      throw new ApiError(400, "Credit delivery requires a named customer account", { code: "CREDIT_CUSTOMER_REQUIRED" });
    }
    const draftNumber = `DRAFT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    return tx.deliveryMemo.create({
      data: {
        dmNumber: draftNumber,
        shopId: data.shopId,
        staffId: user.id,
        customerId: customer.id,
        estimatedAmount: money(totalAmount),
        balanceAmount: money(totalAmount),
        expectedPaymentDate: data.expectedPaymentDate,
        documentPurpose,
        lifecycleStatus: "DRAFT",
        status: "CREATED",
        deliveryNotes: data.deliveryNotes,
        items: {
          create: items.map((item) => ({
            itemId: item.itemId,
            orderItemId: item.orderItemId || null,
            quantity: item.quantity,
            rate: money(item.rate),
            discountAmount: money(item.discountAmount),
            totalAmount: money(item.lineTotal),
            serialNumbers: item.serialNumbers?.length ? item.serialNumbers : null,
            description: item.description,
          })),
        },
      },
      include: { customer: true, items: { include: { item: true } } },
    });
  });
}

export async function updateDeliveryMemoDraft(user, id, data) {
  const existing = await prisma.deliveryMemo.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Delivery memo not found");
  await assertShopAccess(user, existing.shopId);
  if (existing.lifecycleStatus !== "DRAFT") {
    throw new ApiError(409, "Only a draft delivery memo can be edited", { code: "DM_ALREADY_POSTED" });
  }
  if (user.role === "STAFF" && existing.staffId !== user.id) throw new ApiError(403, "You can edit only your own draft");
  if (data.version !== undefined && data.version !== existing.version) {
    throw new ApiError(409, "This draft changed on another device", { code: "CONCURRENT_MODIFICATION" });
  }
  const { items, totalAmount } = calculateItemTotals(data.items);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DeliveryMemo" WHERE id = ${id} FOR UPDATE`;
    await validateMemoItems(tx, existing.shopId, items, { requireCompleteSerials: false });
    const customerId = data.customerId || existing.customerId;
    const documentPurpose = assertImplementedPurpose(data.documentPurpose || existing.documentPurpose);
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.shopId !== existing.shopId || customer.status !== "ACTIVE") {
      throw new ApiError(400, "Customer is not active in this shop", { code: "INVALID_CUSTOMER" });
    }
    if (purposeCreatesReceivable(documentPurpose) && customer.type === "WALK_IN") {
      throw new ApiError(400, "Credit delivery requires a named customer account", { code: "CREDIT_CUSTOMER_REQUIRED" });
    }
    await tx.deliveryMemoItem.deleteMany({ where: { dmId: id } });
    return tx.deliveryMemo.update({
      where: { id },
      data: {
        customerId,
        estimatedAmount: money(totalAmount),
        balanceAmount: money(totalAmount),
        expectedPaymentDate: data.expectedPaymentDate,
        documentPurpose,
        deliveryNotes: data.deliveryNotes,
        version: { increment: 1 },
        items: { create: items.map((item) => ({
          itemId: item.itemId,
          orderItemId: item.orderItemId || null,
          quantity: item.quantity,
          rate: money(item.rate),
          discountAmount: money(item.discountAmount),
          totalAmount: money(item.lineTotal),
          serialNumbers: item.serialNumbers?.length ? item.serialNumbers : null,
          description: item.description,
        })) },
      },
      include: { customer: true, items: { include: { item: true } } },
    });
  });
}

export async function postDeliveryMemo(user, id, data = {}) {
  const existing = await prisma.deliveryMemo.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Delivery memo not found");
  await assertShopAccess(user, existing.shopId);
  if (user.role === "STAFF" && existing.staffId !== user.id) throw new ApiError(403, "You can post only your own draft");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DeliveryMemo" WHERE id = ${id} FOR UPDATE`;
    const dm = await tx.deliveryMemo.findUnique({ where: { id }, include: { items: true } });
    if (!dm) throw new ApiError(404, "Delivery memo not found");
    if (dm.lifecycleStatus === "DISPATCHED") return dm;
    if (dm.lifecycleStatus !== "DRAFT" && dm.lifecycleStatus !== "READY_TO_DISPATCH") {
      throw new ApiError(409, "Delivery memo cannot be posted in its current state", { code: "INVALID_STATE_TRANSITION" });
    }
    assertImplementedPurpose(dm.documentPurpose);
    if (data.version !== undefined && data.version !== dm.version) {
      throw new ApiError(409, "This draft changed before posting", { code: "CONCURRENT_MODIFICATION" });
    }
    const rawItems = dm.items.map((item) => ({
      itemId: item.itemId,
      orderItemId: item.orderItemId,
      quantity: Number(item.quantity),
      rate: Number(item.rate),
      discountAmount: Number(item.discountAmount),
      serialNumbers: Array.isArray(item.serialNumbers) ? item.serialNumbers : [],
      description: item.description,
    }));
    const { items, totalAmount } = calculateItemTotals(rawItems);
    await validateMemoItems(tx, dm.shopId, items, {
      requireCompleteSerials: true,
      enforceStaffMinimum: user.role === "STAFF",
    });
    await checkAndLockAvailableStock(tx, dm.shopId, items, dm.orderId ? { excludeOrderId: dm.orderId } : undefined);
    await assignMemoSerials(tx, user, dm, items);

    const dmNumber = await generateRecordNumber(tx, {
      shopId: dm.shopId,
      model: "deliveryMemo",
      field: "dmNumber",
      prefix: "DM",
    });
    const stockRequirements = await expandStockRequirements(tx, dm.shopId, items);
    for (const item of stockRequirements) {
      await createStockOut(tx, {
        shopId: dm.shopId,
        itemId: item.itemId,
        quantity: item.quantity,
        movementType: "DM",
        referenceType: "DeliveryMemo",
        referenceId: dm.id,
        reason: dm.orderId ? "DM from order" : "Direct DM",
        userId: user.id,
      });
    }

    const totalVal = money(totalAmount);
    let advanceApplied = money(0);
    if (RECEIVABLE_PURPOSES.has(dm.documentPurpose)) {
      const account = await tx.customer.findUnique({ where: { id: dm.customerId } });
      if (!account || account.shopId !== dm.shopId || account.status !== "ACTIVE" || account.type === "WALK_IN") {
        throw new ApiError(409, "The delivery memo customer can no longer receive credit", { code: "INVALID_CREDIT_CUSTOMER" });
      }
      const projectedDebt = Math.max(0, Number(totalVal) - Number(account.advanceBalance || 0)) + Number(account.outstandingAmount || 0);
      if (user.role === "STAFF" && account.creditLimit != null && projectedDebt > Number(account.creditLimit)) {
        throw new ApiError(409, "Posting would exceed the customer credit limit", { code: "CUSTOMER_CREDIT_LIMIT_EXCEEDED" });
      }
      const receivable = await postCustomerReceivable(tx, dm.customerId, totalVal);
      advanceApplied = receivable.advanceApplied;
      await appendCustomerLedger(tx, {
        shopId: dm.shopId,
        customerId: dm.customerId,
        sourceId: dm.id,
        entryType: "DM_POSTED",
        direction: "DEBIT",
        amount: totalVal,
        userId: user.id,
        notes: `Posted ${dmNumber}`,
      });
      if (receivable.advanceApplied.gt(0)) {
        await tx.customerLedgerEntry.create({ data: {
          shopId: dm.shopId,
          customerId: dm.customerId,
          sourceType: "DELIVERY_MEMO",
          sourceId: dm.id,
          entryType: "ADVANCE_APPLIED",
          direction: "CREDIT",
          amount: receivable.advanceApplied,
          createdById: user.id,
          notes: `Advance applied to ${dmNumber}`,
        } });
      }
    }

    const paymentResult = await applyPayments(tx, {
      user,
      shopId: dm.shopId,
      dmId: dm.id,
      customerId: dm.customerId,
      totalAmount: totalVal,
      existingPaidAmount: advanceApplied,
      payments: data.payments || [],
    });
    const posted = await tx.deliveryMemo.update({
      where: { id: dm.id },
      data: {
        dmNumber,
        estimatedAmount: totalVal,
        paidAmount: paymentResult.paidAmount,
        balanceAmount: paymentResult.balanceAmount,
        paymentStatus: paymentResult.paymentStatus,
        status: legacyDeliveryMemoStatusForPayment(paymentResult.paymentStatus),
        lifecycleStatus: "DISPATCHED",
        postedAt: new Date(),
        version: { increment: 1 },
      },
      include: { customer: true, items: { include: { item: true } }, payments: true, sales: true },
    });
    await tx.dispatch.create({ data: {
      dmId: dm.id,
      orderId: dm.orderId,
      customerId: dm.customerId,
      shopId: dm.shopId,
      dispatchedById: user.id,
      status: "DISPATCHED",
    } });
    await tx.auditLog.create({ data: {
      userId: user.id,
      shopId: dm.shopId,
      action: AuditAction.CREATED,
      entityType: EntityType.DELIVERY_MEMO,
      entityId: dm.id,
      newValueJson: { action: "POSTED", dmNumber, totalAmount: Number(totalVal) },
    } });
    await enqueueManyDomainEvents(tx, [
      createDomainEvent({ shopId: dm.shopId, entity: "deliveryMemo", action: "posted", entityId: dm.id, actorUserId: user.id, actorRole: user.role, visibility: { owners: true, staff: true } }),
      createDomainEvent({ shopId: dm.shopId, entity: "stock", action: "updated", entityId: dm.id, actorUserId: user.id, actorRole: user.role, visibility: { owners: true, staff: true } }),
      createDomainEvent({ shopId: dm.shopId, entity: "customer", action: "updated", entityId: dm.customerId, actorUserId: user.id, actorRole: user.role, visibility: { owners: true, staff: true } }),
    ]);
    return withDerivedMemoState(posted, user);
  });
}

export async function createDeliveryMemo(user, data) {
  await assertShopAccess(user, data.shopId);
  const documentPurpose = assertImplementedPurpose(data.documentPurpose);

  const { items, totalAmount } = calculateItemTotals(data.items);

  return prisma.$transaction(async (tx) => {
    await checkAndLockAvailableStock(tx, data.shopId, items);
    await validateMemoItems(tx, data.shopId, items, {
      requireCompleteSerials: true,
      enforceStaffMinimum: user.role === "STAFF",
    });

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
    if (!customer || customer.shopId !== data.shopId || customer.status !== "ACTIVE") {
      throw new ApiError(400, "Customer does not belong to this shop");
    }
    if (purposeCreatesReceivable(documentPurpose) && customer.type === "WALK_IN") {
      throw new ApiError(400, "Credit delivery requires a named customer account", { code: "CREDIT_CUSTOMER_REQUIRED" });
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
        documentPurpose,
        lifecycleStatus: "DISPATCHED",
        postedAt: new Date(),
        deliveryNotes: data.deliveryNotes,
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

    await assignMemoSerials(tx, user, dm, items);

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
    let advanceApplied = money(0);
    if (RECEIVABLE_PURPOSES.has(documentPurpose)) {
      const projectedDebt = Math.max(0, Number(totalVal) - Number(customer.advanceBalance || 0)) + Number(customer.outstandingAmount || 0);
      if (user.role === "STAFF" && customer.creditLimit != null && projectedDebt > Number(customer.creditLimit)) {
        throw new ApiError(409, "Posting would exceed the customer credit limit", { code: "CUSTOMER_CREDIT_LIMIT_EXCEEDED" });
      }
      const receivable = await postCustomerReceivable(tx, customer.id, totalVal);
      advanceApplied = receivable.advanceApplied;
      await appendCustomerLedger(tx, {
        shopId: data.shopId,
        customerId: customer.id,
        sourceId: dm.id,
        entryType: "DM_POSTED",
        direction: "DEBIT",
        amount: totalVal,
        userId: user.id,
        notes: `Posted ${dmNumber}`,
      });
      if (receivable.advanceApplied.gt(0)) {
        await tx.customerLedgerEntry.create({ data: {
          shopId: data.shopId,
          customerId: customer.id,
          sourceType: "DELIVERY_MEMO",
          sourceId: dm.id,
          entryType: "ADVANCE_APPLIED",
          direction: "CREDIT",
          amount: receivable.advanceApplied,
          createdById: user.id,
          notes: `Advance applied to ${dmNumber}`,
        } });
      }
    }

    const paymentResult = await applyPayments(tx, {
      user,
      shopId: data.shopId,
      dmId: dm.id,
      customerId: customer.id,
      totalAmount: totalVal,
      existingPaidAmount: advanceApplied,
      payments: data.payments || [],
    });

    const updated = await tx.deliveryMemo.update({
      where: { id: dm.id },
      data: {
        paidAmount: paymentResult.paidAmount,
        balanceAmount: paymentResult.balanceAmount,
        paymentStatus: paymentResult.paymentStatus,
        status: legacyDeliveryMemoStatusForPayment(paymentResult.paymentStatus),
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
    include: {
      customer: true,
      staff: { select: { id: true, name: true } },
      shop: { select: { id: true, name: true, code: true, city: true, address: true, phone: true, gstin: true, logo: true } },
      order: { select: { id: true, orderNumber: true } },
      items: { include: { item: true, orderItem: true } },
      payments: { include: { details: true } },
      sales: { select: { id: true, saleNumber: true } },
      dispatches: true,
      inventoryReturns: { include: { items: true } },
    },
  });
  if (!dm) throw new ApiError(404, "Delivery memo not found");
  await assertShopAccess(user, dm.shopId);
  if (user.role === "STAFF" && dm.staffId !== user.id) throw new ApiError(403, "You can view only your own DMs");
  return withDerivedMemoState(dm, user);
}

export async function getDeliveryMemoShopForAction(user, id) {
  const dm = await prisma.deliveryMemo.findUnique({ where: { id }, select: { shopId: true } });
  if (!dm) throw new ApiError(404, "Delivery memo not found");
  await assertShopAccess(user, dm.shopId);
  return dm.shopId;
}

export async function getDeliveryMemoTimeline(user, id) {
  const dm = await getDeliveryMemo(user, id);
  const events = [
    { type: "DRAFT_CREATED", at: dm.createdAt, actor: dm.staff?.name || "Staff" },
    ...(dm.postedAt ? [{ type: "DISPATCH_CONFIRMED", at: dm.postedAt, actor: dm.staff?.name || "Staff" }] : []),
    ...dm.payments.map((payment) => ({ type: "PAYMENT_RECORDED", at: payment.createdAt, amount: payment.amount, status: payment.status })),
    ...dm.inventoryReturns.map((entry) => ({ type: `RETURN_${entry.status}`, at: entry.updatedAt, referenceId: entry.id, amount: entry.netAmount })),
    ...dm.sales.map((sale) => ({ type: "INVOICE_GENERATED", at: dm.updatedAt, referenceId: sale.id, number: sale.saleNumber })),
  ];
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export async function convertDeliveryMemoToSale(user, id, data = {}) {
  const existing = await prisma.deliveryMemo.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Delivery memo not found");
  await assertShopAccess(user, existing.shopId);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DeliveryMemo" WHERE id = ${id} FOR UPDATE`;
    const dm = await tx.deliveryMemo.findUnique({
      where: { id },
      include: { items: true, payments: { where: { status: { not: "CANCELLED" } } }, sales: true },
    });
    if (!dm) throw new ApiError(404, "Delivery memo not found");
    if (dm.sales.length) return dm.sales[0];
    if (dm.lifecycleStatus !== "DISPATCHED" || dm.invoicingStatus !== "NOT_INVOICED") {
      throw new ApiError(409, "Delivery memo cannot be converted in its current state", { code: "INVALID_STATE_TRANSITION" });
    }
    if (dm.returnStatus !== "NO_RETURN") {
      throw new ApiError(409, "A returned delivery memo cannot be converted in this version", { code: "DM_HAS_RETURNS" });
    }
    if (!RECEIVABLE_PURPOSES.has(dm.documentPurpose)) {
      throw new ApiError(409, "This delivery purpose does not create a sale invoice", { code: "INVALID_DOCUMENT_PURPOSE" });
    }

    const saleNumber = await generateRecordNumber(tx, {
      shopId: dm.shopId,
      model: "sale",
      field: "saleNumber",
      prefix: "SAL",
    });
    const sale = await tx.sale.create({
      data: {
        saleNumber,
        shopId: dm.shopId,
        staffId: user.id,
        customerId: dm.customerId,
        orderId: dm.orderId,
        dmId: dm.id,
        gstRequired: Boolean(data.gstRequired),
        gstInvoiceStatus: data.gstRequired ? "PENDING" : "NOT_REQUIRED",
        subtotal: dm.estimatedAmount,
        totalAmount: dm.estimatedAmount,
        paidAmount: dm.paidAmount,
        balanceAmount: dm.balanceAmount,
        paymentStatus: dm.paymentStatus,
        saleStatus: dm.paymentStatus === "PAID" ? "PAID" : "CONFIRMED",
        items: { create: dm.items.map((item) => ({
          itemId: item.itemId,
          quantity: item.quantity.minus ? item.quantity.minus(item.returnedQty) : Number(item.quantity) - Number(item.returnedQty),
          rate: item.rate,
          discountAmount: item.discountAmount,
          totalAmount: item.totalAmount,
          serialNumbers: item.serialNumbers,
          description: item.description,
        })) },
      },
      include: { items: true },
    });
    await tx.payment.updateMany({ where: { dmId: dm.id }, data: { dmId: null, saleId: sale.id } });
    await tx.deliveryMemo.update({
      where: { id: dm.id },
      data: { invoicingStatus: "FULLY_INVOICED", status: "CONVERTED_TO_SALE", version: { increment: 1 } },
    });
    await tx.auditLog.create({ data: {
      userId: user.id,
      shopId: dm.shopId,
      action: AuditAction.CREATED,
      entityType: EntityType.SALE,
      entityId: sale.id,
      newValueJson: { action: "CONVERTED_FROM_DELIVERY_MEMO", dmId: dm.id, dmNumber: dm.dmNumber },
    } });
    await enqueueManyDomainEvents(tx, [
      createDomainEvent({ shopId: dm.shopId, entity: "deliveryMemo", action: "converted_to_sale", entityId: dm.id, actorUserId: user.id, actorRole: user.role, visibility: { owners: true, staff: true } }),
      createDomainEvent({ shopId: dm.shopId, entity: "sale", action: "created", entityId: sale.id, actorUserId: user.id, actorRole: user.role, visibility: { owners: true, staff: true } }),
    ]);
    return sale;
  });
}
