import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import authRoutes from "./routes/auth.routes.js";
import shopRoutes from "./routes/shop.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import itemRoutes from "./routes/item.routes.js";
import stockRoutes from "./routes/stock.routes.js";
import cashSessionRoutes from "./routes/cashSession.routes.js";
import orderRoutes from "./routes/order.routes.js";
import saleRoutes from "./routes/sale.routes.js";
import deliveryMemoRoutes from "./routes/deliveryMemo.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import dailySummaryRoutes from "./routes/dailySummary.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import rateChangeRequestRoutes from "./routes/rateChangeRequest.routes.js";
import correctionRequestRoutes from "./routes/correctionRequest.routes.js";
import auditLogRoutes from "./routes/auditLog.routes.js";
import chequeRoutes from "./routes/cheque.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
  app.use(express.json({ limit: "2mb" }));

  if (process.env.NODE_ENV !== "test") {
    app.use(morgan("dev"));
  }

  app.get("/", (_req, res) => {
    res.json({
      success: true,
      message: "API is running",
    });
  });

  app.get("/health", (_req, res) => {
    res.json({
      success: true,
      data: {
        status: "ok",
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use("/auth", authRoutes);
  app.use("/shops", shopRoutes);
  app.use("/customers", customerRoutes);
  app.use("/items", itemRoutes);
  app.use("/stock", stockRoutes);
  app.use("/cash-sessions", cashSessionRoutes);
  app.use("/orders", orderRoutes);
  app.use("/sales", saleRoutes);
  app.use("/delivery-memos", deliveryMemoRoutes);
  app.use("/payments", paymentRoutes);
  app.use("/daily-summary", dailySummaryRoutes);
  app.use("/daily-summaries", dailySummaryRoutes);
  app.use("/notifications", notificationRoutes);
  app.use("/rate-change-requests", rateChangeRequestRoutes);
  app.use("/correction-requests", correctionRequestRoutes);
  app.use("/audit-logs", auditLogRoutes);
  app.use("/cheques", chequeRoutes);
  app.use("/dashboard", dashboardRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
