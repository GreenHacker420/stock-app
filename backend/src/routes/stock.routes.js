import { Router } from "express";
import { z } from "zod";
import * as stockController from "../controllers/stock.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();

const querySchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
    itemId: z.string().optional(),
    movementType: z.enum([
      "OPENING_STOCK",
      "STOCK_IN",
      "STOCK_OUT",
      "SALE",
      "DM",
      "ORDER_DISPATCH",
      "RETURN",
      "DAMAGE_LOSS",
      "MANUAL_ADJUSTMENT",
    ]).optional(),
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional(),
});

const movementSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    itemId: z.string().min(1),
    movementType: z.enum(["STOCK_IN", "STOCK_OUT", "RETURN", "DAMAGE_LOSS", "MANUAL_ADJUSTMENT"]),
    quantity: z.coerce.number().positive(),
    direction: z.enum(["IN", "OUT"]).optional(),
    reason: z.string().optional(),
  }).superRefine((data, ctx) => {
    if (data.movementType === "MANUAL_ADJUSTMENT" && !data.direction) {
      ctx.addIssue({
        code: "custom",
        path: ["direction"],
        message: "direction is required for manual adjustment",
      });
    }
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

router.use(requireAuth);

router.get("/current", requirePermission(PERMISSIONS.STOCK_VIEW), validate(querySchema), stockController.getCurrentStock);
router.get("/movements", requirePermission(PERMISSIONS.STOCK_VIEW), validate(querySchema), stockController.listMovements);
router.post("/movements", requirePermission(PERMISSIONS.STOCK_CREATE_MOVEMENT), validate(movementSchema), stockController.createMovement);

export default router;
