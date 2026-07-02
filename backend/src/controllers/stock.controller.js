import { asyncHandler } from "../utils/asyncHandler.js";
import * as stockService from "../services/stock.service.js";
import { runIdempotentCreate } from "../services/idempotency.service.js";

export const getCurrentStock = asyncHandler(async (req, res) => {
  const stock = await stockService.getCurrentStock(req.user, req.validated.query);
  res.json({ success: true, data: stock });
});

export const listMovements = asyncHandler(async (req, res) => {
  const movements = await stockService.listMovements(req.user, req.validated.query);
  res.json({ success: true, data: movements });
});

export const createMovement = asyncHandler(async (req, res) => {
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: "POST /stock/movements",
      resourceType: "STOCK_MOVEMENT",
      shopId: req.validated.body.shopId,
    },
    () => stockService.createMovement(req.user, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const bulkStockEntry = asyncHandler(async (req, res) => {
  const result = await runIdempotentCreate(
     req,
     {
       endpoint: "POST /stock/entry",
       resourceType: "STOCK_ENTRY",
       shopId: req.validated.body.shopId,
     },
     () => stockService.bulkStockEntry(req.user, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const transferStock = asyncHandler(async (req, res) => {
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: "POST /stock/transfer",
      resourceType: "STOCK_TRANSFER",
      shopId: req.validated.body.sourceShopId,
    },
    () => stockService.transferStock(req.user, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});
