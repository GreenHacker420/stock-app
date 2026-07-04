import { Router } from "express";
import { z } from "zod";
import * as syncController from "../controllers/sync.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { requireShopAccess } from "../middleware/shopAccess.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";
import { EVENT_SEQUENCE_CURSOR_REGEX } from "../lib/validate.js";

const router = Router();

router.use(requireAuth);

const syncEventsQuerySchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
    after: z.string().regex(EVENT_SEQUENCE_CURSOR_REGEX, "Cursor must be a decimal sequence").optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
  }),
});

router.get(
  "/domain-events",
  requirePermission(PERMISSIONS.SHOP_VIEW),
  validate(syncEventsQuerySchema),
  requireShopAccess((req) => req.validated.query.shopId),
  syncController.syncDomainEvents,
);

const readModelBootstrapQuerySchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
  }).strict(),
});

router.get(
  "/read-models/bootstrap",
  requirePermission(PERMISSIONS.SHOP_VIEW),
  validate(readModelBootstrapQuerySchema),
  requireShopAccess((req) => req.validated.query.shopId),
  syncController.getReadModelBootstrap,
);

export default router;
