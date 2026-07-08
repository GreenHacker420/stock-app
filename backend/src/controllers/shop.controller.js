import { asyncHandler } from "../utils/asyncHandler.js";
import * as shopService from "../services/shop.service.js";

export const listShops = asyncHandler(async (req, res) => {
  const shops = await shopService.listShops(req.user);
  res.json({ success: true, data: shops });
});

export const createShop = asyncHandler(async (req, res) => {
  const shop = await shopService.createShop(req.user, req.validated.body);
  res.status(201).json({ success: true, data: shop });
});

export const updateShop = asyncHandler(async (req, res) => {
  const shop = await shopService.updateShop(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data: shop });
});

export const assignStaff = asyncHandler(async (req, res) => {
  const access = await shopService.assignStaff(
    req.user,
    req.validated.params.id,
    req.validated.body.staffId,
  );
  res.status(201).json({ success: true, data: access });
});

export const setOpeningStock = asyncHandler(async (req, res) => {
  const rows = await shopService.setOpeningStock(
    req.user,
    req.validated.params.id,
    req.validated.body.entries,
  );
  res.status(201).json({ success: true, data: rows });
});

export const unassignStaff = asyncHandler(async (req, res) => {
  const result = await shopService.unassignStaff(
    req.user,
    req.validated.params.id,
    req.validated.body.staffId,
  );
  res.json({ success: true, data: result });
});

export const copyCatalog = asyncHandler(async (req, res) => {
  const result = await shopService.copyCatalog(req.user, req.validated.body);
  res.status(200).json({ success: true, data: result });
});

export const getStorageStats = asyncHandler(async (req, res) => {
  const stats = await shopService.getStorageStats(req.user, req.validated.params.id);
  res.json({ success: true, data: stats });
});

