import crypto from "crypto";
import prisma from "../lib/db.js";
import { publishWhatsAppEvent } from "../utils/realtime.js";

const MESSAGE_STATUS_RANK = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 4,
};

/**
 * Normalizes phone numbers to E.164-like format (digits only).
 */
export function normalizePhone(phone) {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

/**
 * Normalizes Meta's nested webhook payload into a flat array of events.
 */
export function parseWebhookPayload(payload) {
  if (payload.object !== "whatsapp_business_account") return [];

  const events = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      // Handle Status Updates
      if (value.statuses) {
        for (const status of value.statuses) {
          events.push({
            type: "status",
            metaMessageId: status.id,
            status: status.status, // sent, delivered, read, failed
            recipientId: status.recipient_id,
            timestamp: status.timestamp,
            errors: status.errors,
            conversation: status.conversation,
            pricing: status.pricing,
          });
        }
      }

      // Handle Inbound Messages
      if (value.messages) {
        // Build contact map for lookup
        const contactMap = new Map();
        (value.contacts || []).forEach(c => {
          contactMap.set(c.wa_id, c.profile?.name);
        });

        for (const message of value.messages) {
          const from = message.from;
          const baseEvent = {
            metaMessageId: message.id,
            from: normalizePhone(from),
            timestamp: message.timestamp,
            contactName: contactMap.get(from),
            replyToMetaMessageId: message.context?.id,
          };

          if (message.text) {
            events.push({ ...baseEvent, type: "text", content: message.text.body });
          } else if (message.image) {
            events.push({ ...baseEvent, type: "image", mediaId: message.image.id, mimeType: message.image.mime_type, content: message.image.caption });
          } else if (message.document) {
            events.push({ ...baseEvent, type: "document", mediaId: message.document.id, mimeType: message.document.mime_type, fileName: message.document.filename, content: message.document.caption });
          } else if (message.audio) {
            events.push({ ...baseEvent, type: "audio", mediaId: message.audio.id, mimeType: message.audio.mime_type });
          } else if (message.video) {
            events.push({ ...baseEvent, type: "video", mediaId: message.video.id, mimeType: message.video.mime_type, content: message.video.caption });
          } else if (message.sticker) {
            events.push({ ...baseEvent, type: "sticker", mediaId: message.sticker.id, mimeType: message.sticker.mime_type });
          } else if (message.location) {
            events.push({ ...baseEvent, type: "location", payload: message.location });
          } else if (message.contacts) {
            events.push({ ...baseEvent, type: "contacts", payload: message.contacts });
          } else if (message.reaction) {
            events.push({ ...baseEvent, type: "reaction", payload: message.reaction });
          } else if (message.button) {
            events.push({ ...baseEvent, type: "button", payload: message.button });
          } else if (message.interactive) {
            const interactive = message.interactive;
            if (interactive.type === "button_reply") {
              events.push({ ...baseEvent, type: "button_reply", payload: interactive.button_reply });
            } else if (interactive.type === "list_reply") {
              events.push({ ...baseEvent, type: "list_reply", payload: interactive.list_reply });
            } else if (interactive.type === "nfm_reply") {
              // Standard for WhatsApp Flows
              events.push({ ...baseEvent, type: "flow_reply", payload: interactive.nfm_reply });
            }
          } else if (message.order) {
            events.push({ ...baseEvent, type: "order", payload: message.order });
          } else if (message.system) {
            events.push({ ...baseEvent, type: "system", payload: message.system });
          } else {
            events.push({ ...baseEvent, type: "unsupported", raw: message });
          }
        }
      }
    }
  }

  return events;
}

/**
 * Processes a single normalized event.
 * Handles database saving, idempotency, and Socket.IO emission.
 */
export async function processWhatsAppEvent(event, shopId) {
  // 1. Idempotency Check (Event level)
  const eventId = `${shopId}:${event.type}:${event.metaMessageId || event.timestamp}:${event.timestamp}`;
  const hashedEventId = crypto.createHash("sha256").update(eventId).digest("hex");

  const existingEvent = await prisma.waWebhookEvent.findUnique({
    where: { id: hashedEventId },
  });

  if (existingEvent) return;

  // 2. Route based on type
  if (event.type === "status") {
    return handleStatusUpdate(event, shopId, hashedEventId);
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

async function handleInboundMessage(event, shopId, eventId) {
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
    const message = await tx.waMessage.create({
      data: {
        conversationId: conversation.id,
        metaMessageId: event.metaMessageId,
        replyToMetaMessageId: event.replyToMetaMessageId,
        direction: "INBOUND",
        status: "SENT",
        type: messageType,
        content: event.content ? { text: event.content } : (event.payload || event.raw || {}),
        mediaId: event.mediaId,
        mimeType: event.mimeType,
        fileName: event.fileName,
        createdAt: new Date(Number(event.timestamp) * 1000),
      },
    });

    // 5. If it is a media message, queue for download
    if (event.mediaId) {
      try {
        const { mediaDownloadQueue } = await import("./whatsapp.queue.js");
        await mediaDownloadQueue.add("download-media", {
          shopId,
          messageId: message.id,
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

function mapEventTypeToMessageType(type) {
  const map = {
    text: "TEXT",
    image: "IMAGE",
    document: "DOCUMENT",
    audio: "AUDIO",
    video: "VIDEO",
    sticker: "STICKER",
    location: "TEXT",
    contacts: "TEXT",
    reaction: "TEXT",
    button_reply: "TEXT",
    list_reply: "TEXT",
    flow_reply: "FLOW",
  };
  return map[type] || "TEXT";
}
