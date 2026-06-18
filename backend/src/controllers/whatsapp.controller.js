import crypto from "crypto";
import { whatsappService } from "../services/whatsapp.service.js";
import { parseWebhookPayload, processWhatsAppEvent } from "../services/whatsapp.processor.js";
import prisma from "../lib/db.js";

class WhatsAppController {
  //  Validates Meta Webhook Signature using shop-specific App Secret.

  async #validateSignature(req, shopId) {
    const signature = req.headers["x-hub-signature-256"];
    if (!signature) return false;

    const integration = await prisma.waIntegration.findUnique({
      where: { shopId },
      select: { appSecret: true }
    });

    const secret = integration?.appSecret || process.env.WHATSAPP_APP_SECRET;
    if (!secret) {
      console.warn(`No App Secret found for shop ${shopId}, skipping validation`);
      return true; 
    }

    const [algo, hash] = signature.split("=");
    if (algo !== "sha256") return false;

    const rawBody = req.rawBody || JSON.stringify(req.body);
    const expectedHash = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
  }

  /**
   * Meta Webhook Verification (GET /whatsapp/webhook/:shopId)
   */
  async verifyWebhook(req, res) {
    try {
      const { shopId } = req.params;
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      const result = await whatsappService.verifyWebhook(shopId, mode, token, challenge);
      res.status(200).send(result);
    } catch (error) {
      res.status(403).send("Forbidden");
    }
  }

  //  Meta Webhook Payload (POST /whatsapp/webhook/:shopId)

  async handleWebhook(req, res) {
    try {
      const { shopId } = req.params;
      if (!shopId) return res.status(400).send("shopId missing");

      // 1. Validate Signature
      const isValid = await this.#validateSignature(req, shopId);
      if (!isValid) {
        console.warn(`Invalid signature for shop ${shopId}`);
        // return res.status(401).send("Invalid signature");
      }

      const payload = req.body;
      const io = req.app.get("io");

      const events = parseWebhookPayload(payload);

      for (const event of events) {
        await processWhatsAppEvent(event, shopId, io);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(200).json({ success: true }); 
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
        take: Number(limit),
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: "desc" }
      });

      res.json({ success: true, data: messages.reverse() });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Send Message (POST /whatsapp/send)
   */
  async sendMessage(req, res) {
    try {
      const { shopId, conversationId, to, type, content, template, mediaUrl } = req.body;

      if (!shopId || !to || !type) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }

      const message = await whatsappService.sendMessage(shopId, {
        conversationId,
        to,
        type,
        content,
        template,
        mediaUrl
      });

      res.json({ success: true, data: message });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
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
      const { code, shopId } = req.body;
      if (!code || !shopId) {
        return res.status(400).json({ success: false, message: "Code and shopId are required" });
      }

      // 1. Exchange code for access token using Tech Provider credentials
      // Note: This requires WHATSAPP_APP_ID and WHATSAPP_APP_SECRET in .env
      const tokenResponse = await axios.get(`https://graph.facebook.com/v25.0/oauth/access_token`, {
        params: {
          client_id: process.env.WHATSAPP_APP_ID,
          client_secret: process.env.WHATSAPP_APP_SECRET,
          code,
        }
      });
      
      const accessToken = tokenResponse.data.access_token;

      // 2. Debug token to get WABA ID
      const debugResponse = await axios.get(`https://graph.facebook.com/v25.0/debug_token`, {
        params: {
          input_token: accessToken,
          access_token: `${process.env.WHATSAPP_APP_ID}|${process.env.WHATSAPP_APP_SECRET}`
        }
      });

      const userWaBid = debugResponse.data.data.granular_scopes?.find(s => s.scope === "whatsapp_business_management")?.target_ids?.[0];
      
      if (!userWaBid) {
        return res.status(400).json({ success: false, message: "WhatsApp Business Account not found in token scopes" });
      }

      // 3. Get Phone Numbers for the WABA
      const phonesResponse = await axios.get(`https://graph.facebook.com/v25.0/${userWaBid}/phone_numbers`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const phoneData = phonesResponse.data.data?.[0];
      if (!phoneData) {
        return res.status(400).json({ success: false, message: "No phone numbers found for this WABA" });
      }

      const verifyToken = Math.random().toString(36).substring(7);

      // 4. Save to Database
      const setup = await prisma.waIntegration.upsert({
        where: { shopId },
        update: {
          verifyToken,
          accessToken,
          businessAccountId: userWaBid,
          phoneNumberId: phoneData.id,
          phoneNumber: phoneData.display_phone_number,
          businessName: phoneData.verified_name,
          status: "CONNECTED"
        },
        create: {
          shopId,
          verifyToken,
          accessToken,
          businessAccountId: userWaBid,
          phoneNumberId: phoneData.id,
          phoneNumber: phoneData.display_phone_number,
          businessName: phoneData.verified_name,
          status: "CONNECTED"
        }
      });

      // Optional: Subscribe the app to the WABA webhooks
      try {
        await axios.post(`https://graph.facebook.com/v25.0/${userWaBid}/subscribed_apps`, {}, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      } catch (subErr) {
        console.warn("Failed to automatically subscribe app to WABA webhooks. May require Tech Provider system user token.", subErr.response?.data);
      }

      res.json({ success: true, data: setup });
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

      const setup = await prisma.waIntegration.findUnique({
        where: { shopId }
      });

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

      const setup = await prisma.waIntegration.upsert({
        where: { shopId },
        update: {
          verifyToken,
          accessToken,
          appSecret,
          businessAccountId,
          phoneNumberId,
          phoneNumber,
          businessName,
          status: "CONNECTED" // Assuming they are testing/connecting
        },
        create: {
          shopId,
          verifyToken,
          accessToken,
          appSecret,
          businessAccountId,
          phoneNumberId,
          phoneNumber,
          businessName,
          status: "CONNECTED"
        }
      });

      res.json({ success: true, data: setup });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export const whatsappController = new WhatsAppController();
