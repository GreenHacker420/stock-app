import { apiRequest } from "@/lib/api/client";
import type { ExpenseRegisterRow } from "@/features/registers/lib/register-types";

export async function verifyExpense(
  token: string,
  expenseId: string,
  status: "APPROVED" | "REJECTED",
  note?: string,
): Promise<ExpenseRegisterRow> {
  return apiRequest<ExpenseRegisterRow>(`/expenses/${expenseId}/verify`, {
    method: "POST",
    token,
    body: { status, note },
  });
}
