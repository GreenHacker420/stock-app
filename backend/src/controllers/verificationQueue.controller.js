import { asyncHandler } from "../utils/asyncHandler.js";
import * as verificationQueueService from "../services/verificationQueue.service.js";

export const listPendingVerifications = asyncHandler(async (req, res) => {
  const data = await verificationQueueService.listPendingVerifications(req.user, req.validated.query);
  res.json({ success: true, data });
});

export const processVerification = asyncHandler(async (req, res) => {
  const data = await verificationQueueService.processVerification(
    req.user,
    req.validated.params.id,
    req.validated.body
  );
  res.json({ success: true, data });
});
