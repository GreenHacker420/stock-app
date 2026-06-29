import { Router } from "express";
import { z } from "zod";
import * as shopController from "../controllers/shop.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireOwner, requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();

const idParams = z.object({ id: z.string().min(1) });

const createShopSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    code: z.string().min(1),
    city: z.string().min(1),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    gstin: z.string().optional(),
    logo: z.string().optional(),
    upiId: z.string().optional(),
    upiName: z.string().optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const updateShopSchema = z.object({
  params: idParams,
  body: z.object({
    name: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    address: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    gstin: z.string().nullable().optional(),
    logo: z.string().nullable().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    upiId: z.string().nullable().optional(),
    upiName: z.string().nullable().optional(),
  }),
  query: z.object({}).optional(),
});

const assignStaffSchema = z.object({
  params: idParams,
  body: z.object({
    staffId: z.string().min(1),
  }),
  query: z.object({}).optional(),
});

const openingStockSchema = z.object({
  params: idParams,
  body: z.object({
    entries: z.array(
      z.object({
        itemId: z.string().min(1),
        quantity: z.coerce.number().nonnegative(),
        reason: z.string().optional(),
      }),
    ).min(1),
  }),
  query: z.object({}).optional(),
});

router.use(requireAuth);

router.get("/", requirePermission(PERMISSIONS.SHOP_VIEW), shopController.listShops);
router.post("/", requireOwner, validate(createShopSchema), shopController.createShop);
router.patch("/:id", requireOwner, validate(updateShopSchema), shopController.updateShop);
router.post("/:id/assign-staff", requireOwner, validate(assignStaffSchema), shopController.assignStaff);
router.post(
  "/:id/set-opening-stock",
  requireOwner,
  validate(openingStockSchema),
  shopController.setOpeningStock,
);

export default router;
