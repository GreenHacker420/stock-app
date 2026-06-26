import type { PrismaClient } from "@prisma/client/react-native";
import type { Customer, Item } from "../api/client";
import { ensureLocalDbReady, getLocalPrisma } from "./prisma";
import {
  newIdempotencyKey,
  newLocalCustomerId,
  newLocalPaymentId,
  newLocalSaleId,
  newLocalSaleItemId,
  newMutationId,
} from "./localIds";

type LocalContext = {
  shopId: string;
  userId?: string | null;
  deviceId?: string | null;
};

type LocalFailure = { ok: false; reason: "LOCAL_DB_UNAVAILABLE"; message: string };
type LocalSuccess<T> = { ok: true } & T;

function localDbFailure(message: string): LocalFailure {
  return { ok: false, reason: "LOCAL_DB_UNAVAILABLE", message };
}

export type LocalCustomerInput = LocalContext & {
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  customerType?: string | null;
};

export type LocalSaleItemInput = {
  itemId?: string | null;
  serverItemId?: string | null;
  nameSnapshot: string;
  priceSnapshot: string;
  quantity: string;
  unit?: string | null;
  lineTotal: string;
};

export type LocalSaleInput = LocalContext & {
  customerId?: string | null;
  serverCustomerId?: string | null;
  customerMutationId?: string | null;
  billNumber?: string | null;
  subtotal: string;
  discount?: string;
  tax?: string;
  total: string;
  paymentStatus?: string;
  notes?: string | null;
  signatureUri?: string | null;
  signatureBase64?: string | null;
  items: LocalSaleItemInput[];
};

export type LocalPaymentInput = LocalContext & {
  saleId?: string | null;
  serverSaleId?: string | null;
  orderId?: string | null;
  dmId?: string | null;
  saleMutationId?: string | null;
  customerId?: string | null;
  serverCustomerId?: string | null;
  amount: string;
  mode: string;
  reference?: string | null;
  notes?: string | null;
};

function addDecimalStrings(left: string, right: string) {
  return String(Number(left || "0") + Number(right || "0"));
}

