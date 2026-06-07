import { Router } from "express";
import { z } from "zod";
import * as customerController from "../controllers/customer.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();

router.use(requireAuth);

const querySchema = z.object({
  query: z.object({
    shopId: z.string(),
    search: z.string().optional(),
    type: z.enum(["WALK_IN", "REGULAR", "BUSINESS"]).optional(),
    includeWalkin: z.string().transform(v => v === "true").optional(),
  }),
});

const createSchema = z.object({
  body: z.object({
    shopId: z.string(),
    name: z.string().min(2),
    type: z.enum(["WALK_IN", "REGULAR", "BUSINESS"]).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    address: z.string().optional(),
    city: z.string().optional(),
    gstin: z.string().optional(),
    contactPerson: z.string().optional(),
    creditLimit: z.number().optional(),
    outstandingAmount: z.number().optional(),
    advanceBalance: z.number().optional(),
    notes: z.string().optional(),
  }),
});

const updateSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    type: z.enum(["WALK_IN", "REGULAR", "BUSINESS"]).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    address: z.string().optional(),
    city: z.string().optional(),
    gstin: z.string().optional(),
    contactPerson: z.string().optional(),
    creditLimit: z.number().optional(),
    notes: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  }),
});

router.get("/", requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(querySchema), customerController.listCustomers);
router.post("/", requirePermission(PERMISSIONS.CUSTOMER_CREATE), validate(createSchema), customerController.createCustomer);
router.get("/:id", requirePermission(PERMISSIONS.CUSTOMER_VIEW), customerController.getCustomer);
router.get("/:id/summary", requirePermission(PERMISSIONS.CUSTOMER_VIEW), customerController.getCustomerSummary);
router.get("/:id/outstanding", requirePermission(PERMISSIONS.CUSTOMER_VIEW), customerController.getOutstanding);
router.get("/:id/timeline", requirePermission(PERMISSIONS.CUSTOMER_VIEW), customerController.getTimeline);
router.get("/:id/sales", requirePermission(PERMISSIONS.CUSTOMER_VIEW), customerController.getSales);
router.get("/:id/payments", requirePermission(PERMISSIONS.CUSTOMER_VIEW), customerController.getPayments);
router.get("/:id/dms", requirePermission(PERMISSIONS.CUSTOMER_VIEW), customerController.getDMs);
router.get("/:id/price-history", requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(z.object({ query: z.object({ itemId: z.string().optional() }) })), customerController.getPriceHistory);
router.patch("/:id", requirePermission(PERMISSIONS.CUSTOMER_UPDATE), validate(updateSchema), customerController.updateCustomer);

export default router;
