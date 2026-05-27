import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditLog.js";

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
      creditLimit: data.creditLimit,
      notes: data.notes,
      createdById: user.id,
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

  const customer = await prisma.customer.update({
    where: { id },
    data,
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
  const records = await prisma.creditOutstanding.findMany({
    where: { customerId: id, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
    include: { sale: true, deliveryMemo: true, order: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  const totalPending = records.reduce((sum, record) => sum + Number(record.pendingAmount), 0);
  return { customer, totalPending, records };
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
