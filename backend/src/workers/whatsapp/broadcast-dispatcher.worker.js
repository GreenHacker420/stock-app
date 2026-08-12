import { DelayedError, Worker } from "bullmq";
import prisma from "../../lib/db.js";
import { resolveAudience } from "../../services/whatsapp.broadcast.service.js";
import { broadcastQueue, broadcastSendQueue, connection } from "../../services/whatsapp.queue.js";

const FANOUT_BATCH_SIZE = 250;
const PROGRESS_TTL_SECONDS = 7 * 24 * 60 * 60;
const SCHEDULE_RECOVERY_INTERVAL_MS = 60_000;
const SCHEDULE_RECOVERY_LOOKAHEAD_MS = 2 * 60_000;
const SCHEDULE_JOB_PREFIX = "wa-broadcast-scheduled";

async function ensureLegacyRecipients(broadcast) {
  const audience = await resolveAudience(broadcast.shopId, broadcast.audienceFilter);
  if (audience.length === 0) return [];

  for (let index = 0; index < audience.length; index += FANOUT_BATCH_SIZE) {
    const batch = audience.slice(index, index + FANOUT_BATCH_SIZE);
    await prisma.waBroadcastRecipient.createMany({
      data: batch.map((recipient) => ({
        broadcastId: broadcast.id,
        customerId: recipient.customerId || null,
        customerPhone: recipient.phone,
        customerName: recipient.name || null,
        source: "CUSTOMER",
        sourceContactId: null,
        status: "PENDING",
      })),
      skipDuplicates: true,
    });
  }

  const [recipients, audienceCount] = await Promise.all([
    prisma.waBroadcastRecipient.findMany({
      where: { broadcastId: broadcast.id, status: "PENDING" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.waBroadcastRecipient.count({
      where: { broadcastId: broadcast.id },
    }),
  ]);
  await prisma.waBroadcast.update({
    where: { id: broadcast.id },
    data: { audienceCount },
  });
  return recipients;
}

function loadPendingRecipients(broadcast) {
  if (broadcast.audienceFilter?.mode === "EXPLICIT") {
    return prisma.waBroadcastRecipient.findMany({
      where: { broadcastId: broadcast.id, status: "PENDING" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
  }
  return ensureLegacyRecipients(broadcast);
}

async function activateScheduledBroadcast(job, token, broadcast) {
  if (broadcast.status !== "SCHEDULED") return broadcast;
  if (!broadcast.scheduledAt) return null;

  const dueAt = new Date(broadcast.scheduledAt).getTime();
  if (Number.isFinite(dueAt) && dueAt > Date.now() + 500) {
    await job.moveToDelayed(dueAt, token);
    throw new DelayedError();
  }

  const transitioned = await prisma.waBroadcast.updateMany({
    where: {
      id: broadcast.id,
      status: "SCHEDULED",
      scheduledAt: broadcast.scheduledAt,
    },
    data: {
      status: "SENDING",
      scheduledAt: null,
      startedAt: new Date(),
      completedAt: null,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
      skippedCount: 0,
    },
  });
  if (!transitioned.count) return null;
  return prisma.waBroadcast.findUnique({ where: { id: broadcast.id } });
}

async function recoverScheduledBroadcasts() {
  const horizon = new Date(Date.now() + SCHEDULE_RECOVERY_LOOKAHEAD_MS);
  const scheduled = await prisma.waBroadcast.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { not: null, lte: horizon },
    },
    select: { id: true, scheduledAt: true },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });

  for (const broadcast of scheduled) {
    if (!broadcast.scheduledAt) continue;
    const jobId = `${SCHEDULE_JOB_PREFIX}-${broadcast.id}`;
    const existing = await broadcastQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (["completed", "failed"].includes(state)) {
        await existing.remove().catch(() => undefined);
      } else {
        continue;
      }
    }

    await broadcastQueue.add(
      "scheduled-dispatch",
      {
        broadcastId: broadcast.id,
        runId: `scheduled-${broadcast.id}-${broadcast.scheduledAt.getTime()}`,
      },
      {
        jobId,
        delay: Math.max(0, broadcast.scheduledAt.getTime() - Date.now()),
      },
    );
  }
}

export function startBroadcastDispatcherWorker() {
  const worker = new Worker(
    "whatsapp-broadcast-dispatcher",
    async (job, token) => {
      const { broadcastId } = job.data;
      const runId = job.data.runId || String(job.id);
      console.log(`[Broadcast Dispatcher] Starting dispatch for broadcast: ${broadcastId}`);

      let broadcast = await prisma.waBroadcast.findUnique({ where: { id: broadcastId } });
      if (!broadcast) {
        await connection.del(`broadcast:${broadcastId}:remaining`);
        return;
      }

      broadcast = await activateScheduledBroadcast(job, token, broadcast);
      if (!broadcast || broadcast.status !== "SENDING") {
        await connection.del(`broadcast:${broadcastId}:remaining`);
        return;
      }

      const recipients = await loadPendingRecipients(broadcast);
      if (recipients.length === 0) {
        await prisma.waBroadcast.updateMany({
          where: { id: broadcastId, status: "SENDING" },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        await connection.del(`broadcast:${broadcastId}:remaining`);
        return;
      }

      await connection.set(
        `broadcast:${broadcastId}:remaining`,
        recipients.length,
        "EX",
        PROGRESS_TTL_SECONDS,
      );

      for (let index = 0; index < recipients.length; index += FANOUT_BATCH_SIZE) {
        const batch = recipients.slice(index, index + FANOUT_BATCH_SIZE);
        await broadcastSendQueue.addBulk(
          batch.map((recipient) => ({
            name: "send-broadcast-recipient",
            data: { broadcastId, recipientId: recipient.id, runId },
            opts: {
              jobId: `wa-broadcast-${broadcastId}-${runId}-${recipient.id}`,
            },
          })),
        );
      }

      console.log(`[Broadcast Dispatcher] Queued ${recipients.length} recipient sends for broadcast ${broadcastId}`);
    },
    {
      connection,
      concurrency: 2,
    },
  );

  const recover = () => recoverScheduledBroadcasts().catch((error) => {
    console.error("[Broadcast Dispatcher] Scheduled campaign recovery failed:", error.message);
  });
  recover();
  const recoveryTimer = setInterval(recover, SCHEDULE_RECOVERY_INTERVAL_MS);
  recoveryTimer.unref?.();

  worker.on("completed", (job) => {
    console.log(`[Broadcast Dispatcher] Job ${job.id} completed successfully`);
  });

  worker.on("failed", async (job, error) => {
    if (error instanceof DelayedError) return;
    console.error(`[Broadcast Dispatcher] Job ${job?.id} failed:`, error.message);
    if (!job) return;
    const attempts = job.opts.attempts || 1;
    if (job.attemptsMade >= attempts) {
      await Promise.all([
        prisma.waBroadcast.updateMany({
          where: { id: job.data.broadcastId, status: "SENDING" },
          data: { status: "FAILED", completedAt: new Date() },
        }),
        connection.del(`broadcast:${job.data.broadcastId}:remaining`),
      ]).catch(() => undefined);
    }
  });

  worker.on("closed", () => clearInterval(recoveryTimer));

  return worker;
}
