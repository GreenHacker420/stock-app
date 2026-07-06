import * as customerService from "../services/customer.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { runIdempotentCreate } from "../services/idempotency.service.js";

export const listCustomers = asyncHandler(async (req, res) => {
  const customers = await customerService.listCustomers(req.user, req.validated.query);
  res.json({ success: true, data: customers });
});

export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomer(req.user, req.params.id);
  res.json({ success: true, data: customer });
});

export const getCustomerSummary = asyncHandler(async (req, res) => {
  const summary = await customerService.getCustomerSummary(req.user, req.params.id);
  res.json({ success: true, data: summary });
});

export const createCustomer = asyncHandler(async (req, res) => {
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: "POST /customers",
      resourceType: "CUSTOMER",
      shopId: req.validated.body.shopId,
    },
    () => customerService.createCustomer(req.user, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomer(req.user, req.params.id, req.validated.body);
  res.json({ success: true, data: customer });
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.deleteCustomer(req.user, req.params.id);
  res.json({ success: true, data: customer });
});

export const getOutstanding = asyncHandler(async (req, res) => {
  const outstanding = await customerService.getOutstanding(req.user, req.params.id);
  res.json({ success: true, data: outstanding });
});

export const getTimeline = asyncHandler(async (req, res) => {
  const timeline = await customerService.getCustomerTimeline(req.user, req.params.id);
  res.json({ success: true, data: timeline });
});

export const getSales = asyncHandler(async (req, res) => {
  const sales = await customerService.listCustomerSales(req.user, req.params.id, req.query);
  res.json({ success: true, data: sales });
});

export const getPayments = asyncHandler(async (req, res) => {
  const payments = await customerService.listCustomerPayments(req.user, req.params.id, req.query);
  res.json({ success: true, data: payments });
});

export const getDMs = asyncHandler(async (req, res) => {
  const dms = await customerService.listCustomerDMs(req.user, req.params.id, req.query);
  res.json({ success: true, data: dms });
});

export const getReturns = asyncHandler(async (req, res) => {
  const returns = await customerService.listCustomerReturns(req.user, req.params.id);
  res.json({ success: true, data: returns });
});

export const getPriceHistory = asyncHandler(async (req, res) => {
  const history = await customerService.getPriceHistory(req.user, req.params.id, req.validated.query);
  res.json({ success: true, data: history });
});
