import { asyncHandler } from "../utils/asyncHandler.js";
import * as auditLogService from "../services/auditLog.service.js";

export const listAuditLogs = asyncHandler(async (req, res) => {
  const logs = await auditLogService.listAuditLogs(req.user, req.validated.query);
  res.json({ success: true, data: logs });
});

export const exportCsv = asyncHandler(async (req, res) => {
  const logs = await auditLogService.listAuditLogs(req.user, req.validated.query);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=audit-logs.csv");
  res.send(auditLogService.toCsv(logs));
});
