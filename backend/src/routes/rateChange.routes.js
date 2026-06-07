import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";
import * as rateChangeService from "../services/rateChange.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

const createSchema = z.object({
  body: z.object({
    orderItemId: z.string().min(1),
    suggestedRate: z.coerce.number().positive(),
    reason: z.string().min(1),
  }),
});

const listSchema = z.object({
  query: z.object({
    shopId: z.string().optional(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
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
    const result = await rateChangeService.createRateChangeRequest(req.user, req.body);
    res.status(201).json({ success: true, data: result });
  })
);

router.get(
  "/",
  validate(listSchema),
  asyncHandler(async (req, res) => {
    const result = await rateChangeService.listRateChangeRequests(req.user, req.query);
    res.json({ success: true, data: result });
  })
);

router.post(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    const result = await rateChangeService.approveRateChangeRequest(req.user, req.params.id);
    res.json({ success: true, data: result });
  })
);

router.post(
  "/:id/reject",
  validate(respondSchema),
  asyncHandler(async (req, res) => {
    const reason = req.body?.reason || "Rejected by owner";
    const result = await rateChangeService.rejectRateChangeRequest(req.user, req.params.id, reason);
    res.json({ success: true, data: result });
  })
);

export default router;
