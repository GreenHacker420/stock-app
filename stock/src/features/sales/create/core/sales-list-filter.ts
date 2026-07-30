export type SaleDateFilter = "TODAY" | "WEEK" | "CUSTOM" | "ALL";
export type SaleStatusFilter = "ALL" | "PAID" | "PENDING" | "PARTIAL" | "CANCELLED";

export type SaleListRecord = {
  saleDate?: string | Date | null;
  createdAt: string | Date;
  saleNumber?: string | null;
  isWalkin?: boolean;
  customer?: { name?: string | null } | null;
  paymentStatus?: string | null;
  saleStatus?: string | null;
  status?: string | null;
};

export type SalePeriodRange = {
  start: Date;
  end: Date;
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function endOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

export function getSalePeriodRange(
  filter: SaleDateFilter,
  now: Date,
  customStart: Date,
  customEnd: Date,
): SalePeriodRange | null {
  if (filter === "ALL") return null;
  if (filter === "TODAY") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  if (filter === "WEEK") {
    const start = startOfDay(now);
    const daysSinceMonday = start.getDay() === 0 ? 6 : start.getDay() - 1;
    start.setDate(start.getDate() - daysSinceMonday);
    return { start, end: endOfDay(now) };
  }

  const first = startOfDay(customStart);
  const second = endOfDay(customEnd);
  return first.getTime() <= second.getTime()
    ? { start: first, end: second }
    : { start: startOfDay(customEnd), end: endOfDay(customStart) };
}

export function saleTimestamp(sale: SaleListRecord) {
  const value = sale.saleDate || sale.createdAt;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isCompletedSaleRecord(sale: SaleListRecord) {
  return sale.saleStatus !== "DRAFT" && sale.status !== "DRAFT";
}

export function filterSalesForPeriod<T extends SaleListRecord>(
  sales: readonly T[],
  range: SalePeriodRange | null,
) {
  const completedSales = sales.filter(isCompletedSaleRecord);
  if (!range) return completedSales;
  const start = range.start.getTime();
  const end = range.end.getTime();
  return completedSales.filter((sale) => {
    const timestamp = saleTimestamp(sale);
    return timestamp !== null && timestamp >= start && timestamp <= end;
  });
}

export function effectiveSaleStatus(sale: SaleListRecord): SaleStatusFilter {
  if (sale.saleStatus === "CANCELLED" || sale.status === "CANCELLED") {
    return "CANCELLED";
  }
  if (sale.paymentStatus === "UNPAID" || sale.paymentStatus === "PENDING") {
    return "PENDING";
  }
  if (sale.paymentStatus === "PAID" || sale.paymentStatus === "PARTIAL") {
    return sale.paymentStatus;
  }
  return "PENDING";
}

export function saleMatchesSearch(sale: SaleListRecord, search: string) {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return true;
  const saleNumber = sale.saleNumber?.toLocaleLowerCase() || "";
  const customerName = sale.isWalkin
    ? "walk-in customer"
    : sale.customer?.name?.toLocaleLowerCase() || "";
  return saleNumber.includes(query) || customerName.includes(query);
}

export function countSalesByStatus(sales: readonly SaleListRecord[]) {
  const counts: Record<SaleStatusFilter, number> = {
    ALL: sales.length,
    PAID: 0,
    PENDING: 0,
    PARTIAL: 0,
    CANCELLED: 0,
  };
  for (const sale of sales) {
    counts[effectiveSaleStatus(sale)] += 1;
  }
  return counts;
}
