import { asyncHandler } from "../utils/asyncHandler.js";
import * as customerService from "../services/customer.service.js";

export const listCustomers = asyncHandler(async (req, res) => {
  const customers = await customerService.listCustomers(req.user, req.validated.query);
  res.json({ success: true, data: customers });
});

export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomer(req.user, req.validated.params.id);
  res.json({ success: true, data: customer });
});

export const createCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.createCustomer(req.user, req.validated.body);
  res.status(201).json({ success: true, data: customer });
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomer(
    req.user,
    req.validated.params.id,
    req.validated.body,
  );
  res.json({ success: true, data: customer });
});

export const getOutstanding = asyncHandler(async (req, res) => {
  const outstanding = await customerService.getOutstanding(req.user, req.validated.params.id);
  res.json({ success: true, data: outstanding });
});

export const getPriceHistory = asyncHandler(async (req, res) => {
  const history = await customerService.getPriceHistory(req.user, req.validated.params.id, req.validated.query);
  res.json({ success: true, data: history });
});
