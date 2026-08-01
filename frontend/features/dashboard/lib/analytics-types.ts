export type PaymentMode = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE";

export type Granularity = "AUTO" | "DAY" | "WEEK" | "MONTH";

export type AnalyticsRange = {
  dateFrom: string;
  dateTo: string;
  granularity: Granularity;
  timezone: "Asia/Kolkata";
};

export type AnalyticsTotals = {
  salesAmount: number;
  invoiceCount: number;
  expensesAmount: number;
  salesLessRecordedExpenses: number;
  collectedAmount: number;
};

export type SalesTrendItem = {
  period: string;
  salesAmount: number;
  expensesAmount: number;
  salesLessRecordedExpenses: number;
  invoiceCount: number;
};

export type PaymentMixItem = {
  paymentMode: PaymentMode;
  amount: number;
  paymentCount: number;
};

export type OrderStatusItem = {
  status: string;
  count: number;
};

export type TopItemRecord = {
  itemId: string;
  itemName: string;
  quantitySold: number;
  revenue: number;
};

export type TopCustomerRecord = {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  salesAmount: number;
};

export type CustomerTrendItem = {
  period: string;
  newCustomers: number;
};

export type OwnerDashboardAnalytics = {
  range: AnalyticsRange;
  totals: AnalyticsTotals;
  salesTrend: SalesTrendItem[];
  paymentMix: PaymentMixItem[];
  orderStatus: OrderStatusItem[];
  topItems: TopItemRecord[];
  topCustomers: TopCustomerRecord[];
  customerTrend: CustomerTrendItem[];
};

export type AnalyticsQueryParams = {
  shopId?: string;
  dateFrom: string;
  dateTo: string;
  granularity?: Granularity;
  topLimit?: number;
};
