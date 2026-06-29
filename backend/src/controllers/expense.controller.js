import { asyncHandler } from "../utils/asyncHandler.js";
import * as expenseService from "../services/expense.service.js";

export const createExpense = asyncHandler(async (req, res) => {
  const data = await expenseService.createExpense(req.user, req.validated.body);
  res.status(201).json({ success: true, data });
});

export const listExpenses = asyncHandler(async (req, res) => {
  const data = await expenseService.listExpenses(req.user, req.validated.query);
  res.json({ success: true, data });
});

export const verifyExpense = asyncHandler(async (req, res) => {
  const data = await expenseService.verifyExpense(req.user, req.validated.params.id, req.validated.body);
  res.json({ success: true, data });
});
