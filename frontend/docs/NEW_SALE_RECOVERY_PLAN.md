# New Sale Recovery Plan — Core Write Recovery Sprint 1

## Audit Summary

### Backend contracts verified (all real, no changes needed)

**POST /sales** — `sale.controller.js` already wraps via `runIdempotentCreate(req, ...)`  
**Idempotency** — `idempotency.service.js` is DB-backed. Reads `Idempotency-Key` header. Scopes by `(key, shopId, userId, endpoint)`. Stores request hash and replay JSON.  
**Customer search** — `GET /customers?shopId=&search=&includeWalkin=&page=&limit=`  
**Item search** — `GET /items?shopId=&search=&page=&limit=`  
**Item stock** — `GET /items/:id/stock`  
**Rate suggestion** — `GET /items/:id/customer-rate-suggestion?customerId=`  
**Recent rates** — `GET /items/:id/recent-rates?customerId=`

### Exact POST /sales request contract

```typescript
{
  shopId: string;              // required
  customerId?: string;         // mode: existing customer
  customerInfo?: {             // mode: captured inline
    name?: string;
    phone?: string;
    email?: string;
  };
  isWalkin?: boolean;          // mode: walk-in (backend resolves walk-in customer)
  saleDate?: string;           // "YYYY-MM-DD", no future date, defaults to today
  dueDate?: string;            // coerce date
  items: Array<{
    itemId: string;            // real server ID, no hardcoding
    quantity: number;          // nonnegative
    rate: number;              // nonnegative
    discountAmount?: number;   // nonnegative
    serialNumbers?: string[];  // required when item.requiresSerialNumber
    description?: string;
  }>;
  payments?: Array<{
    paymentMode: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE";
    amount: number;            // nonnegative
    paymentDate?: string;      // "YYYY-MM-DD"
    referenceNumber?: string;
    proofImageUrl?: string;
    notes?: string;
    details?: Record<string, unknown>;
  }>;
  customerSignature?: string;
  gstRequired?: boolean;
  notes?: string;
}
```

### POST /sales response

Returns full `sale` object from `sale.service.js` including:
- `id`, `saleNumber`, `shopId`, `staffId`, `customerId`
- `subtotal`, `discountAmount`, `totalAmount`, `paidAmount`, `balanceAmount`
- `paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID"`
- `saleStatus: "CONFIRMED" | "PAID"`
- `gstRequired`, `gstInvoiceStatus`
- `customer: { id, name, phone, type }`
- `items: [{ id, itemId, quantity, rate, discountAmount, totalAmount, serialNumbers, description, item: {...} }]`
- `payments: [{ id, paymentMode, amount, paymentStatus, referenceNumber, ... }]`
- `staff: { id, name, role }`
- `saleDate`, `createdAt`

Status codes: `201` on creation, `200` on idempotent replay.

### Money formula (backend — `transactionHelpers.js calculateItemTotals`)

```
lineTotal = (rate × quantity) - discountAmount
subtotal  = sum(lineTotals)
totalAmount = subtotal  (no overall sale discount in current schema)
```

All stored as `Prisma.Decimal` (2 decimal places, ROUND_HALF_UP).

### Walk-in rule

`isWalkin: true` → backend calls `getOrCreateWalkIn`. Payment status must be PAID.

### Serial number rule

`item.requiresSerialNumber === true` → exactly `quantity` serial numbers required.

### Idempotency behavior

- Send header: `Idempotency-Key: <uuid>`
- Same key + same body → 200 replay
- Same key + different body → 409 IDEMPOTENCY_KEY_CONFLICT
- In-progress → 409 IDEMPOTENCY_REQUEST_IN_PROGRESS
- Failed attempts → key deleted, safe to retry with same key

---

## Feature Availability Registry

### `frontend/lib/features/feature-availability.ts`

Typed registry with status `ENABLED | DISABLED | UNSUPPORTED`:

