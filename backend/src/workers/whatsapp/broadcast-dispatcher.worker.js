import { Worker } from "bullmq";
import prisma from "../../lib/db.js";
import { resolveAudience } from "../../services/whatsapp.broadcast.service.js";
import { broadcastSendQueue, connection } from "../../services/whatsapp.queue.js";

const FANOUT_BATCH_SIZE = 250;

async function ensureLegacyRecipients(broadcast) {
  const audience = await resolveAudience(broadcast.shopId, broadcast.audienceFilter);
  if (audience.length === 0) return [];

  for (let i = 0; i < audience.length; i += FANOUT_BATCH_SIZE) {
    const batch = audience.slice(i, i + FANOUT_BATCH_SIZE);
    await prisma.$transaction(
      batch.map((recipient) => prisma.waBroadcastRecipient.upsert({
        where: {
          broadcastId_customerPhone: {
            broadcastId: broadcast.id,
            customerPhone: recipient.phone,
          },
        },
        create: {
          broadcastId: broadcast.id,
          customerId: recipient.customerId || null,
          customerPhone: recipient.phone,
          customerName: recipient.name || null,
          source: recipient.source || "CUSTOMER",
          sourceContactId: recipient.sourceContactId || null,
          status: "PENDING",
        },
        update: {
          customerId: recipient.customerId || null,
          customerName: recipient.name || null,
          source: recipient.source || "CUSTOMER",
          sourceContactId: recipient.sourceContactId || null,
        },
      })),
    );
  }

  await prisma.waBroadcast.update({
    where: { id: broadcast.id },
    data: { audienceCount: audience.length },
  });

  return prisma.waBroadcastRecipient.findMany({
    where: { broadcastId: broadcast.id, status: "PENDING" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
}

async function loadPendingRecipients(broadcast) {
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
      console.log(`[Broadcast Dispatcher] Starting dispatch for broadcast: ${broadcastId}`);

      const broadcast = await prisma.waBroadcast.findUnique({
        where: { id: broadcastId },
      });

      if (!broadcast || broadcast.status !== "SENDING") {
        console.warn(`[Broadcast Dispatcher] Broadcast ${broadcastId} not found or not in SENDING state.`);
        return;
      }

      const recipients = await loadPendingRecipients(broadcast);
      console.log(`[Broadcast Dispatcher] Pending audience size: ${recipients.length} for broadcast ${broadcastId}`);

      if (recipients.length === 0) {
        await prisma.waBroadcast.update({
          where: { id: broadcastId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
        await connection.del(`broadcast:${broadcastId}:remaining`);
        return;
      }

      await connection.set(`broadcast:${broadcastId}:remaining`, recipients.length);

      for (let i = 0; i < recipients.length; i += FANOUT_BATCH_SIZE) {
        const batch = recipients.slice(i, i + FANOUT_BATCH_SIZE);
        await broadcastSendQueue.addBulk(
          batch.map((recipient) => ({
            name: "send-broadcast-recipient",
            data: {
              broadcastId,
              recipientId: recipient.id,
            },
            opts: {
              jobId: `wa-broadcast-${broadcastId}-recipient-${recipient.id}`,
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
      await prisma.waBroadcast.updateMany({
        where: { id: job.data.broadcastId, status: "SENDING" },
        data: { status: "FAILED", completedAt: new Date() },
      }).catch(() => undefined);
    }
  });

  return worker;
}
