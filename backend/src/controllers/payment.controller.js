import { asyncHandler } from "../utils/asyncHandler.js";
import * as paymentService from "../services/payment.service.js";
import { runIdempotentCreate } from "../services/idempotency.service.js";

export const listPayments = asyncHandler(async (req, res) => {
  const payments = await paymentService.listPayments(req.user, req.validated.query);
  res.json({ success: true, data: payments });
});

export const getPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.getPayment(req.user, req.validated.params.id);
  res.json({ success: true, data: payment });
});

export const addPayment = asyncHandler(async (req, res) => {
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: "POST /payments",
      resourceType: "PAYMENT",
      shopId: req.validated.body.shopId,
    },
    () => paymentService.addPayment(req.user, req.validated.body),
  );
  const payment = result.data;
  res.status(result.statusCode).json({ success: true, data: payment });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.verifyPayment(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: payment });
});

export const markMismatch = asyncHandler(async (req, res) => {
  const payment = await paymentService.markMismatch(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: payment });
});

export const attachPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.attachPayment(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: payment });
});
