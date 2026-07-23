import crypto from "crypto";
import axios from "axios";
import { whatsappService } from "../services/whatsapp.service.js";
import { whatsappBroadcastService } from "../services/whatsapp.broadcast.service.js";
import { getWaCredentials, getTenantByPhoneNumberId, invalidateWaCredentials } from "../lib/wa-cache.js";
import { inboundQueue } from "../services/whatsapp.queue.js";
import { encrypt } from "../lib/wa-crypto.js";
import prisma from "../lib/db.js";
import { persistWebhookEnvelopes } from "../services/whatsapp.webhook.service.js";
import {
  serializeMessageWithAsset,
  uploadWhatsAppTemplateExample,
  uploadWhatsAppMedia,
} from "../services/whatsapp.media.service.js";
import { whatsappTemplateService } from "../services/whatsapp.template.service.js";
import {
  decodeWhatsAppCursor,
  encodeWhatsAppCursor,
  whatsappCursorWhere,
} from "../services/whatsapp.pagination.js";
import { ApiError } from "../utils/ApiError.js";
import { enqueueWhatsAppDomainEvent } from "../services/whatsapp.domain-events.js";

function boundedLimit(value, fallback = 50, maximum = 100) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function assertMatchingWhatsAppScope(body, scope) {
  const mismatched = (
    (body.shopId && body.shopId !== scope.integration.shopId)
    || (body.integrationId && body.integrationId !== scope.integration.id)
    || (body.conversationId && body.conversationId !== scope.conversation.id)
  );
  if (mismatched) {
    throw new ApiError(400, "Request scope does not match the authorized resource", {
      code: "WHATSAPP_SCOPE_MISMATCH",
    });
  }
}

