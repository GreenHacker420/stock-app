import { asyncHandler } from "../utils/asyncHandler.js";
import * as deliveryMemoService from "../services/deliveryMemo.service.js";
import { runIdempotentCreate } from "../services/idempotency.service.js";

export const createDeliveryMemo = asyncHandler(async (req, res) => {
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: "POST /delivery-memos",
      resourceType: "DELIVERY_MEMO",
      shopId: req.validated.body.shopId,
    },
    () => deliveryMemoService.createDeliveryMemo(req.user, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const listDeliveryMemos = asyncHandler(async (req, res) => {
  const memos = await deliveryMemoService.listDeliveryMemos(req.user, req.validated.query);
  res.json({ success: true, data: memos });
});

export const getDeliveryMemo = asyncHandler(async (req, res) => {
  const dm = await deliveryMemoService.getDeliveryMemo(req.user, req.validated.params.id);
  res.json({ success: true, data: dm });
});
