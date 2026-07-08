import { asyncHandler } from "../utils/asyncHandler.js";
import * as dashboardService from "../services/dashboard.service.js";

export const ownerDashboard = asyncHandler(async (req, res) => {
  const dashboard = await dashboardService.getOwnerDashboard(req.user, req.validated.query);
  res.json({ success: true, data: dashboard });
});

export const staffTodaySummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getStaffTodaySummary(req.user, req.validated.query);
  res.json({ success: true, data: summary });
});

export const listStorageObjects = asyncHandler(async (req, res) => {
  const objects = await dashboardService.listStorageObjects(req.user, req.validated.query);
  res.json({ success: true, data: objects });
});

export const deleteStorageObject = asyncHandler(async (req, res) => {
  const result = await dashboardService.deleteStorageObject(req.user, req.params.id);
  res.json({ success: true, ...result });
});
