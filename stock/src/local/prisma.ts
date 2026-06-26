import "@prisma/react-native";
import { PrismaClient } from "@prisma/client/react-native";

let localPrisma: PrismaClient | null = null;
let initialized = false;
let initializationError: string | null = null;

export type LocalDbReadyResult =
  | { ok: true; prisma: PrismaClient }
  | { ok: false; reason: "LOCAL_DB_UNAVAILABLE"; message: string };

export function getLocalPrisma() {
  if (!localPrisma) {
    localPrisma = new PrismaClient();
  }
  return localPrisma;
}

export async function initializeLocalPrisma() {
  const prisma = getLocalPrisma();
  if (!initialized) {
    await (prisma as PrismaClient & { $applyPendingMigrations?: () => Promise<void> }).$applyPendingMigrations?.();
    initialized = true;
    initializationError = null;
  }
  return prisma;
}

export async function ensureLocalDbReady(): Promise<LocalDbReadyResult> {
  if (initialized && localPrisma) return { ok: true, prisma: localPrisma };
  if (initializationError) {
    return { ok: false, reason: "LOCAL_DB_UNAVAILABLE", message: initializationError };
  }

  try {
    const prisma = await initializeLocalPrisma();
    return { ok: true, prisma };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local database is unavailable";
    initializationError = message;
    console.warn("[local-db] initialization failed", message);
    return { ok: false, reason: "LOCAL_DB_UNAVAILABLE", message };
  }
}

export async function runLocalPrismaSmokeTest() {
  const ready = await ensureLocalDbReady();
  if (!ready.ok) throw new Error(ready.message);
  const prisma = ready.prisma;
  const key = "__local_prisma_smoke_test__";
  const now = new Date();

  await prisma.syncMetadata.upsert({
    where: { key },
    update: { value: "created", updatedAt: now },
    create: { key, value: "created", updatedAt: now },
  });

  const created = await prisma.syncMetadata.findUnique({ where: { key } });
  if (!created) throw new Error("Local Prisma smoke test failed to read SyncMetadata");

  await prisma.syncMetadata.update({
    where: { key },
    data: { value: "updated", updatedAt: new Date() },
  });

  const updated = await prisma.syncMetadata.findUnique({ where: { key } });
  if (updated?.value !== "updated") throw new Error("Local Prisma smoke test failed to update SyncMetadata");

  await prisma.syncMetadata.delete({ where: { key } });
  return true;
}
