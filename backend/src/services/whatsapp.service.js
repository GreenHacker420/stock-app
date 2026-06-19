import axios from "axios";
import prisma from "../lib/db.js";
import { publishWhatsAppEvent } from "../utils/realtime.js";
import { getWaCredentials } from "../lib/wa-cache.js";
import { connection as redis } from "./whatsapp.queue.js";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

class WhatsAppService {
  // Fetches the WhatsApp integration details for a shop (Cache-backed).
  async getIntegration(shopId) {
    const credentials = await getWaCredentials(shopId);
    if (!credentials) {
      throw new Error("WhatsApp integration not connected for this shop");
    }
    return credentials;
  }

  // Verification for Meta Webhook setup.
  async verifyWebhook(shopId, mode, token, challenge) {
    const integration = await prisma.waIntegration.findUnique({
      where: { shopId },
    });
    if (mode === "subscribe" && token === integration?.verifyToken) {
      return challenge;
    }
    throw new Error("Verification failed");
  }

  // Checks if a conversation is within the 24-hour service window (Redis first, fallback to DB).
  async canSendFreeText(conversationId) {
    try {
      const windowKey = `wa:window:${conversationId}`;
      const active = await redis.get(windowKey);
      if (active) return true;
    } catch (err) {
      console.error("[WhatsApp Service] Redis read error (window):", err.message);
    }

    const conversation = await prisma.waConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation?.lastCustomerMessageAt) return false;

    const lastMessageTime = new Date(conversation.lastCustomerMessageAt).getTime();
    const now = Date.now();
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

    const isValid = (now - lastMessageTime) <= twentyFourHoursInMs;

    if (isValid) {
      try {
        await redis.setex(`wa:window:${conversationId}`, 24 * 60 * 60, "active");
      } catch (err) {
        console.error("[WhatsApp Service] Redis write error (window):", err.message);
      }
    }

    return isValid;
  }

  // Queues a message for sending.
  async sendMessage(shopId, { conversationId, to, type, content, template, mediaUrl }) {
    // Ensure integration exists before queuing
    await this.getIntegration(shopId);

    // 1. Initial local record
    const message = await prisma.waMessage.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        status: "QUEUED",
        type,
        content: content || template || {},
        mediaUrl,
      },
    });

    // 2. Add to queue
    const { whatsappQueue } = await import("./whatsapp.queue.js");
    await whatsappQueue.add("send-message", {
      shopId,
      messageId: message.id,
      payload: { conversationId, to, type, content, template, mediaUrl }
    });

    return message;
  }

  // Low-level method called by worker to actually hit Meta API.
  async _sendDirect(shopId, { messageId, payload: p }) {
    const { conversationId, to, type, content, template, mediaUrl } = p;
    const integration = await this.getIntegration(shopId);

    try {
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
      };

      if (type === "TEMPLATE") {
        payload.type = "template";
        payload.template = template;
      } else if (type === "TEXT") {
        const isWithinWindow = await this.canSendFreeText(conversationId);
        if (!isWithinWindow) {
          throw new Error("Outside 24-hour window. Please use a template.");
        }
        payload.type = "text";
        payload.text = { body: content.text };
      } else if (["IMAGE", "DOCUMENT", "AUDIO", "VIDEO"].includes(type)) {
        const isWithinWindow = await this.canSendFreeText(conversationId);
        if (!isWithinWindow) {
          throw new Error("Outside 24-hour window. Please use a template.");
        }
        const mediaType = type.toLowerCase();
        payload.type = mediaType;
        payload[mediaType] = { link: mediaUrl };
      }

      const response = await axios.post(
        `${BASE_URL}/${integration.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${integration.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const metaMessageId = response.data.messages?.[0]?.id;

      const updatedMessage = await prisma.waMessage.update({
        where: { id: messageId },
        data: {
          metaMessageId,
          status: "SENT",
        },
      });

      await publishWhatsAppEvent(shopId, "wa:status_updated", {
        messageId: updatedMessage.id,
        conversationId,
        status: "SENT",
      });

      return updatedMessage;
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;

      const failedMessage = await prisma.waMessage.update({
        where: { id: messageId },
        data: {
          status: "FAILED",
          errorMessage,
          failedAt: new Date(),
        },
      });

      await publishWhatsAppEvent(shopId, "wa:status_updated", {
        messageId: failedMessage.id,
        conversationId,
        status: "FAILED",
        error: errorMessage
      });

      throw new Error(errorMessage);
    }
  }

  // Syncs templates from Meta.
  async syncTemplates(shopId) {
    const integration = await this.getIntegration(shopId);

    try {
      const response = await axios.get(
        `${BASE_URL}/${integration.businessAccountId}/message_templates`,
        {
          headers: {
            Authorization: `Bearer ${integration.accessToken}`,
          },
        }
      );

      const metaTemplates = response.data.data;

      for (const t of metaTemplates) {
        await prisma.waTemplate.upsert({
          where: {
            shopId_name_language: {
              shopId,
              name: t.name,
              language: t.language,
            },
          },
          update: {
            status: t.status,
            category: t.category,
            components: t.components,
            syncedAt: new Date(),
          },
          create: {
            shopId,
            name: t.name,
            language: t.language,
            status: t.status,
            category: t.category,
            components: t.components,
            syncedAt: new Date(),
          }
        });
      }

      return metaTemplates.length;
    } catch (error) {
      console.error("Sync templates failed:", error.response?.data || error.message);
      throw error;
    }
  }

  // Syncs flows from Meta.
  async syncFlows(shopId) {
    const integration = await this.getIntegration(shopId);

    try {
      const response = await axios.get(
        `${BASE_URL}/${integration.businessAccountId}/flows`,
        {
          headers: {
            Authorization: `Bearer ${integration.accessToken}`,
          },
        }
      );

      const metaFlows = response.data.data;

      for (const f of metaFlows) {
        await prisma.waFlow.upsert({
          where: {
            shopId_flowId: {
              shopId,
              flowId: f.id,
            },
          },
          update: {
            name: f.name,
            status: f.status,
            syncedAt: new Date(),
          },
          create: {
            shopId,
            flowId: f.id,
            name: f.name,
            status: f.status,
            syncedAt: new Date(),
          }
        });
      }

      return metaFlows.length;
    } catch (error) {
      console.error("Sync flows failed:", error.response?.data || error.message);
      throw error;
    }
  }

  // Syncs existing Customers into WaConversation records.
  async syncContactsWithConversations(shopId) {
    const customers = await prisma.customer.findMany({
      where: {
        shopId,
        phone: { not: null },
      },
    });

    let createdCount = 0;
    for (const customer of customers) {
      const normalizedPhone = customer.phone.replace(/\D/g, "");
      if (!normalizedPhone) continue;

      const existing = await prisma.waConversation.findUnique({
        where: { shopId_phone: { shopId, phone: normalizedPhone } },
      });

      if (!existing) {
        await prisma.waConversation.create({
          data: {
            shopId,
            phone: normalizedPhone,
            contactName: customer.name,
            customerId: customer.id,
          },
        });
        createdCount++;
      } else if (!existing.customerId) {
        await prisma.waConversation.update({
          where: { id: existing.id },
          data: { customerId: customer.id },
        });
      }
    }

    return createdCount;
  }
}

export const whatsappService = new WhatsAppService();
