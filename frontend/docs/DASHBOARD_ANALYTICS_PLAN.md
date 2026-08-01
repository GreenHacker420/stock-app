# Owner Dashboard Analytics & Visualizations Plan

**Repository**: GreenHacker420/stock-app  
**Target**: `backend/` & `frontend/`  
**Date**: August 1, 2026  

---

## 1. Current Snapshot Capabilities vs Missing Analytics

### Current Snapshot Capabilities
- `GET /dashboard/owner`: Single-day operational snapshot (`todaySales`, `cashCollected`, `pendingDmAmount`, `lowStockAlerts`, `paymentVerificationPending`, `cashMismatch`, `gstInvoicesPendingCount`, `newCustomersToday`).
- `GET /dashboard/staff/today`: Single-day staff summary (`salesTotal`, `ordersPacked`, `cashCollected`).

### Missing Analytics Information
- **Time-Series Trends**: No multi-day trend analysis for sales revenue, expense volume, or sales-less-recorded-expenses.
- **Collection Breakdown**: No date-range collection mix (Cash vs UPI vs Card vs Bank vs Cheque) breakdown.
- **Top Product Performers**: No top items by revenue and quantity sold across custom date ranges.
- **Top Customer Leaders**: No top customer accounts by overall sales volume.
- **Customer Acquisition Growth**: No time-series customer growth trend over custom periods.

---

## 2. Selected Chart Library & Component Architecture

