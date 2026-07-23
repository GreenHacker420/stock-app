import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { whatsappController } from "../controllers/whatsapp.controller.js";
import { whatsappFlowEndpointController } from "../controllers/whatsapp.flow-endpoint.controller.js";
import { whatsappFlowController } from "../controllers/whatsapp.flow.controller.js";
import * as whatsappOnboardingController from "../controllers/whatsapp.onboarding.controller.js";
import { requireShopAccess } from "../middleware/shopAccess.middleware.js";
import {
  requireWhatsAppBroadcast,
  requireWhatsAppConversation,
  requireWhatsAppIntegration,
  requireWhatsAppMessage,
} from "../services/whatsapp.authorization.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import multer from "multer";

const router = Router();
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 100 * 1024 * 1024,
  },
});

router.get("/webhook", whatsappController.verifyWebhook);
router.post("/webhook", whatsappController.handleWebhook);

// Flows E2EE Endpoints (Public, called by Meta)
router.get("/flow-endpoint/:shopId", whatsappFlowEndpointController.verifyWebhook);
router.post("/flow-endpoint/:shopId", whatsappFlowEndpointController.handleFlowRequest);
router.get("/onboarding/launch/:sessionId", whatsappOnboardingController.launchSession);
router.post("/onboarding/sessions/:sessionId/complete", whatsappOnboardingController.completeSession);

// Protected UI routes
router.get(
  "/capability",
  requireAuth,
  requireShopAccess((req) => req.query.shopId),
  whatsappController.getCapability,
);
router.post(
  "/integrations/:integrationId/conversations",
  requireAuth,
  requireWhatsAppIntegration,
  whatsappController.createScopedConversation,
);
router.get(
  "/integrations/:integrationId/conversations",
  requireAuth,
  requireWhatsAppIntegration,
  whatsappController.getScopedConversations,
);
router.get(
  "/integrations/:integrationId/conversations/:conversationId/messages",
  requireAuth,
  requireWhatsAppConversation,
  whatsappController.getScopedMessages,
);
router.post(
  "/integrations/:integrationId/conversations/:conversationId/messages",
  requireAuth,
  requireWhatsAppConversation,
  whatsappController.sendScopedMessage,
);
router.post(
  "/integrations/:integrationId/messages/:messageId/reaction",
  requireAuth,
  requireWhatsAppMessage,
  whatsappController.reactToScopedMessage,
);
router.delete(
  "/integrations/:integrationId/messages/:messageId",
  requireAuth,
  requireWhatsAppMessage,
  whatsappController.deleteScopedMessage,
);
router.post(
  "/integrations/:integrationId/conversations/:conversationId/archive",
  requireAuth,
  requireWhatsAppConversation,
  whatsappController.archiveScopedConversation,
);
router.post(
  "/integrations/:integrationId/conversations/:conversationId/pin",
  requireAuth,
  requireWhatsAppConversation,
  whatsappController.pinScopedConversation,
);
router.post(
  "/integrations/:integrationId/conversations/:conversationId/mute",
  requireAuth,
  requireWhatsAppConversation,
  whatsappController.muteScopedConversation,
);
router.delete(
  "/integrations/:integrationId/conversations/:conversationId",
  requireAuth,
  requireWhatsAppConversation,
  whatsappController.deleteScopedConversation,
);
router.post(
  "/integrations/:integrationId/media",
  requireAuth,
  requireWhatsAppIntegration,
  mediaUpload.single("file"),
  whatsappController.uploadMedia,
);
router.post(
  "/integrations/:integrationId/contacts/sync",
  requireAuth,
  requireWhatsAppIntegration,
  whatsappController.syncPhoneContacts,
);
router.post(
  "/integrations/:integrationId/conversations/:conversationId/read",
  requireAuth,
  requireWhatsAppConversation,
  whatsappController.markScopedConversationRead,
);
router.post(
  "/integrations/:integrationId/messages/:messageId/retry",
  requireAuth,
  requireWhatsAppMessage,
  whatsappController.retryScopedMessage,
);
router.get(
  "/integrations/:integrationId/health",
  requireAuth,
  requireWhatsAppIntegration,
  whatsappController.getScopedHealth,
);
router.get(
  "/templates",
  requireAuth,
  requireShopAccess((req) => req.query.shopId),
  whatsappController.getTemplates,
);
router.get(
  "/templates/:id",
  requireAuth,
  requireShopAccess((req) => req.query.shopId),
  whatsappController.getTemplate,
);
router.post(
  "/templates/:id/preview",
  requireAuth,
  requireShopAccess((req) => req.body.shopId),
  whatsappController.previewTemplate,
);
router.post(
  "/templates/:id/send",
  requireAuth,
  requireShopAccess((req) => req.body.shopId),
  whatsappController.sendTemplate,
);
router.get(
  "/template-attributes",
  requireAuth,
  requireShopAccess((req) => req.query.shopId),
  whatsappController.getTemplateAttributes,
);
router.get(
  "/flows",
  requireAuth,
  requireShopAccess((req) => req.query.shopId),
  whatsappFlowController.list,
);
router.get(
  "/flows/:id",
  requireAuth,
  requireShopAccess((req) => req.query.shopId),
  whatsappFlowController.get,
);
router.get(
  "/flows/:id/executions",
  requireAuth,
  requireShopAccess((req) => req.query.shopId),
  whatsappFlowController.executions,
);
router.post(
  "/flows/:id/send",
  requireAuth,
  requireShopAccess((req) => req.body.shopId),
  whatsappFlowController.send,
);
router.post(
  "/template-media",
  requireAuth,
  requireShopAccess((req) => req.headers["x-shop-id"]),
  mediaUpload.single("file"),
  whatsappController.uploadTemplateExample,
);

