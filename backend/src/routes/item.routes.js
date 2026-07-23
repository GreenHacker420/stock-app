import { Router } from "express";
import { z } from "zod";
import * as itemController from "../controllers/item.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";
import multer from "multer";

const router = Router();
const idParams = z.object({ id: z.string().min(1) });
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 8 * 1024 * 1024,
  },
});

const listSchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
    search: z.string().optional(),
    categoryId: z.string().optional(),
    brandId: z.string().optional(),
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

const listCategoriesSchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional(),
});

const updateCategorySchema = z.object({
  params: idParams,
  body: z.object({
    name: z.string().min(1),
  }),
  query: z.object({}).optional(),
});

const brandSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    name: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const updateBrandSchema = z.object({
  params: idParams,
  body: z.object({
    name: z.string().min(1),
  }),
  query: z.object({}).optional(),
});

const createItemSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    name: z.string().min(1),
    sku: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    brandId: z.string().nullable().optional(),
    unit: z.string().min(1),
    defaultSellingPrice: z.coerce.number().nonnegative().optional(),
    minimumAllowedPrice: z.coerce.number().nonnegative().nullable().optional(),
    purchasePrice: z.coerce.number().nonnegative().nullable().optional(),
    mrp: z.coerce.number().nonnegative().nullable().optional(),
    minimumStock: z.coerce.number().nonnegative().optional(),
    imageUrl: z.url().nullable().optional(),
    initialStock: z.coerce.number().optional(),
    requiresSerialNumber: z.boolean().optional(),
    bundleComponents: z.array(z.object({
      componentItemId: z.string().min(1),
      quantity: z.coerce.number().positive(),
    })).optional(),
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

const uploadItemImageSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    categoryId: z.string().nullable().optional(),
    itemId: z.string().nullable().optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const batchQuickUpdateSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    updates: z.array(
      z.object({
        itemId: z.string().min(1),
        pricePatch: z.object({
          mrp: z.coerce.number().nonnegative().nullable().optional(),
          defaultSellingPrice: z.coerce.number().nonnegative().optional(),
        }).optional(),
        stockAdjustment: z.coerce.number().int().optional(),
      })
    ).min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

router.use(requireAuth);

// SUMMARY & CATEGORIES (Must be before parameterized routes)
router.get("/summary", requirePermission(PERMISSIONS.ITEM_VIEW), validate(listCategoriesSchema), itemController.getItemSummary);
router.get("/categories", requirePermission(PERMISSIONS.ITEM_VIEW), validate(listCategoriesSchema), itemController.listCategories);
router.post("/categories", requirePermission(PERMISSIONS.ITEM_CREATE), validate(categorySchema), itemController.createCategory);
router.patch("/categories/:id", requirePermission(PERMISSIONS.ITEM_UPDATE), validate(updateCategorySchema), itemController.updateCategory);
router.delete("/categories/:id", requirePermission(PERMISSIONS.ITEM_UPDATE), validate(z.object({ params: idParams })), itemController.deleteCategory);

// BRANDS (Must be before parameterized routes)
router.get("/brands", requirePermission(PERMISSIONS.ITEM_VIEW), validate(listCategoriesSchema), itemController.listBrands);
router.post("/brands", requirePermission(PERMISSIONS.ITEM_CREATE), validate(brandSchema), itemController.createBrand);
router.patch("/brands/:id", requirePermission(PERMISSIONS.ITEM_UPDATE), validate(updateBrandSchema), itemController.updateBrand);
router.delete("/brands/:id", requirePermission(PERMISSIONS.ITEM_UPDATE), validate(z.object({ params: idParams })), itemController.deleteBrand);

// ITEMS
router.get("/", requirePermission(PERMISSIONS.ITEM_VIEW), validate(listSchema), itemController.listItems);
router.post("/", requirePermission(PERMISSIONS.ITEM_CREATE), validate(createItemSchema), itemController.createItem);
router.post(
  "/image",
  requirePermission(PERMISSIONS.ITEM_CREATE),
  imageUpload.single("file"),
  validate(uploadItemImageSchema),
  itemController.uploadItemImage,
);

router.post(
  "/batch-quick-update",
  requirePermission(PERMISSIONS.ITEM_UPDATE),
  validate(batchQuickUpdateSchema),
  itemController.batchQuickUpdate,
);

const findDuplicatesSchema = z.object({
  query: z.object({
    shopId:        z.string().min(1),
    name:          z.string().optional(),
    sku:           z.string().optional(),
    categoryId:    z.string().optional(),
    excludeItemId: z.string().optional(),
    limit:         z.coerce.number().int().positive().max(10).optional(),
  }),
  params: z.object({}).optional(),
  body:   z.object({}).optional(),
});
router.get(
  "/find-duplicates",
  requirePermission(PERMISSIONS.ITEM_VIEW),
  validate(findDuplicatesSchema),
  itemController.findDuplicates,
);

// INDIVIDUAL ITEM ROUTES
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
const mergeItemsSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    sourceItemIds: z.array(z.string().min(1)).min(1).max(20)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate source product IDs are not allowed"),
    targetItemId: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

router.post(
  "/merge",
  requirePermission(PERMISSIONS.ITEM_UPDATE),
  validate(mergeItemsSchema),
  itemController.mergeItems,
);

router.patch("/:id", requirePermission(PERMISSIONS.ITEM_UPDATE), validate(updateItemSchema), itemController.updateItem);
router.delete("/:id", requirePermission(PERMISSIONS.ITEM_UPDATE), validate(z.object({ params: idParams, body: z.object({}).optional(), query: z.object({}).optional() })), itemController.deleteItem);

export default router;
