import { Router } from "express";
import { z } from "zod";
import * as orderController from "../controllers/order.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireOwner, requirePermission } from "../middleware/rbac.middleware.js";
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

const orderItemSchema = z.object({
  itemId: z.string().min(1),
  quantityOrdered: z.coerce.number().positive(),
  rate: z.coerce.number().positive(),
  discountAmount: z.coerce.number().nonnegative().optional(),
  priceSource: z.string().optional(),
  lastCustomerRateSnapshot: z.coerce.number().nonnegative().optional(),
  recentRateSnapshot: z.any().optional(),
});

const createOrderSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    customerId: z.string().min(1),
    assignedStaffId: z.string().optional(),
    expectedDispatchDate: z.coerce.date().optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
    ownerNotes: z.string().optional(),
    items: z.array(orderItemSchema).min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const listSchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
    status: z.enum([
      "DRAFT",
      "CONFIRMED",
      "PACKING",
      "PARTIALLY_PACKED",
      "PACKED",
      "DISPATCHED",
      "CANCELLED",
    ]).optional(),
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional(),
});

const packedSchema = z.object({
  params: idParams,
  body: z.object({
    orderItemId: z.string().min(1),
    quantityPacked: z.coerce.number().positive(),
  }),
  query: z.object({}).optional(),
});

const shortageSchema = z.object({
  params: idParams,
  body: z.object({
    orderItemId: z.string().min(1),
    availableQuantity: z.coerce.number().nonnegative(),
    reason: z.string().min(1),
  }),
  query: z.object({}).optional(),
});

const dispatchItemSchema = z.object({
  orderItemId: z.string().min(1).optional(),
  itemId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  rate: z.coerce.number().positive(),
  discountAmount: z.coerce.number().nonnegative().optional(),
});

router.use(requireAuth);

router.get("/", requirePermission(PERMISSIONS.ORDER_VIEW_ASSIGNED), validate(listSchema), orderController.listOrders);
router.get("/:id", requirePermission(PERMISSIONS.ORDER_VIEW_ASSIGNED), validate(z.object({ params: idParams })), orderController.getOrder);
router.post("/", requirePermission(PERMISSIONS.ORDER_CREATE), validate(createOrderSchema), orderController.createOrder);
router.post("/:id/confirm", requireOwner, validate(z.object({ params: idParams })), orderController.confirmOrder);
router.post(
  "/:id/assign-staff",
  requirePermission(PERMISSIONS.ORDER_ASSIGN_STAFF),
  validate(z.object({ params: idParams, body: z.object({ staffId: z.string().min(1) }) })),
  orderController.assignStaff,
);
router.post("/:id/start-packing", requirePermission(PERMISSIONS.PACKING_UPDATE), validate(z.object({ params: idParams })), orderController.startPacking);
router.post("/:id/mark-item-packed", requirePermission(PERMISSIONS.PACKING_UPDATE), validate(packedSchema), orderController.markItemPacked);
router.post("/:id/report-shortage", requirePermission(PERMISSIONS.PACKING_UPDATE), validate(shortageSchema), orderController.reportShortage);
router.post(
  "/:id/add-payment",
  requirePermission(PERMISSIONS.PAYMENT_CREATE),
  validate(z.object({ params: idParams, body: z.object({ payments: z.array(paymentSchema).min(1) }) })),
  orderController.addPayment,
);
router.post(
  "/:id/create-dm",
  requirePermission(PERMISSIONS.DM_CREATE),
  validate(z.object({
    params: idParams,
    body: z.object({
      expectedPaymentDate: z.coerce.date().optional(),
      reason: z.string().optional(),
      items: z.array(dispatchItemSchema).optional(),
    }),
  })),
  orderController.createDmFromOrder,
);
router.post(
  "/:id/convert-to-sale",
  requirePermission(PERMISSIONS.SALE_CREATE),
  validate(z.object({
    params: idParams,
    body: z.object({
      dueDate: z.coerce.date().optional(),
      items: z.array(dispatchItemSchema).optional(),
      payments: z.array(paymentSchema).optional(),
    }),
  })),
  orderController.convertOrderToSale,
);

export default router;
