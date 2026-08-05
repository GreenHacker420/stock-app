import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";
import { createPresignedUploadIntent, completeUploadIntent } from "../services/upload.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

const intentSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    domain: z.enum(["PRODUCT", "CUSTOMER_LEDGER", "PAYMENT", "EXPENSE", "DISPATCH", "WHATSAPP", "SALE_INVOICE", "DAILY_SUMMARY", "OTHER"]).optional(),
    kind: z.enum(["IMAGE", "DOC", "VIDEO", "AUDIO"]).optional(),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().optional(),
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
  asyncHandler(async (req, res) => {
    const { shopId } = req.body;
    const result = await completeUploadIntent(req.user, { assetId: req.params.id, shopId });
    res.json({ success: true, data: result });
  })
);

export default router;
