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

export const createDeliveryMemoDraft = asyncHandler(async (req, res) => {
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: "POST /delivery-memos/drafts",
      resourceType: "DELIVERY_MEMO_DRAFT",
      shopId: req.validated.body.shopId,
    },
    () => deliveryMemoService.createDeliveryMemoDraft(req.user, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const updateDeliveryMemoDraft = asyncHandler(async (req, res) => {
  const dm = await deliveryMemoService.updateDeliveryMemoDraft(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: dm });
});

export const postDeliveryMemo = asyncHandler(async (req, res) => {
  const id = req.validated.params.id;
  const shopId = await deliveryMemoService.getDeliveryMemoShopForAction(req.user, id);
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: `POST /delivery-memos/${id}/post`,
      resourceType: "DELIVERY_MEMO_POST",
      shopId,
      statusCode: 200,
    },
    () => deliveryMemoService.postDeliveryMemo(req.user, id, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const convertDeliveryMemoToSale = asyncHandler(async (req, res) => {
  const id = req.validated.params.id;
  const shopId = await deliveryMemoService.getDeliveryMemoShopForAction(req.user, id);
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: `POST /delivery-memos/${id}/convert-to-sale`,
      resourceType: "DELIVERY_MEMO_CONVERSION",
      shopId,
    },
    () => deliveryMemoService.convertDeliveryMemoToSale(req.user, id, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const getDeliveryMemoTimeline = asyncHandler(async (req, res) => {
  const timeline = await deliveryMemoService.getDeliveryMemoTimeline(req.user, req.validated.params.id);
  res.json({ success: true, data: timeline });
});
