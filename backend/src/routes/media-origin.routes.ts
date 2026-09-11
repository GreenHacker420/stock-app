import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";

import {
  resolveLegacyMediaAlias,
  resolvePublicMediaOrigin,
} from "../services/media-origin.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

const router = Router();

function hasValidWorkerSecret(req: Request): boolean {
  const expected = process.env.ASSET_ORIGIN_TOKEN || process.env.ASSET_GATEWAY_SECRET;
  const provided = req.get("x-asset-origin-token") || req.get("x-asset-gateway-secret");
  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length
    && crypto.timingSafeEqual(expectedBytes, providedBytes);
}

router.use((req, _res, next) => {
  if (!hasValidWorkerSecret(req)) {
    return next(new ApiError(401, "Unauthorized asset origin request"));
  }
  return next();
});

router.get(
  "/origin/:identifier",
  asyncHandler(async (req: Request, res: Response) => {
    const identifier = Array.isArray(req.params.identifier)
      ? req.params.identifier[0]
      : req.params.identifier;
    const data = await resolvePublicMediaOrigin(identifier);
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, data });
  }),
);

router.get(
  "/alias",
  asyncHandler(async (req: Request, res: Response) => {
    const aliasPath = typeof req.query.path === "string" ? req.query.path : "";
    const match = aliasPath.match(/^\/(s3|onedrive)\/(.+)$/i);
    if (!match) throw new ApiError(404, "Alias not found");

    const data = await resolveLegacyMediaAlias(match[1], decodeURIComponent(match[2]));
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, data });
  }),
);

export default router;
