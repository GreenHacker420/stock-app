import { Router } from "express";
import * as approvalController from "../controllers/approval.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireOwner } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

const router = Router();

router.use(requireAuth);

const querySchema = z.object({
  query: z.object({
    shopId: z.string().optional(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
    type: z.string().optional(),
  }),
});

const respondSchema = z.object({
  body: z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
    rejectedReason: z.string().optional(),
  }),
});

const bulkRespondSchema = z.object({
  body: z.object({
    ids: z.array(z.string().min(1)).min(1),
    status: z.enum(["APPROVED", "REJECTED"]),
    rejectedReason: z.string().optional(),
  }),
});

router.get("/", validate(querySchema), approvalController.listRequests);
router.post("/bulk-respond", requireOwner, validate(bulkRespondSchema), approvalController.bulkRespond);
router.get("/:id", approvalController.getRequest);
router.post("/:id/respond", requireOwner, validate(respondSchema), approvalController.respond);

export default router;
