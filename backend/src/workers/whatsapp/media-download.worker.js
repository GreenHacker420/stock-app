import { Worker } from "bullmq";
import Redis from "ioredis";
import axios from "axios";
import prisma from "../../lib/db.js";
import { getWaCredentials } from "../../lib/wa-cache.js";
import { uploadToS3 } from "../../lib/wa-media.js";
import { publishWhatsAppEvent } from "../../utils/realtime.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

export function startMediaDownloadWorker() {
  const worker = new Worker(
    "whatsapp-media-download",
    async (job) => {
      const { shopId, messageId, mediaId, mimeType, fileName } = job.data;
      console.log(`[Media Download Worker] Processing job ${job.id} for message ${messageId} in shop ${shopId}`);

      const credentials = await getWaCredentials(shopId);
      if (!credentials) {
        throw new Error(`WhatsApp credentials not found for shop ${shopId}`);
      }

      const accessToken = credentials.accessToken;

      // 1. Get Meta Media URL
      console.log(`[Media Download Worker] Fetching Meta media details for ID: ${mediaId}`);
      const metaResponse = await axios.get(`https://graph.facebook.com/v25.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const downloadUrl = metaResponse.data.url;
      if (!downloadUrl) {
        throw new Error(`Failed to retrieve download URL for media ${mediaId}`);
      }

      // 2. Download Media Binary
      console.log(`[Media Download Worker] Downloading binary data from Meta...`);
      const downloadResponse = await axios.get(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: "arraybuffer",
      });

      const mediaBuffer = Buffer.from(downloadResponse.data);

      // 3. Upload to S3 (S3 is the only supported media storage backend)
      const s3Key = `shops/${shopId}/media/${mediaId}`;
      console.log(`[Media Download Worker] Uploading to S3 under key: ${s3Key}`);
      const uploadResult = await uploadToS3(mediaBuffer, s3Key, mimeType);

      // 4. Update WaMessage
      const updatedMessage = await prisma.waMessage.update({
        where: { id: messageId },
        data: {
          s3Key: uploadResult.key,
          s3Bucket: uploadResult.bucket,
          mediaUrl: uploadResult.url,
        },
      });

      console.log(`[Media Download Worker] Successfully processed and uploaded media for message ${messageId}`);

      // 5. Notify UI via Pub/Sub socket bridge
      await publishWhatsAppEvent(shopId, "wa:message_received", {
        message: updatedMessage,
        conversationId: updatedMessage.conversationId,
      });

      return updatedMessage;
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[Media Download Worker] Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Media Download Worker] Job ${job.id} failed:`, err.message);
  });

  return worker;
}
