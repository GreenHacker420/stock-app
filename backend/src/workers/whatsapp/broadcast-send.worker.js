import { Worker } from "bullmq";
import axios from "axios";
import prisma from "../../lib/db.js";
import { getWaCredentials } from "../../lib/wa-cache.js";
import { connection } from "../../services/whatsapp.queue.js";
import { publishWhatsAppEvent } from "../../utils/realtime.js";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

function recipientValue(value, recipient) {
  if (value == null) return "";
  const name = recipient.customerName || recipient.customerPhone;
  return String(value)
    .replaceAll("{{recipient.name}}", name)
    .replaceAll("{{recipient.phone}}", recipient.customerPhone);
}

function headerFormat(template) {
  const components = Array.isArray(template.components) ? template.components : [];
  return components.find((component) => String(component?.type || "").toUpperCase() === "HEADER")?.format?.toUpperCase();
}

async function resolveHeaderMedia(broadcast, template) {
  const variables = broadcast.templateVariables || {};
  const assetId = variables.headerAssetId;
  const format = headerFormat(template);
  if (!assetId || !["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) return null;

  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      shopId: broadcast.shopId,
      status: "READY",
      kind: format,
    },
    select: {
      externalProvider: true,
      externalId: true,
      fileName: true,
    },
  });
  if (!asset?.externalId || asset.externalProvider !== "META_WHATSAPP") {
    throw new Error("Broadcast header media is not available in WhatsApp");
  }

  const type = format.toLowerCase();
  return {
    type,
    [type]: {
      id: asset.externalId,
      ...(format === "DOCUMENT"
        ? { filename: variables.headerFileName || asset.fileName || "document" }
        : {}),
    },
  };
}

async function buildTemplatePayload(broadcast, template, recipient) {
  const variables = broadcast.templateVariables || {};
  const components = [];
  const mediaParameter = await resolveHeaderMedia(broadcast, template);

  if (mediaParameter) {
    components.push({ type: "header", parameters: [mediaParameter] });
  } else if (Array.isArray(variables.header) && variables.header.length > 0) {
    components.push({
      type: "header",
      parameters: variables.header.map((value) => ({
        type: "text",
        text: recipientValue(value, recipient),
      })),
    });
  }

  if (Array.isArray(variables.body) && variables.body.length > 0) {
    components.push({
      type: "body",
      parameters: variables.body.map((value) => ({
        type: "text",
        text: recipientValue(value, recipient),
      })),
    });
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient.customerPhone,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}

async function ensureConversation(broadcast, integration, recipient) {
  let conversation = await prisma.waConversation.findFirst({
    where: {
      integrationId: integration.id,
      phone: recipient.customerPhone,
    },
  });

  if (!conversation) {
    conversation = await prisma.waConversation.create({
      data: {
        shopId: integration.shopId,
        integrationId: integration.id,
        contextShopId: broadcast.shopId,
        phone: recipient.customerPhone,
        contactName: recipient.customerName || null,
        customerId: integration.shopId === broadcast.shopId ? recipient.customerId : null,
        unreadCount: 0,
      },
    });
  } else {
    conversation = await prisma.waConversation.update({
      where: { id: conversation.id },
      data: {
        contextShopId: broadcast.shopId,
        contactName: conversation.contactName || recipient.customerName || undefined,
        ...(integration.shopId === broadcast.shopId && !conversation.customerId && recipient.customerId
          ? { customerId: recipient.customerId }
          : {}),
      },
    });
  }

  if (recipient.customerId) {
    await prisma.waConversationCustomerLink.upsert({
      where: {
        conversationId_shopId: {
          conversationId: conversation.id,
          shopId: broadcast.shopId,
        },
      },
      create: {
        conversationId: conversation.id,
        shopId: broadcast.shopId,
        customerId: recipient.customerId,
      },
      update: { customerId: recipient.customerId },
    });
  }

  return conversation;
}

async function finalizeBroadcastIfDone(broadcastId) {
  const remaining = await connection.decr(`broadcast:${broadcastId}:remaining`);
  if (remaining > 0) return;

  const counts = await prisma.waBroadcastRecipient.groupBy({
    by: ["status"],
    where: { broadcastId },
    _count: { id: true },
  });
  const byStatus = Object.fromEntries(counts.map((entry) => [entry.status, entry._count.id]));

  await prisma.waBroadcast.updateMany({
    where: { id: broadcastId, status: "SENDING" },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      sentCount: (byStatus.SENT || 0) + (byStatus.DELIVERED || 0) + (byStatus.READ || 0),
      deliveredCount: (byStatus.DELIVERED || 0) + (byStatus.READ || 0),
      readCount: byStatus.READ || 0,
      failedCount: byStatus.FAILED || 0,
      skippedCount: byStatus.SKIPPED || 0,
    },
  });
  await connection.del(`broadcast:${broadcastId}:remaining`);
}

async function recordTerminalFailure({ broadcast, recipient, conversation, template, errorMessage }) {
  await prisma.$transaction(async (tx) => {
    await tx.waBroadcastRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "FAILED",
        errorMessage,
      },
    });

    await tx.waMessage.upsert({
      where: {
        conversationId_clientMessageId: {
          conversationId: conversation.id,
          clientMessageId: `broadcast:${broadcast.id}:${recipient.id}`,
        },
      },
      create: {
        conversationId: conversation.id,
        contextShopId: broadcast.shopId,
        clientMessageId: `broadcast:${broadcast.id}:${recipient.id}`,
        direction: "OUTBOUND",
        status: "FAILED",
        operationState: "TERMINALLY_FAILED",
        providerStatus: "FAILED",
        providerStatusAt: new Date(),
        type: "TEMPLATE",
        content: { template: { name: template.name, language: template.language } },
        templateId: template.id,
        templateName: template.name,
        templateLanguage: template.language,
        broadcastRecipientId: recipient.id,
        errorMessage,
        failedAt: new Date(),
      },
      update: {
        status: "FAILED",
        operationState: "TERMINALLY_FAILED",
        providerStatus: "FAILED",
        providerStatusAt: new Date(),
        broadcastRecipientId: recipient.id,
        errorMessage,
        failedAt: new Date(),
        entityVersion: { increment: 1 },
      },
    });
  });
}

