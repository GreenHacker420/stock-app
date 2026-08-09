import { DelayedError, UnrecoverableError, Worker } from "bullmq";
import axios from "axios";
import prisma from "../../lib/db.js";
import { getWaCredentials } from "../../lib/wa-cache.js";
import { connection } from "../../services/whatsapp.queue.js";
import { reserveWhatsAppSendSlot } from "../../services/whatsapp.rate-limit.js";
import { publishWhatsAppEvent } from "../../utils/realtime.js";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;
const PROGRESS_TTL_SECONDS = 7 * 24 * 60 * 60;

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
    throw new UnrecoverableError("Broadcast header media is not available in WhatsApp");
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
    to: recipient.customerPhone.replace(/^\+/, ""),
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}

async function ensureConversation(broadcast, integration, recipient) {
  const conversation = await prisma.waConversation.upsert({
    where: {
      integrationId_phone: {
        integrationId: integration.id,
        phone: recipient.customerPhone,
      },
    },
    create: {
      shopId: integration.shopId,
      integrationId: integration.id,
      contextShopId: broadcast.shopId,
      phone: recipient.customerPhone,
      contactName: recipient.customerName || null,
      customerId: integration.shopId === broadcast.shopId ? recipient.customerId : null,
      unreadCount: 0,
    },
    update: { contextShopId: broadcast.shopId },
  });

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

async function syncBroadcastProgress(broadcastId) {
  const counts = await prisma.waBroadcastRecipient.groupBy({
    by: ["status"],
    where: { broadcastId },
    _count: { id: true },
  });
  const byStatus = Object.fromEntries(counts.map((entry) => [entry.status, entry._count.id]));
  const remaining = byStatus.PENDING || 0;
  const data = {
    sentCount: (byStatus.SENT || 0) + (byStatus.DELIVERED || 0) + (byStatus.READ || 0),
    deliveredCount: (byStatus.DELIVERED || 0) + (byStatus.READ || 0),
    readCount: byStatus.READ || 0,
    failedCount: byStatus.FAILED || 0,
    skippedCount: byStatus.SKIPPED || 0,
    ...(remaining === 0 ? { status: "COMPLETED", completedAt: new Date() } : {}),
  };

  await prisma.waBroadcast.updateMany({
    where: { id: broadcastId, status: "SENDING" },
    data,
  });

  if (remaining === 0) {
    await connection.del(`broadcast:${broadcastId}:remaining`);
  } else {
    await connection.set(
      `broadcast:${broadcastId}:remaining`,
      remaining,
      "EX",
      PROGRESS_TTL_SECONDS,
    );
  }
}

async function recordTerminalFailure({ broadcast, recipient, conversation, errorMessage }) {
  await prisma.$transaction(async (tx) => {
    await tx.waBroadcastRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "FAILED",
        errorMessage,
      },
    });

    if (!broadcast?.template || !conversation) return;

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
        content: { template: { name: broadcast.template.name, language: broadcast.template.language } },
        templateId: broadcast.template.id,
        templateName: broadcast.template.name,
        templateLanguage: broadcast.template.language,
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
    async (job, token) => {
      const { broadcastId, recipientId } = job.data;
      const recipient = await prisma.waBroadcastRecipient.findFirst({
        where: { id: recipientId, broadcastId },
      });

      if (!recipient) {
        console.warn(`[Broadcast Send] Recipient ${recipientId} not found for ${broadcastId}`);
        await syncBroadcastProgress(broadcastId);
        return;
      }
      if (["SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"].includes(recipient.status)) {
        await syncBroadcastProgress(broadcastId);
        return;
      }

      let broadcast;
      let conversation;
      try {
        broadcast = await prisma.waBroadcast.findUnique({
          where: { id: broadcastId },
          include: { template: true },
        });
        if (!broadcast || broadcast.status !== "SENDING") {
          await connection.del(`broadcast:${broadcastId}:remaining`);
          return;
        }
        if (!broadcast.template) {
          throw new UnrecoverableError("Broadcast template is unavailable");
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
          throw new UnrecoverableError("WhatsApp integration is not connected");
        }

        const credentials = await getWaCredentials(integration.shopId);
        if (!credentials || credentials.id !== integration.id) {
          throw new UnrecoverableError("WhatsApp credentials are unavailable for the broadcast integration");
        }

        const waitMs = await reserveWhatsAppSendSlot(
          integration.shopId,
          `broadcast:${job.id}`,
        );
        if (waitMs > 0) {
          await job.moveToDelayed(Date.now() + waitMs, token);
          throw new DelayedError();
        }

        conversation = await ensureConversation(broadcast, integration, recipient);
        const payload = await buildTemplatePayload(broadcast, broadcast.template, recipient);
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
        await syncBroadcastProgress(broadcast.id);
      } catch (error) {
        if (error instanceof DelayedError) throw error;

        const errorMessage = error.response?.data?.error?.message || error.message || "Broadcast send failed";
        const maxAttempts = job.opts.attempts || 3;
        const terminalAttempt = error instanceof UnrecoverableError
          || job.attemptsMade + 1 >= maxAttempts;
        console.error(
          `[Broadcast Send] recipient ${recipient.id} failed (${job.attemptsMade + 1}/${maxAttempts}):`,
          errorMessage,
        );

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
          errorMessage,
        });
        await syncBroadcastProgress(broadcastId);
      }
    },
    {
      connection,
      concurrency: 10,
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
