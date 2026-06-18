import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { whatsappService } from "./whatsapp.service.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

export const whatsappQueue = new Queue("whatsapp-outbound", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

export const whatsappWorker = new Worker(
  "whatsapp-outbound",
  async (job) => {
    const { shopId, payload, messageId } = job.data;
    console.log(`[WhatsApp Worker] Processing job ${job.id} for message ${messageId} in shop ${shopId}`);
    
    try {
      const result = await whatsappService._sendDirect(shopId, { messageId, payload });
      return result;
    } catch (error) {
      console.error(`[WhatsApp Worker] Job ${job.id} failed:`, error.message);
      throw error; // Let BullMQ handle retries based on backoff
    }
  },
  { connection }
);

whatsappWorker.on("completed", (job) => {
  console.log(`WhatsApp job ${job.id} completed`);
});

whatsappWorker.on("failed", (job, err) => {
  console.error(`WhatsApp job ${job.id} failed:`, err);
});
