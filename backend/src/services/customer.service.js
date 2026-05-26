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
