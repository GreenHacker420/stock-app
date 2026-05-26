import { Router } from "express";
import { z } from "zod";
import * as cashSessionController from "../controllers/cashSession.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireOwner, requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();
const idParams = z.object({ id: z.string().min(1) });

const shopBodySchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const currentSchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional(),
});

const closeSchema = z.object({
  params: idParams,
  body: z.object({
    actualCash: z.coerce.number().nonnegative(),
    cashHandover: z.coerce.number().nonnegative().optional(),
    otherDeductionsAmount: z.coerce.number().nonnegative().optional(),
    otherDeductionsReason: z.string().optional(),
    differenceReason: z.string().optional(),
  }),
  query: z.object({}).optional(),
});

router.use(requireAuth);

router.post("/open", requirePermission(PERMISSIONS.CASH_SESSION_OPEN), validate(shopBodySchema), cashSessionController.openSession);
router.get("/current", requirePermission(PERMISSIONS.CASH_SESSION_OPEN), validate(currentSchema), cashSessionController.getCurrentSession);
router.post("/:id/close", requirePermission(PERMISSIONS.CASH_SESSION_CLOSE), validate(closeSchema), cashSessionController.closeSession);
router.post("/:id/review", requireOwner, validate(z.object({ params: idParams })), cashSessionController.reviewSession);

export default router;
