import { Router } from "express";
import { z } from "zod";
import * as itemController from "../controllers/item.controller.js";
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
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional(),
});

const categorySchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    name: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const createItemSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    name: z.string().min(1),
    sku: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    unit: z.string().min(1),
    defaultSellingPrice: z.coerce.number().nonnegative().optional(),
    minimumAllowedPrice: z.coerce.number().nonnegative().nullable().optional(),
    purchasePrice: z.coerce.number().nonnegative().nullable().optional(),
    mrp: z.coerce.number().nonnegative().nullable().optional(),
    minimumStock: z.coerce.number().nonnegative().optional(),
    imageUrl: z.url().nullable().optional(),
    initialStock: z.coerce.number().optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const updateItemSchema = z.object({
  params: idParams,
  body: createItemSchema.shape.body.partial().extend({
    adjustmentStock: z.coerce.number().optional(),
  }).omit({ shopId: true }),
  query: z.object({}).optional(),
});

router.use(requireAuth);

router.get("/", requirePermission(PERMISSIONS.ITEM_VIEW), validate(listSchema), itemController.listItems);
router.post("/categories", requirePermission(PERMISSIONS.ITEM_CREATE), validate(categorySchema), itemController.createCategory);
router.post("/", requirePermission(PERMISSIONS.ITEM_CREATE), validate(createItemSchema), itemController.createItem);
router.get("/:id/stock", requirePermission(PERMISSIONS.ITEM_VIEW), validate(z.object({ params: idParams })), itemController.getItemStock);
router.get(
  "/:id/price-history",
  requirePermission(PERMISSIONS.ITEM_VIEW),
  validate(z.object({ params: idParams, query: z.object({ customerId: z.string().optional() }), body: z.object({}).optional() })),
  itemController.getPriceHistory,
);
router.get(
  "/:id/price-change-history",
  requirePermission(PERMISSIONS.ITEM_VIEW),
  validate(z.object({ params: idParams })),
  itemController.getPriceChangeHistory,
);
router.get(
  "/:id/recent-rates",
  requirePermission(PERMISSIONS.ITEM_VIEW),
  validate(z.object({ params: idParams, query: z.object({ customerId: z.string().optional() }), body: z.object({}).optional() })),
  itemController.getRecentRates,
);
router.get(
  "/:id/customer-rate-suggestion",
  requirePermission(PERMISSIONS.ITEM_VIEW),
  validate(z.object({ params: idParams, query: z.object({ customerId: z.string().min(1) }), body: z.object({}).optional() })),
  itemController.getRateSuggestion,
);
router.patch("/:id", requirePermission(PERMISSIONS.ITEM_UPDATE), validate(updateItemSchema), itemController.updateItem);

export default router;
