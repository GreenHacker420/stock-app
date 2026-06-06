import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { money } from "../utils/money.js";
import { listSales } from "./sale.service.js";
import { listPayments } from "./payment.service.js";
import { listDeliveryMemos } from "./deliveryMemo.service.js";

export async function listCustomerSales(user, id, query) {
  const customer = await getCustomer(user, id);
  return listSales(user, { ...query, shopId: customer.shopId, customerId: id });
}

export async function listCustomerPayments(user, id, query) {
  const customer = await getCustomer(user, id);
  return listPayments(user, { ...query, shopId: customer.shopId, customerId: id });
}

export async function listCustomerDMs(user, id, query) {
  const customer = await getCustomer(user, id);
  return listDeliveryMemos(user, { ...query, shopId: customer.shopId, customerId: id });
}

export async function listCustomerReturns(user, id) {
  const customer = await getCustomer(user, id);
  return prisma.inventoryReturn.findMany({
    where: { customerId: id },
    include: { items: { include: { item: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCustomerTimeline(user, id) {
  const customer = await getCustomer(user, id);
  
  const [sales, payments, dms, returns, audits] = await Promise.all([
    prisma.sale.findMany({ where: { customerId: id }, take: 20, orderBy: { createdAt: "desc" } }),
    prisma.payment.findMany({ where: { customerId: id }, take: 20, orderBy: { createdAt: "desc" } }),
    prisma.deliveryMemo.findMany({ where: { customerId: id }, take: 20, orderBy: { createdAt: "desc" } }),
    prisma.inventoryReturn.findMany({ where: { customerId: id }, take: 20, orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ where: { entityType: "Customer", entityId: id }, take: 20, orderBy: { createdAt: "desc" } }),
  ]);

  const timeline = [
    ...sales.map(s => ({ id: s.id, type: "SALE", date: s.createdAt, title: `Sale #${s.saleNumber}`, amount: s.totalAmount, status: s.saleStatus })),
    ...payments.map(p => ({ id: p.id, type: "PAYMENT", date: p.receivedAt, title: `${p.paymentMode} Payment`, amount: p.amount, status: p.verificationStatus })),
    ...dms.map(d => ({ id: d.id, type: "DM", date: d.createdAt, title: `Delivery Memo #${d.dmNumber}`, amount: d.estimatedAmount, status: d.status })),
    ...returns.map(r => ({ id: r.id, type: "RETURN", date: r.createdAt, title: `Return #${r.returnNumber}`, amount: r.netAmount, status: r.status })),
    ...audits.map(a => ({ id: a.id, type: "AUDIT", date: a.createdAt, title: a.action, detail: a.reason })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return timeline;
}

export async function listCustomers(user, { shopId, search }) {
  await assertShopAccess(user, shopId);

  return prisma.customer.findMany({
    where: {
      shopId,
      status: "ACTIVE",
      OR: search
        ? [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCustomer(user, id) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw new ApiError(404, "Customer not found");
  await assertShopAccess(user, customer.shopId);
  return customer;
}

export async function createCustomer(user, data) {
  await assertShopAccess(user, data.shopId);

  const customer = await prisma.customer.create({
    data: {
      shopId: data.shopId,
      name: data.name,
      phone: data.phone,
      address: data.address,
      city: data.city,
      gstin: data.gstin,
      creditLimit: data.creditLimit ? money(data.creditLimit) : null,
      notes: data.notes,
      createdById: user.id,
      outstandingAmount: money(data.outstandingAmount || 0),
      advanceBalance: money(data.advanceBalance || 0),
    },
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId: customer.shopId,
    action: "customer.created",
    entityType: "Customer",
    entityId: customer.id,
    newValueJson: customer,
  });

  return customer;
}

export async function updateCustomer(user, id, data) {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Customer not found");
  await assertShopAccess(user, existing.shopId);

  // Strip outstandingAmount so it cannot be directly updated via normal updates
  const { outstandingAmount, advanceBalance, ...updateData } = data;
  
  if (updateData.creditLimit !== undefined) {
    updateData.creditLimit = updateData.creditLimit ? money(updateData.creditLimit) : null;
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: updateData,
  });

  await writeAuditLog({
    userId: user.id,
    role: user.role,
    shopId: existing.shopId,
    action: "customer.updated",
    entityType: "Customer",
    entityId: id,
    oldValueJson: existing,
    newValueJson: customer,
  });

  return customer;
}

export async function getOutstanding(user, id) {
  const customer = await getCustomer(user, id);
  const sales = await prisma.sale.findMany({
    where: { customerId: id, paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] }, saleStatus: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" }
  });
  return {
    customer,
    outstandingAmount: customer.outstandingAmount,
    advanceBalance: customer.advanceBalance,
    sales
  };
}

export async function getPriceHistory(user, id, { itemId }) {
  const customer = await getCustomer(user, id);

  const [sales, dms, orders] = await Promise.all([
    prisma.saleItem.findMany({
      where: { itemId: itemId || undefined, sale: { customerId: id } },
      include: { item: true, sale: true },
      orderBy: { sale: { createdAt: "desc" } },
      take: 100,
    }),
    prisma.deliveryMemoItem.findMany({
      where: { itemId: itemId || undefined, deliveryMemo: { customerId: id } },
      include: { item: true, deliveryMemo: true },
      orderBy: { deliveryMemo: { createdAt: "desc" } },
      take: 100,
    }),
    prisma.orderItem.findMany({
      where: { itemId: itemId || undefined, order: { customerId: id } },
      include: { item: true, order: true },
      orderBy: { order: { createdAt: "desc" } },
      take: 100,
    }),
  ]);

  const rows = [
    ...sales.map((row) => ({ type: "SALE", date: row.sale.createdAt, item: row.item, quantity: row.quantity, rate: row.rate, recordNumber: row.sale.saleNumber })),
    ...dms.map((row) => ({ type: "DM", date: row.deliveryMemo.createdAt, item: row.item, quantity: row.quantity, rate: row.rate, recordNumber: row.deliveryMemo.dmNumber })),
    ...orders.map((row) => ({ type: "ORDER", date: row.order.createdAt, item: row.item, quantity: row.quantityOrdered, rate: row.rate, recordNumber: row.order.orderNumber })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const rates = rows.map((row) => Number(row.rate));
  return {
    customer,
    rows,
    summary: {
      count: rows.length,
      lastRate: rates[0] ?? null,
      averageRate: rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null,
      minRate: rates.length ? Math.min(...rates) : null,
      maxRate: rates.length ? Math.max(...rates) : null,
    },
  };
}
