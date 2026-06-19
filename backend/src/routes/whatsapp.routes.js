import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { whatsappController } from "../controllers/whatsapp.controller.js";

const router = Router();

// Public Webhook routes (called by Meta)
// shopId is passed as path param or query param for multi-tenancy
router.get("/webhook", whatsappController.verifyWebhook);
router.post("/webhook", whatsappController.handleWebhook);
router.get("/webhook/:shopId", whatsappController.verifyWebhook);
router.post("/webhook/:shopId", whatsappController.handleWebhook);

// Protected UI routes
router.get("/conversations", requireAuth, whatsappController.getConversations);
router.get("/conversations/:id/messages", requireAuth, whatsappController.getMessages);
router.post("/send", requireAuth, whatsappController.sendMessage);
router.post("/react", requireAuth, whatsappController.reactToMessage);
router.delete("/messages/:id", requireAuth, whatsappController.deleteMessage);
router.post("/conversations/:id/archive", requireAuth, whatsappController.archiveConversation);
router.delete("/conversations/:id", requireAuth, whatsappController.deleteConversation);

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
router.post("/fb-embedded-signup", requireAuth, requireOwner, whatsappController.fbEmbeddedSignup);

// Campaign / Broadcast routes (Owner Only)
router.get("/broadcasts", requireAuth, requireOwner, whatsappController.getBroadcasts);
router.post("/broadcasts", requireAuth, requireOwner, whatsappController.createBroadcast);
router.get("/broadcasts/:id", requireAuth, requireOwner, whatsappController.getBroadcast);
router.post("/broadcasts/:id/send", requireAuth, requireOwner, whatsappController.sendBroadcast);
router.post("/broadcasts/:id/schedule", requireAuth, requireOwner, whatsappController.scheduleBroadcast);
router.post("/broadcasts/:id/cancel", requireAuth, requireOwner, whatsappController.cancelBroadcast);
router.get("/broadcasts/:id/recipients", requireAuth, requireOwner, whatsappController.getBroadcastRecipients);

export default router;
