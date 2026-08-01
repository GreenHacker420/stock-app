"use client";

import { computeSaleTotals, computeTotalPayments, computeBalance, formatINR } from "../lib/sale-money";
import type { SaleLineFormValue, SalePaymentFormValue } from "../lib/sale-types";
import { Separator } from "@/components/ui/separator";

interface SaleTotalsPanelProps {
  lines: SaleLineFormValue[];
  payments: SalePaymentFormValue[];
  isWalkin: boolean;
}

export function SaleTotalsPanel({ lines, payments, isWalkin }: SaleTotalsPanelProps) {
  const { subtotal, totalDiscounts, totalAmount } = computeSaleTotals(lines);
  const totalPayments = computeTotalPayments(payments);
  const balance = computeBalance(totalAmount, totalPayments);

  const isPaid = balance <= 0.005;
  const isOverpaid = balance < -0.005;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2 text-xs">
      <div className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-2">Preview Totals</div>

      <div className="flex justify-between text-muted-foreground">
        <span>Subtotal</span>
        <span className="font-mono">{formatINR(subtotal)}</span>
      </div>

      {totalDiscounts > 0 && (
        <div className="flex justify-between text-rose-600">
          <span>Line Discounts</span>
          <span className="font-mono">- {formatINR(totalDiscounts)}</span>
        </div>
      )}

      <Separator />

      <div className="flex justify-between font-bold text-sm">
        <span>Total</span>
        <span className="font-mono">{formatINR(totalAmount)}</span>
      </div>

      {payments.length > 0 && (
        <>
          <div className="flex justify-between text-emerald-600">
            <span>Payments Entered</span>
            <span className="font-mono">{formatINR(totalPayments)}</span>
          </div>

          <div className={["flex justify-between font-bold", isOverpaid ? "text-amber-600" : isPaid ? "text-emerald-600" : "text-slate-900 dark:text-slate-100"].join(" ")}>
            <span>{isOverpaid ? "Advance / Overpaid" : "Balance Due"}</span>
            <span className="font-mono">{formatINR(Math.abs(balance))}</span>
          </div>
        </>
      )}

      {isWalkin && !isPaid && (
        <p className="text-rose-600 text-[11px] font-semibold mt-1">
          ⚠ Walk-in sale must be fully paid before submission.
        </p>
      )}

      <p className="text-[10px] text-muted-foreground pt-1 border-t">
        Preview only. Backend calculates authoritative totals.
      </p>
    </div>
  );
}
