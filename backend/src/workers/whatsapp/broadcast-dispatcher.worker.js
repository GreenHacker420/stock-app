import { Worker } from "bullmq";
import Redis from "ioredis";
import prisma from "../../lib/db.js";
import { resolveAudience } from "../../services/whatsapp.broadcast.service.js";
import { broadcastSendQueue, connection } from "../../services/whatsapp.queue.js";

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

      // 1. Resolve audience
      const audience = await resolveAudience(broadcast.shopId, broadcast.audienceFilter);
      console.log(`[Broadcast Dispatcher] Resolved audience size: ${audience.length} for broadcast ${broadcastId}`);

      if (audience.length === 0) {
        await prisma.waBroadcast.update({
          where: { id: broadcastId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });
        return;
      }

      // 2. Set Redis counter
      await connection.set(`broadcast:${broadcastId}:remaining`, audience.length);

      // 3. Batch insert recipient records and enqueue send jobs
      const batchSize = 100;
      for (let i = 0; i < audience.length; i += batchSize) {
        const batch = audience.slice(i, i + batchSize);

        // Save recipient records in DB
        await prisma.$transaction(
          batch.map((c) =>
            prisma.waBroadcastRecipient.upsert({
              where: {
                broadcastId_customerId: {
                  broadcastId,
                  customerId: c.id,
                },
              },
              update: {
                status: "PENDING",
                customerPhone: c.phone.replace(/\D/g, ""),
                customerName: c.name,
              },
              create: {
                broadcastId,
                customerId: c.id,
                customerPhone: c.phone.replace(/\D/g, ""),
                customerName: c.name,
                status: "PENDING",
              },
            })
          )
        );

        // Add to Send Queue in bulk
        const sendJobs = batch.map((c) => ({
          name: "send-broadcast-recipient",
          data: {
            broadcastId,
            shopId: broadcast.shopId,
            customerId: c.id,
            customerPhone: c.phone.replace(/\D/g, ""),
            templateId: broadcast.templateId,
            templateVariables: broadcast.templateVariables,
          },
        }));

        await broadcastSendQueue.addBulk(sendJobs);
      }

      console.log(`[Broadcast Dispatcher] Successfully queued ${audience.length} recipient sends for broadcast ${broadcastId}`);
    },
    {
      connection,
      concurrency: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[Broadcast Dispatcher] Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Broadcast Dispatcher] Job ${job.id} failed:`, err.message);
  });

  return worker;
}
