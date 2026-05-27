import { Router } from "express";
import { z } from "zod";
import * as dashboardController from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireOwner, requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();

const querySchema = z.object({
  query: z.object({
    shopId: z.string().optional(),
    date: z.string().optional(),
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional(),
});

const staffQuerySchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
    date: z.string().optional(),
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional(),
});

router.use(requireAuth);

router.get("/owner", requireOwner, validate(querySchema), dashboardController.ownerDashboard);
router.get("/staff/today", requirePermission(PERMISSIONS.SALE_VIEW_OWN), validate(staffQuerySchema), dashboardController.staffTodaySummary);

export default router;
