import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import prisma from "../lib/db.js";
import { deleteS3Object } from "./s3.service.js";
import { deleteOneDriveObject } from "../lib/onedrive-storage.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const GRACE_PERIOD_MS = Number(process.env.ASSET_DELETE_GRACE_MS || 60_000);

const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

export const assetDeletionQueue = new Queue("asset-deletion", {
  connection,
  defaultJobOptions: {
    attempts: 6,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: { count: 200 },
  },
});

export async function enqueueAssetDeletion(outboxId) {
  return assetDeletionQueue.add(
    "process",
    { outboxId },
    { jobId: `asset-deletion-${outboxId}` },
  );
}

async function processOutboxRow(outboxId) {
  const outbox = await prisma.assetDeletionOutbox.findUnique({ where: { id: outboxId } });
  if (!outbox || outbox.status === "COMPLETED") return { skipped: true };

  const asset = await prisma.asset.findUnique({ where: { id: outbox.assetId } });
  if (!asset) {
    await prisma.assetDeletionOutbox.update({
      where: { id: outboxId },
      data: { status: "COMPLETED", processedAt: new Date(), lastError: "Asset missing" },
    });
    return { completed: true };
  }

  // Recheck financial references
  const ledgerRefs = await prisma.customerLedgerAttachment.count({ where: { assetId: asset.id } });
  if (ledgerRefs > 0) {
    await prisma.assetDeletionOutbox.update({
      where: { id: outboxId },
      data: {
        status: "FAILED",
        lastError: "Asset is referenced by financial ledger entries",
        attempts: { increment: 1 },
      },
    });
    await prisma.asset.update({
      where: { id: asset.id },
      data: { deletionStatus: "FAILED", storageDeleteError: "Referenced by ledger" },
    });
    return { blocked: true };
  }

  // Grace period
  const requestedAt = asset.deleteRequestedAt ? new Date(asset.deleteRequestedAt).getTime() : 0;
  if (Date.now() - requestedAt < GRACE_PERIOD_MS) {
    throw new Error("Grace period not elapsed");
  }

  await prisma.assetDeletionOutbox.update({
    where: { id: outboxId },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });
  await prisma.asset.update({
    where: { id: asset.id },
    data: { deletionStatus: "PROCESSING" },
  });

  if (asset.storageKey) {
    if (asset.storageProvider === "ONEDRIVE") {
      await deleteOneDriveObject(asset.storageKey, asset.externalId);
    } else {
      const deleted = await deleteS3Object({
        key: asset.storageKey,
        bucket: asset.storageBucket || outbox.storageBucket,
      });
      if (!deleted.success) {
        throw new Error(deleted.error || "S3 delete failed");
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id: asset.id },
      data: {
        deletionStatus: "COMPLETED",
        storageDeletedAt: new Date(),
        storageDeleteError: null,
      },
    });
    await tx.assetDeletionOutbox.update({
      where: { id: outboxId },
      data: { status: "COMPLETED", processedAt: new Date(), lastError: null },
    });
    await tx.auditLog.create({
      data: {
        shopId: asset.shopId,
        action: "STORAGE_DELETED",
        entityType: "ASSET",
        entityId: asset.id,
        reason: "Asset storage deleted by outbox worker",
      },
    });
  });

  return { completed: true };
}

let worker = null;

export function startAssetDeletionWorker() {
  if (worker) return worker;
  worker = new Worker(
    "asset-deletion",
    async (job) => processOutboxRow(job.data.outboxId),
    { connection, concurrency: 2 },
  );
  worker.on("failed", async (job, err) => {
    if (!job?.data?.outboxId) return;
    await prisma.assetDeletionOutbox.update({
      where: { id: job.data.outboxId },
      data: { status: "FAILED", lastError: err?.message || String(err) },
    }).catch(() => {});
  });
  return worker;
}

export async function closeAssetDeletionQueue() {
  try { if (worker) await worker.close(); } catch {}
  try { await assetDeletionQueue.close(); } catch {}
  try { await connection.quit(); } catch {}
}
