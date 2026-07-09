import { asyncHandler } from "../utils/asyncHandler.js";
import * as saleService from "../services/sale.service.js";
import { runIdempotentCreate } from "../services/idempotency.service.js";

export const createSale = asyncHandler(async (req, res) => {
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: "POST /sales",
      resourceType: "SALE",
      shopId: req.validated.body.shopId,
    },
    () => saleService.createSale(req.user, req.validated.body),
  );
  const sale = result.data;
  res.status(result.statusCode).json({ success: true, data: sale });
});

export const listSales = asyncHandler(async (req, res) => {
  const sales = await saleService.listSales(req.user, req.validated.query);
  res.json({ success: true, data: sales });
});

export const getSale = asyncHandler(async (req, res) => {
  const sale = await saleService.getSale(req.user, req.validated.params.id);
  res.json({ success: true, data: sale });
});

export const updateSale = asyncHandler(async (req, res) => {
  const sale = await saleService.updateSale(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: sale });
});

export const amendSale = asyncHandler(async (req, res) => {
  const sale = await saleService.amendSale(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: sale });
});

export const issueInvoice = asyncHandler(async (req, res) => {
  const sale = await saleService.issueInvoice(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: sale });
});

export const cancelInvoice = asyncHandler(async (req, res) => {
  const sale = await saleService.cancelInvoice(req.user, req.validated.params.id, req.validated.body || {});
  res.json({ success: true, data: sale });
});
