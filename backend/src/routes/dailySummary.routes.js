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

const listSchema = z.object({
  query: z.object({
    shopId: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    status: z.enum(["DRAFT", "GENERATED", "REVIEWED", "LOCKED", "EXPORTED"]).optional(),
  }),
});

const idParams = z.object({ id: z.string().min(1) });

router.use(requireAuth);

router.get("/", requirePermission(PERMISSIONS.DAILY_SUMMARY_VIEW), validate(querySchema), summaryController.getSummary);
router.post("/generate", requirePermission(PERMISSIONS.DAILY_SUMMARY_VIEW), validate(lockSchema), summaryController.generateSummary);
router.post("/lock", requirePermission(PERMISSIONS.DAILY_SUMMARY_LOCK), validate(lockSchema), summaryController.lockSummary);
router.get("/list", requirePermission(PERMISSIONS.DAILY_SUMMARY_VIEW), validate(listSchema), summaryController.listSummaries);
router.get("/:id", requirePermission(PERMISSIONS.DAILY_SUMMARY_VIEW), validate(z.object({ params: idParams })), summaryController.getSummaryById);
router.post("/:id/lock", requirePermission(PERMISSIONS.DAILY_SUMMARY_LOCK), validate(z.object({ params: idParams })), summaryController.lockSummaryById);
router.get(
  "/:id/export/:format",
  requirePermission(PERMISSIONS.DAILY_SUMMARY_EXPORT),
  validate(z.object({ params: idParams.extend({ format: z.enum(["pdf", "csv"]) }) })),
  summaryController.exportSummary,
);

export default router;
