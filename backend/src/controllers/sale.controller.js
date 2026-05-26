import { asyncHandler } from "../utils/asyncHandler.js";
import * as saleService from "../services/sale.service.js";

export const createSale = asyncHandler(async (req, res) => {
  const sale = await saleService.createSale(req.user, req.validated.body);
  res.status(201).json({ success: true, data: sale });
});

export const listSales = asyncHandler(async (req, res) => {
  const sales = await saleService.listSales(req.user, req.validated.query);
  res.json({ success: true, data: sales });
});

export const getSale = asyncHandler(async (req, res) => {
  const sale = await saleService.getSale(req.user, req.validated.params.id);
  res.json({ success: true, data: sale });
});
