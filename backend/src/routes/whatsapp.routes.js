import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { whatsappController } from "../controllers/whatsapp.controller.js";
import { whatsappFlowEndpointController } from "../controllers/whatsapp.flow-endpoint.controller.js";
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
router.get("/templates", requireAuth, whatsappController.getTemplates);
router.post("/messages", requireAuth, whatsappController.sendMessage);
router.post(
  "/media",
  requireAuth,
  requireShopAccess((req) => req.headers["x-shop-id"]),
  mediaUpload.single("file"),
  whatsappController.uploadMedia,
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

router.post("/sync-templates", requireAuth, requireOwner, whatsappController.syncTemplates);
router.post("/sync-flows", requireAuth, requireOwner, whatsappController.syncFlows);
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
