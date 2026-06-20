import crypto from "crypto";
import prisma from "../lib/db.js";
import { publishWhatsAppEvent } from "../utils/realtime.js";
import { mapEventTypeToMessageType, parseWebhookPayload } from "./whatsapp.webhook-parser.js";

const MESSAGE_STATUS_RANK = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 4,
  DELETED: 5,
};
/**
 * Processes a single normalized event.
 * Handles database saving, idempotency, and Socket.IO emission.
 */
export async function processWhatsAppEvent(event, shopId) {
  // 1. Idempotency Check (Event level)
  const hashedEventId = crypto
    .createHash("sha256")
    .update(JSON.stringify({ shopId, event }))
    .digest("hex");

  const existingEvent = await prisma.waWebhookEvent.findUnique({
    where: { id: hashedEventId },
  });

  if (existingEvent) return;

  // 2. Route based on type
  if (event.type === "status") {
    return handleStatusUpdate(event, shopId, hashedEventId);
  }

  if (event.type === "reaction") {
    return handleInboundReaction(event, shopId, hashedEventId);
  }

  return handleInboundMessage(event, shopId, hashedEventId);
}

async function handleStatusUpdate(event, shopId, eventId) {
  return await prisma.$transaction(async (tx) => {
    // Save event idempotency
    await tx.waWebhookEvent.create({
      data: { id: eventId, eventType: "STATUS", shopId }
    });

    const message = await tx.waMessage.findUnique({
      where: { metaMessageId: event.metaMessageId },
    });

    if (!message) return null;

    const nextStatus = event.status.toUpperCase();
    const currentStatusRank = MESSAGE_STATUS_RANK[message.status] || 0;
    const nextStatusRank = MESSAGE_STATUS_RANK[nextStatus] || 0;

    // Prevent status regression
    if (nextStatusRank <= currentStatusRank && message.status !== "FAILED") {
      return null;
    }

    const nextTimestamp = new Date(Number(event.timestamp) * 1000);
    const updateData = { status: nextStatus };

    if (nextStatus === "DELIVERED") updateData.deliveredAt = nextTimestamp;
    if (nextStatus === "READ") updateData.readAt = nextTimestamp;
    if (nextStatus === "FAILED") {
      updateData.failedAt = nextTimestamp;
      updateData.errorMessage = event.errors?.[0]?.message || "Unknown Meta error";
    }

    const updatedMessage = await tx.waMessage.update({
      where: { id: message.id },
      data: updateData,
    });

    if (message.broadcastRecipientId) {
      const recipientUpdate = { status: nextStatus };
      if (nextStatus === "FAILED") {
        recipientUpdate.errorMessage = event.errors?.[0]?.message || "Unknown Meta error";
      }
      if (nextStatus === "DELIVERED") recipientUpdate.deliveredAt = nextTimestamp;
      if (nextStatus === "READ") recipientUpdate.readAt = nextTimestamp;

      await tx.waBroadcastRecipient.updateMany({
        where: { id: message.broadcastRecipientId },
        data: recipientUpdate,
      });
    }

    // Notify UI via Pub/Sub socket bridge
    await publishWhatsAppEvent(shopId, "wa:status_updated", {
      messageId: updatedMessage.id,
      conversationId: updatedMessage.conversationId,
      status: nextStatus,
      timestamp: nextTimestamp,
    });

    return updatedMessage;
  });
}

async function handleInboundReaction(event, shopId, eventId) {
  const targetMetaId = event.payload?.message_id;
  const emoji = event.payload?.emoji;
  const senderPhone = event.from;

  if (!targetMetaId) return null;

  return await prisma.$transaction(async (tx) => {
    // Save event idempotency
    await tx.waWebhookEvent.create({
      data: { id: eventId, eventType: "MESSAGE", shopId }
    });

    const targetMessage = await tx.waMessage.findUnique({
      where: { metaMessageId: targetMetaId },
    });

    if (!targetMessage) {
      console.warn(`[WhatsApp Processor] Reaction target message ${targetMetaId} not found.`);
      return null;
    }

    let reactions = targetMessage.payload?.reactions || [];
    if (!Array.isArray(reactions)) reactions = [];

    // Remove any existing reaction from this sender
    reactions = reactions.filter(r => r.from !== senderPhone);

    // Add new reaction if emoji is provided
    if (emoji) {
      reactions.push({
        from: senderPhone,
        emoji,
        timestamp: new Date().toISOString(),
      });
    }

    const updatedPayload = {
      ...(targetMessage.payload || {}),
      reactions,
    };

    const updatedMessage = await tx.waMessage.update({
      where: { id: targetMessage.id },
      data: { payload: updatedPayload },
    });

    // Broadcast reaction updates
    await publishWhatsAppEvent(shopId, "wa:reaction_updated", {
      messageId: updatedMessage.id,
      conversationId: updatedMessage.conversationId,
      reactions,
    });

    return updatedMessage;
  });
}

