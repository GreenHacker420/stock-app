import { asyncHandler } from "../utils/asyncHandler.js";
import * as paymentService from "../services/payment.service.js";
import { emitShopEvent, REALTIME_EVENTS } from "../utils/realtime.js";
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
  if (!result.replayed) {
    emitShopEvent(req, payment.shopId, REALTIME_EVENTS.PAYMENT_UPDATED, { paymentId: payment.id, action: "created" });
  }
  res.status(result.statusCode).json({ success: true, data: payment });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.verifyPayment(req.user, req.validated.params.id, req.validated.body);
  emitShopEvent(req, payment.shopId, REALTIME_EVENTS.PAYMENT_UPDATED, { paymentId: payment.id, action: "verified" });
  res.json({ success: true, data: payment });
});

export const markMismatch = asyncHandler(async (req, res) => {
  const payment = await paymentService.markMismatch(req.user, req.validated.params.id, req.validated.body);
  emitShopEvent(req, payment.shopId, REALTIME_EVENTS.PAYMENT_UPDATED, { paymentId: payment.id, action: "mismatch" });
  res.json({ success: true, data: payment });
});

export const attachPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.attachPayment(req.user, req.validated.params.id, req.validated.body);
  emitShopEvent(req, payment.shopId, REALTIME_EVENTS.PAYMENT_UPDATED, { paymentId: payment.id, action: "attached" });
  res.json({ success: true, data: payment });
});
