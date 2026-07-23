import axios from "axios";
import prisma from "../lib/db.js";
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
import { ApiError } from "../utils/ApiError.js";
import { enqueueWhatsAppDomainEvent } from "./whatsapp.domain-events.js";
import {
  hashLogicalMessage,
  queueJobId,
  resolveIdempotentMessage,
} from "./whatsapp.idempotency.js";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

async function enqueueOutboundMessage({
  shopId,
  message,
  requestId,
  clientMessageId,
  payload,
}) {
  const { whatsappQueue } = await import("./whatsapp.queue.js");
  await whatsappQueue.add("send-message", {
    shopId,
    messageId: message.id,
    attempt: message.attempt,
    requestId: requestId || message.requestId,
    clientMessageId: clientMessageId || message.clientMessageId,
    payload,
  }, {
    jobId: queueJobId(message.id, message.attempt),
  });
}

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
      integrationId,
      conversationId,
      to,
      message: requestedMessage,
      replyToMetaMessageId,
      replyToMessageId,
      sourceDeviceId,
      requestId,
      actorUserId,
    } = command;
    const clientMessageId = command.clientMessageId || crypto.randomUUID();
    const idempotencyKey = command.idempotencyKey
      || `wa-send:${shopId}:${integrationId || "primary"}:${clientMessageId}`;

    // Ensure integration exists before queuing
    const integration = await this.getIntegration(shopId);
    if (integrationId && integration.id !== integrationId) {
      throw new ApiError(404, "WhatsApp integration not found", {
        code: "WHATSAPP_RESOURCE_NOT_FOUND",
      });
    }

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
      const parentMsg = await prisma.waMessage.findFirst({
        where: { id: replyToMessageId, conversationId: resolvedConversationId },
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
    const logicalPayload = {
      conversationId: resolvedConversationId,
      to: normalizedPhone,
      message: outboundMessage,
      replyToMetaMessageId: resolvedReplyToMetaId || null,
    };
    const clientPayloadHash = hashLogicalMessage(logicalPayload);

    const existing = await prisma.waMessage.findUnique({
      where: {
        conversationId_clientMessageId: {
          conversationId: resolvedConversationId,
          clientMessageId,
        },
      },
    });
    if (resolveIdempotentMessage(existing, clientPayloadHash)) {
      if (existing.operationState === "QUEUED" || existing.operationState === "RETRY_SCHEDULED") {
        await enqueueOutboundMessage({
          shopId,
          message: existing,
          requestId,
          clientMessageId,
          payload: existing.payload?.outboundCommand || logicalPayload,
        });
      }
      return existing;
    }

    let message;
    try {
      message = await prisma.$transaction(async (tx) => {
        const created = await tx.waMessage.create({
          data: {
            conversationId: resolvedConversationId,
            clientMessageId,
            clientPayloadHash,
            sourceDeviceId,
            requestId,
            direction: "OUTBOUND",
            status: "QUEUED",
            operationState: "QUEUED",
            providerStatus: "PENDING",
            contentState: "VISIBLE",
            attempt: 1,
            type: projection.type,
            content: projection.content,
            payload: {
              ...(projection.payload || {}),
              outboundCommand: logicalPayload,
            },
            assetId: projection.assetId,
            templateName: projection.templateName,
            templateLanguage: projection.templateLanguage,
            replyToMetaMessageId: resolvedReplyToMetaId,
          },
        });
        await enqueueWhatsAppDomainEvent(tx, {
          shopId,
          integration: {
            id: integration.id,
            phoneNumberId: integration.phoneNumberId,
          },
          entity: "waMessage",
          entityId: created.id,
          entityVersion: created.entityVersion,
          action: "created",
          conversationId: resolvedConversationId,
          sourceDeviceId,
          actorUserId: actorUserId || "system:whatsapp",
          idempotencyKey,
          patch: {
            id: created.id,
            clientMessageId,
            conversationId: resolvedConversationId,
            operationState: created.operationState,
            providerStatus: created.providerStatus,
            contentState: created.contentState,
            attempt: created.attempt,
            entityVersion: created.entityVersion,
            direction: created.direction,
            type: created.type,
            content: created.content,
            createdAt: created.createdAt,
          },
        });
        return created;
      });
    } catch (error) {
      if (error?.code === "P2002") {
        const raced = await prisma.waMessage.findUnique({
          where: {
            conversationId_clientMessageId: {
              conversationId: resolvedConversationId,
              clientMessageId,
            },
          },
        });
        if (raced?.clientPayloadHash === clientPayloadHash) return raced;
      }
      throw error;
    }

    // 2. Add to queue
    try {
      await enqueueOutboundMessage({
        shopId,
        message,
        requestId,
        clientMessageId,
        payload: {
          conversationId: resolvedConversationId,
          to: normalizedPhone,
          message: outboundMessage,
          replyToMetaMessageId: resolvedReplyToMetaId,
        },
      });
    } catch (error) {
      await prisma.$transaction(async (tx) => {
        const failed = await tx.waMessage.update({
          where: { id: message.id },
          data: {
            status: "FAILED",
            operationState: "TERMINALLY_FAILED",
            providerStatus: "FAILED",
            providerStatusAt: new Date(),
            entityVersion: { increment: 1 },
            failedAt: new Date(),
            errorMessage: error.message,
          },
        });
        await enqueueWhatsAppDomainEvent(tx, {
          shopId,
          integration,
          entity: "waMessage",
          entityId: failed.id,
          entityVersion: failed.entityVersion,
          action: "terminally_failed",
          conversationId: failed.conversationId,
          sourceDeviceId,
          actorUserId: actorUserId || "system:whatsapp",
          patch: {
            operationState: failed.operationState,
            providerStatus: failed.providerStatus,
            providerStatusAt: failed.providerStatusAt,
            attempt: failed.attempt,
            entityVersion: failed.entityVersion,
            errorMessage: failed.errorMessage,
          },
        });
      });
      throw error;
    }

    return message;
  }

  async retryMessage({ shopId, integrationId, messageId, sourceDeviceId, requestId }) {
    const integration = await this.getIntegration(shopId);
    if (integrationId && integration.id !== integrationId) {
      throw new ApiError(404, "WhatsApp integration not found", {
        code: "WHATSAPP_RESOURCE_NOT_FOUND",
      });
    }
    const message = await prisma.waMessage.findFirst({
      where: { id: messageId, conversation: { shopId } },
    });
    if (!message) {
      throw new ApiError(404, "WhatsApp message not found");
    }
    if (message.operationState !== "TERMINALLY_FAILED") {
      throw new ApiError(409, "Only terminally failed messages can be retried", {
        code: "MESSAGE_NOT_RETRYABLE",
      });
    }
    const outboundCommand = message.payload?.outboundCommand;
    if (!outboundCommand) {
      throw new ApiError(409, "This legacy message does not contain retry metadata", {
        code: "MESSAGE_NOT_RETRYABLE",
      });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.waMessage.updateMany({
        where: {
          id: message.id,
          operationState: "TERMINALLY_FAILED",
          attempt: message.attempt,
        },
        data: {
          attempt: { increment: 1 },
          operationState: "RETRY_SCHEDULED",
          providerStatus: "PENDING",
          providerStatusAt: null,
          metaMessageId: null,
          sourceDeviceId: sourceDeviceId || message.sourceDeviceId,
          requestId,
          status: "QUEUED",
          errorMessage: null,
          failedAt: null,
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
          entityVersion: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new ApiError(409, "Message retry is already in progress", {
          code: "MESSAGE_RETRY_IN_PROGRESS",
        });
      }
      const row = await tx.waMessage.findUnique({ where: { id: message.id } });
      await enqueueWhatsAppDomainEvent(tx, {
        shopId,
        integration,
        entity: "waMessage",
        entityId: row.id,
        entityVersion: row.entityVersion,
        action: "retry_scheduled",
        conversationId: row.conversationId,
        sourceDeviceId,
        patch: {
          operationState: row.operationState,
          providerStatus: row.providerStatus,
          attempt: row.attempt,
          entityVersion: row.entityVersion,
        },
      });
      return row;
    });
    await enqueueOutboundMessage({
      shopId,
      message: updated,
      requestId,
      clientMessageId: updated.clientMessageId,
      payload: outboundCommand,
    });
    return updated;
  }


  // Low-level method called by worker to actually hit Meta API.
  async _sendDirect(shopId, { messageId, attempt, payload: p }) {
    const { conversationId, to, message, replyToMetaMessageId } = p;
    const integration = await this.getIntegration(shopId);
    const current = await prisma.waMessage.findFirst({
      where: { id: messageId, conversation: { shopId } },
    });
    if (!current) throw new Error("WhatsApp message not found");
    if (attempt && current.attempt !== attempt) {
      return current;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const processing = await tx.waMessage.update({
          where: { id: messageId },
          data: {
            operationState: "PROCESSING",
            entityVersion: { increment: 1 },
          },
        });
        await enqueueWhatsAppDomainEvent(tx, {
          shopId,
          integration,
          entity: "waMessage",
          entityId: processing.id,
          entityVersion: processing.entityVersion,
          action: "processing",
          conversationId,
          sourceDeviceId: processing.sourceDeviceId,
          patch: {
            operationState: processing.operationState,
            providerStatus: processing.providerStatus,
            attempt: processing.attempt,
            entityVersion: processing.entityVersion,
          },
        });
      });

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

      const updatedMessage = await prisma.$transaction(async (tx) => {
        const updated = await tx.waMessage.update({
          where: { id: messageId },
          data: {
            metaMessageId,
            status: "SENT",
            operationState: "COMPLETED",
            providerStatus: "ACCEPTED",
            providerStatusAt: new Date(),
            entityVersion: { increment: 1 },
          },
        });
        await enqueueWhatsAppDomainEvent(tx, {
          shopId,
          integration,
          entity: "waMessage",
          entityId: updated.id,
          entityVersion: updated.entityVersion,
          action: "provider_status_changed",
          conversationId,
          sourceDeviceId: updated.sourceDeviceId,
          patch: {
            providerMessageId: updated.metaMessageId,
            operationState: updated.operationState,
            providerStatus: updated.providerStatus,
            providerStatusAt: updated.providerStatusAt,
            attempt: updated.attempt,
            entityVersion: updated.entityVersion,
            status: updated.status,
          },
        });
        return updated;
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

      return updatedMessage;
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      if (message.kind === "flow" && message.executionId) {
        await prisma.waFlowExecution.updateMany({
          where: { id: message.executionId, shopId },
          data: {
            status: "FAILED",
            lastEndpointError: errorMessage,
          },
        });
      }

      throw new Error(errorMessage);
    }
  }

  // Sends an emoji reaction via Meta API.
  async sendReaction(shopId, { to, messageId, emoji }) {
    const integration = await this.getIntegration(shopId);

    const targetMessage = await prisma.waMessage.findFirst({
      where: { id: messageId, conversation: { shopId } },
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

      const updatedMessage = await prisma.$transaction(async (tx) => {
        const updated = await tx.waMessage.update({
          where: { id: messageId },
          data: { payload: updatedPayload, entityVersion: { increment: 1 } },
        });
        await enqueueWhatsAppDomainEvent(tx, {
          shopId,
          integration,
          entity: "waMessage",
          entityId: updated.id,
          entityVersion: updated.entityVersion,
          action: "reaction_updated",
          conversationId: updated.conversationId,
          patch: { reactions, entityVersion: updated.entityVersion },
        });
        return updated;
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

    const message = await prisma.waMessage.findFirst({
      where: { id: messageId, conversation: { shopId } },
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

      const updatedMessage = await prisma.$transaction(async (tx) => {
        const updated = await tx.waMessage.update({
          where: { id: messageId },
          data: {
            status: "DELETED",
            contentState: "DELETED",
            content: { text: "This message was deleted", isDeleted: true },
            entityVersion: { increment: 1 },
          },
        });
        await enqueueWhatsAppDomainEvent(tx, {
          shopId,
          integration,
          entity: "waMessage",
          entityId: updated.id,
          entityVersion: updated.entityVersion,
          action: "content_deleted",
          conversationId: updated.conversationId,
          patch: {
            contentState: updated.contentState,
            entityVersion: updated.entityVersion,
          },
        });
        return updated;
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
