import { asyncHandler } from "../utils/asyncHandler.js";
import * as orderService from "../services/order.service.js";
import { runIdempotentCreate } from "../services/idempotency.service.js";

export const createOrder = asyncHandler(async (req, res) => {
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: "POST /orders",
      resourceType: "ORDER",
      shopId: req.validated.body.shopId,
    },
    () => orderService.createOrder(req.user, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const listOrders = asyncHandler(async (req, res) => {
  const orders = await orderService.listOrders(req.user, req.validated.query);
  res.json({ success: true, data: orders });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getOrder(req.user, req.validated.params.id);
  res.json({ success: true, data: order });
});

export const confirmOrder = asyncHandler(async (req, res) => {
  const order = await orderService.confirmOrder(req.user, req.validated.params.id);
  res.json({ success: true, data: order });
});

export const assignStaff = asyncHandler(async (req, res) => {
  const order = await orderService.assignStaff(
    req.user,
    req.validated.params.id,
    req.validated.body.staffId,
  );
  res.json({ success: true, data: order });
});

export const startPacking = asyncHandler(async (req, res) => {
  const order = await orderService.startPacking(req.user, req.validated.params.id);
  res.json({ success: true, data: order });
});

export const markItemPacked = asyncHandler(async (req, res) => {
  const order = await orderService.markItemPacked(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: order });
});

export const reportShortage = asyncHandler(async (req, res) => {
  const order = await orderService.reportShortage(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: order });
});

export const addPayment = asyncHandler(async (req, res) => {
  const orderId = req.validated.params.id;
  const shopId = await orderService.getOrderShopForAction(req.user, orderId);
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: `POST /orders/${orderId}/add-payment`,
      resourceType: "ORDER_PAYMENT",
      shopId,
      statusCode: 200,
    },
    () => orderService.addPayment(req.user, orderId, req.validated.body.payments),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const createDmFromOrder = asyncHandler(async (req, res) => {
  const orderId = req.validated.params.id;
  const shopId = await orderService.getOrderShopForAction(req.user, orderId);
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: `POST /orders/${orderId}/create-dm`,
      resourceType: "DELIVERY_MEMO",
      shopId,
    },
    () => orderService.createDmFromOrder(req.user, orderId, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const convertOrderToSale = asyncHandler(async (req, res) => {
  const orderId = req.validated.params.id;
  const shopId = await orderService.getOrderShopForAction(req.user, orderId);
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: `POST /orders/${orderId}/convert-to-sale`,
      resourceType: "SALE",
      shopId,
    },
    () => orderService.convertOrderToSale(req.user, orderId, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const orderId = req.validated.params.id;
  const shopId = await orderService.getOrderShopForAction(req.user, orderId);
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: `POST /orders/${orderId}/cancel`,
      resourceType: "ORDER_CANCEL",
      shopId,
      statusCode: 200,
    },
    () => orderService.cancelOrder(req.user, orderId, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});