- **Library**: `recharts` (installed via `npx shadcn@latest add chart`).
- **Shadcn Chart Primitives**: `components/ui/chart.tsx` (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`).
- **Styling & Theme**: Styled with `base-nova` CSS variables, supporting light/dark theme contrast, responsive containers, and Recharts `accessibilityLayer`.

---

## 3. Backend Endpoint Contract (`GET /dashboard/owner/analytics`)

### Route Definition
`GET /dashboard/owner/analytics`

### Middleware Stack
1. `requireAuth`: Verifies active user JWT token.
2. `requireOwner`: Enforces `user.role === "OWNER"`.
3. `validate(analyticsQuerySchema)`: Validates input params via Zod.
4. `assertShopAccess(user, shopId)`: Validates owner access to target shop.

### Query Parameters
```ts
{
  shopId?: string;           // Optional single shop filter
  dateFrom: string;          // YYYY-MM-DD (Required)
  dateTo: string;            // YYYY-MM-DD (Required)
  granularity?: "AUTO" | "DAY" | "WEEK" | "MONTH"; // Default "AUTO"
  topLimit?: number;         // Default 5 (min 3, max 10)
}
```

### Business Rules & Timezone
- Timezone: `Asia/Kolkata` (+05:30).
- Range Validation: `dateFrom <= dateTo`, maximum range 366 days.
- Granularity rules for `AUTO`:
  - 1–31 days: `DAY`
  - 32–120 days: `WEEK`
  - 121–366 days: `MONTH`

### Response Payload Contract (`OwnerDashboardAnalytics`)
```ts
type OwnerDashboardAnalytics = {
  range: {
    dateFrom: string;
    dateTo: string;
    granularity: "DAY" | "WEEK" | "MONTH";
    timezone: "Asia/Kolkata";
  };
  totals: {
    salesAmount: number;
    invoiceCount: number;
    expensesAmount: number;
    salesLessRecordedExpenses: number;
    collectedAmount: number;
  };
  salesTrend: Array<{
    period: string;
    salesAmount: number;
    expensesAmount: number;
    salesLessRecordedExpenses: number;
    invoiceCount: number;
  }>;
  paymentMix: Array<{
    paymentMode: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE";
    amount: number;
    paymentCount: number;
  }>;
  orderStatus: Array<{
    status: string;
    count: number;
  }>;
  topItems: Array<{
    itemId: string;
    itemName: string;
    quantitySold: number;
    revenue: number;
  }>;
  topCustomers: Array<{
    customerId: string;
    customerName: string;
    invoiceCount: number;
    salesAmount: number;
  }>;
  customerTrend: Array<{
    period: string;
    newCustomers: number;
  }>;
};
```

---

## 4. Metric Semantics

1. **Sales Amount**: Total amount of non-cancelled sales (`saleStatus !== "CANCELLED"`) with `saleDate` between `dateFrom` and `dateTo`.
2. **Recorded Expenses**: Total amount of expenses recorded with `createdAt` between `dateFrom` and `dateTo`.
3. **Sales Less Recorded Expenses**: `salesAmount - expensesAmount`. (Labeled strictly as "Sales Less Recorded Expenses", NOT "Net Profit").
4. **Payment Mix**: Total received payments (`status !== "CANCELLED" && status !== "REJECTED"`) within `dateFrom` and `dateTo`, grouped by `paymentMode`.
5. **Order Status Snapshot**: Counts of mutually exclusive order statuses (`CONFIRMED`, `PACKING`, `DISPATCHED`, `DELIVERED`, `CANCELLED`).
6. **Top Items**: Non-cancelled `SaleItem` records grouped by `itemId`, summing `quantity` and `totalAmount`.
7. **Top Customers**: Non-cancelled `Sale` records grouped by `customerId` (excluding `type === "WALK_IN"`), summing `totalAmount`.
8. **Customer Growth**: Count of new non-walk-in `Customer` accounts created in each time bucket.

---

## 5. Query and Cache Ownership

- **Query Key Factory**:
  `queryKeys.dashboard.ownerAnalytics({ shopId, dateFrom, dateTo, granularity, topLimit })`
- **Freshness Policy**:
  - `staleTime`: 60,000 ms (60 seconds)
  - `gcTime`: 10 minutes (600,000 ms)
  - `refetchOnWindowFocus`: true
  - `refetchOnReconnect`: true
- **Realtime Invalidation**:
  - `sale_created` -> invalidate `ownerAnalytics` for affected shop.
  - `stock_updated` -> invalidate `ownerAnalytics` for affected shop.
  - `payment_recorded` -> invalidate `ownerAnalytics` for affected shop.

---

## 6. Frontend Feature Architecture (`frontend/features/dashboard`)

```text
frontend/features/dashboard/
├── api/
│   └── dashboard-analytics.query.ts
├── components/
│   ├── DashboardAnalyticsSection.tsx
│   ├── DashboardAnalyticsToolbar.tsx
│   ├── SalesTrendChart.tsx
│   ├── PaymentMixChart.tsx
│   ├── OrderStatusChart.tsx
│   ├── TopItemsChart.tsx
│   ├── TopCustomersChart.tsx
│   └── CustomerGrowthChart.tsx
├── lib/
│   ├── analytics-formatters.ts
│   └── analytics-types.ts
└── tests/
    └── analytics.test.ts
```

---

## 7. Responsive & Accessibility Guidelines

- **Responsiveness**: Charts stack vertically to 1 column on mobile viewports (`390px`). Desktop uses a 12-column grid. Explicit min-heights (280px–350px). Horizontal bar charts accommodate long product and customer names cleanly.
- **Accessibility**: Recharts `accessibilityLayer` enabled. Every chart card includes a readable text summary for screen readers. High contrast colors for light/dark themes.

---

## 8. Implementation Order

1. **Backend**:
   - Add `getOwnerDashboardAnalytics` to `backend/src/services/dashboard.service.js`.
   - Add controller method `ownerAnalytics` to `backend/src/controllers/dashboard.controller.js`.
   - Add `GET /dashboard/owner/analytics` route with validation to `backend/src/routes/dashboard.routes.js`.
   - Add backend tests for validation, owner permission check, staff 403 rejection, date range calculations.

2. **Frontend**:
   - Create types & formatters in `frontend/features/dashboard/lib/`.
   - Add `fetchOwnerDashboardAnalyticsApi` and query key factory in `frontend/lib/api/client.ts` & `frontend/lib/query/query-keys.ts`.
   - Create `DashboardAnalyticsToolbar.tsx` with date preset options (7D, 30D, 90D, Custom) and URL search params persistence.
   - Build 6 domain chart components (`SalesTrendChart.tsx`, `PaymentMixChart.tsx`, `OrderStatusChart.tsx`, `TopItemsChart.tsx`, `TopCustomersChart.tsx`, `CustomerGrowthChart.tsx`).
   - Assemble `DashboardAnalyticsSection.tsx` and integrate into `app/(dashboard)/dashboard/page.tsx`.

3. **Validation**:
   - Unit tests for analytics formatters and query functions.
   - Playwright E2E tests for analytics toolbar, charts rendering, mobile responsiveness, staff 403 guard.
   - Run `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run build`, `npm run test:e2e`.

---

## 9. Deliberately Deferred

- Staff analytics time-series charts.
- COGS / Gross profit calculation (requires full purchase batch cost accounting).
- AI-generated automated narrative text conclusions.
- Transaction forms re-enabling.
