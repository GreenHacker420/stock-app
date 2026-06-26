import { Queue } from "bullmq";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
export const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// Outbound Message Queue
export const whatsappQueue = new Queue("whatsapp-outbound", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
});

// Inbound Webhook Payload Queue
export const inboundQueue = new Queue("whatsapp-inbound", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
});

// Inbound Media Download Queue
export const mediaDownloadQueue = new Queue("whatsapp-media-download", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
});

// Broadcast Campaign Dispatcher Queue (Stage 1)
export const broadcastQueue = new Queue("whatsapp-broadcast-dispatcher", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
});

// Broadcast Campaign Individual Message Sender Queue (Stage 2)
export const broadcastSendQueue = new Queue("whatsapp-broadcast-send", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
});

export async function closeWhatsappQueues() {
  try {
    await Promise.all([
      whatsappQueue.close(),
      inboundQueue.close(),
      mediaDownloadQueue.close(),
      broadcastQueue.close(),
      broadcastSendQueue.close(),
    ]);
  } catch (err) {}
  try {
    await connection.quit();
  } catch (err) {}
}
