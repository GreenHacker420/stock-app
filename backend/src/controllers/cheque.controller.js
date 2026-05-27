import { asyncHandler } from "../utils/asyncHandler.js";
import * as chequeService from "../services/cheque.service.js";
import { emitShopEvent, REALTIME_EVENTS } from "../utils/realtime.js";

export const listCheques = asyncHandler(async (req, res) => {
  const cheques = await chequeService.listCheques(req.user, req.validated.query);
  res.json({ success: true, data: cheques });
});

export const getCheque = asyncHandler(async (req, res) => {
  const cheque = await chequeService.getCheque(req.user, req.validated.params.id);
  res.json({ success: true, data: cheque });
});

async function updateStatus(req, res, status) {
  const cheque = await chequeService.updateChequeStatus(req.user, req.validated.params.id, status, req.validated.body ?? {});
  emitShopEvent(req, cheque.shopId, REALTIME_EVENTS.PAYMENT_UPDATED, { paymentId: cheque.id, action: `cheque_${status.toLowerCase()}` });
  res.json({ success: true, data: cheque });
}

export const markDeposited = asyncHandler((req, res) => updateStatus(req, res, "DEPOSITED"));
export const markCleared = asyncHandler((req, res) => updateStatus(req, res, "CLEARED"));
export const markBounced = asyncHandler((req, res) => updateStatus(req, res, "BOUNCED"));
export const markReturned = asyncHandler((req, res) => updateStatus(req, res, "RETURNED"));
