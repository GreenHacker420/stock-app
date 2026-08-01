import type { SaleLineFormValue, SalePaymentFormValue } from "./sale-types";

function toPaise(value: number): number {
  return Math.round(value * 100);
}


function fromPaise(paise: number): number {
  return paise / 100;
}

export function computeLineTotal(line: {
  rate: number;
  quantity: number;
  discountAmount: number;
}): number {
  const ratePaise = toPaise(line.rate);
  const qty = Math.round(line.quantity * 1000); // quantity scale: 3dp
  // rate_paise × quantity (in units) = subtotal in paise×1000 → divide by 1000 for paise
  const grossPaise = Math.round((ratePaise * qty) / 1000);
  const discountPaise = toPaise(line.discountAmount);
  const totalPaise = Math.max(0, grossPaise - discountPaise);
  return fromPaise(totalPaise);
}


export function computeSaleTotals(lines: SaleLineFormValue[]): {
  subtotal: number;
  totalDiscounts: number;
  totalAmount: number;
  lineTotals: number[];
} {
  let subtotalPaise = 0;
  let totalDiscountsPaise = 0;
  const lineTotals: number[] = [];

  for (const line of lines) {
    const lineTotalPaise = toPaise(computeLineTotal(line));
    const discountPaise = toPaise(line.discountAmount);
    subtotalPaise += lineTotalPaise;
    totalDiscountsPaise += discountPaise;
    lineTotals.push(fromPaise(lineTotalPaise));
  }

  return {
    subtotal: fromPaise(subtotalPaise),
    totalDiscounts: fromPaise(totalDiscountsPaise),
    totalAmount: fromPaise(subtotalPaise), // no sale-level discount in current schema
    lineTotals,
  };
}


export function computeTotalPayments(payments: SalePaymentFormValue[]): number {
  const paise = payments.reduce((sum, p) => sum + toPaise(p.amount || 0), 0);
  return fromPaise(paise);
}


export function computeBalance(totalAmount: number, totalPayments: number): number {
  return fromPaise(toPaise(totalAmount) - toPaise(totalPayments));
}

export function formatINR(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function getTodayIST(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata" }).format(
    new Date()
  );
}


export function isDateNotFuture(dateStr: string): boolean {
  return dateStr <= getTodayIST();
}
