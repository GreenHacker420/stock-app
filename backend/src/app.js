import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";
import { mountAppRoutes } from "./routes/index.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
  app.use(express.json({
    limit: "2mb",
    verify: (req, res, buf) => {
      if (req.originalUrl && req.originalUrl.includes("/whatsapp/webhook")) {
        req.rawBody = buf;
      }
    }
  }));

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

  mountAppRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
