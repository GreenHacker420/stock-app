import { Router } from "express";
import { z } from "zod";
import * as verificationQueueController from "../controllers/verificationQueue.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireOwner } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const querySchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
  }),
});

const processSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
    notes: z.string().optional(),
  }),
});

router.use(requireAuth);
router.use(requireOwner);

router.get("/pending", validate(querySchema), verificationQueueController.listPendingVerifications);
router.post("/:id/process", validate(processSchema), verificationQueueController.processVerification);

export default router;
