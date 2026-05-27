import { asyncHandler } from "../utils/asyncHandler.js";
import * as correctionRequestService from "../services/correctionRequest.service.js";
import { emitShopEvent, REALTIME_EVENTS } from "../utils/realtime.js";

export const createRequest = asyncHandler(async (req, res) => {
  const request = await correctionRequestService.createRequest(req.user, req.validated.body);
  emitShopEvent(req, request.shopId, REALTIME_EVENTS.NOTIFICATION_CREATED, { entityType: "CorrectionRequest", entityId: request.id, action: "created" });
  res.status(201).json({ success: true, data: request });
});

export const listRequests = asyncHandler(async (req, res) => {
  const requests = await correctionRequestService.listRequests(req.user, req.validated.query);
  res.json({ success: true, data: requests });
});

export const approveRequest = asyncHandler(async (req, res) => {
  const request = await correctionRequestService.approveRequest(req.user, req.validated.params.id);
  emitShopEvent(req, request.shopId, REALTIME_EVENTS.NOTIFICATION_CREATED, { entityType: "CorrectionRequest", entityId: request.id, action: "approved" });
  res.json({ success: true, data: request });
});

export const rejectRequest = asyncHandler(async (req, res) => {
  const request = await correctionRequestService.rejectRequest(req.user, req.validated.params.id, req.validated.body);
  emitShopEvent(req, request.shopId, REALTIME_EVENTS.NOTIFICATION_CREATED, { entityType: "CorrectionRequest", entityId: request.id, action: "rejected" });
  res.json({ success: true, data: request });
});
