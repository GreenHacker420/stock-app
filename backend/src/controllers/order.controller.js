import { asyncHandler } from "../utils/asyncHandler.js";
import * as orderService from "../services/order.service.js";

export const createOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder(req.user, req.validated.body);
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
  const order = await orderService.addPayment(req.user, req.validated.params.id, req.validated.body.payments);
  res.json({ success: true, data: order });
});

export const createDmFromOrder = asyncHandler(async (req, res) => {
  const dm = await orderService.createDmFromOrder(req.user, req.validated.params.id, req.validated.body);
  res.status(201).json({ success: true, data: dm });
});

export const convertOrderToSale = asyncHandler(async (req, res) => {
  const sale = await orderService.convertOrderToSale(req.user, req.validated.params.id, req.validated.body);
  res.status(201).json({ success: true, data: sale });
});