- `SALE_CREATE` → **ENABLED**, `/sales/new`, F8, `sale:create`
- `ORDER_CREATE` → **DISABLED**, `/orders/new`, Ctrl+F8, `order:create`  
- `DM_CREATE` → **DISABLED**, `/delivery-memos/new`, Alt+F8, `dm:create`
- `PAYMENT_CREATE` → **DISABLED**, `/payments/new`, F6, `payment:create`
- `STOCK_ENTRY` → **DISABLED**, `/inventory/stock-entry`, F9, `stock:create_movement`
- `STOCK_TRANSFER` → **DISABLED**, no route, Alt+F9, `stock:create_movement`
- `PHYSICAL_STOCK` → **UNSUPPORTED**, no route, Ctrl+F7, `stock:create_movement`

Consumers: `RightActionRail`, `CommandPalette`, `ShortcutProvider`, dashboard button, sales register button.

---

## Component Structure

```
frontend/features/sales/
├── api/
│   ├── sale.queries.ts          — useItemSearchQuery, useCustomerSearchQuery, useItemStockQuery, useRateSuggestionQuery
│   └── sale.mutations.ts        — useCreateSale mutation
├── components/
│   ├── NewSaleForm.tsx          — top-level orchestrator, RHF context, unsaved guard
│   ├── SaleCustomerSelector.tsx — debounced search, walk-in mode, captured-inline mode
│   ├── SaleItemSearch.tsx       — debounced item search popover
│   ├── SaleLineGrid.tsx         — desktop editable grid (keyboard-first)
│   ├── SaleLineEditor.tsx       — individual line row (rate, qty, discount, serial)
│   ├── SerialNumberDialog.tsx   — dialog for serial-number capture
│   ├── SalePaymentPanel.tsx     — 0–N payment entries with mode-specific fields
│   ├── SaleTotalsPanel.tsx      — preview subtotal/discount/total/paid/balance
│   ├── SaleValidationSummary.tsx— non-field error Alert display
│   └── SaleMobileActionBar.tsx  — mobile sticky bottom submit bar
├── hooks/
│   ├── useNewSaleDraft.ts       — draft state + UUID idempotency key lifecycle
│   ├── useCreateSale.ts         — TanStack mutation with exact invalidations
│   └── useUnsavedSaleGuard.ts   — beforeunload + in-app navigation guard
├── lib/
│   ├── sale-schema.ts           — Zod schema aligned with backend
│   ├── sale-types.ts            — TypeScript contracts for form values and API
│   ├── sale-money.ts            — decimal-safe preview math (paise-based)
│   └── sale-payload.ts          — form values → POST /sales body mapping
└── tests/
    ├── sale-schema.test.ts
    ├── sale-money.test.ts
    ├── sale-payload.test.ts
    └── feature-availability.test.ts
```

---

## Query Invalidation on Success

After `POST /sales` succeeds:

1. `queryClient.setQueryData(queryKeys.sales.detail(sale.id), sale)` — write returned sale to cache
2. `queryClient.invalidateQueries({ queryKey: ["sales", activeShopId] })` — invalidate register
3. `queryClient.invalidateQueries({ queryKey: ["dashboard", "owner", activeShopId] })` — snapshot
4. `queryClient.invalidateQueries({ queryKey: ["dashboard", "owner-analytics"] })` — analytics
5. `queryClient.invalidateQueries({ queryKey: ["items", activeShopId] })` — stock snapshots
6. `queryClient.invalidateQueries({ queryKey: ["customers", "detail", customerId] })` — if customerId sent
7. `queryClient.invalidateQueries({ queryKey: ["payments", activeShopId] })` — if payments included

---

## Keyboard Behavior

- **F8** registered as GLOBAL, permission-aware (`sale:create`)
- **F4** opens customer selector inside sale form (FORM scope)
- **Ctrl+A / Ctrl+S** saves form when FORM scope is active  
- **Escape** closes serial dialog → then closes form with dirty-guard
- **Enter** in item search selects the focused item
- **Arrow keys** navigate the line grid cells
- All DISABLED features: shortcut NOT registered (via `disabled: true`)

---

## Idempotency Key Lifecycle

