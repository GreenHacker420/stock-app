import { Router } from "express";
import { z } from "zod";
import * as deliveryMemoController from "../controllers/deliveryMemo.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();
const idParams = z.object({ id: z.string().min(1) });

const paymentSchema = z.object({
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"]),
  amount: z.coerce.number().positive(),
  referenceNumber: z.string().optional(),
  proofImageUrl: z.string().optional(),
  notes: z.string().optional(),
  details: z.record(z.string(), z.any()).optional(),
});

const itemSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  rate: z.coerce.number().positive(),
  discountAmount: z.coerce.number().nonnegative().optional(),
});

const createSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    customerId: z.string().optional(),
    customerName: z.string().min(1),
    customerPhone: z.string().optional(),
    customerAddress: z.string().optional(),
    expectedPaymentDate: z.coerce.date().optional(),
    reason: z.string().optional(),
    items: z.array(itemSchema).min(1),
    payments: z.array(paymentSchema).optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const listSchema = z.object({
  query: z.object({ shopId: z.string().min(1) }),
  params: z.object({}).optional(),
  body: z.object({}).optional(),
});

router.use(requireAuth);
router.get("/", requirePermission(PERMISSIONS.DM_VIEW_OWN), validate(listSchema), deliveryMemoController.listDeliveryMemos);
router.get("/:id", requirePermission(PERMISSIONS.DM_VIEW_OWN), validate(z.object({ params: idParams })), deliveryMemoController.getDeliveryMemo);
router.post("/", requirePermission(PERMISSIONS.DM_CREATE), validate(createSchema), deliveryMemoController.createDeliveryMemo);

export default router;
