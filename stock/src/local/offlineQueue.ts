import type { PendingMutation } from "@prisma/client/react-native";
import { getLocalPrisma } from "./prisma";

export type PendingMutationStatus = "pending" | "processing" | "synced" | "failed" | "conflict";

export type EnqueueMutationInput = {
  id: string;
  idempotencyKey: string;
  shopId: string;
  userId?: string | null;
  deviceId?: string | null;
  entityType: string;
  action: string;
  localEntityId: string;
  serverEntityId?: string | null;
  dependsOnMutationId?: string | null;
  payload: unknown;
  createdAt?: Date;
};

const entityPriority: Record<string, number> = {
  CUSTOMER: 1,
  SALE: 2,
  PAYMENT: 3,
};

export function orderPendingMutations<T extends PendingMutation>(mutations: T[]) {
  return [...mutations].sort((a, b) => {
    const dependencyDelta = Number(!!a.dependsOnMutationId) - Number(!!b.dependsOnMutationId);
    if (dependencyDelta !== 0) return dependencyDelta;
    const priorityDelta = (entityPriority[a.entityType] ?? 99) - (entityPriority[b.entityType] ?? 99);
    if (priorityDelta !== 0) return priorityDelta;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export async function enqueueMutation(input: EnqueueMutationInput) {
  const prisma = getLocalPrisma();
  const now = input.createdAt ?? new Date();
  return prisma.pendingMutation.create({
    data: {
      id: input.id,
      idempotencyKey: input.idempotencyKey,
      shopId: input.shopId,
      userId: input.userId ?? null,
      deviceId: input.deviceId ?? null,
      entityType: input.entityType,
      action: input.action,
      localEntityId: input.localEntityId,
      serverEntityId: input.serverEntityId ?? null,
      dependsOnMutationId: input.dependsOnMutationId ?? null,
      payloadJson: JSON.stringify(input.payload),
      status: "pending",
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    },
  });
}

export async function getPendingMutations(shopId: string): Promise<PendingMutation[]> {
  const prisma = getLocalPrisma();
  const rows = await prisma.pendingMutation.findMany({
    where: {
      shopId,
      status: { in: ["pending", "failed"] },
    },
    orderBy: { createdAt: "asc" },
  });
  return orderPendingMutations(rows);
}

export async function markMutationProcessing(id: string) {
  const prisma = getLocalPrisma();
  return prisma.pendingMutation.update({
    where: { id },
    data: { status: "processing", updatedAt: new Date() },
  });
}

export async function markMutationSynced(id: string, serverEntityId?: string | null) {
  const prisma = getLocalPrisma();
  return prisma.pendingMutation.update({
    where: { id },
    data: {
      status: "synced",
      serverEntityId: serverEntityId ?? undefined,
      lastError: null,
      updatedAt: new Date(),
    },
  });
}

export async function markMutationFailed(id: string, error: string) {
  const prisma = getLocalPrisma();
  const existing = await prisma.pendingMutation.findUnique({ where: { id } });
  return prisma.pendingMutation.update({
    where: { id },
    data: {
      status: "failed",
      retryCount: (existing?.retryCount ?? 0) + 1,
      lastError: error,
      updatedAt: new Date(),
    },
  });
}

export async function markMutationConflict(id: string, error: string) {
  const prisma = getLocalPrisma();
  return prisma.pendingMutation.update({
    where: { id },
    data: {
      status: "conflict",
      lastError: error,
      updatedAt: new Date(),
    },
  });
}

export async function updateDependentMutationPayload(id: string, payload: unknown) {
  const prisma = getLocalPrisma();
  return prisma.pendingMutation.update({
    where: { id },
    data: {
      payloadJson: JSON.stringify(payload),
      updatedAt: new Date(),
    },
  });
}