async function getPublicIntegration(shopId) {
  const integration = await prisma.waIntegration.findUnique({
    where: { shopId },
    select: {
      id: true,
      shopId: true,
      appSecret: true,
      accessToken: true,
      businessAccountId: true,
      phoneNumberId: true,
      phoneNumber: true,
      businessName: true,
      status: true,
      accountStatus: true,
      accountReviewStatus: true,
      displayNameStatus: true,
      capabilities: true,
      messagingLimitTier: true,
      qualityRating: true,
      callingEnabled: true,
      rsaPublicKey: true,
      connectedAt: true,
      lastWebhookAt: true,
      lastManagementEventAt: true,
      lastManagementEventField: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!integration) return null;
  const { appSecret, accessToken, ...safeIntegration } = integration;
  return {
    ...safeIntegration,
    hasAppSecret: Boolean(appSecret),
    hasAccessToken: Boolean(accessToken),
  };
}

class WhatsAppController {
  async getCapability(req, res, next) {
    try {
      const integration = await prisma.waIntegration.findUnique({
        where: { shopId: req.shop.id },
        select: {
          id: true,
          phoneNumberId: true,
          status: true,
        },
      });
      if (req.query.integrationId && req.query.integrationId !== integration?.id) {
        throw new ApiError(404, "WhatsApp resource not found", {
          code: "WHATSAPP_RESOURCE_NOT_FOUND",
        });
      }
      if (req.query.conversationId) {
        const conversation = await prisma.waConversation.findFirst({
          where: {
            id: req.query.conversationId,
            shopId: req.shop.id,
          },
          select: { id: true },
        });
        if (!conversation) {
          throw new ApiError(404, "WhatsApp resource not found", {
            code: "WHATSAPP_RESOURCE_NOT_FOUND",
          });
        }
      }
      const socketGraceMs = Math.min(
        Math.max(Number(process.env.WHATSAPP_SOCKET_GRACE_MS || 3000), 0),
        30_000,
      );
      res.json({
        enabled: Boolean(integration && integration.status === "CONNECTED"),
        integrationId: integration?.id || null,
        phoneNumberId: integration?.phoneNumberId || null,
        runtimeConfig: {
          socketGraceMs,
          notificationPreviewsEnabled: false,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  constructor() {
    this.handleWebhook = this.handleWebhook.bind(this);
    this.verifyWebhook = this.verifyWebhook.bind(this);
  }

  async #validateSignature(req, shopId) {
    const signature = req.headers["x-hub-signature-256"];
    if (!signature) return false;

    // Get credentials from cache
    const creds = await getWaCredentials(shopId);
    const secret = creds?.appSecret || process.env.WHATSAPP_APP_SECRET;
    if (!secret) {
      console.warn(`[WhatsApp Controller] No App Secret configured for shop ${shopId}, rejecting signature`);
      return false; // Strict validation: reject unsigned or unconfigured webhooks
    }

    const parts = signature.split("=");
    if (parts.length !== 2 || parts[0] !== "sha256") return false;
    const hash = parts[1];

    const rawBody = req.rawBody;
    if (!rawBody) {
      console.warn("[WhatsApp Controller] rawBody is missing, cannot validate signature");
      return false;
    }

    const expectedHash = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    try {
      return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
    } catch {
      return false;
    }
  }

  async verifyWebhook(req, res) {
    try {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      if (mode !== "subscribe" || !token) {
        return res.status(400).send("Invalid verification request");
      }

      // Try legacy path-based verification if shopId is provided
      const shopId = req.params.shopId || req.query.shopId;
      if (shopId) {
        const result = await whatsappService.verifyWebhook(shopId, mode, token, challenge);
        return res.status(200).send(result);
      }

      // Unified single-webhook URL: search database/cache for matching verifyToken
      const integration = await prisma.waIntegration.findFirst({
        where: { verifyToken: token, status: "CONNECTED" },
        select: { shopId: true },
      });

      if (integration) {
        return res.status(200).send(challenge);
      }

      console.warn(`[WhatsApp Controller] Webhook verification failed for token: ${token}`);
      res.status(403).send("Forbidden");
    } catch (error) {
      console.error("[WhatsApp Controller] Webhook verification error:", error);
      res.status(403).send("Forbidden");
    }
  }

  /**
   * Meta Webhook Payload (POST /whatsapp/webhook or /whatsapp/webhook/:shopId)
   */
  async handleWebhook(req, res) {
    try {
      const payload = req.body;
      if (!payload || payload.object !== "whatsapp_business_account") {
        return res.status(200).send("Ignored");
      }

      // Prefer phone number routing for message/call events, then fall back to WABA routing
      // for account, template, capability, and other management fields.
      const phoneNumberId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
      const wabaId = payload.entry?.[0]?.id;
      const tenant = phoneNumberId
        ? await getTenantByPhoneNumberId(phoneNumberId)
        : await prisma.waIntegration.findFirst({
            where: { businessAccountId: wabaId, status: "CONNECTED" },
            select: { shopId: true },
          });

      if (!tenant?.shopId) {
        console.warn(`[WhatsApp Controller] No shop resolved for webhook identity: ${phoneNumberId || wabaId || "unknown"}`);
        return res.status(200).send("Ignored"); // Return 200 so Meta doesn't retry
      }

      const shopId = tenant.shopId;

      // Validate HMAC signature
      const isValid = await this.#validateSignature(req, shopId);
      if (!isValid) {
        console.warn(`[WhatsApp Controller] Invalid signature for shop ${shopId}`);
        return res.status(401).send("Invalid signature");
      }

      const envelopes = await persistWebhookEnvelopes({
        payload,
        shopId,
        signatureVerified: true,
      });

      // Queue durable envelope IDs instead of transient request payloads.
      const jobs = envelopes
        .filter((envelope) => ["RECEIVED", "FAILED"].includes(envelope.processingStatus))
        .map((envelope) => ({
          name: "webhook-envelope",
          data: {
            envelopeId: envelope.id,
            shopId,
          },
          opts: {
            jobId: `wa-envelope-${envelope.id}-${envelope.attemptCount}`,
          },
        }));

      if (jobs.length > 0) {
        await inboundQueue.addBulk(jobs);
      }

      // Acknowledge immediately to Meta
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("[WhatsApp Controller] Webhook error:", error);
      res.status(500).json({ success: false });
    }
  }

  /**
   * Versioned, integration-scoped conversation list.
   */
  async getScopedConversations(req, res, next) {
    try {
      const { integration } = req.waScope;
      const limit = boundedLimit(req.query.limit);
      const cursor = decodeWhatsAppCursor(req.query.cursor, "conversation");
      const rows = await prisma.waConversation.findMany({
        where: {
          shopId: integration.shopId,
          ...(whatsappCursorWhere(cursor, "updatedAt") || {}),
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          messages: { take: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      res.json({
        success: true,
        data: {
          items,
          nextCursor: hasMore ? encodeWhatsAppCursor("conversation", items.at(-1)) : null,
          snapshotCursor: items[0] ? encodeWhatsAppCursor("conversation", items[0]) : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async createScopedConversation(req, res, next) {
    try {
      const { integration } = req.waScope;
      assertMatchingWhatsAppScope(req.body, {
        ...req.waScope,
        conversation: { id: undefined },
      });
      const conversation = await whatsappService.createConversation(
        integration.shopId,
        req.body,
        {
          integration,
          actorUserId: req.user.id,
          sourceDeviceId: req.body.sourceDeviceId,
        },
      );
      res.status(201).json({ success: true, data: { conversation } });
    } catch (error) {
      next(error);
    }
  }

  async getScopedMessages(req, res, next) {
    try {
      const { conversation } = req.waScope;
      const limit = boundedLimit(req.query.limit);
      const cursor = decodeWhatsAppCursor(req.query.cursor, "message");
      const rows = await prisma.waMessage.findMany({
        where: {
          conversationId: conversation.id,
          ...(whatsappCursorWhere(cursor, "createdAt") || {}),
        },
        include: { asset: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const serialized = await Promise.all(page.map(serializeMessageWithAsset));
      res.json({
        success: true,
        data: {
          items: serialized.reverse(),
          nextCursor: hasMore ? encodeWhatsAppCursor("message", page.at(-1)) : null,
          snapshotCursor: page[0] ? encodeWhatsAppCursor("message", page[0]) : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async sendScopedMessage(req, res, next) {
    try {
      const { integration, conversation } = req.waScope;
      assertMatchingWhatsAppScope(req.body, req.waScope);
      if (
        typeof req.body.clientMessageId !== "string"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.body.clientMessageId)
      ) {
        throw new ApiError(400, "A valid clientMessageId is required", {
          code: "INVALID_CLIENT_MESSAGE_ID",
        });
      }
      if (typeof req.body.sourceDeviceId !== "string" || !req.body.sourceDeviceId.trim()) {
        throw new ApiError(400, "sourceDeviceId is required", {
          code: "SOURCE_DEVICE_ID_REQUIRED",
        });
      }
      const expectedIdempotencyKey =
        `wa-send:${integration.shopId}:${integration.id}:${req.body.clientMessageId}`;
      if (req.get("Idempotency-Key") !== expectedIdempotencyKey) {
        throw new ApiError(400, "Invalid Idempotency-Key", {
          code: "INVALID_IDEMPOTENCY_KEY",
        });
      }
      const message = await whatsappService.sendMessage({
        shopId: integration.shopId,
        conversationId: conversation.id,
        to: conversation.phone,
        message: req.body.message,
        replyToMessageId: req.body.replyToMessageId,
        clientMessageId: req.body.clientMessageId,
        sourceDeviceId: req.body.sourceDeviceId,
        requestId: req.get("X-Request-Id") || crypto.randomUUID(),
        idempotencyKey: req.get("Idempotency-Key"),
        integrationId: integration.id,
        actorUserId: req.user.id,
      });
      res.status(202).json({ success: true, data: { message } });
    } catch (error) {
      next(error);
    }
  }

  async retryScopedMessage(req, res, next) {
    try {
      const { integration, message } = req.waScope;
      const updated = await whatsappService.retryMessage({
        shopId: integration.shopId,
        integrationId: integration.id,
        messageId: message.id,
        sourceDeviceId: req.body?.sourceDeviceId,
        requestId: req.get("X-Request-Id") || crypto.randomUUID(),
      });
      res.status(202).json({ success: true, data: { message: updated } });
    } catch (error) {
      next(error);
    }
  }

  async reactToScopedMessage(req, res, next) {
    try {
      const { integration, conversation, message } = req.waScope;
      const updated = await whatsappService.sendReaction(integration.shopId, {
        to: conversation.phone,
        messageId: message.id,
        emoji: req.body.emoji,
        sourceDeviceId: req.body.sourceDeviceId,
        actorUserId: req.user.id,
      });
      res.json({ success: true, data: { message: updated } });
    } catch (error) {
      next(error);
    }
  }

  async deleteScopedMessage(req, res, next) {
    try {
      const { integration, message } = req.waScope;
      const updated = await whatsappService.deleteMessage(integration.shopId, message.id, {
        integration,
        sourceDeviceId: req.body?.sourceDeviceId,
        actorUserId: req.user.id,
      });
      res.json({ success: true, data: { message: updated } });
    } catch (error) {
      next(error);
    }
  }

  async archiveScopedConversation(req, res, next) {
    try {
      const { integration, conversation } = req.waScope;
      const updated = await whatsappService.archiveConversation(
        integration.shopId,
        conversation.id,
        req.body.isArchived !== false,
        {
          integration,
          actorUserId: req.user.id,
          sourceDeviceId: req.body.sourceDeviceId,
        },
      );
      res.json({ success: true, data: { conversation: updated } });
    } catch (error) {
      next(error);
    }
  }

  async deleteScopedConversation(req, res, next) {
    try {
      const { integration, conversation } = req.waScope;
      await whatsappService.deleteConversation(integration.shopId, conversation.id, {
        integration,
        actorUserId: req.user.id,
        sourceDeviceId: req.body?.sourceDeviceId,
      });
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  }

  async markScopedConversationRead(req, res, next) {
    try {
      const { integration, conversation } = req.waScope;
      if (conversation.unreadCount === 0) {
        return res.json({ success: true, data: { conversation } });
      }
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.waConversation.update({
          where: { id: conversation.id },
          data: { unreadCount: 0, entityVersion: { increment: 1 } },
        });
        await enqueueWhatsAppDomainEvent(tx, {
          shopId: integration.shopId,
          integration,
          entity: "waConversation",
          entityId: row.id,
          entityVersion: row.entityVersion,
          action: "read",
          conversationId: row.id,
          actorUserId: req.user.id,
          sourceDeviceId: req.body?.sourceDeviceId,
          patch: { unreadCount: 0, entityVersion: row.entityVersion },
        });
        return row;
      });
      res.json({ success: true, data: { conversation: updated } });
    } catch (error) {
      next(error);
    }
  }

  async getScopedHealth(req, res, next) {
    try {
      const { integration } = req.waScope;
      res.json({
        success: true,
        data: {
          integration: {
            id: integration.id,
            shopId: integration.shopId,
            phoneNumberId: integration.phoneNumberId,
            phoneNumber: integration.phoneNumber,
            status: integration.status,
            callingEnabled: integration.callingEnabled,
            lastWebhookAt: integration.lastWebhookAt,
          },
          whatsappRuntimeConfig: {
            socketGraceMs: Math.max(
              0,
              Math.min(Number(process.env.WHATSAPP_SOCKET_GRACE_MS) || 3000, 30_000),
            ),
            notificationPreviewsDefault: false,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }


  async uploadMedia(req, res) {
    try {
      const result = await uploadWhatsAppMedia({
        shopId: req.shop.id,
        createdById: req.user.id,
        kind: req.body.kind,
        file: req.file,
        metadata: {
          width: req.body.width,
          height: req.body.height,
          durationMs: req.body.durationMs,
        },
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      const message = error.response?.data?.error?.message
        || error.issues?.[0]?.message
        || error.message;
      res.status(400).json({ success: false, message });
    }
  }

  async uploadTemplateExample(req, res) {
    try {
      const result = await uploadWhatsAppTemplateExample({
        shopId: req.shop.id,
        createdById: req.user.id,
        kind: req.body.kind,
        file: req.file,
        metadata: {
          width: req.body.width,
          height: req.body.height,
          durationMs: req.body.durationMs,
        },
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      const message = error.response?.data?.error?.message
        || error.issues?.[0]?.message
        || error.message;
      res.status(400).json({ success: false, message });
    }
  }

  /**
   * Sync Templates (POST /whatsapp/sync-templates)
   */
  async syncTemplates(req, res) {
    try {
      const result = await whatsappTemplateService.syncTemplates(req.shop.id);
      res.json({ success: true, data: result, message: `Synced ${result.count} templates` });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Synced Templates (GET /whatsapp/templates)
   */
  async getTemplates(req, res) {
    try {
      const result = await whatsappTemplateService.listTemplates(req.shop.id, req.query);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async getTemplate(req, res) {
    try {
      const template = await whatsappTemplateService.getTemplate(req.shop.id, req.params.id);
      res.json({ success: true, data: template });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async createTemplate(req, res) {
    try {
      const template = await whatsappTemplateService.createTemplate(req.shop.id, req.user.id, req.body);
      res.status(201).json({ success: true, data: template });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.response?.data?.error?.message || error.issues?.[0]?.message || error.message,
        details: error.issues || undefined,
      });
    }
  }

  async updateTemplate(req, res) {
    try {
      const template = await whatsappTemplateService.updateTemplate(
        req.shop.id,
        req.params.id,
        req.user.id,
        req.body,
      );
      res.json({ success: true, data: template });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.response?.data?.error?.message || error.issues?.[0]?.message || error.message,
      });
    }
  }

  async deleteTemplate(req, res) {
    try {
      const template = await whatsappTemplateService.deleteTemplate(req.shop.id, req.params.id);
      res.json({ success: true, data: template });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.response?.data?.error?.message || error.message,
      });
    }
  }

  async previewTemplate(req, res) {
    try {
      const template = await whatsappTemplateService.previewTemplate(req.shop.id, req.params.id, req.body);
      res.json({ success: true, data: template });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async sendTemplate(req, res) {
    try {
      const message = await whatsappTemplateService.compileTemplateMessage(
        req.shop.id,
        req.params.id,
        req.body,
      );
      const sent = await whatsappService.sendMessage({
        shopId: req.shop.id,
        conversationId: req.body.conversationId,
        to: req.body.to,
        message,
        replyToMessageId: req.body.replyToMessageId,
      });
      res.json({ success: true, data: sent });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getTemplateAttributes(req, res) {
    try {
      const attributes = await whatsappTemplateService.listAttributes(req.shop.id);
      res.json({ success: true, data: attributes });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async createTemplateAttribute(req, res) {
    try {
      const attribute = await whatsappTemplateService.createAttribute(req.shop.id, req.user.id, req.body);
      res.status(201).json({ success: true, data: attribute });
    } catch (error) {
      res.status(400).json({ success: false, message: error.issues?.[0]?.message || error.message });
    }
  }

  async updateTemplateAttribute(req, res) {
    try {
      const attribute = await whatsappTemplateService.updateAttribute(req.shop.id, req.params.id, req.body);
      res.json({ success: true, data: attribute });
    } catch (error) {
      res.status(400).json({ success: false, message: error.issues?.[0]?.message || error.message });
    }
  }

  async deleteTemplateAttribute(req, res) {
    try {
      const attribute = await whatsappTemplateService.deleteAttribute(req.shop.id, req.params.id);
      res.json({ success: true, data: attribute });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Sync Flows (POST /whatsapp/sync-flows)
   */
  async syncFlows(req, res) {
    try {
      const { shopId } = req.body;
      const count = await whatsappService.syncFlows(shopId);
      res.json({ success: true, message: `Synced ${count} flows` });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Sync Contacts (POST /whatsapp/sync-contacts)
   */
  async syncContacts(req, res) {
    try {
      const { shopId } = req.body;
      const count = await whatsappService.syncContactsWithConversations(shopId);
      res.json({ success: true, message: `Synced ${count} contacts` });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Setup (GET /whatsapp/setup)
   */
  async getSetup(req, res) {
    try {
      const { shopId } = req.query;
      if (!shopId) return res.status(400).json({ success: false, message: "shopId required" });

      const setup = await getPublicIntegration(shopId);

      res.json({ success: true, data: setup });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Save Setup (POST /whatsapp/setup)
   */
  async saveSetup(req, res) {
    try {
      const { shopId, verifyToken, accessToken, appSecret, businessAccountId, phoneNumberId, phoneNumber, businessName } = req.body;
      if (!shopId || !verifyToken || !accessToken || !businessAccountId || !phoneNumberId) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }

      const encryptedAccessToken = encrypt(accessToken);

      const setup = await prisma.waIntegration.upsert({
        where: { shopId },
        update: {
          verifyToken,
          accessToken: encryptedAccessToken,
          appSecret,
          businessAccountId,
          phoneNumberId,
          phoneNumber,
          businessName,
          status: "CONNECTED",
          connectedAt: new Date()
        },
        create: {
          shopId,
          verifyToken,
          accessToken: encryptedAccessToken,
          appSecret,
          businessAccountId,
          phoneNumberId,
          phoneNumber,
          businessName,
          status: "CONNECTED",
          connectedAt: new Date()
        }
      });

      // Generate RSA key pair if not already present
      if (!setup.rsaPublicKey) {
        await whatsappService.generateRsaKeyPair(shopId);
      }

      // Warm cache
      await invalidateWaCredentials(shopId);
      await getWaCredentials(shopId);

      const finalSetup = await getPublicIntegration(shopId);

      res.json({ success: true, data: finalSetup });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete Setup / Disconnect (DELETE /whatsapp/setup)
   */
  async deleteSetup(req, res) {
    try {
      const shopId = req.query.shopId || req.body.shopId;
      if (!shopId) return res.status(400).json({ success: false, message: "shopId is required" });

      await prisma.waIntegration.update({
        where: { shopId },
        data: {
          status: "DISCONNECTED",
          accessToken: "", // clear token for security
        }
      });

      // Warm cache after disconnecting
      await invalidateWaCredentials(shopId);

      res.json({ success: true, message: "WhatsApp integration disconnected successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }


  /**
   * List Broadcasts (GET /whatsapp/broadcasts)
   */
  async getBroadcasts(req, res) {
    try {
      const { shopId } = req.query;
      if (!shopId) return res.status(400).json({ success: false, message: "shopId required" });

      const broadcasts = await prisma.waBroadcast.findMany({
        where: { shopId },
        include: {
          template: { select: { name: true } }
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ success: true, data: broadcasts });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Create Broadcast Campaign (POST /whatsapp/broadcasts)
   */
  async createBroadcast(req, res) {
    try {
      const { shopId, name, templateId, templateVariables, audienceFilter } = req.body;
      const createdById = req.user?.id;

      if (!shopId || !name || !templateId) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }

      if (!createdById) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const broadcast = await whatsappBroadcastService.createBroadcast(shopId, {
        name,
        templateId,
        templateVariables,
        audienceFilter,
        createdById,
      });

      res.json({ success: true, data: broadcast });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Broadcast Stats & Info (GET /whatsapp/broadcasts/:id)
   */
  async getBroadcast(req, res) {
    try {
      const { id } = req.params;
      const stats = await whatsappBroadcastService.getBroadcastStats(id);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  /**
   * Dispatch Broadcast immediately (POST /whatsapp/broadcasts/:id/send)
   */
  async sendBroadcast(req, res) {
    try {
      const { id } = req.params;
      await whatsappBroadcastService.dispatchBroadcast(id);
      res.json({ success: true, message: "Broadcast dispatch started" });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Schedule Broadcast (POST /whatsapp/broadcasts/:id/schedule)
   */
  async scheduleBroadcast(req, res) {
    try {
      const { id } = req.params;
      const { scheduledAt } = req.body;

      if (!scheduledAt) {
        return res.status(400).json({ success: false, message: "scheduledAt required" });
      }

      const broadcast = await whatsappBroadcastService.scheduleBroadcast(id, scheduledAt);
      res.json({ success: true, data: broadcast });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Cancel Broadcast (DELETE /whatsapp/broadcasts/:id/cancel)
   */
  async cancelBroadcast(req, res) {
    try {
      const { id } = req.params;
      const broadcast = await whatsappBroadcastService.cancelBroadcast(id);
      res.json({ success: true, data: broadcast });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Broadcast Recipients list (GET /whatsapp/broadcasts/:id/recipients)
   */
  async getBroadcastRecipients(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50, page = 1 } = req.query;

      const recipients = await prisma.waBroadcastRecipient.findMany({
        where: { broadcastId: id },
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
        orderBy: { createdAt: "desc" },
      });

      res.json({ success: true, data: recipients });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async syncPhoneContacts(req, res) {
    try {
      const shopId = req.shop.id;
      const { mergeStrategy, contacts } = req.body;
      if (!Array.isArray(contacts)) {
        return res.status(400).json({ success: false, message: "shopId and contacts array are required" });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const result = await whatsappService.syncPhoneContacts(shopId, contacts, mergeStrategy, userId);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Rotate E2EE Keys (POST /whatsapp/rotate-keys)
   */
  async rotateKeys(req, res) {
    try {
      const { shopId } = req.body;
      if (!shopId) return res.status(400).json({ success: false, message: "shopId is required" });

      const updated = await whatsappService.generateRsaKeyPair(shopId);
      
      // Invalidate cache
      await invalidateWaCredentials(shopId);

      res.json({
        success: true,
        message: "E2EE RSA Key pair rotated successfully",
        data: {
          rsaPublicKey: updated.rsaPublicKey,
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export const whatsappController = new WhatsAppController();
