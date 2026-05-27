import { asyncHandler } from "../utils/asyncHandler.js";
import * as rateChangeRequestService from "../services/rateChangeRequest.service.js";
import { emitShopEvent, REALTIME_EVENTS } from "../utils/realtime.js";

function shopIdFromRequest(request) {
  return request.orderItem?.order?.shopId;
}

export const createRequest = asyncHandler(async (req, res) => {
  const request = await rateChangeRequestService.createRequest(req.user, req.validated.body);
  emitShopEvent(req, shopIdFromRequest(request), REALTIME_EVENTS.NOTIFICATION_CREATED, { entityType: "RateChangeRequest", entityId: request.id, action: "created" });
  res.status(201).json({ success: true, data: request });
});

export const listRequests = asyncHandler(async (req, res) => {
  const requests = await rateChangeRequestService.listRequests(req.user, req.validated.query);
  res.json({ success: true, data: requests });
});

export const approveRequest = asyncHandler(async (req, res) => {
  const request = await rateChangeRequestService.approveRequest(req.user, req.validated.params.id);
  emitShopEvent(req, shopIdFromRequest(request), REALTIME_EVENTS.ORDER_UPDATED, { orderId: request.orderItem.orderId, action: "rate_change_approved" });
  emitShopEvent(req, shopIdFromRequest(request), REALTIME_EVENTS.NOTIFICATION_CREATED, { entityType: "RateChangeRequest", entityId: request.id, action: "approved" });
  res.json({ success: true, data: request });
});

export const rejectRequest = asyncHandler(async (req, res) => {
  const request = await rateChangeRequestService.rejectRequest(req.user, req.validated.params.id, req.validated.body);
  emitShopEvent(req, shopIdFromRequest(request), REALTIME_EVENTS.NOTIFICATION_CREATED, { entityType: "RateChangeRequest", entityId: request.id, action: "rejected" });
  res.json({ success: true, data: request });
});
