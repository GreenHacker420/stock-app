import { Router } from "express";
import { z } from "zod";
import * as expenseController from "../controllers/expense.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../utils/permissions.js";

const router = Router();

const createSchema = z.object({
  body: z.object({
    shopId: z.string().min(1),
    amount: z.coerce.number().positive(),
    category: z.string().min(1),
    note: z.string().optional(),
    photoUrl: z.string().optional(),
    vendorName: z.string().optional(),
  }),
});

const listSchema = z.object({
  query: z.object({
    shopId: z.string().min(1),
  }),
});

const idParams = z.object({ id: z.string().min(1) });

const verifySchema = z.object({
  params: idParams,
  body: z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
    note: z.string().optional(),
  }),
});

router.use(requireAuth);

router.post("/", requirePermission(PERMISSIONS.EXPENSE_CREATE), validate(createSchema), expenseController.createExpense);
router.get("/", requirePermission(PERMISSIONS.EXPENSE_VIEW), validate(listSchema), expenseController.listExpenses);
router.post("/:id/verify", requirePermission(PERMISSIONS.EXPENSE_VERIFY), validate(verifySchema), expenseController.verifyExpense);

export default router;
