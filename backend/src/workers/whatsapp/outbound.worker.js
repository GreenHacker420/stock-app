import { Worker } from "bullmq";
import Redis from "ioredis";
import prisma from "../../lib/db.js";
import { whatsappService } from "../../services/whatsapp.service.js";
import { publishWhatsAppEvent } from "../../utils/realtime.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

/**
 * Checks and registers rate limiting for the shop.
 * Retries up to 3 times with 200ms delay. Returns false if limit is exceeded.
 */
async function checkRateLimit(shopId, jobId) {
  const key = `wa:rate:${shopId}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    const clearBefore = now - 1000;

    const multi = connection.multi();
    multi.zremrangebyscore(key, 0, clearBefore);
    multi.zcard(key);
    const results = await multi.exec();

    const count = results[1][1];
    if (count < 75) {
      await connection.zadd(key, now, `${now}:${jobId}`);
      await connection.pexpire(key, 2000);
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

export function startOutboundWorker() {
  const worker = new Worker(
    "whatsapp-outbound",
    async (job) => {
      const { shopId, payload, messageId } = job.data;
      console.log(`[WhatsApp Outbound Worker] Processing job ${job.id} for message ${messageId} in shop ${shopId}`);

      // 1. Sliding window rate limiting
      const allowed = await checkRateLimit(shopId, job.id);
      if (!allowed) {
        console.warn(`[WhatsApp Outbound Worker] Rate limit exceeded for shop ${shopId}, triggering retry.`);
        throw new Error("RATE_LIMIT_EXCEEDED");
      }

      // 2. Process outbound message sending
      try {
        const result = await whatsappService._sendDirect(shopId, { messageId, payload });
        return result;
      } catch (error) {
        console.error(`[WhatsApp Outbound Worker] Send failed for message ${messageId}:`, error.message);
        throw error;
      }
    },
    {
      connection,
      concurrency: 10,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[WhatsApp Outbound Worker] Job ${job.id} completed successfully`);
  });

  worker.on("failed", async (job, err) => {
    console.error(`[WhatsApp Outbound Worker] Job ${job.id} failed:`, err.message);

    if (!job) return;

    const { shopId, messageId } = job.data;

    // Check if attempts are exhausted (this is going to the DLQ)
    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts || 3;

    if (attemptsMade >= maxAttempts) {
      console.error(`[WhatsApp Outbound Worker] DLQ triggered for job ${job.id} (message ${messageId})`);

      try {
        // Update message status to FAILED in the database
        const updatedMessage = await prisma.waMessage.update({
          where: { id: messageId },
          data: {
            status: "FAILED",
            errorMessage: err.message || "Failed after maximum retries",
            failedAt: new Date(),
          },
        });

        // Notify client-side UI
        await publishWhatsAppEvent(shopId, "wa:status_updated", {
          messageId: updatedMessage.id,
          conversationId: updatedMessage.conversationId,
          status: "FAILED",
          error: updatedMessage.errorMessage,
        });

        // Get owners of the shop to trigger alert notifications
        const shop = await prisma.shop.findUnique({
          where: { id: shopId },
          select: { ownerId: true },
        });

        if (shop) {
          // Create system alert notification for the owner
          await prisma.notification.create({
            data: {
              userId: shop.ownerId,
              shopId,
              triggerEvent: "WHATSAPP_DLQ",
              entityType: "WHATSAPP",
              entityId: messageId,
              message: `WhatsApp message failed to deliver after ${maxAttempts} retries. Error: ${err.message || "Unknown error"}.`,
            },
          });

          // Emit notification event to socket
          await publishWhatsAppEvent(shopId, "notification:created", {
            message: `WhatsApp message failed to deliver permanently.`,
          });
        }
      } catch (dbErr) {
        console.error(`[WhatsApp Outbound Worker] Failed to update DLQ status in database:`, dbErr.message);
      }
    }
  });

  return worker;
}