export function startBroadcastSendWorker() {
  const worker = new Worker(
    "whatsapp-broadcast-send",
    async (job) => {
      const { broadcastId, recipientId } = job.data;

      const recipient = await prisma.waBroadcastRecipient.findFirst({
        where: { id: recipientId, broadcastId },
      });
      if (!recipient) {
        console.warn(`[Broadcast Send] Recipient ${recipientId} not found for ${broadcastId}`);
        await finalizeBroadcastIfDone(broadcastId);
        return;
      }
      if (["SENT", "DELIVERED", "READ", "SKIPPED"].includes(recipient.status)) {
        return;
      }

      const broadcast = await prisma.waBroadcast.findUnique({
        where: { id: broadcastId },
        include: { template: true },
      });
      if (!broadcast || broadcast.status !== "SENDING" || !broadcast.template) {
        throw new Error(`Broadcast ${broadcastId} is not sendable`);
      }

      const integration = broadcast.integrationId
        ? await prisma.waIntegration.findUnique({
            where: { id: broadcast.integrationId },
            select: { id: true, shopId: true, status: true },
          })
        : await prisma.waIntegration.findUnique({
            where: { shopId: broadcast.shopId },
            select: { id: true, shopId: true, status: true },
          });
      if (!integration || integration.status !== "CONNECTED") {
        throw new Error("WhatsApp integration is not connected");
      }

      const credentials = await getWaCredentials(integration.shopId);
      if (!credentials || credentials.id !== integration.id) {
        throw new Error("WhatsApp credentials are unavailable for the broadcast integration");
      }

      const conversation = await ensureConversation(broadcast, integration, recipient);
      const payload = await buildTemplatePayload(broadcast, broadcast.template, recipient);

      try {
        const response = await axios.post(
          `${BASE_URL}/${credentials.phoneNumberId}/messages`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${credentials.accessToken}`,
              "Content-Type": "application/json",
            },
          },
        );
        const metaMessageId = response.data.messages?.[0]?.id;
        if (!metaMessageId) throw new Error("WhatsApp did not return a message id");
        const now = new Date();

        const message = await prisma.$transaction(async (tx) => {
          await tx.waBroadcastRecipient.update({
            where: { id: recipient.id },
            data: {
              status: "SENT",
              metaMessageId,
              sentAt: now,
              errorMessage: null,
            },
          });

          return tx.waMessage.upsert({
            where: {
              conversationId_clientMessageId: {
                conversationId: conversation.id,
                clientMessageId: `broadcast:${broadcast.id}:${recipient.id}`,
              },
            },
            create: {
              conversationId: conversation.id,
              contextShopId: broadcast.shopId,
              clientMessageId: `broadcast:${broadcast.id}:${recipient.id}`,
              metaMessageId,
              direction: "OUTBOUND",
              status: "SENT",
              operationState: "COMPLETED",
              providerStatus: "SENT",
              providerStatusAt: now,
              type: "TEMPLATE",
              content: { template: { name: broadcast.template.name, language: broadcast.template.language } },
              payload: { broadcastId: broadcast.id },
              templateId: broadcast.template.id,
              templateName: broadcast.template.name,
              templateLanguage: broadcast.template.language,
              broadcastRecipientId: recipient.id,
              createdAt: now,
            },
            update: {
              metaMessageId,
              status: "SENT",
              operationState: "COMPLETED",
              providerStatus: "SENT",
              providerStatusAt: now,
              broadcastRecipientId: recipient.id,
              errorMessage: null,
              entityVersion: { increment: 1 },
            },
          });
        });

        await publishWhatsAppEvent(broadcast.shopId, "wa:status_updated", {
          messageId: message.id,
          conversationId: conversation.id,
          status: "SENT",
        });
        await finalizeBroadcastIfDone(broadcast.id);
      } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.message || "Broadcast send failed";
        const maxAttempts = job.opts.attempts || 3;
        const terminalAttempt = job.attemptsMade + 1 >= maxAttempts;
        console.error(`[Broadcast Send] ${recipient.customerPhone} failed (${job.attemptsMade + 1}/${maxAttempts}):`, errorMessage);

        if (!terminalAttempt) {
          await prisma.waBroadcastRecipient.updateMany({
            where: { id: recipient.id, status: "PENDING" },
            data: { errorMessage },
          });
          throw error;
        }

        await recordTerminalFailure({
          broadcast,
          recipient,
          conversation,
          template: broadcast.template,
          errorMessage,
        });
        await finalizeBroadcastIfDone(broadcast.id);
      }
    },
    {
      connection,
      concurrency: 10,
      limiter: {
        max: 60,
        duration: 1000,
      },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[Broadcast Send] Job ${job.id} completed`);
  });

  worker.on("failed", (job, error) => {
    console.error(`[Broadcast Send] Job ${job?.id} scheduled for retry or failed:`, error.message);
  });

  return worker;
}
