import { API_BASE_URL } from "../api/client";
import { ensureLocalDbReady, getLocalPrisma } from "./prisma";
import {
  getPendingMutations,
  markMutationConflict,
  markMutationFailed,
  markMutationProcessing,
  markMutationSynced,
} from "./offlineQueue";
import { reconcileDomainEventsForShop } from "../realtime/domainEventReconciliation";

type PendingMutationRow = Awaited<ReturnType<typeof getPendingMutations>>[number];

let isSyncRunning = false;

function endpointForMutation(mutation: PendingMutationRow) {
  if (mutation.entityType === "CUSTOMER" && mutation.action === "CREATE") return "/customers";
  if (mutation.entityType === "SALE" && mutation.action === "CREATE") return "/sales";
  if (mutation.entityType === "PAYMENT" && mutation.action === "CREATE") return "/payments";
  throw new Error(`Unsupported offline mutation ${mutation.entityType}:${mutation.action}`);
}

async function getServerId(localId?: string | null) {
  if (!localId) return null;
  const prisma = getLocalPrisma();
  const mapping = await prisma.idMapping.findUnique({ where: { localId } });
  return mapping?.serverId ?? null;
}

async function dependencyIsSynced(mutation: PendingMutationRow) {
  if (!mutation.dependsOnMutationId) return true;
  const prisma = getLocalPrisma();
  const dependency = await prisma.pendingMutation.findUnique({ where: { id: mutation.dependsOnMutationId } });
  return dependency?.status === "synced";
}

async function resolvePayload(mutation: PendingMutationRow) {
  const payload = JSON.parse(mutation.payloadJson);

  if (mutation.entityType === "SALE") {
    if (!payload.customerId && payload.localCustomerId) {
      payload.customerId = await getServerId(payload.localCustomerId);
    }
    payload.items = await Promise.all((payload.items || []).map(async (item: Record<string, unknown>) => {
      if (!item.itemId && item.localItemId) {
        item.itemId = await getServerId(String(item.localItemId));
      }
      const { localItemId, ...serverItem } = item;
      return serverItem;
    }));
    delete payload.localCustomerId;
  }

  if (mutation.entityType === "PAYMENT") {
    if (!payload.saleId && payload.localSaleId) {
      payload.saleId = await getServerId(payload.localSaleId);
    }
    if (!payload.customerId && payload.localCustomerId) {
      payload.customerId = await getServerId(payload.localCustomerId);
    }
    delete payload.localSaleId;
    delete payload.localCustomerId;
  }

  return payload;
}

async function postMutation(mutation: PendingMutationRow, token: string) {
  const response = await fetch(`${API_BASE_URL}${endpointForMutation(mutation)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": mutation.idempotencyKey,
    },
    body: JSON.stringify(await resolvePayload(mutation)),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (response.status === 401) {
    throw Object.assign(new Error("Authentication failed during offline sync"), { status: 401 });
  }
  if (response.status === 409) {
    throw Object.assign(new Error(body?.message || "Offline sync conflict"), { status: 409 });
  }
  if (!response.ok) {
    throw Object.assign(new Error(body?.message || "Offline sync failed"), { status: response.status });
  }

  return body?.data;
}

async function markLocalEntitySynced(mutation: PendingMutationRow, serverId: string) {
  const prisma = getLocalPrisma();
  const now = new Date();

  await prisma.idMapping.upsert({
    where: { localId: mutation.localEntityId },
    update: { serverId },
    create: {
      localId: mutation.localEntityId,
      serverId,
      entityType: mutation.entityType,
      createdAt: now,
    },
  });

  if (mutation.entityType === "CUSTOMER") {
    await prisma.localCustomer.update({
      where: { id: mutation.localEntityId },
      data: { serverId, syncStatus: "synced", conflictReason: null, updatedAt: now },
    });
  }

  if (mutation.entityType === "SALE") {
    await prisma.localSale.update({
      where: { id: mutation.localEntityId },
      data: { serverId, syncStatus: "synced", conflictReason: null, updatedAt: now },
    });
  }

  if (mutation.entityType === "PAYMENT") {
    await prisma.localPayment.update({
      where: { id: mutation.localEntityId },
      data: { serverId, syncStatus: "synced", updatedAt: now },
    });
  }
}

async function markLocalEntityConflict(mutation: PendingMutationRow, reason: string) {
  const prisma = getLocalPrisma();
  const now = new Date();

  if (mutation.entityType === "CUSTOMER") {
    await prisma.localCustomer.update({
      where: { id: mutation.localEntityId },
      data: { syncStatus: "conflict", conflictReason: reason, updatedAt: now },
    });
  }

  if (mutation.entityType === "SALE") {
    await prisma.localSale.update({
      where: { id: mutation.localEntityId },
      data: { syncStatus: "conflict", conflictReason: reason, updatedAt: now },
    });
  }

  if (mutation.entityType === "PAYMENT") {
    await prisma.localPayment.update({
      where: { id: mutation.localEntityId },
      data: { syncStatus: "conflict", updatedAt: now },
    });
  }
}

export async function runOfflineSyncOnce({
  shopId,
  token,
  queryClient,
  deviceId,
}: {
  shopId: string;
  token: string;
  queryClient?: import("@tanstack/react-query").QueryClient;
  deviceId?: string;
}) {
  if (isSyncRunning) return { skipped: true, processed: 0 };
  isSyncRunning = true;

  try {
    const ready = await ensureLocalDbReady();
    if (!ready.ok) return { skipped: false, processed: 0, error: ready.reason };
    const mutations = await getPendingMutations(shopId);
    let processed = 0;

    for (const mutation of mutations) {
      if (!(await dependencyIsSynced(mutation))) continue;

      await markMutationProcessing(mutation.id);
      try {
        const data = await postMutation(mutation, token);
        if (data?.id) {
          await markLocalEntitySynced(mutation, data.id);
        }
        await markMutationSynced(mutation.id, data?.id ?? null);
        processed += 1;
      } catch (error) {
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
        const message = error instanceof Error ? error.message : "Offline sync failed";
        if (status === 401) break;
        if (status === 409) {
          await markMutationConflict(mutation.id, message);
          await markLocalEntityConflict(mutation, message);
          continue;
        }
        await markMutationFailed(mutation.id, message);
      }
    }

    if (processed > 0 && queryClient) {
      void reconcileDomainEventsForShop(shopId, token, queryClient, deviceId);
    }

    return { skipped: false, processed };
  } finally {
    isSyncRunning = false;
  }
}
