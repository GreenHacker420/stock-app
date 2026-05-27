import { Router } from "express";
import { z } from "zod";
import * as auditLogController from "../controllers/auditLog.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();

const querySchema = z.object({
  query: z.object({
    shopId: z.string().optional(),
    entityType: z.string().optional(),
    action: z.string().optional(),
    userId: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional(),
});

router.use(requireAuth);

router.get("/", requirePermission(PERMISSIONS.AUDIT_LOG_VIEW), validate(querySchema), auditLogController.listAuditLogs);
router.get("/export/csv", requirePermission(PERMISSIONS.AUDIT_LOG_VIEW), validate(querySchema), auditLogController.exportCsv);

export default router;
