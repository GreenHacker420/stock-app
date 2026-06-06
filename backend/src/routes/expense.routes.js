import { Router } from "express";
import { z } from "zod";
import * as expenseController from "../controllers/expense.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";

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

router.use(requireAuth);

router.post("/", validate(createSchema), expenseController.createExpense);
router.get("/", validate(listSchema), expenseController.listExpenses);

export default router;