async function handleInboundMessage(event, shopId, eventId) {
  // Handle customer deleting/recalling their message
  if (event.type === "system" && event.payload?.type === "message_deleted") {
    const deletedMetaId = event.payload.deleted_message_id;
    if (!deletedMetaId) return null;

    return await prisma.$transaction(async (tx) => {
      // Save event idempotency
      await tx.waWebhookEvent.create({
        data: { id: eventId, eventType: "MESSAGE", shopId }
      });

      const targetMessage = await tx.waMessage.findUnique({
        where: { metaMessageId: deletedMetaId },
      });

      if (targetMessage) {
        const updatedMessage = await tx.waMessage.update({
          where: { id: targetMessage.id },
          data: {
            status: "DELETED",
            content: { text: "This message was deleted", isDeleted: true }
          }
        });

        await publishWhatsAppEvent(shopId, "wa:status_updated", {
          messageId: updatedMessage.id,
          conversationId: updatedMessage.conversationId,
          status: "DELETED",
        });

        return updatedMessage;
      }
      return null;
    });
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Save event idempotency
    await tx.waWebhookEvent.create({
      data: { id: eventId, eventType: "MESSAGE", shopId }
    });

    // 2. Find or Create Conversation (Race condition safe)
    let conversation = await tx.waConversation.upsert({
      where: { shopId_phone: { shopId, phone: event.from } },
      update: {
        contactName: event.contactName || undefined,
        lastCustomerMessageAt: new Date(Number(event.timestamp) * 1000),
        unreadCount: { increment: 1 },
        updatedAt: new Date(),
      },
      create: {
        shopId,
        phone: event.from,
        contactName: event.contactName,
        lastCustomerMessageAt: new Date(Number(event.timestamp) * 1000),
        unreadCount: 1,
      },
    });

    // 3. Optional: Link to customer if not already linked
    if (!conversation.customerId) {
      const customer = await tx.customer.findFirst({
        where: { shopId, phone: event.from }, // Use exact normalized match
      });
      if (customer) {
        conversation = await tx.waConversation.update({
          where: { id: conversation.id },
          data: { customerId: customer.id },
        });
      }
    }

    // 4. Save Message
    const messageType = mapEventTypeToMessageType(event.type);
    const messagePayload = { subtype: event.type };
    if (event.forwarded) messagePayload.forwarded = true;
    if (event.frequentlyForwarded) messagePayload.frequentlyForwarded = true;
    if (event.voice) messagePayload.voice = true;
    if (event.animated) messagePayload.animated = true;
    if (event.raw) messagePayload.raw = event.raw;
    let asset = null;
    if (event.mediaId) {
      asset = await tx.asset.findUnique({
        where: {
          shopId_externalProvider_externalId: {
            shopId,
            externalProvider: "META_WHATSAPP",
            externalId: event.mediaId,
          },
        },
      });

      if (!asset) {
        asset = await tx.asset.create({
          data: {
            shopId,
            kind: {
              image: "IMAGE",
              video: "VIDEO",
              audio: "AUDIO",
              document: "DOCUMENT",
              sticker: "STICKER",
            }[event.type] || "OTHER",
            source: "WHATSAPP_INBOUND",
            status: "UPLOADING",
            externalProvider: "META_WHATSAPP",
            externalId: event.mediaId,
            mimeType: event.mimeType || "application/octet-stream",
            fileName: event.fileName,
          },
        });
      } else if (asset.status === "FAILED") {
        asset = await tx.asset.update({
          where: { id: asset.id },
          data: {
            status: "UPLOADING",
            errorMessage: null,
          },
        });
      }
    }

    const message = await tx.waMessage.create({
      data: {
        conversationId: conversation.id,
        metaMessageId: event.metaMessageId,
        replyToMetaMessageId: event.replyToMetaMessageId,
        direction: "INBOUND",
        status: "SENT",
        type: messageType,
        content: event.content ? { text: event.content } : (event.payload || event.raw || {}),
        payload: messagePayload,
        assetId: asset?.id,
        createdAt: new Date(Number(event.timestamp) * 1000),
      },
    });

    if (event.type === "flow_reply") {
      let response = event.payload?.response_json;
      if (typeof response === "string") {
        try {
          response = JSON.parse(response);
        } catch {
          response = { raw: response };
        }
      }
      const flowToken = response?.flow_token || event.payload?.flow_token;
      if (flowToken) {
        const execution = await tx.waFlowExecution.findUnique({ where: { flowToken } });
        if (execution?.shopId === shopId) {
          await tx.waFlowExecution.update({
            where: { id: execution.id },
            data: {
              status: "COMPLETED",
              resultJson: response || event.payload,
              submittedAt: new Date(Number(event.timestamp) * 1000),
              completedAt: new Date(Number(event.timestamp) * 1000),
              lastAction: "nfm_reply",
            },
          });
          await tx.waFlow.update({
            where: { id: execution.flowId },
            data: { totalResponses: { increment: 1 } },
          });
        }
      }
    }

    // 5. If it is a media message, queue for download
    if (event.mediaId && asset?.status !== "READY") {
      try {
        const { mediaDownloadQueue } = await import("./whatsapp.queue.js");
        await mediaDownloadQueue.add("download-media", {
          shopId,
          messageId: message.id,
          assetId: asset.id,
          mediaId: event.mediaId,
          mimeType: event.mimeType,
          fileName: event.fileName,
        });
      } catch (err) {
        console.error(`[WhatsApp Processor] Failed to queue media download:`, err.message);
      }
    }

    // Set 24-hour window key in Redis
    try {
      const { connection: redis } = await import("./whatsapp.queue.js");
      await redis.setex(`wa:window:${conversation.id}`, 24 * 60 * 60, "active");
    } catch (err) {
      console.error(`[WhatsApp Processor] Failed to set 24h window key:`, err.message);
    }

    // 6. Notify UI via Pub/Sub socket bridge
    await publishWhatsAppEvent(shopId, "wa:message_received", {
      message,
      conversationId: conversation.id,
    });

    return message;
  });
}

export { parseWebhookPayload };
