import * as approvalService from "../services/approval.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const listRequests = asyncHandler(async (req, res) => {
  const requests = await approvalService.listApprovalRequests(req.user, req.query);
  res.json(requests);
});

export const getRequest = asyncHandler(async (req, res) => {
  const request = await approvalService.getApprovalRequest(req.user, req.params.id);
  res.json(request);
});

export const respond = asyncHandler(async (req, res) => {
  const request = await approvalService.respondToRequest(req.user, req.params.id, req.body);
  res.json(request);
});
