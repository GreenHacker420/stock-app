import { asyncHandler } from "../utils/asyncHandler.js";
import * as summaryService from "../services/dailySummary.service.js";
import { emitShopEvent, REALTIME_EVENTS } from "../utils/realtime.js";

export const getSummary = asyncHandler(async (req, res) => {
  const summary = await summaryService.getSummary(req.user, req.validated.query);
  res.json({ success: true, data: summary });
});

export const generateSummary = asyncHandler(async (req, res) => {
  const summary = await summaryService.generateSummary(req.user, req.validated.body);
  emitShopEvent(req, summary.shopId, REALTIME_EVENTS.DAILY_SUMMARY_UPDATED, { summaryId: summary.id, action: "generated" });
  res.status(201).json({ success: true, data: summary });
});

export const listSummaries = asyncHandler(async (req, res) => {
  const summaries = await summaryService.listSummaries(req.user, req.validated.query);
  res.json({ success: true, data: summaries });
});

export const getSummaryById = asyncHandler(async (req, res) => {
  const summary = await summaryService.getSummaryById(req.user, req.validated.params.id);
  res.json({ success: true, data: summary });
});

export const lockSummary = asyncHandler(async (req, res) => {
  const summary = await summaryService.lockSummary(req.user, req.validated.body);
  emitShopEvent(req, summary.shopId, REALTIME_EVENTS.DAILY_SUMMARY_UPDATED, { summaryId: summary.id, action: "locked" });
  res.json({ success: true, data: summary });
});

export const lockSummaryById = asyncHandler(async (req, res) => {
  const summary = await summaryService.lockSummaryById(req.user, req.validated.params.id);
  emitShopEvent(req, summary.shopId, REALTIME_EVENTS.DAILY_SUMMARY_UPDATED, { summaryId: summary.id, action: "locked" });
  res.json({ success: true, data: summary });
});

export const exportSummary = asyncHandler(async (req, res) => {
  const exportResult = await summaryService.exportSummary(req.user, req.validated.params.id, req.validated.params.format);
  res.setHeader("Content-Type", exportResult.contentType);
  res.setHeader("Content-Disposition", `attachment; filename=${exportResult.filename}`);
  res.send(exportResult.body);
});
