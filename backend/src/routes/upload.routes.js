import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";
import {
  createPresignedUploadIntent,
  completeUploadIntent,
  getAssetDownloadUrl,
  requestAssetDeletion,
} from "../services/upload.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

const ASSET_DOMAINS = [
  "PRODUCT", "CUSTOMER_LEDGER", "PAYMENT", "EXPENSE",
  "DISPATCH", "WHATSAPP", "SALE_INVOICE", "DAILY_SUMMARY", "OTHER",
];

const intentSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    domain: z.enum(ASSET_DOMAINS),
    kind: z.enum(["IMAGE", "DOC", "VIDEO", "AUDIO"]).optional(),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
    checksumSha256: z.hash("sha256", { error: "checksumSha256 must be a 64-char hex SHA-256" }),
  }),
});

const completeSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
  }),
});

const downloadSchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
  }),
});

const deleteRequestSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    reason: z.string().max(500).optional(),
  }),
});

router.post(
  "/upload-intents",
  validate(intentSchema),
  asyncHandler(async (req, res) => {
    const result = await createPresignedUploadIntent(req.user, req.validated.body);
    res.json({ success: true, data: result });
  })
);

router.post(
  "/:id/complete",
  validate(completeSchema),
  asyncHandler(async (req, res) => {
    const result = await completeUploadIntent(req.user, {
      assetId: req.params.id,
      shopId: req.validated.body.shopId,
    });
    res.json({ success: true, data: result });
  })
);

router.get(
  "/:id/download-url",
  validate(downloadSchema),
  asyncHandler(async (req, res) => {
    const result = await getAssetDownloadUrl(req.user, {
      assetId: req.params.id,
      shopId: req.validated.query.shopId,
    });
    res.json({ success: true, data: result });
  })
);

router.post(
  "/:id/delete-request",
  validate(deleteRequestSchema),
  asyncHandler(async (req, res) => {
    const result = await requestAssetDeletion(req.user, {
      assetId: req.params.id,
      shopId: req.validated.body.shopId,
      reason: req.validated.body.reason,
    });
    res.json({ success: true, data: result });
  })
);

export default router;