1. UUID generated in `useNewSaleDraft` when a new draft starts
2. Same key reused for retries of the same unchanged draft
3. New key generated only after:
   - confirmed success response
   - explicit "New Sale" action after save
   - manual reset
4. Sent as `Idempotency-Key: <uuid>` header in `createSaleApi`

---

## Tests

### Backend tests (backend/src/tests/sale.create.test.js)

1. Owner creates sale
2. Permitted staff creates sale
3. No sale:create → 403
4. Cross-shop customer → 400
5. Cross-shop item → 400
6. Insufficient stock → 400
7. Serial-required item without serials → 400
8. Wrong serial count → 400
9. Walk-in partially paid → 400
10. Regular customer credit sale → allowed
11. Split payment → correct payment records
12. Stock decreases exactly once
13. Customer outstanding updated once
14. Audit log created
15. Domain events created
16. Duplicate idempotency key → no duplicate sale (replay)
17. Same key + changed payload → 409
18. Failed validation → safe retry
19. India date boundary
20. Rollback leaves no partial data

### Frontend unit tests (features/sales/tests/)

- sale-schema.test.ts: Zod validation rules
- sale-money.test.ts: paise arithmetic, line preview
- sale-payload.test.ts: form → API body mapping
- feature-availability.test.ts: ENABLED/DISABLED/UNSUPPORTED behavior, shortcut guards

---

## Deferred Deliberately

- Standalone `/payments/new` (Sprint 2)
- `/orders/new` (Sprint 3)
- `/delivery-memos/new` (Sprint 3)
- `/inventory/stock-entry` (Sprint 2)
- `/inventory/stock-transfer` (Sprint 2)
- Physical Stock (Unsupported)
- WhatsApp inbox

---

## Files to Create/Modify

### New files
- `frontend/lib/features/feature-availability.ts`
- `frontend/features/sales/lib/sale-types.ts`
- `frontend/features/sales/lib/sale-schema.ts`
- `frontend/features/sales/lib/sale-money.ts`
- `frontend/features/sales/lib/sale-payload.ts`
- `frontend/features/sales/api/sale.queries.ts`
- `frontend/features/sales/api/sale.mutations.ts`
- `frontend/features/sales/hooks/useNewSaleDraft.ts`
- `frontend/features/sales/hooks/useCreateSale.ts`
- `frontend/features/sales/hooks/useUnsavedSaleGuard.ts`
- `frontend/features/sales/components/NewSaleForm.tsx`
- `frontend/features/sales/components/SaleCustomerSelector.tsx`
- `frontend/features/sales/components/SaleItemSearch.tsx`
- `frontend/features/sales/components/SaleLineGrid.tsx`
- `frontend/features/sales/components/SaleLineEditor.tsx`
- `frontend/features/sales/components/SerialNumberDialog.tsx`
- `frontend/features/sales/components/SalePaymentPanel.tsx`
- `frontend/features/sales/components/SaleTotalsPanel.tsx`
- `frontend/features/sales/components/SaleValidationSummary.tsx`
- `frontend/features/sales/components/SaleMobileActionBar.tsx`
- `frontend/features/sales/tests/sale-schema.test.ts`
- `frontend/features/sales/tests/sale-money.test.ts`
- `frontend/features/sales/tests/sale-payload.test.ts`
- `frontend/features/sales/tests/feature-availability.test.ts`
- `frontend/docs/NEW_SALE_RECOVERY_PLAN.md`

### Modified files
- `frontend/lib/api/client.ts` — add `createSaleApi`, `searchCustomersApi`, `searchItemsApi`, `getItemStockApi`
- `frontend/lib/query/query-keys.ts` — add `items.stock`, `items.rateSuggestion`
- `frontend/lib/features/feature-availability.ts` — new
- `frontend/app/(dashboard)/sales/new/page.tsx` — replace ModuleUnavailable with real form
- `frontend/components/shell/RightActionRail.tsx` — consume feature registry
- `frontend/components/command-palette/CommandPalette.tsx` — show disabled actions
- `frontend/components/keyboard/ShortcutProvider.tsx` — handle disabled shortcuts from registry
