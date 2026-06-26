import { Queue } from "bullmq";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

export const notificationPushQueue = new Queue("notification-push", {
  connection,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: { count: 200 },
  },
});

export async function enqueueNotificationPush(notificationId) {
  return notificationPushQueue.add(
    "deliver",
    { notificationId },
    {
      jobId: `notification-${notificationId}`,
      delay: 1000,
    },
  );
}

export async function closePushQueue() {
  try {
    await notificationPushQueue.close();
  } catch (err) {}
  try {
    await connection.quit();
  } catch (err) {}
}
