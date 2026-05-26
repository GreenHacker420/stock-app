import { asyncHandler } from "../utils/asyncHandler.js";
import * as deliveryMemoService from "../services/deliveryMemo.service.js";

export const createDeliveryMemo = asyncHandler(async (req, res) => {
  const dm = await deliveryMemoService.createDeliveryMemo(req.user, req.validated.body);
  res.status(201).json({ success: true, data: dm });
});

export const listDeliveryMemos = asyncHandler(async (req, res) => {
  const memos = await deliveryMemoService.listDeliveryMemos(req.user, req.validated.query);
  res.json({ success: true, data: memos });
});

export const getDeliveryMemo = asyncHandler(async (req, res) => {
  const dm = await deliveryMemoService.getDeliveryMemo(req.user, req.validated.params.id);
  res.json({ success: true, data: dm });
});
