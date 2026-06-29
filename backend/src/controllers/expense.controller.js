import { asyncHandler } from "../utils/asyncHandler.js";
import * as expenseService from "../services/expense.service.js";
import { runIdempotentCreate } from "../services/idempotency.service.js";

export const createExpense = asyncHandler(async (req, res) => {
  const result = await runIdempotentCreate(
    req,
    {
      endpoint: "POST /expenses",
      resourceType: "EXPENSE",
      shopId: req.validated.body.shopId,
    },
    () => expenseService.createExpense(req.user, req.validated.body),
  );
  res.status(result.statusCode).json({ success: true, data: result.data });
});

export const listExpenses = asyncHandler(async (req, res) => {
  const data = await expenseService.listExpenses(req.user, req.validated.query);
  res.json({ success: true, data });
});

export const verifyExpense = asyncHandler(async (req, res) => {
  const data = await expenseService.verifyExpense(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data });
});
