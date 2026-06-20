import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { whatsappController } from "../controllers/whatsapp.controller.js";
import { whatsappFlowEndpointController } from "../controllers/whatsapp.flow-endpoint.controller.js";
import { whatsappFlowController } from "../controllers/whatsapp.flow.controller.js";
import { requireShopAccess } from "../middleware/shopAccess.middleware.js";
import multer from "multer";

const router = Router();
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 100 * 1024 * 1024,
  },
});

// Public Webhook routes (called by Meta)
// shopId is passed as path param or query param for multi-tenancy
router.get("/webhook", whatsappController.verifyWebhook);
router.post("/webhook", whatsappController.handleWebhook);
router.get("/webhook/:shopId", whatsappController.verifyWebhook);
router.post("/webhook/:shopId", whatsappController.handleWebhook);

// Flows E2EE Endpoints (Public, called by Meta)
router.get("/flow-endpoint/:shopId", whatsappFlowEndpointController.verifyWebhook);
router.post("/flow-endpoint/:shopId", whatsappFlowEndpointController.handleFlowRequest);

// Protected UI routes
router.get("/conversations", requireAuth, whatsappController.getConversations);
router.get("/conversations/:id/messages", requireAuth, whatsappController.getMessages);
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
router.post("/messages", requireAuth, whatsappController.sendMessage);
router.post(
  "/media",
  requireAuth,
  requireShopAccess((req) => req.headers["x-shop-id"]),
  mediaUpload.single("file"),
  whatsappController.uploadMedia,
);
router.post(
  "/template-media",
  requireAuth,
  requireShopAccess((req) => req.headers["x-shop-id"]),
  mediaUpload.single("file"),
  whatsappController.uploadTemplateExample,
);
router.post("/react", requireAuth, whatsappController.reactToMessage);
router.delete("/messages/:id", requireAuth, whatsappController.deleteMessage);
router.post("/conversations/:id/archive", requireAuth, whatsappController.archiveConversation);
router.post("/conversations/:id/read", requireAuth, whatsappController.markConversationRead);
router.delete("/conversations/:id", requireAuth, whatsappController.deleteConversation);
router.post("/sync-phone-contacts", requireAuth, whatsappController.syncPhoneContacts);

// Use a simple middleware to check if user is OWNER instead of missing authorize
const requireOwner = (req, res, next) => {
  if (req.user?.role !== "OWNER") return res.status(403).json({ success: false, message: "Forbidden" });
  next();
};

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
router.post("/sync-contacts", requireAuth, requireOwner, whatsappController.syncContacts);

router.get("/setup", requireAuth, requireOwner, whatsappController.getSetup);
router.post("/setup", requireAuth, requireOwner, whatsappController.saveSetup);
router.delete("/setup", requireAuth, requireOwner, whatsappController.deleteSetup);
router.post("/fb-embedded-signup", requireAuth, requireOwner, whatsappController.fbEmbeddedSignup);
router.post("/rotate-keys", requireAuth, requireOwner, whatsappController.rotateKeys);


// Campaign / Broadcast routes (Owner Only)
router.get("/broadcasts", requireAuth, requireOwner, whatsappController.getBroadcasts);
router.post("/broadcasts", requireAuth, requireOwner, whatsappController.createBroadcast);
router.get("/broadcasts/:id", requireAuth, requireOwner, whatsappController.getBroadcast);
router.post("/broadcasts/:id/send", requireAuth, requireOwner, whatsappController.sendBroadcast);
router.post("/broadcasts/:id/schedule", requireAuth, requireOwner, whatsappController.scheduleBroadcast);
router.post("/broadcasts/:id/cancel", requireAuth, requireOwner, whatsappController.cancelBroadcast);
router.get("/broadcasts/:id/recipients", requireAuth, requireOwner, whatsappController.getBroadcastRecipients);

export default router;
