import { Router } from "express";
import { z } from "zod";
import * as correctionRequestController from "../controllers/correctionRequest.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();
const idParams = z.object({ id: z.string().min(1) });

router.use(requireAuth);

router.post(
  "/",
  requirePermission(PERMISSIONS.CORRECTION_REQUEST),
  validate(z.object({
    body: z.object({
      entityType: z.enum(["SALE", "DM", "ORDER", "STOCK", "PAYMENT"]),
      entityId: z.string().min(1),
      requestedChangeJson: z.record(z.string(), z.any()),
      reason: z.string().min(1),
    }),
    params: z.object({}).optional(),
    query: z.object({}).optional(),
  })),
  correctionRequestController.createRequest,
);

router.get(
  "/",
  requirePermission(PERMISSIONS.CORRECTION_REQUEST),
  validate(z.object({
    query: z.object({
      shopId: z.string().optional(),
      status: z.enum(["PENDING", "APPROVED", "REJECTED", "APPLIED", "CANCELLED"]).optional(),
      entityType: z.enum(["SALE", "DM", "ORDER", "STOCK", "PAYMENT"]).optional(),
    }),
    params: z.object({}).optional(),
    body: z.object({}).optional(),
  })),
  correctionRequestController.listRequests,
);

router.post(
  "/:id/approve",
  requirePermission(PERMISSIONS.CORRECTION_APPROVE),
  validate(z.object({ params: idParams })),
  correctionRequestController.approveRequest,
);

router.post(
  "/:id/reject",
  requirePermission(PERMISSIONS.CORRECTION_APPROVE),
  validate(z.object({
    params: idParams,
    body: z.object({ reason: z.string().min(1) }),
    query: z.object({}).optional(),
  })),
  correctionRequestController.rejectRequest,
);

export default router;
