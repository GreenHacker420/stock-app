import { asyncHandler } from "../utils/asyncHandler.js";
import * as stockService from "../services/stock.service.js";
import { emitShopEvent, REALTIME_EVENTS } from "../utils/realtime.js";

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
  emitShopEvent(req, movement.shopId, REALTIME_EVENTS.STOCK_UPDATED, { movementId: movement.id, itemId: movement.itemId, action: "movement_created" });
  res.status(201).json({ success: true, data: movement });
});

export const bulkStockEntry = asyncHandler(async (req, res) => {
  const result = await stockService.bulkStockEntry(req.user, req.validated.body);
  if (Array.isArray(result)) {
    for (const movement of result) {
      emitShopEvent(req, movement.shopId, REALTIME_EVENTS.STOCK_UPDATED, { movementId: movement.id, itemId: movement.itemId, action: "movement_created" });
    }
  } else if (result && result.isRequest) {
    emitShopEvent(req, req.validated.body.shopId, REALTIME_EVENTS.NOTIFICATION_CREATED, { entityType: "CorrectionRequest", entityId: result.requestId, action: "created" });
  }
  res.status(201).json({ success: true, data: result });
});
