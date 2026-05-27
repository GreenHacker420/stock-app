import { Router } from "express";
import { z } from "zod";
import * as summaryController from "../controllers/dailySummary.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();

const querySchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
    date: z.string().min(1),
  }),
});

const lockSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    date: z.string().min(1),
  }),
});

router.use(requireAuth);

router.get("/", requirePermission(PERMISSIONS.DAILY_SUMMARY_VIEW), validate(querySchema), summaryController.getSummary);
router.post("/lock", requirePermission(PERMISSIONS.DAILY_SUMMARY_LOCK), validate(lockSchema), summaryController.lockSummary);

export default router;
