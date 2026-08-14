import { Worker } from "bullmq";
import Redis from "ioredis";
import axios from "axios";
import prisma from "../../lib/db.js";
import { getWaCredentials } from "../../lib/wa-cache.js";
import { uploadBuffer } from "../../lib/storage-manager.js";
import { publishWhatsAppEvent } from "../../utils/realtime.js";
import crypto from "crypto";
import { serializeMessageWithAsset } from "../../services/whatsapp.media.service.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

export function startMediaDownloadWorker() {
  const worker = new Worker(
    "whatsapp-media-download",
    async (job) => {
      const { shopId, messageId, assetId, mediaId, mimeType } = job.data;
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
      const checksumSha256 = crypto.createHash("sha256").update(mediaBuffer).digest("hex");

      // 3. Upload to storage provider (defaults to OneDrive for WhatsApp)
      const storageKey = `shops/${shopId}/media/${mediaId}`;
      console.log(`[Media Download Worker] Uploading media under key: ${storageKey}`);
      const uploadResult = await uploadBuffer({
        body: mediaBuffer,
        key: storageKey,
        mimeType,
        domain: "WHATSAPP",
      });

      // 4. Complete the shared asset and load its message projection.
      await prisma.asset.update({
        where: { id: assetId },
        data: {
          status: "READY",
          storageProvider: uploadResult.storageProvider,
          storageKey: uploadResult.storageKey,
          storageBucket: uploadResult.storageBucket,
          externalId: uploadResult.externalId,
          remoteUrl: uploadResult.url,
          sizeBytes: BigInt(mediaBuffer.length),
          checksumSha256,
          readyAt: new Date(),
        },
      });
      const updatedMessage = await prisma.waMessage.findUnique({
        where: { id: messageId },
        include: { asset: true },
      });
      const publicMessage = await serializeMessageWithAsset(updatedMessage);

      console.log(`[Media Download Worker] Successfully processed and uploaded media for message ${messageId}`);

      // 5. Notify UI via Pub/Sub socket bridge
      await publishWhatsAppEvent(shopId, "wa:message_received", {
        message: publicMessage,
        conversationId: updatedMessage.conversationId,
      });

      return publicMessage;
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
    if (job?.data?.assetId) {
      prisma.asset.update({
        where: { id: job.data.assetId },
        data: { status: "FAILED", errorMessage: err.message },
      }).catch((updateError) => {
        console.error(`[Media Download Worker] Failed to mark asset ${job.data.assetId} failed:`, updateError.message);
      });
    }
  });

  return worker;
}
