import { asyncHandler } from "../utils/asyncHandler.js";
import * as itemService from "../services/item.service.js";
import * as itemDuplicateService from "../services/item.duplicate.service.js";
import { runIdempotentCreate } from "../services/idempotency.service.js";

export const listItems = asyncHandler(async (req, res) => {
  const items = await itemService.listItems(req.user, req.validated.query);
  res.json({ success: true, data: items });
});

export const getItemSummary = asyncHandler(async (req, res) => {
  const summary = await itemService.getItemSummary(req.user, req.validated.query);
  res.json({ success: true, data: summary });
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await itemService.createCategory(req.user, req.validated.body);
  res.status(201).json({ success: true, data: category });
});

export const listCategories = asyncHandler(async (req, res) => {
  const categories = await itemService.listCategories(req.user, req.validated.query);
  res.json({ success: true, data: categories });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await itemService.updateCategory(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: category });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  await itemService.deleteCategory(req.user, req.validated.params.id);
  res.json({ success: true, data: { success: true } });
});

export const createItem = asyncHandler(async (req, res) => {
  const item = await itemService.createItem(req.user, req.validated.body);
  res.status(201).json({ success: true, data: item });
});

export const updateItem = asyncHandler(async (req, res) => {
  const item = await itemService.updateItem(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: item });
});

export const deleteItem = asyncHandler(async (req, res) => {
  const item = await itemService.deleteItem(req.user, req.validated.params.id);
  res.json({ success: true, data: item });
});

export const uploadItemImage = asyncHandler(async (req, res) => {
  const upload = await itemService.uploadItemImage(req.user, req.validated.body, req.file);
  res.status(201).json({ success: true, data: upload });
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

export const createBrand = asyncHandler(async (req, res) => {
  const brand = await itemService.createBrand(req.user, req.validated.body);
  res.status(201).json({ success: true, data: brand });
});

export const listBrands = asyncHandler(async (req, res) => {
  const brands = await itemService.listBrands(req.user, req.validated.query);
  res.json({ success: true, data: brands });
});

export const updateBrand = asyncHandler(async (req, res) => {
  const brand = await itemService.updateBrand(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: brand });
});

export const deleteBrand = asyncHandler(async (req, res) => {
  const brand = await itemService.deleteBrand(req.user, req.validated.params.id);
  res.json({ success: true, data: brand });
});

export const batchQuickUpdate = asyncHandler(async (req, res) => {
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: "POST /items/batch-quick-update",
      resourceType: "ITEM_BATCH_QUICK_UPDATE",
      shopId: req.validated.body.shopId,
      statusCode: 200,
    },
    () => itemService.batchQuickUpdate(
      req.user,
      req.validated.body.shopId,
      req.validated.body.updates
    )
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const mergeItems = asyncHandler(async (req, res) => {
  const result = await itemService.mergeItems(req.user, req.validated.body);
  res.json({ success: true, data: result });
});

export const findDuplicates = asyncHandler(async (req, res) => {
  const { shopId, name, sku, categoryId, excludeItemId, limit } = req.validated.query;
  const results = await itemDuplicateService.findDuplicates(req.user, {
    shopId,
    name,
    sku,
    categoryId,
    excludeItemId,
    limit: limit ? Number(limit) : 5,
  });
  res.json({ success: true, data: results });
});
