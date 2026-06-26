import { asyncHandler } from "../utils/asyncHandler.js";
import * as saleService from "../services/sale.service.js";
import { emitShopEvent, REALTIME_EVENTS } from "../utils/realtime.js";
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
  if (!result.replayed) {
    emitShopEvent(req, sale.shopId, REALTIME_EVENTS.SALE_UPDATED, { saleId: sale.id, action: "created" });
    emitShopEvent(req, sale.shopId, REALTIME_EVENTS.PAYMENT_UPDATED, { saleId: sale.id, action: "created" });
    emitShopEvent(req, sale.shopId, REALTIME_EVENTS.STOCK_UPDATED, { saleId: sale.id, action: "sale_created" });
  }
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

export const updateGstInvoice = asyncHandler(async (req, res) => {
  const sale = await saleService.updateGstInvoice(req.user, req.validated.params.id, req.validated.body);
  emitShopEvent(req, sale.shopId, REALTIME_EVENTS.SALE_UPDATED, { saleId: sale.id, action: "gst_updated" });
  res.json({ success: true, data: sale });
});
