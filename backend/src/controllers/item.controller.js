import { asyncHandler } from "../utils/asyncHandler.js";
import * as itemService from "../services/item.service.js";

export const listItems = asyncHandler(async (req, res) => {
  const items = await itemService.listItems(req.user, req.validated.query);
  res.json({ success: true, data: items });
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await itemService.createCategory(req.user, req.validated.body);
  res.status(201).json({ success: true, data: category });
});

export const createItem = asyncHandler(async (req, res) => {
  const item = await itemService.createItem(req.user, req.validated.body);
  res.status(201).json({ success: true, data: item });
});

export const updateItem = asyncHandler(async (req, res) => {
  const item = await itemService.updateItem(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: item });
});

export const getItemStock = asyncHandler(async (req, res) => {
  const stock = await itemService.getItemStock(req.user, req.validated.params.id);
  res.json({ success: true, data: stock });
});

export const getPriceHistory = asyncHandler(async (req, res) => {
  const history = await itemService.getPriceHistory(req.user, req.validated.params.id, req.validated.query);
  res.json({ success: true, data: history });
});

export const getPriceChangeHistory = asyncHandler(async (req, res) => {
  const history = await itemService.getPriceChangeHistory(req.user, req.validated.params.id);
  res.json({ success: true, data: history });
});

export const getRecentRates = asyncHandler(async (req, res) => {
  const history = await itemService.getPriceHistory(req.user, req.validated.params.id, req.validated.query);
  res.json({ success: true, data: history.rows.slice(0, 10) });
});

export const getRateSuggestion = asyncHandler(async (req, res) => {
  const suggestion = await itemService.getRateSuggestion(req.user, req.validated.params.id, req.validated.query);
  res.json({ success: true, data: suggestion });
});
