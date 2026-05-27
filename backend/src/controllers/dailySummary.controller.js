import { asyncHandler } from "../utils/asyncHandler.js";
import * as summaryService from "../services/dailySummary.service.js";
import { emitShopEvent, REALTIME_EVENTS } from "../utils/realtime.js";

export const getSummary = asyncHandler(async (req, res) => {
  const summary = await summaryService.getSummary(req.user, req.validated.query);
  res.json({ success: true, data: summary });
});

export const lockSummary = asyncHandler(async (req, res) => {
  const summary = await summaryService.lockSummary(req.user, req.validated.body);
  emitShopEvent(req, summary.shopId, REALTIME_EVENTS.DAILY_SUMMARY_UPDATED, { summaryId: summary.id, action: "locked" });
  res.json({ success: true, data: summary });
});
