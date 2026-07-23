import { Worker } from "bullmq";
import Redis from "ioredis";
import prisma from "../../lib/db.js";
import { whatsappService } from "../../services/whatsapp.service.js";
import { enqueueWhatsAppDomainEvent } from "../../services/whatsapp.domain-events.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });


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
      await connection.zadd(key, now, `${now}-${jobId}`);
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
      const { shopId, payload, messageId, attempt, clientMessageId, requestId } = job.data;
      const startedAt = Date.now();
      console.log("[WhatsApp Send Trace]", {
        phase: "queue_processing",
        requestId,
        clientMessageId,
        messageId,
        queueJobId: job.id,
        shopId,
        attempt,
      });

      // 1. Sliding window rate limiting
      const allowed = await checkRateLimit(shopId, job.id);
      if (!allowed) {
        console.warn(`[WhatsApp Outbound Worker] Rate limit exceeded for shop ${shopId}, triggering retry.`);
        throw new Error("RATE_LIMIT_EXCEEDED");
      }

      // 2. Process outbound message sending
      try {
        const result = await whatsappService._sendDirect(shopId, { messageId, attempt, payload });
        console.log("[WhatsApp Send Trace]", {
          phase: "provider_accepted",
          requestId,
          clientMessageId,
          messageId,
          queueJobId: job.id,
          providerMessageId: result.metaMessageId,
          shopId,
          attempt,
          durationMs: Date.now() - startedAt,
        });
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

    const { shopId, messageId, attempt, requestId, clientMessageId } = job.data;

    // Check if attempts are exhausted (this is going to the DLQ)
    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts || 3;

    const exhausted = attemptsMade >= maxAttempts;
    if (exhausted) {
      console.error(`[WhatsApp Outbound Worker] DLQ triggered for job ${job.id} (message ${messageId})`);

      try {
        // Update message status to FAILED in the database
        const updatedMessage = await prisma.$transaction(async (tx) => {
          const updated = await tx.waMessage.update({
            where: { id: messageId },
            data: {
              status: "FAILED",
              operationState: "TERMINALLY_FAILED",
              providerStatus: "FAILED",
              providerStatusAt: new Date(),
              errorMessage: err.message || "Failed after maximum retries",
              failedAt: new Date(),
              entityVersion: { increment: 1 },
            },
          });
          await enqueueWhatsAppDomainEvent(tx, {
            shopId,
            entity: "waMessage",
            entityId: updated.id,
            entityVersion: updated.entityVersion,
            action: "terminally_failed",
            conversationId: updated.conversationId,
            sourceDeviceId: updated.sourceDeviceId,
            patch: {
              operationState: updated.operationState,
              providerStatus: updated.providerStatus,
              providerStatusAt: updated.providerStatusAt,
              attempt: updated.attempt,
              entityVersion: updated.entityVersion,
              errorMessage: updated.errorMessage,
            },
          });
          return updated;
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

        }
      } catch (dbErr) {
        console.error(`[WhatsApp Outbound Worker] Failed to update DLQ status in database:`, dbErr.message);
      }
    } else {
      try {
        await prisma.$transaction(async (tx) => {
          const current = await tx.waMessage.findUnique({ where: { id: messageId } });
          if (!current || current.attempt !== attempt) return;
          const updated = await tx.waMessage.update({
            where: { id: messageId },
            data: {
              operationState: "RETRY_SCHEDULED",
              errorMessage: err.message,
              entityVersion: { increment: 1 },
            },
          });
          await enqueueWhatsAppDomainEvent(tx, {
            shopId,
            entity: "waMessage",
            entityId: updated.id,
            entityVersion: updated.entityVersion,
            action: "retry_scheduled",
            conversationId: updated.conversationId,
            sourceDeviceId: updated.sourceDeviceId,
            patch: {
              operationState: updated.operationState,
              providerStatus: updated.providerStatus,
              attempt: updated.attempt,
              entityVersion: updated.entityVersion,
            },
          });
        });
      } catch (dbErr) {
        console.error("[WhatsApp Outbound Worker] Failed to persist retry state:", dbErr.message);
      }
    }

    console.log("[WhatsApp Send Trace]", {
      phase: exhausted ? "terminal_failure" : "retry_scheduled",
      requestId,
      clientMessageId,
      messageId,
      queueJobId: job.id,
      shopId,
      attempt,
    });
  });

  return worker;
}
