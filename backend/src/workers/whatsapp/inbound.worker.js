import { Worker } from "bullmq";
import Redis from "ioredis";
import { processWebhookEnvelope } from "../../services/whatsapp.webhook.service.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

/**
 * Initializes and starts the whatsapp-inbound BullMQ worker.
 */
export function startInboundWorker() {
  const worker = new Worker(
    "whatsapp-inbound",
    async (job) => {
      const { envelopeId, shopId } = job.data;
      console.log(`[WhatsApp Inbound Worker] Processing envelope ${envelopeId} for shop ${shopId}`);
      await processWebhookEnvelope(envelopeId);
    },
    {
      connection,
      concurrency: 10, // Process up to 10 payloads concurrently
    }
  );

  worker.on("completed", (job) => {
    console.log(`[WhatsApp Inbound Worker] Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[WhatsApp Inbound Worker] Job ${job.id} failed:`, err.message);
  });

  return worker;
}
