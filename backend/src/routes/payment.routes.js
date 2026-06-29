import { Router } from "express";
import { z } from "zod";
import * as paymentController from "../controllers/payment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();
const idParams = z.object({ id: z.string().min(1) });

const paymentMode = z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"]);

const listSchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
    customerId: z.string().optional(),
    unlinked: z.string().transform(val => val === "true").or(z.boolean()).optional(),
    paymentMode: paymentMode.optional(),
    status: z.enum(["RECORDED", "VERIFIED", "REJECTED", "CANCELLED"]).optional(),
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional(),
});

const addSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    saleId: z.string().optional(),
    dmId: z.string().optional(),
    orderId: z.string().optional(),
    customerId: z.string().optional(),
    paymentMode,
    amount: z.coerce.number().positive("Payment amount must be greater than zero"),
    referenceNumber: z.string().optional(),
    proofImageUrl: z.string().optional(),
    notes: z.string().optional(),
    details: z.record(z.string(), z.any()).optional(),
  }).refine((data) => {
    const refs = [data.saleId, data.dmId, data.orderId].filter(Boolean);
    if (refs.length > 1) return false;
    return true;
  }, {
    message: "Target invoice references (saleId, dmId, orderId) are mutually exclusive.",
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const noteSchema = z.object({
  params: idParams,
  body: z.object({ note: z.string().optional() }).optional(),
  query: z.object({}).optional(),
});

const attachSchema = z.object({
  params: idParams,
  body: z.object({
    saleId: z.string().optional(),
    dmId: z.string().optional(),
    orderId: z.string().optional(),
  }).refine((data) => {
    const refs = [data.saleId, data.dmId, data.orderId].filter(Boolean);
    return refs.length === 1;
  }, {
    message: "Must provide exactly one target (saleId, dmId, or orderId)",
  }),
  query: z.object({}).optional(),
});

router.use(requireAuth);
router.get("/", requirePermission(PERMISSIONS.PAYMENT_VIEW_OWN), validate(listSchema), paymentController.listPayments);
router.get("/:id", requirePermission(PERMISSIONS.PAYMENT_VIEW_OWN), validate(z.object({ params: idParams })), paymentController.getPayment);
router.post("/", requirePermission(PERMISSIONS.PAYMENT_CREATE), validate(addSchema), paymentController.addPayment);
router.post("/:id/verify", requirePermission(PERMISSIONS.PAYMENT_VERIFY), validate(noteSchema), paymentController.verifyPayment);
router.post("/:id/mark-mismatch", requirePermission(PERMISSIONS.PAYMENT_VERIFY), validate(noteSchema), paymentController.markMismatch);
router.post("/:id/attach", requirePermission(PERMISSIONS.PAYMENT_CREATE), validate(attachSchema), paymentController.attachPayment);

export default router;
