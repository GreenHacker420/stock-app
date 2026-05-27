import { asyncHandler } from "../utils/asyncHandler.js";
import * as shopService from "../services/shop.service.js";
import { emitShopEvent, REALTIME_EVENTS } from "../utils/realtime.js";

export const listShops = asyncHandler(async (req, res) => {
  const shops = await shopService.listShops(req.user);
  res.json({ success: true, data: shops });
});

export const createShop = asyncHandler(async (req, res) => {
  const shop = await shopService.createShop(req.user, req.validated.body);
  emitShopEvent(req, shop.id, REALTIME_EVENTS.SHOP_UPDATED, { shopId: shop.id, action: "created" });
  res.status(201).json({ success: true, data: shop });
});

export const updateShop = asyncHandler(async (req, res) => {
  const shop = await shopService.updateShop(req.user, req.validated.params.id, req.validated.body);
  emitShopEvent(req, shop.id, REALTIME_EVENTS.SHOP_UPDATED, { shopId: shop.id, action: "updated" });
  res.json({ success: true, data: shop });
});

export const assignStaff = asyncHandler(async (req, res) => {
  const access = await shopService.assignStaff(
    req.user,
    req.validated.params.id,
    req.validated.body.staffId,
  );
  emitShopEvent(req, req.validated.params.id, REALTIME_EVENTS.SHOP_UPDATED, { shopId: req.validated.params.id, staffId: access.staffId, action: "staff_assigned" });
  res.status(201).json({ success: true, data: access });
});

export const setOpeningStock = asyncHandler(async (req, res) => {
  const rows = await shopService.setOpeningStock(
    req.user,
    req.validated.params.id,
    req.validated.body.entries,
  );
  emitShopEvent(req, req.validated.params.id, REALTIME_EVENTS.STOCK_UPDATED, { shopId: req.validated.params.id, action: "opening_stock_set" });
  res.status(201).json({ success: true, data: rows });
});
