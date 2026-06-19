import { Worker } from "bullmq";
import Redis from "ioredis";
import axios from "axios";
import prisma from "../../lib/db.js";
import { getWaCredentials } from "../../lib/wa-cache.js";
import { connection } from "../../services/whatsapp.queue.js";
import { publishWhatsAppEvent } from "../../utils/realtime.js";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

/**
 * Decrements Redis counter and checks if broadcast is complete.
 */
async function decrementCounter(broadcastId) {
  const remaining = await connection.decr(`broadcast:${broadcastId}:remaining`);
  if (remaining <= 0) {
    const counts = await prisma.waBroadcastRecipient.groupBy({
      by: ["status"],
      where: { broadcastId },
      _count: { id: true },
    });

    const stats = {
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      skipped: 0,
    };

    counts.forEach((c) => {
      const status = c.status;
      const count = c._count.id;
      if (status === "SENT") stats.sent += count;
      if (status === "DELIVERED") stats.delivered += count;
      if (status === "READ") stats.read += count;
      if (status === "FAILED") stats.failed += count;
      if (status === "SKIPPED") stats.skipped += count;
    });

    await prisma.waBroadcast.update({
      where: { id: broadcastId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        sentCount: stats.sent + stats.delivered + stats.read,
        deliveredCount: stats.delivered + stats.read,
        readCount: stats.read,
        failedCount: stats.failed,
        skippedCount: stats.skipped,
        updatedAt: new Date(),
      },
    });

    await connection.del(`broadcast:${broadcastId}:remaining`);
    console.log(`[Broadcast Send Worker] Broadcast ${broadcastId} marked COMPLETED.`);
  }
}

export function startBroadcastSendWorker() {
  const worker = new Worker(
    "whatsapp-broadcast-send",
    async (job) => {
      const { broadcastId, shopId, customerId, customerPhone, templateId, templateVariables } = job.data;
      console.log(`[Broadcast Send Worker] Processing recipient send for customer ${customerId} (phone ${customerPhone})`);

      const credentials = await getWaCredentials(shopId);
      if (!credentials) {
        throw new Error(`WhatsApp credentials not found for shop ${shopId}`);
      }

      // 1. Get Template Details
      const template = await prisma.waTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        throw new Error(`Template not found for ID: ${templateId}`);
      }

      // 2. Find or Create Conversation
      let conversation = await prisma.waConversation.upsert({
        where: { shopId_phone: { shopId, phone: customerPhone } },
        update: {
          updatedAt: new Date(),
        },
        create: {
          shopId,
          phone: customerPhone,
          unreadCount: 0,
        },
      });

      // Link customer to conversation if not already linked
      if (!conversation.customerId) {
        conversation = await prisma.waConversation.update({
          where: { id: conversation.id },
          data: { customerId },
        });
      }

      // 3. Prepare Meta Send Payload
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: customerPhone,
        type: "template",
        template: {
          name: template.name,
          language: {
            code: template.language,
          },
        },
      };

      // If there are template variables, format them for components:
      if (templateVariables && (templateVariables.body || templateVariables.header)) {
        payload.template.components = [];
        if (templateVariables.header) {
          payload.template.components.push({
            type: "header",
            parameters: templateVariables.header.map((val) => ({ type: "text", text: String(val) })),
          });
        }
        if (templateVariables.body) {
          payload.template.components.push({
            type: "body",
            parameters: templateVariables.body.map((val) => ({ type: "text", text: String(val) })),
          });
        }
      }

      try {
        // 4. Send Message to Meta
        const response = await axios.post(
          `${BASE_URL}/${credentials.phoneNumberId}/messages`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${credentials.accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        const metaMessageId = response.data.messages?.[0]?.id;

        // 5. Update Recipient Record
        const recipient = await prisma.waBroadcastRecipient.update({
          where: {
            broadcastId_customerId: {
              broadcastId,
              customerId,
            },
          },
          data: {
            status: "SENT",
            metaMessageId,
            sentAt: new Date(),
          },
        });

        // 6. Create Outbound WaMessage record in DB
        const message = await prisma.waMessage.create({
          data: {
            conversationId: conversation.id,
            metaMessageId,
            direction: "OUTBOUND",
            status: "SENT",
            type: "TEMPLATE",
            content: { template: { name: template.name, language: template.language } },
            templateId: template.id,
            templateName: template.name,
            templateLanguage: template.language,
            broadcastRecipientId: recipient.id,
            createdAt: new Date(),
          },
        });

        // Notify client UI
        await publishWhatsAppEvent(shopId, "wa:status_updated", {
          messageId: message.id,
          conversationId: conversation.id,
          status: "SENT",
        });

      } catch (sendErr) {
        const errMsg = sendErr.response?.data?.error?.message || sendErr.message;
        console.error(`[Broadcast Send Worker] Failed to send to ${customerPhone}:`, errMsg);

        // Update Recipient Record with failure status
        await prisma.waBroadcastRecipient.update({
          where: {
            broadcastId_customerId: {
              broadcastId,
              customerId,
            },
          },
          data: {
            status: "FAILED",
            errorMessage: errMsg,
          },
        });

        // Create FAILED WaMessage local record for tracking
        await prisma.waMessage.create({
          data: {
            conversationId: conversation.id,
            direction: "OUTBOUND",
            status: "FAILED",
            type: "TEMPLATE",
            content: { template: { name: template.name, language: template.language } },
            templateId: template.id,
            templateName: template.name,
            templateLanguage: template.language,
            errorMessage: errMsg,
            failedAt: new Date(),
            createdAt: new Date(),
          },
        });
      } finally {
        // 7. Decrement counter and update broadcast lifecycle state
        await decrementCounter(broadcastId);
      }
    },
    {
      connection,
      concurrency: 10,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[Broadcast Send Worker] Job ${job.id} completed successfully`);
  });

  worker.on("failed", async (job, err) => {
    console.error(`[Broadcast Send Worker] Job ${job.id} failed:`, err.message);
    if (job) {
      const { broadcastId } = job.data;
      await decrementCounter(broadcastId);
    }
  });

  return worker;
}
