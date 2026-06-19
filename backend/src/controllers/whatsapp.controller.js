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
  uploadWhatsAppMedia,
} from "../services/whatsapp.media.service.js";

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
   * List Conversations (GET /whatsapp/conversations)
   */
  async getConversations(req, res) {
    try {
      const { shopId } = req.query;
      if (!shopId) return res.status(400).json({ success: false, message: "shopId required" });

      const conversations = await prisma.waConversation.findMany({
        where: { shopId },
        include: {
          customer: {
            select: { id: true, name: true, phone: true }
          },
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" }
          }
        },
        orderBy: { updatedAt: "desc" }
      });

      res.json({ success: true, data: conversations });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Message History (GET /whatsapp/conversations/:id/messages)
   */
  async getMessages(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50, cursor } = req.query;

      const messages = await prisma.waMessage.findMany({
        where: { conversationId: id },
        include: { asset: true },
        take: Number(limit),
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: "desc" }
      });

      const messagesWithAssets = await Promise.all(messages.map(serializeMessageWithAsset));

      res.json({ success: true, data: messagesWithAssets.reverse() });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Send Message (POST /whatsapp/messages)
   */
  async sendMessage(req, res) {
    try {
      const { shopId, to } = req.body;
      if (!shopId || !to || !req.body.message) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }

      const message = await whatsappService.sendMessage(req.body);

      res.json({ success: true, data: message });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.issues?.[0]?.message || error.message,
        details: error.issues || undefined,
      });
    }
  }

  /**
   * Upload Media (POST /whatsapp/media)
   */
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

  /**
   * Sync Templates (POST /whatsapp/sync-templates)
   */
  async syncTemplates(req, res) {
    try {
      const { shopId } = req.body;
      const count = await whatsappService.syncTemplates(shopId);
      res.json({ success: true, message: `Synced ${count} templates` });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Synced Templates (GET /whatsapp/templates)
   */
  async getTemplates(req, res) {
    try {
      const { shopId } = req.query;
      if (!shopId) return res.status(400).json({ success: false, message: "shopId is required" });
      const templates = await prisma.waTemplate.findMany({
        where: { shopId, status: "APPROVED" },
        orderBy: { name: "asc" }
      });
      res.json({ success: true, data: templates });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
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

  //  Facebook Embedded Signup (POST /whatsapp/fb-embedded-signup)

  async fbEmbeddedSignup(req, res) {
    try {
      const { code, shopId, redirectUri } = req.body;
      if (!code || !shopId) {
        return res.status(400).json({ success: false, message: "Code and shopId are required" });
      }

      // 1. OAuth Exchange
      // Note: This requires WHATSAPP_APP_ID and WHATSAPP_APP_SECRET in .env
      const tokenResponse = await axios.get(`https://graph.facebook.com/v25.0/oauth/access_token`, {
        params: {
          client_id: process.env.WHATSAPP_APP_ID,
          client_secret: process.env.WHATSAPP_APP_SECRET,
          code,
          redirect_uri: redirectUri,
        }
      });
      
      const shortAccessToken = tokenResponse.data.access_token;

      // Exchange short-lived token for long-lived token
      const longLivedResponse = await axios.get(`https://graph.facebook.com/v25.0/oauth/access_token`, {
        params: {
          grant_type: "fb_exchange_token",
          client_id: process.env.WHATSAPP_APP_ID,
          client_secret: process.env.WHATSAPP_APP_SECRET,
          fb_exchange_token: shortAccessToken,
        }
      });

      const accessToken = longLivedResponse.data.access_token;

      // 2. Debug Token to get WABA ID
      const debugResponse = await axios.get(`https://graph.facebook.com/v25.0/debug_token`, {
        params: {
          input_token: accessToken,
          access_token: `${process.env.WHATSAPP_APP_ID}|${process.env.WHATSAPP_APP_SECRET}`
        }
      });

      const userWaBid = debugResponse.data.data.granular_scopes?.find(s => s.scope === "whatsapp_business_management")?.target_ids?.[0] || debugResponse.data.data.business_id || debugResponse.data.data.target_id;
      
      if (!userWaBid) {
        return res.status(400).json({ success: false, message: "WhatsApp Business Account not found in token scopes" });
      }

      // 3 & 4. App Subscription & Callback URL Override
      const verifyToken = crypto.randomBytes(16).toString("hex");
      const host = req.get("host");
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const overrideCallbackUri = process.env.BACKEND_URL 
        ? `${process.env.BACKEND_URL}/whatsapp/webhook`
        : `${protocol}://${host}/whatsapp/webhook`;

      await axios.post(`https://graph.facebook.com/v25.0/${userWaBid}/subscribed_apps`, {
        override_callback_uri: overrideCallbackUri,
        verify_token: verifyToken
      }, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      // 5. Get Phone Numbers & Register with a system-generated 6-digit PIN
      const phonesResponse = await axios.get(`https://graph.facebook.com/v25.0/${userWaBid}/phone_numbers`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const phoneData = phonesResponse.data.data?.[0];
      if (!phoneData) {
        return res.status(400).json({ success: false, message: "No phone numbers found for this WABA" });
      }

      const phoneNumberId = phoneData.id;
      const pin = Math.floor(100000 + Math.random() * 900000).toString();

      await axios.post(`https://graph.facebook.com/v25.0/${phoneNumberId}/register`, {
        messaging_product: "whatsapp",
        pin
      }, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      // 6. Integration Upsert
      const encryptedAccessToken = encrypt(accessToken);

      const setup = await prisma.waIntegration.upsert({
        where: { shopId },
        update: {
          verifyToken,
          accessToken: encryptedAccessToken,
          appSecret: process.env.WHATSAPP_APP_SECRET || null,
          businessAccountId: userWaBid,
          phoneNumberId,
          phoneNumber: phoneData.display_phone_number,
          businessName: phoneData.verified_name,
          status: "CONNECTED",
          connectedAt: new Date()
        },
        create: {
          shopId,
          verifyToken,
          accessToken: encryptedAccessToken,
          appSecret: process.env.WHATSAPP_APP_SECRET || null,
          businessAccountId: userWaBid,
          phoneNumberId,
          phoneNumber: phoneData.display_phone_number,
          businessName: phoneData.verified_name,
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
      console.error("Embedded Signup Error:", error.response?.data || error.message);
      res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message });
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
   * React to Message (POST /whatsapp/react)
   */
  async reactToMessage(req, res) {
    try {
      const { shopId, to, messageId, emoji } = req.body;
      if (!shopId || !to || !messageId) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }
      const message = await whatsappService.sendReaction(shopId, { to, messageId, emoji });
      res.json({ success: true, data: message });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete Message (DELETE /whatsapp/messages/:id)
   */
  async deleteMessage(req, res) {
    try {
      const { id } = req.params;
      const { shopId } = req.query;
      if (!shopId) {
        return res.status(400).json({ success: false, message: "shopId query parameter is required" });
      }
      const message = await whatsappService.deleteMessage(shopId, id);
      res.json({ success: true, data: message });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Archive Conversation (POST /whatsapp/conversations/:id/archive)
   */
  async archiveConversation(req, res) {
    try {
      const { id } = req.params;
      const { shopId, isArchived } = req.body;
      if (!shopId) {
        return res.status(400).json({ success: false, message: "shopId is required" });
      }
      const isArchivedBool = isArchived !== undefined ? Boolean(isArchived) : true;
      const conversation = await whatsappService.archiveConversation(shopId, id, isArchivedBool);
      res.json({ success: true, data: conversation });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Mark Conversation as Read (POST /whatsapp/conversations/:id/read)
   */
  async markConversationRead(req, res) {
    try {
      const { id } = req.params;
      const { shopId } = req.body;
      if (!shopId) {
        return res.status(400).json({ success: false, message: "shopId is required" });
      }
      const conversation = await prisma.waConversation.update({
        where: { id, shopId },
        data: { unreadCount: 0 }
      });
      res.json({ success: true, data: conversation });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete Conversation (DELETE /whatsapp/conversations/:id)
   */
  async deleteConversation(req, res) {
    try {
      const { id } = req.params;
      const { shopId } = req.query;
      if (!shopId) {
        return res.status(400).json({ success: false, message: "shopId query parameter is required" });
      }
      const result = await whatsappService.deleteConversation(shopId, id);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
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

  /**
   * Sync Phone Contacts (POST /whatsapp/sync-phone-contacts)
   */
  async syncPhoneContacts(req, res) {
    try {
      const { shopId, mergeStrategy, contacts } = req.body;
      if (!shopId || !Array.isArray(contacts)) {
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
