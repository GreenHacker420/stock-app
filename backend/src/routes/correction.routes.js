import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";
import * as correctionService from "../services/correction.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

const createSchema = z.object({
  body: z.object({
    entityType: z.enum(["SALE", "DM", "ORDER", "STOCK", "PAYMENT"]),
    entityId: z.string().min(1),
    requestedChangeJson: z.record(z.string(), z.any()),
    reason: z.string().min(1),
  }),
});

const listSchema = z.object({
  query: z.object({
    shopId: z.string().optional(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
    entityType: z.enum(["SALE", "DM", "ORDER", "STOCK", "PAYMENT"]).optional(),
  }),
});

const respondSchema = z.object({
  body: z.object({
    reason: z.string().optional(),
  }).optional(),
});

router.use(requireAuth);

router.post(
  "/",
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const result = await correctionService.createCorrectionRequest(req.user, req.body);
    res.status(201).json({ success: true, data: result });
  })
);

router.get(
  "/",
  validate(listSchema),
  asyncHandler(async (req, res) => {
    const result = await correctionService.listCorrectionRequests(req.user, req.query);
    res.json({ success: true, data: result });
  })
);

router.post(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    const result = await correctionService.approveCorrectionRequest(req.user, req.params.id);
    res.json({ success: true, data: result });
  })
);

router.post(
  "/:id/reject",
  validate(respondSchema),
  asyncHandler(async (req, res) => {
    const reason = req.body?.reason || "Rejected by owner";
    const result = await correctionService.rejectCorrectionRequest(req.user, req.params.id, reason);
    res.json({ success: true, data: result });
  })
);

export default router;
