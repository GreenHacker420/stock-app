import axios from "axios";
import prisma from "../lib/db.js";
import { publishWhatsAppEvent } from "../utils/realtime.js";
import { getWaCredentials } from "../lib/wa-cache.js";
import { connection as redis } from "./whatsapp.queue.js";
import crypto from "crypto";
import { encrypt, decrypt } from "../lib/wa-crypto.js";
import { normalizePhone } from "./whatsapp.phone.js";
import {
  compileMetaMessage,
  getLocalMessageProjection,
  outboundCommandSchema,
  requiresServiceWindow,
} from "./whatsapp.message-compiler.js";
import { resolveOutboundMediaAsset } from "./whatsapp.media.service.js";

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

  async createConversation(shopId, { phone, contactName, customerId }) {
    await this.getIntegration(shopId);

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
      throw new Error("A valid WhatsApp phone number is required");
    }

    const customer = customerId
      ? await prisma.customer.findFirst({
          where: { id: customerId, shopId, status: "ACTIVE" },
          select: { id: true, name: true, phone: true },
        })
      : await this.findCustomerByPhone(shopId, normalizedPhone);

    if (customerId && !customer) {
      throw new Error("Customer not found for this shop");
    }

    return prisma.waConversation.upsert({
      where: { shopId_phone: { shopId, phone: normalizedPhone } },
      create: {
        shopId,
        phone: normalizedPhone,
        contactName: contactName?.trim() || customer?.name || null,
        customerId: customer?.id || null,
      },
      update: {
        isArchived: false,
        contactName: contactName?.trim() || customer?.name || undefined,
        customerId: customer?.id || undefined,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        messages: { take: 1, orderBy: { createdAt: "desc" } },
      },
    });
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
  async sendMessage(input) {
    const command = outboundCommandSchema.parse(input);
    const {
      shopId,
      conversationId,
      to,
      message: requestedMessage,
      replyToMetaMessageId,
      replyToMessageId,
    } = command;

    // Ensure integration exists before queuing
    await this.getIntegration(shopId);

    const normalizedPhone = normalizePhone(to);
    let resolvedConversationId = conversationId;

    if (resolvedConversationId) {
      const conversation = await prisma.waConversation.findFirst({
        where: { id: resolvedConversationId, shopId },
        select: { id: true, phone: true },
      });
      if (!conversation) {
        throw new Error("Conversation not found for this shop");
      }
      if (normalizePhone(conversation.phone) !== normalizedPhone) {
        throw new Error("Conversation recipient does not match the requested phone number");
      }
    } else {
      let conversation = await prisma.waConversation.findUnique({
        where: { shopId_phone: { shopId, phone: normalizedPhone } },
      });

      if (!conversation) {
        const customer = await this.findCustomerByPhone(shopId, normalizedPhone);
        conversation = await prisma.waConversation.create({
          data: {
            shopId,
            phone: normalizedPhone,
            contactName: customer?.name || null,
            customerId: customer?.id || null,
          },
        });
      }
      resolvedConversationId = conversation.id;
    }

    let resolvedReplyToMetaId = replyToMetaMessageId;
    if (replyToMessageId && !resolvedReplyToMetaId) {
      const parentMsg = await prisma.waMessage.findUnique({
        where: { id: replyToMessageId },
        select: { metaMessageId: true }
      });
      resolvedReplyToMetaId = parentMsg?.metaMessageId || null;
    }

    const resolvedMedia = await resolveOutboundMediaAsset({
      shopId,
      message: requestedMessage,
    });
    const outboundMessage = resolvedMedia.message;
    const projection = getLocalMessageProjection({
      ...requestedMessage,
      ...(resolvedMedia.assetId ? { assetId: resolvedMedia.assetId } : {}),
    });

    // 1. Initial local record
    const message = await prisma.waMessage.create({
      data: {
        conversationId: resolvedConversationId,
        direction: "OUTBOUND",
        status: "QUEUED",
        type: projection.type,
        content: projection.content,
        payload: projection.payload,
        assetId: projection.assetId,
        templateName: projection.templateName,
        templateLanguage: projection.templateLanguage,
        replyToMetaMessageId: resolvedReplyToMetaId,
      },
    });

    // 2. Add to queue
    try {
      const { whatsappQueue } = await import("./whatsapp.queue.js");
      await whatsappQueue.add("send-message", {
        shopId,
        messageId: message.id,
        payload: {
          conversationId: resolvedConversationId,
          to: normalizedPhone,
          message: outboundMessage,
          replyToMetaMessageId: resolvedReplyToMetaId,
        },
      });
    } catch (error) {
      await prisma.waMessage.update({
        where: { id: message.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          errorMessage: error.message,
        },
      });
      throw error;
    }

    return message;
  }


  // Low-level method called by worker to actually hit Meta API.
  async _sendDirect(shopId, { messageId, payload: p }) {
    const { conversationId, to, message, replyToMetaMessageId } = p;
    const integration = await this.getIntegration(shopId);

    try {
      if (requiresServiceWindow(message)) {
        const isWithinWindow = await this.canSendFreeText(conversationId);
        if (!isWithinWindow) {
          throw new Error("Outside 24-hour window. Please use a template.");
        }
      }

      const payload = compileMetaMessage({ to, message, replyToMetaMessageId });

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
      if (message.kind === "flow" && message.executionId) {
        await prisma.waFlowExecution.updateMany({
          where: { id: message.executionId, shopId },
          data: {
            metaMessageId,
            status: "STARTED",
            sentAt: new Date(),
          },
        });
      }

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
      if (message.kind === "flow" && message.executionId) {
        await prisma.waFlowExecution.updateMany({
          where: { id: message.executionId, shopId },
          data: {
            status: "FAILED",
            lastEndpointError: errorMessage,
          },
        });
      }

      await publishWhatsAppEvent(shopId, "wa:status_updated", {
        messageId: failedMessage.id,
        conversationId,
        status: "FAILED",
        error: errorMessage
      });

      throw new Error(errorMessage);
    }
  }

  // Sends an emoji reaction via Meta API.
  async sendReaction(shopId, { to, messageId, emoji }) {
    const integration = await this.getIntegration(shopId);

    const targetMessage = await prisma.waMessage.findUnique({
      where: { id: messageId },
    });

    if (!targetMessage || !targetMessage.metaMessageId) {
      throw new Error("Target message not found or lacks metaMessageId");
    }

    try {
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "reaction",
        reaction: {
          message_id: targetMessage.metaMessageId,
          emoji: emoji || "", // Empty string removes reaction on Meta
        },
      };

      await axios.post(
        `${BASE_URL}/${integration.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${integration.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Update local reactions payload
      let reactions = targetMessage.payload?.reactions || [];
      if (!Array.isArray(reactions)) reactions = [];

      // Remove existing reaction from "me"
      reactions = reactions.filter(r => r.from !== "me");

      if (emoji) {
        reactions.push({
          from: "me",
          emoji,
          timestamp: new Date().toISOString(),
        });
      }

      const updatedPayload = {
        ...(targetMessage.payload || {}),
        reactions,
      };

      const updatedMessage = await prisma.waMessage.update({
        where: { id: messageId },
        data: { payload: updatedPayload },
      });

      // Broadcast reaction updates
      await publishWhatsAppEvent(shopId, "wa:reaction_updated", {
        messageId: updatedMessage.id,
        conversationId: updatedMessage.conversationId,
        reactions,
      });

      return updatedMessage;
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      console.error("[WhatsApp Service] Send reaction failed:", errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Recalls (deletes) a message.
  async deleteMessage(shopId, messageId) {
    const integration = await this.getIntegration(shopId);

    const message = await prisma.waMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || !message.metaMessageId) {
      throw new Error("Message not found or lacks metaMessageId");
    }

    try {
      await axios.post(
        `${BASE_URL}/${integration.phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          status: "deleted",
          message_id: message.metaMessageId,
        },
        {
          headers: {
            Authorization: `Bearer ${integration.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const updatedMessage = await prisma.waMessage.update({
        where: { id: messageId },
        data: {
          status: "DELETED",
          content: { text: "This message was deleted", isDeleted: true },
        },
      });

      // Broadcast status updates
      await publishWhatsAppEvent(shopId, "wa:status_updated", {
        messageId: updatedMessage.id,
        conversationId: updatedMessage.conversationId,
        status: "DELETED",
      });

      return updatedMessage;
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      console.error("[WhatsApp Service] Recall message failed:", errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Archives a conversation.
  async archiveConversation(shopId, conversationId, isArchived = true) {
    return await prisma.waConversation.update({
      where: { id: conversationId, shopId },
      data: { isArchived },
    });
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

  // Deletes (recalls) a conversation and cascades to clean up message logs.
  async deleteConversation(shopId, conversationId) {
    return await prisma.$transaction(async (tx) => {
      await tx.waMessage.deleteMany({
        where: { conversationId }
      });
      return await tx.waConversation.delete({
        where: { id: conversationId, shopId }
      });
    });
  }

  // Generates RSA Key Pair for Flows E2EE per integration (shop)
  async generateRsaKeyPair(shopId) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    const encryptedPrivateKey = encrypt(privateKey);

    return await prisma.waIntegration.update({
      where: { shopId },
      data: {
        rsaPublicKey: publicKey,
        rsaPrivateKeyEncrypted: encryptedPrivateKey,
      },
    });
  }

  // Finds customer by phone number using fallback: normalized (E.164) -> national -> last10 digits suffix
  async findCustomerByPhone(shopId, phone) {
    if (!phone) return null;
    const normalized = normalizePhone(phone);

    // 1. Exact match (normalized E.164)
    let customer = await prisma.customer.findFirst({
      where: {
        shopId,
        phone: normalized,
        status: "ACTIVE",
      },
    });
    if (customer) return customer;

    // 2. National format fallback
    let subscriberNumber = normalized;
    if (normalized.startsWith("+91")) {
      subscriberNumber = normalized.slice(3); // last 10 digits
    } else if (normalized.startsWith("+")) {
      subscriberNumber = normalized.slice(1);
    }

    if (subscriberNumber !== normalized) {
      customer = await prisma.customer.findFirst({
        where: {
          shopId,
          phone: { in: [subscriberNumber, `0${subscriberNumber}`] },
          status: "ACTIVE",
        },
      });
      if (customer) return customer;
    }

    // 3. Suffix match (last 10 digits endsWith)
    const suffix = normalized.slice(-10);
    if (suffix.length === 10) {
      customer = await prisma.customer.findFirst({
        where: {
          shopId,
          phone: { endsWith: suffix },
          status: "ACTIVE",
        },
      });
      if (customer) return customer;
    }

    return null;
  }

  // Bulk synchronizes phone contacts locally cached to DB (asynchronously)
  async syncPhoneContacts(shopId, contacts, mergeStrategy, userId) {
    let newCustomersCount = 0;
    let mergedCount = 0;

    for (const c of contacts) {
      if (!c.phone) continue;

      const normalizedPhone = normalizePhone(c.phone);
      if (!normalizedPhone) continue;

      let customer = null;

      if (c.customerId) {
        // Link to existing customer manually
        customer = await prisma.customer.findUnique({
          where: { id: c.customerId },
        });

        if (customer && customer.shopId === shopId) {
          customer = await prisma.customer.update({
            where: { id: customer.id },
            data: {
              phone: normalizedPhone,
              email: (mergeStrategy === "MERGE" && !customer.email) ? c.email : customer.email,
              type: (c.tag === "BUSINESS" || c.tag === "REGULAR") ? c.tag : customer.type,
            },
          });
          mergedCount++;
        }
      } else {
        // Try match by normalized -> national -> last10 suffix fallback matching
        customer = await this.findCustomerByPhone(shopId, normalizedPhone);

        if (customer) {
          if (mergeStrategy === "MERGE") {
            const updateData = {};
            if (!customer.phone) updateData.phone = normalizedPhone;
            if (!customer.email && c.email) updateData.email = c.email;
            if (!customer.contactPerson && c.name) updateData.contactPerson = c.name;
            if (c.tag === "BUSINESS" || c.tag === "REGULAR") updateData.type = c.tag;

            if (Object.keys(updateData).length > 0) {
              customer = await prisma.customer.update({
                where: { id: customer.id },
                data: updateData,
              });
              mergedCount++;
            }
          }
        } else {
          // Create new Customer
          customer = await prisma.customer.create({
            data: {
              shopId,
              name: c.name || `Contact ${normalizedPhone.slice(-10)}`,
              phone: normalizedPhone,
              email: c.email || null,
              type: (c.tag === "BUSINESS" || c.tag === "REGULAR") ? c.tag : "REGULAR",
              createdById: userId,
            },
          });
          newCustomersCount++;
        }
      }
    }

    return {
      newCustomersCount,
      mergedCount,
      conversationsCount: 0,
    };
  }
}


export const whatsappService = new WhatsAppService();
export { normalizePhone };
