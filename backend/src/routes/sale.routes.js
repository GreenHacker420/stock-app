import { Router } from "express";
import { z } from "zod";
import * as saleController from "../controllers/sale.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();
const idParams = z.object({ id: z.string().min(1) });

const paymentSchema = z.object({
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"]),
  amount: z.coerce.number().nonnegative(),
  referenceNumber: z.string().optional(),
  proofImageUrl: z.string().optional(),
  notes: z.string().optional(),
  details: z.record(z.string(), z.any()).optional(),
});

const saleItemSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number().nonnegative(),
  rate: z.coerce.number().nonnegative(),
  discountAmount: z.coerce.number().nonnegative().optional(),
  serialNumbers: z.array(z.string()).optional(),
  description: z.string().optional(),
});

const customerInfoSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.email().optional().or(z.literal("")),
});

const createSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    customerId: z.string().optional(),
    customerInfo: customerInfoSchema.optional(),
    isWalkin: z.boolean().optional(),
    dueDate: z.coerce.date().optional(),
    items: z.array(saleItemSchema).min(1),
    payments: z.array(paymentSchema).optional(),
    customerSignature: z.string().optional(),
    gstRequired: z.boolean().optional(),
    notes: z.string().optional(),
  }),
});

const listSchema = z.object({
  query: z.object({ 
    shopId: z.string().min(1),
    customerId: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  }),
});

const updateSaleSchema = z.object({
  params: idParams,
  body: z.object({
    gstRequired: z.boolean().optional(),
    gstInvoiceNumber: z.string().nullable().optional(),
    notes: z.string().optional(),
    items: z.array(saleItemSchema).optional(),
    discountAmount: z.coerce.number().nonnegative().optional(),
  }),
});

router.use(requireAuth);
router.get("/", requirePermission(PERMISSIONS.SALE_VIEW_OWN), validate(listSchema), saleController.listSales);
router.get("/:id", requirePermission(PERMISSIONS.SALE_VIEW_OWN), validate(z.object({ params: idParams })), saleController.getSale);
router.post("/", requirePermission(PERMISSIONS.SALE_CREATE), validate(createSchema), saleController.createSale);
router.patch("/:id", requirePermission(PERMISSIONS.SALE_CREATE), validate(updateSaleSchema), saleController.updateSale);
router.patch("/:id/gst", requirePermission(PERMISSIONS.SALE_VIEW_ALL), validate(z.object({ params: idParams, body: z.object({ gstRequired: z.boolean().optional(), gstInvoiceNumber: z.string().nullable().optional() }) })), saleController.updateGstInvoice);

export default router;
