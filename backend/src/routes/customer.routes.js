import { Router } from "express";
import { z } from "zod";
import * as customerController from "../controllers/customer.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();
const idParams = z.object({ id: z.string().min(1) });

const listSchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
    search: z.string().optional(),
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional(),
});

const createSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    name: z.string().min(1),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    gstin: z.string().optional(),
    creditLimit: z.coerce.number().nonnegative().optional(),
    notes: z.string().optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const updateSchema = z.object({
  params: idParams,
  body: z.object({
    name: z.string().min(1).optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    gstin: z.string().nullable().optional(),
    creditLimit: z.coerce.number().nonnegative().nullable().optional(),
    notes: z.string().nullable().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  }),
  query: z.object({}).optional(),
});

router.use(requireAuth);

router.get("/", requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(listSchema), customerController.listCustomers);
router.get("/:id/sales", requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(z.object({ params: idParams, query: z.object({}).passthrough() })), customerController.listCustomerSales);
router.get("/:id/payments", requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(z.object({ params: idParams, query: z.object({}).passthrough() })), customerController.listCustomerPayments);
router.get("/:id/delivery-memos", requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(z.object({ params: idParams, query: z.object({}).passthrough() })), customerController.listCustomerDMs);
router.get("/:id/returns", requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(z.object({ params: idParams })), customerController.listCustomerReturns);
router.get("/:id/timeline", requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(z.object({ params: idParams })), customerController.getCustomerTimeline);
router.get("/:id/outstanding", requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(z.object({ params: idParams })), customerController.getOutstanding);
router.get(
  "/:id/price-history",
  requirePermission(PERMISSIONS.CUSTOMER_VIEW),
  validate(z.object({ params: idParams, query: z.object({ itemId: z.string().optional() }), body: z.object({}).optional() })),
  customerController.getPriceHistory,
);
router.get("/:id", requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(z.object({ params: idParams })), customerController.getCustomer);
router.post("/", requirePermission(PERMISSIONS.CUSTOMER_CREATE), validate(createSchema), customerController.createCustomer);
router.patch("/:id", requirePermission(PERMISSIONS.CUSTOMER_UPDATE), validate(updateSchema), customerController.updateCustomer);

export default router;
