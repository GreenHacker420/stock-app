import { asyncHandler } from "../utils/asyncHandler.js";
import * as paymentService from "../services/payment.service.js";

export const listPayments = asyncHandler(async (req, res) => {
  const payments = await paymentService.listPayments(req.user, req.validated.query);
  res.json({ success: true, data: payments });
});

export const getPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.getPayment(req.user, req.validated.params.id);
  res.json({ success: true, data: payment });
});

export const addPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.addPayment(req.user, req.validated.body);
  res.status(201).json({ success: true, data: payment });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.verifyPayment(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: payment });
});

export const markMismatch = asyncHandler(async (req, res) => {
  const payment = await paymentService.markMismatch(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: payment });
});
