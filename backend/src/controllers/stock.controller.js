import { asyncHandler } from "../utils/asyncHandler.js";
import * as stockService from "../services/stock.service.js";

export const getCurrentStock = asyncHandler(async (req, res) => {
  const stock = await stockService.getCurrentStock(req.user, req.validated.query);
  res.json({ success: true, data: stock });
});

export const listMovements = asyncHandler(async (req, res) => {
  const movements = await stockService.listMovements(req.user, req.validated.query);
  res.json({ success: true, data: movements });
});

export const createMovement = asyncHandler(async (req, res) => {
  const movement = await stockService.createMovement(req.user, req.validated.body);
  res.status(201).json({ success: true, data: movement });
});

export const bulkStockEntry = asyncHandler(async (req, res) => {
  const result = await stockService.bulkStockEntry(req.user, req.validated.body);
  res.status(201).json({ success: true, data: result });
});
