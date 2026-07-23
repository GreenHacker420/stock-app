import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import crypto from "node:crypto";

import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";
import { mountAppRoutes } from "./routes/index.js";
import { getCorsOrigin } from "./utils/env.js";

function requestMetrics(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (body !== undefined) {
      try {
        res.locals.payloadBytes = Buffer.byteLength(JSON.stringify(body));
      } catch {
        res.locals.payloadBytes = undefined;
      }
    }
    return originalJson(body);
  };

  res.on("finish", () => {
    if (process.env.NODE_ENV === "production") return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const payload = res.locals.payloadBytes == null ? "-" : `${res.locals.payloadBytes}b`;
    if (durationMs >= 100 || (res.locals.payloadBytes ?? 0) >= 25_000) {
      console.log(`[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms ${payload}`);
    }
  });

  next();
}

function requestContext(req, res, next) {
  const requestedId = req.get("X-Request-Id");
  req.requestId = requestedId && requestedId.length <= 128
    ? requestedId
    : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: getCorsOrigin() }));
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
  app.use(requestMetrics);
  app.use(requestContext);

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
