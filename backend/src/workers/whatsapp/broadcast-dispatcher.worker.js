import { Worker } from "bullmq";
import prisma from "../../lib/db.js";
import { resolveAudience } from "../../services/whatsapp.broadcast.service.js";
import { broadcastSendQueue, connection } from "../../services/whatsapp.queue.js";

const FANOUT_BATCH_SIZE = 250;
const PROGRESS_TTL_SECONDS = 7 * 24 * 60 * 60;

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

  const recipients = await prisma.waBroadcastRecipient.findMany({
    where: { broadcastId: broadcast.id, status: "PENDING" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  await prisma.waBroadcast.update({
    where: { id: broadcast.id },
    data: { audienceCount: recipients.length },
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

export function startBroadcastDispatcherWorker() {
  const worker = new Worker(
    "whatsapp-broadcast-dispatcher",
    async (job) => {
      const { broadcastId } = job.data;
      const runId = job.data.runId || String(job.id);
      console.log(`[Broadcast Dispatcher] Starting dispatch for broadcast: ${broadcastId}`);

      const broadcast = await prisma.waBroadcast.findUnique({ where: { id: broadcastId } });
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

  worker.on("completed", (job) => {
    console.log(`[Broadcast Dispatcher] Job ${job.id} completed successfully`);
  });

  worker.on("failed", async (job, error) => {
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

  return worker;
}