// Use a simple middleware to check if user is OWNER instead of missing authorize
const requireOwner = (req, res, next) => {
  if (req.user?.role !== "OWNER") return res.status(403).json({ success: false, message: "Forbidden" });
  next();
};

const onboardingCreateSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    mode: z.enum(["CLOUD_API", "COEXISTENCE"]).optional().default("CLOUD_API"),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const onboardingSessionSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ sessionId: z.string().min(1) }),
  query: z.object({ shopId: z.string().min(1) }),
});

const onboardingContinueSchema = z.object({
  body: z.object({ shopId: z.string().min(1) }),
  params: z.object({ sessionId: z.string().min(1) }),
  query: z.object({}).optional(),
});

router.post(
  "/onboarding/sessions",
  requireAuth,
  requireOwner,
  validate(onboardingCreateSchema),
  requireShopAccess((req) => req.body.shopId),
  whatsappOnboardingController.createSession,
);
router.get(
  "/onboarding/sessions/:sessionId",
  requireAuth,
  requireOwner,
  validate(onboardingSessionSchema),
  requireShopAccess((req) => req.query.shopId),
  whatsappOnboardingController.getSession,
);
router.post(
  "/onboarding/sessions/:sessionId/continue",
  requireAuth,
  requireOwner,
  validate(onboardingContinueSchema),
  requireShopAccess((req) => req.body.shopId),
  whatsappOnboardingController.continueSession,
);

router.post(
  "/sync-templates",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappController.syncTemplates,
);
router.post(
  "/templates",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappController.createTemplate,
);
router.patch(
  "/templates/:id",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappController.updateTemplate,
);
router.delete(
  "/templates/:id",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.query.shopId),
  whatsappController.deleteTemplate,
);
router.post(
  "/template-attributes",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappController.createTemplateAttribute,
);
router.patch(
  "/template-attributes/:id",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappController.updateTemplateAttribute,
);
router.delete(
  "/template-attributes/:id",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.query.shopId),
  whatsappController.deleteTemplateAttribute,
);
router.post(
  "/sync-flows",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappFlowController.sync,
);
router.post(
  "/flows",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappFlowController.create,
);
router.patch(
  "/flows/:id/draft",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappFlowController.updateDraft,
);
router.post(
  "/flows/:id/validate",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappFlowController.validate,
);
router.post(
  "/flows/:id/deploy",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappFlowController.deploy,
);
router.post(
  "/flows/:id/preview",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappFlowController.preview,
);
router.post(
  "/flows/:id/publish",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappFlowController.publish,
);
router.post(
  "/flows/:id/deprecate",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappFlowController.deprecate,
);
router.delete(
  "/flows/:id",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.query.shopId),
  whatsappFlowController.remove,
);
router.post(
  "/flows/register-public-key",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappFlowController.registerPublicKey,
);
router.post(
  "/sync-contacts",
  requireAuth,
  requireOwner,
  requireShopAccess((req) => req.body.shopId),
  whatsappController.syncContacts,
);

router.get("/setup", requireAuth, requireOwner, requireShopAccess((req) => req.query.shopId), whatsappController.getSetup);
router.post("/setup", requireAuth, requireOwner, requireShopAccess((req) => req.body.shopId), whatsappController.saveSetup);
router.delete("/setup", requireAuth, requireOwner, requireShopAccess((req) => req.query.shopId || req.body.shopId), whatsappController.deleteSetup);
router.post("/rotate-keys", requireAuth, requireOwner, requireShopAccess((req) => req.body.shopId), whatsappController.rotateKeys);


// Campaign / Broadcast routes (Owner Only)
router.get("/broadcasts", requireAuth, requireOwner, requireShopAccess((req) => req.query.shopId), whatsappController.getBroadcasts);
router.post("/broadcasts", requireAuth, requireOwner, requireShopAccess((req) => req.body.shopId), whatsappController.createBroadcast);
router.get("/broadcasts/:id", requireAuth, requireOwner, requireWhatsAppBroadcast, whatsappController.getBroadcast);
router.post("/broadcasts/:id/send", requireAuth, requireOwner, requireWhatsAppBroadcast, whatsappController.sendBroadcast);
router.post("/broadcasts/:id/schedule", requireAuth, requireOwner, requireWhatsAppBroadcast, whatsappController.scheduleBroadcast);
router.post("/broadcasts/:id/cancel", requireAuth, requireOwner, requireWhatsAppBroadcast, whatsappController.cancelBroadcast);
router.get("/broadcasts/:id/recipients", requireAuth, requireOwner, requireWhatsAppBroadcast, whatsappController.getBroadcastRecipients);

export default router;
