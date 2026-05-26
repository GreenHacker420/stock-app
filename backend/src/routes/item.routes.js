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
    sku: z.string().optional(),
    categoryId: z.string().optional(),
    unit: z.string().min(1),
    defaultSellingPrice: z.coerce.number().nonnegative().optional(),
    minimumAllowedPrice: z.coerce.number().nonnegative().optional(),
    purchasePrice: z.coerce.number().nonnegative().optional(),
    mrp: z.coerce.number().nonnegative().optional(),
    minimumStock: z.coerce.number().nonnegative().optional(),
    imageUrl: z.string().url().optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const updateItemSchema = z.object({
  params: idParams,
  body: createItemSchema.shape.body.partial().omit({ shopId: true }),
  query: z.object({}).optional(),
});

router.use(requireAuth);

router.get("/", requirePermission(PERMISSIONS.ITEM_VIEW), validate(listSchema), itemController.listItems);
router.post("/categories", requirePermission(PERMISSIONS.ITEM_CREATE), validate(categorySchema), itemController.createCategory);
router.post("/", requirePermission(PERMISSIONS.ITEM_CREATE), validate(createItemSchema), itemController.createItem);
router.patch("/:id", requirePermission(PERMISSIONS.ITEM_UPDATE), validate(updateItemSchema), itemController.updateItem);

export default router;
