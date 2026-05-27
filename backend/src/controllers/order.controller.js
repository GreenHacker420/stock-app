import { asyncHandler } from "../utils/asyncHandler.js";
import * as orderService from "../services/order.service.js";
import { emitShopEvent, REALTIME_EVENTS } from "../utils/realtime.js";

export const createOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder(req.user, req.validated.body);
  emitShopEvent(req, order.shopId, REALTIME_EVENTS.ORDER_UPDATED, { orderId: order.id, action: "created" });
  res.status(201).json({ success: true, data: order });
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
  emitShopEvent(req, order.shopId, REALTIME_EVENTS.ORDER_UPDATED, { orderId: order.id, action: "confirmed" });
  res.json({ success: true, data: order });
});

export const assignStaff = asyncHandler(async (req, res) => {
  const order = await orderService.assignStaff(
    req.user,
    req.validated.params.id,
    req.validated.body.staffId,
  );
  emitShopEvent(req, order.shopId, REALTIME_EVENTS.ORDER_UPDATED, { orderId: order.id, action: "assigned" });
  res.json({ success: true, data: order });
});

export const startPacking = asyncHandler(async (req, res) => {
  const order = await orderService.startPacking(req.user, req.validated.params.id);
  emitShopEvent(req, order.shopId, REALTIME_EVENTS.ORDER_UPDATED, { orderId: order.id, action: "packing_started" });
  res.json({ success: true, data: order });
});

export const markItemPacked = asyncHandler(async (req, res) => {
  const order = await orderService.markItemPacked(req.user, req.validated.params.id, req.validated.body);
  emitShopEvent(req, order.shopId, REALTIME_EVENTS.ORDER_UPDATED, { orderId: order.id, action: "item_packed" });
  res.json({ success: true, data: order });
});

export const reportShortage = asyncHandler(async (req, res) => {
  const order = await orderService.reportShortage(req.user, req.validated.params.id, req.validated.body);
  emitShopEvent(req, order.shopId, REALTIME_EVENTS.ORDER_UPDATED, { orderId: order.id, action: "shortage_reported" });
  res.json({ success: true, data: order });
});

export const addPayment = asyncHandler(async (req, res) => {
  const order = await orderService.addPayment(req.user, req.validated.params.id, req.validated.body.payments);
  emitShopEvent(req, order.shopId, REALTIME_EVENTS.ORDER_UPDATED, { orderId: order.id, action: "payment_added" });
  emitShopEvent(req, order.shopId, REALTIME_EVENTS.PAYMENT_UPDATED, { orderId: order.id, action: "created" });
  res.json({ success: true, data: order });
});

export const createDmFromOrder = asyncHandler(async (req, res) => {
  const dm = await orderService.createDmFromOrder(req.user, req.validated.params.id, req.validated.body);
  emitShopEvent(req, dm.shopId, REALTIME_EVENTS.DELIVERY_MEMO_UPDATED, { dmId: dm.id, orderId: dm.orderId, action: "created_from_order" });
  emitShopEvent(req, dm.shopId, REALTIME_EVENTS.STOCK_UPDATED, { dmId: dm.id, action: "order_dm_created" });
  res.status(201).json({ success: true, data: dm });
});

export const convertOrderToSale = asyncHandler(async (req, res) => {
  const sale = await orderService.convertOrderToSale(req.user, req.validated.params.id, req.validated.body);
  emitShopEvent(req, sale.shopId, REALTIME_EVENTS.SALE_UPDATED, { saleId: sale.id, orderId: sale.orderId, action: "created_from_order" });
  emitShopEvent(req, sale.shopId, REALTIME_EVENTS.STOCK_UPDATED, { saleId: sale.id, action: "order_sale_created" });
  res.status(201).json({ success: true, data: sale });
});
