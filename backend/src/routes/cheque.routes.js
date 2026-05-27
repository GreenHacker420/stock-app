import { Router } from "express";
import { z } from "zod";
import * as chequeController from "../controllers/cheque.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();
const idParams = z.object({ id: z.string().min(1) });
const noteBody = z.object({
  params: idParams,
  body: z.object({ reason: z.string().optional() }).optional(),
  query: z.object({}).optional(),
});

router.use(requireAuth);

router.get(
  "/",
  requirePermission(PERMISSIONS.PAYMENT_VIEW_ALL),
  validate(z.object({
    query: z.object({
      shopId: z.string().optional(),
      status: z.enum(["RECEIVED", "DEPOSITED", "CLEARED", "BOUNCED", "RETURNED", "CANCELLED"]).optional(),
    }),
    params: z.object({}).optional(),
    body: z.object({}).optional(),
  })),
  chequeController.listCheques,
);
router.get("/:id", requirePermission(PERMISSIONS.PAYMENT_VIEW_ALL), validate(z.object({ params: idParams })), chequeController.getCheque);
router.post("/:id/mark-deposited", requirePermission(PERMISSIONS.PAYMENT_VERIFY), validate(noteBody), chequeController.markDeposited);
router.post("/:id/mark-cleared", requirePermission(PERMISSIONS.PAYMENT_VERIFY), validate(noteBody), chequeController.markCleared);
router.post("/:id/mark-bounced", requirePermission(PERMISSIONS.PAYMENT_VERIFY), validate(noteBody), chequeController.markBounced);
router.post("/:id/mark-returned", requirePermission(PERMISSIONS.PAYMENT_VERIFY), validate(noteBody), chequeController.markReturned);

export default router;