function createPendingMutationData(input: {
  id: string;
  idempotencyKey: string;
  context: LocalContext;
  entityType: string;
  action: string;
  localEntityId: string;
  serverEntityId?: string | null;
  dependsOnMutationId?: string | null;
  payload: unknown;
  now: Date;
}) {
  return {
    id: input.id,
    idempotencyKey: input.idempotencyKey,
    shopId: input.context.shopId,
    userId: input.context.userId ?? null,
    deviceId: input.context.deviceId ?? null,
    entityType: input.entityType,
    action: input.action,
    localEntityId: input.localEntityId,
    serverEntityId: input.serverEntityId ?? null,
    dependsOnMutationId: input.dependsOnMutationId ?? null,
    payloadJson: JSON.stringify(input.payload),
    status: "pending",
    retryCount: 0,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export async function createLocalCustomer(input: LocalCustomerInput) {
  const ready = await ensureLocalDbReady();
  if (!ready.ok) return localDbFailure(ready.message);
  const prisma = ready.prisma;
  const now = new Date();
  const localCustomerId = newLocalCustomerId();
  const mutationId = newMutationId();

  const result = await prisma.$transaction(async (tx) => {
    const db = tx as unknown as PrismaClient;
    const existing = input.phone
      ? await db.localCustomer.findFirst({
          where: { shopId: input.shopId, phone: input.phone, deletedAt: null },
          orderBy: { updatedAt: "desc" },
        })
      : null;
    if (existing) {
      const existingMutation = await db.pendingMutation.findFirst({
        where: { localEntityId: existing.id, entityType: "CUSTOMER", status: { in: ["pending", "failed", "processing"] } },
        orderBy: { createdAt: "asc" },
      });
      return { customer: existing, mutation: existingMutation };
    }

    const customer = await db.localCustomer.create({
      data: {
        id: localCustomerId,
        serverId: null,
        shopId: input.shopId,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        gstin: input.gstin ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        customerType: input.customerType ?? "REGULAR",
        syncStatus: "pending",
        createdAt: now,
        updatedAt: now,
      },
    });

    const mutation = await db.pendingMutation.create({
      data: createPendingMutationData({
        id: mutationId,
        idempotencyKey: newIdempotencyKey("CUSTOMER", localCustomerId),
        context: input,
        entityType: "CUSTOMER",
        action: "CREATE",
        localEntityId: localCustomerId,
        payload: {
          shopId: input.shopId,
          name: input.name,
          phone: input.phone ?? undefined,
          email: input.email ?? undefined,
          gstin: input.gstin ?? undefined,
          address: input.address ?? undefined,
          city: input.city ?? undefined,
          type: input.customerType ?? "REGULAR",
        },
        now,
      }),
    });

    return { customer, mutation };
  });
  return { ok: true, ...result } satisfies LocalSuccess<typeof result>;
}

export async function createLocalSaleWithItems(input: LocalSaleInput) {
  const ready = await ensureLocalDbReady();
  if (!ready.ok) return localDbFailure(ready.message);
  const prisma = ready.prisma;
  const now = new Date();
  const localSaleId = newLocalSaleId();
  const mutationId = newMutationId();

  const result = await prisma.$transaction(async (tx) => {
    const db = tx as unknown as PrismaClient;
    const sale = await db.localSale.create({
      data: {
        id: localSaleId,
        serverId: null,
        shopId: input.shopId,
        customerId: input.customerId ?? null,
        serverCustomerId: input.serverCustomerId ?? null,
        billNumber: input.billNumber ?? null,
        subtotal: input.subtotal,
        discount: input.discount ?? "0",
        tax: input.tax ?? "0",
        total: input.total,
        paymentStatus: input.paymentStatus ?? "UNPAID",
        notes: input.notes ?? null,
        signatureUri: input.signatureUri ?? null,
        signatureBase64: input.signatureBase64 ?? null,
        syncStatus: "pending",
        createdAt: now,
        updatedAt: now,
      },
    });

    const saleItems = [];
    for (const item of input.items) {
      const saleItem = await db.localSaleItem.create({
        data: {
          id: newLocalSaleItemId(),
          saleId: localSaleId,
          itemId: item.itemId ?? null,
          serverItemId: item.serverItemId ?? null,
          nameSnapshot: item.nameSnapshot,
          priceSnapshot: item.priceSnapshot,
          quantity: item.quantity,
          unit: item.unit ?? null,
          lineTotal: item.lineTotal,
          createdAt: now,
        },
      });
      saleItems.push(saleItem);

      if (item.itemId) {
        const existing = await db.localItem.findUnique({ where: { id: item.itemId } });
        if (existing) {
          await db.localItem.update({
            where: { id: item.itemId },
            data: {
              pendingStockDelta: addDecimalStrings(existing.pendingStockDelta, `-${item.quantity}`),
              updatedAt: now,
            },
          });
        }
      }
    }

    const mutation = await db.pendingMutation.create({
      data: createPendingMutationData({
        id: mutationId,
        idempotencyKey: newIdempotencyKey("SALE", localSaleId),
        context: input,
        entityType: "SALE",
        action: "CREATE",
        localEntityId: localSaleId,
        dependsOnMutationId: input.customerMutationId ?? null,
        payload: {
          shopId: input.shopId,
          customerId: input.serverCustomerId ?? undefined,
          localCustomerId: input.customerId ?? undefined,
          items: input.items.map((item) => ({
            itemId: item.serverItemId,
            localItemId: item.itemId ?? undefined,
            quantity: Number(item.quantity),
            rate: Number(item.priceSnapshot),
            discountAmount: 0,
          })),
          customerSignature: input.signatureBase64 ?? undefined,
          notes: input.notes ?? undefined,
        },
        now,
      }),
    });

    return { sale, saleItems, mutation };
  });
  return { ok: true, ...result } satisfies LocalSuccess<typeof result>;
}

export async function createLocalPayment(input: LocalPaymentInput) {
  const ready = await ensureLocalDbReady();
  if (!ready.ok) return localDbFailure(ready.message);
  const prisma = ready.prisma;
  const now = new Date();
  const localPaymentId = newLocalPaymentId();
  const mutationId = newMutationId();

  const result = await prisma.$transaction(async (tx) => {
    const db = tx as unknown as PrismaClient;
    const payment = await db.localPayment.create({
      data: {
        id: localPaymentId,
        serverId: null,
        saleId: input.saleId ?? null,
        serverSaleId: input.serverSaleId ?? null,
        customerId: input.customerId ?? null,
        serverCustomerId: input.serverCustomerId ?? null,
        shopId: input.shopId,
        amount: input.amount,
        mode: input.mode,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        syncStatus: "pending",
        createdAt: now,
        updatedAt: now,
      },
    });

    const mutation = await db.pendingMutation.create({
      data: createPendingMutationData({
        id: mutationId,
        idempotencyKey: newIdempotencyKey("PAYMENT", localPaymentId),
        context: input,
        entityType: "PAYMENT",
        action: "CREATE",
        localEntityId: localPaymentId,
        dependsOnMutationId: input.saleMutationId ?? null,
        payload: {
          shopId: input.shopId,
          saleId: input.serverSaleId ?? undefined,
          orderId: input.orderId ?? undefined,
          dmId: input.dmId ?? undefined,
          localSaleId: input.saleId ?? undefined,
          customerId: input.serverCustomerId ?? undefined,
          localCustomerId: input.customerId ?? undefined,
          paymentMode: input.mode,
          amount: Number(input.amount),
          referenceNumber: input.reference ?? undefined,
          notes: input.notes ?? undefined,
        },
        now,
      }),
    });

    return { payment, mutation };
  });
  return { ok: true, ...result } satisfies LocalSuccess<typeof result>;
}

export async function createOfflineBillWithOptionalCustomer(input: {
  context: LocalContext;
  customer?: Omit<LocalCustomerInput, keyof LocalContext> & { serverId?: string | null };
  sale: Omit<LocalSaleInput, keyof LocalContext | "customerId" | "serverCustomerId" | "customerMutationId">;
  payment?: Omit<LocalPaymentInput, keyof LocalContext | "saleId" | "serverSaleId" | "saleMutationId" | "customerId" | "serverCustomerId">;
}) {
  const createdCustomer = input.customer?.serverId
    ? null
    : input.customer
      ? await createLocalCustomer({ ...input.context, ...input.customer })
      : null;
  if (createdCustomer && !createdCustomer.ok) return createdCustomer;

  const sale = await createLocalSaleWithItems({
    ...input.context,
    ...input.sale,
    customerId: createdCustomer?.customer.id ?? null,
    serverCustomerId: input.customer?.serverId ?? null,
    customerMutationId: createdCustomer?.mutation?.id ?? null,
  });
  if (!sale.ok) return sale;

  const payment = input.payment
    ? await createLocalPayment({
        ...input.context,
        ...input.payment,
        saleId: sale.sale.id,
        saleMutationId: sale.mutation.id,
        customerId: createdCustomer?.customer.id ?? null,
        serverCustomerId: input.customer?.serverId ?? null,
      })
    : null;
  if (payment && !payment.ok) return payment;

  return {
    ok: true,
    customer: createdCustomer?.customer ?? null,
    sale: sale.sale,
    saleItems: sale.saleItems,
    saleMutation: sale.mutation,
    payment: payment?.payment ?? null,
    paymentMutation: payment?.mutation ?? null,
  };
}

export async function getLocalCustomers(shopId: string, search?: string) {
  const ready = await ensureLocalDbReady();
  if (!ready.ok) return [];
  const normalized = search?.trim();
  return ready.prisma.localCustomer.findMany({
    where: {
      shopId,
      deletedAt: null,
      OR: normalized
        ? [
            { name: { contains: normalized } },
            { phone: { contains: normalized } },
            { gstin: { contains: normalized } },
          ]
        : undefined,
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}

export async function getLocalItems(shopId: string, search?: string) {
  const ready = await ensureLocalDbReady();
  if (!ready.ok) return [];
  const normalized = search?.trim();
  return ready.prisma.localItem.findMany({
    where: {
      shopId,
      OR: normalized
        ? [
            { name: { contains: normalized } },
            { sku: { contains: normalized } },
          ]
        : undefined,
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function getPendingMutationForLocalEntity(localEntityId: string, entityType: string) {
  const ready = await ensureLocalDbReady();
  if (!ready.ok) return null;
  return ready.prisma.pendingMutation.findFirst({
    where: {
      localEntityId,
      entityType,
      status: { in: ["pending", "failed", "processing"] },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function upsertLocalCustomersFromServer(shopId: string, customers: Customer[]) {
  const ready = await ensureLocalDbReady();
  if (!ready.ok) return ready;
  const now = new Date();
  await Promise.all(customers.map((customer) =>
    ready.prisma.localCustomer.upsert({
      where: { id: `server_customer_${customer.id}` },
      update: {
        serverId: customer.id,
        shopId,
        name: customer.name,
        phone: customer.phone ?? null,
        gstin: customer.gstin ?? null,
        address: customer.address ?? null,
        city: customer.city ?? null,
        customerType: customer.type ?? "REGULAR",
        syncStatus: "synced",
        updatedAt: now,
      },
      create: {
        id: `server_customer_${customer.id}`,
        serverId: customer.id,
        shopId,
        name: customer.name,
        phone: customer.phone ?? null,
        gstin: customer.gstin ?? null,
        address: customer.address ?? null,
        city: customer.city ?? null,
        customerType: customer.type ?? "REGULAR",
        syncStatus: "synced",
        createdAt: now,
        updatedAt: now,
      },
    })
  ));
  return { ok: true as const };
}

export async function upsertLocalItemsFromServer(shopId: string, items: Item[]) {
  const ready = await ensureLocalDbReady();
  if (!ready.ok) return ready;
  const now = new Date();
  await Promise.all(items.map((item) =>
    ready.prisma.localItem.upsert({
      where: { id: `server_item_${item.id}` },
      update: {
        serverId: item.id,
        shopId,
        name: item.name,
        sku: item.sku ?? null,
        categoryId: item.category?.id ?? null,
        categoryName: item.category?.name ?? null,
        unit: item.unit ?? null,
        price: String(item.defaultSellingPrice ?? "0"),
        stockQty: String(item.availableStock ?? item.currentStock ?? 0),
        syncStatus: "synced",
        updatedAt: now,
      },
      create: {
        id: `server_item_${item.id}`,
        serverId: item.id,
        shopId,
        name: item.name,
        sku: item.sku ?? null,
        categoryId: item.category?.id ?? null,
        categoryName: item.category?.name ?? null,
        unit: item.unit ?? null,
        price: String(item.defaultSellingPrice ?? "0"),
        stockQty: String(item.availableStock ?? item.currentStock ?? 0),
        pendingStockDelta: "0",
        syncStatus: "synced",
        updatedAt: now,
      },
    })
  ));
  return { ok: true as const };
}

export async function getPendingSyncCounts(shopId: string) {
  const ready = await ensureLocalDbReady();
  if (!ready.ok) return { pending: 0, conflict: 0, failed: 0 };
  const [pending, conflict, failed] = await Promise.all([
    ready.prisma.pendingMutation.count({ where: { shopId, status: { in: ["pending", "processing"] } } }),
    ready.prisma.pendingMutation.count({ where: { shopId, status: "conflict" } }),
    ready.prisma.pendingMutation.count({ where: { shopId, status: "failed" } }),
  ]);
  return { pending, conflict, failed };
}
