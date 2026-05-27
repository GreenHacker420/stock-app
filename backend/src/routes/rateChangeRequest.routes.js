import { Router } from "express";
import { z } from "zod";
import * as rateChangeRequestController from "../controllers/rateChangeRequest.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();
const idParams = z.object({ id: z.string().min(1) });

router.use(requireAuth);

router.post(
  "/",
  requirePermission(PERMISSIONS.RATE_CHANGE_REQUEST),
  validate(z.object({
    body: z.object({
      orderItemId: z.string().min(1),
      suggestedRate: z.coerce.number().positive(),
      reason: z.string().min(1),
    }),
    params: z.object({}).optional(),
    query: z.object({}).optional(),
  })),
  rateChangeRequestController.createRequest,
);

router.get(
  "/",
  requirePermission(PERMISSIONS.RATE_CHANGE_REQUEST),
  validate(z.object({
    query: z.object({
      shopId: z.string().optional(),
      status: z.enum(["PENDING", "APPROVED", "REJECTED", "APPLIED", "CANCELLED"]).optional(),
    }),
    params: z.object({}).optional(),
    body: z.object({}).optional(),
  })),
  rateChangeRequestController.listRequests,
);

router.post(
  "/:id/approve",
  requirePermission(PERMISSIONS.RATE_CHANGE_REVIEW),
  validate(z.object({ params: idParams })),
  rateChangeRequestController.approveRequest,
);

router.post(
  "/:id/reject",
  requirePermission(PERMISSIONS.RATE_CHANGE_REVIEW),
  validate(z.object({
    params: idParams,
    body: z.object({ reason: z.string().min(1) }),
    query: z.object({}).optional(),
  })),
  rateChangeRequestController.rejectRequest,
);

export default router;
