# Foundation Stabilization Audit

**Repository**: GreenHacker420/stock-app  
**Target**: `frontend/`  
**Date**: August 1, 2026  

---

## 1. Current Problems Found

1. **Deceptive Fake Behavior on WhatsApp Page (`app/(dashboard)/whatsapp/page.tsx`)**:
   - The WhatsApp page contains hardcoded mock logs, simulated chat bubbles, simulated recipient phone numbers, fake "SENT/DELIVERED/READ" badges, and local state dispatching (`sentLogs`).
   - Does not query the real backend capability endpoint (`GET /whatsapp/capability?shopId=...`) or display clean disconnected/unimplemented states.

2. **Unsafe Write Workflows (`/new` routes & stock operations)**:
   - Creation pages (`/sales/new`, `/orders/new`, `/delivery-memos/new`, `/payments/new`, `/inventory/stock-entry`, `/inventory/physical-stock`, `/inventory/stock-transfer`) contain incomplete form inputs, active submit buttons, and lack full stock validation, idempotency key generation, or server-authoritative calculations.
   - Submitting these incomplete forms risks creating corrupted records or failing silently.

3. **Insecure Permission Guard (`frontend/lib/permissions/permissions.ts`)**:
   - `hasPermission` helper defaults to returning `true` for null users, missing permission arrays, or unknown permission strings.
   - Violates the principle of fail-closed authorization.

4. **Protected Route & Auth Resolution Gaps (`frontend/app/(dashboard)/layout.tsx` & `lib/auth/auth-store.ts`)**:
   - Route protection relies on loose client checks, rendering protected dashboard shell components before auth is resolved.
   - Logout does not reset all client stores, TanStack Query cache, date state, or Socket.IO connection.
   - API `401` and `403` error handling is inconsistent.

5. **Fragmented & Duplicate Keyboard Listeners (`frontend/lib/keyboard/shortcut-engine.ts`, shell components, pages)**:
   - Scattered `keydown` event listeners exist in `Header.tsx`, `CommandPalette.tsx`, `DatePeriodDialog.tsx`, `ShopSwitcherDialog.tsx`, and individual page components.
   - Lacks a strict priority stack (`DIALOG > FORM > TABLE > PAGE > GLOBAL`), leading to duplicate actions, navigation glitches, and unhandled input typing conflicts.

6. **Dashboard API Contract Misalignment (`frontend/app/(dashboard)/dashboard/page.tsx`)**:
   - Dashboard page used guessed field names (`todaySalesTotal`, `outstandingTotal`, `recentActivity`) rather than matching the actual backend responses (`GET /dashboard/owner` and `GET /dashboard/staff/today`).
   - Passed ambiguous date ranges (`dateFrom`/`dateTo`) to single-date business APIs.

7. **Query Cache & Testing Foundation Missing**:
   - Query keys lack centralized standardization.
   - Automated testing suite (Vitest, Testing Library, Playwright) and npm validation scripts (`typecheck`, `test`, `test:run`, `test:e2e`) are missing or unconfigured in `package.json`.

---

## 2. Exact Files Affected

- `frontend/package.json`
- `frontend/app/(dashboard)/layout.tsx`
- `frontend/app/(dashboard)/dashboard/page.tsx`
- `frontend/app/(dashboard)/whatsapp/page.tsx`
- `frontend/app/(dashboard)/sales/new/page.tsx`
- `frontend/app/(dashboard)/orders/new/page.tsx`
- `frontend/app/(dashboard)/delivery-memos/new/page.tsx`
- `frontend/app/(dashboard)/payments/new/page.tsx`
- `frontend/app/(dashboard)/inventory/stock-entry/page.tsx`
- `frontend/app/(dashboard)/inventory/physical-stock/page.tsx`
- `frontend/app/(dashboard)/inventory/stock-transfer/page.tsx`
- `frontend/lib/permissions/permissions.ts`
- `frontend/lib/keyboard/shortcut-engine.ts`
- `frontend/lib/keyboard/os.ts`
- `frontend/lib/auth/auth-store.ts`
- `frontend/lib/api/client.ts`
- `frontend/lib/realtime/socket-client.ts`
- `frontend/lib/query/query-keys.ts` [NEW]
- `frontend/components/feedback/ModuleUnavailable.tsx` [NEW]
- `frontend/components/keyboard/ShortcutProvider.tsx` [NEW]
- `frontend/components/command-palette/CommandPalette.tsx`
- `frontend/components/shell/Header.tsx`
- `frontend/components/shell/Sidebar.tsx`
- `frontend/components/shell/RightActionRail.tsx`
- `frontend/components/shell/DatePeriodDialog.tsx`
- `frontend/components/shell/ShopSwitcherDialog.tsx`
- `frontend/docs/AUTH_TRANSITIONAL_SECURITY.md` [NEW]
- `frontend/docs/HTTP_CACHE_ETAG_PLAN.md` [NEW]

---

## 3. Backend Contract References

- `GET /whatsapp/capability?shopId=...`: `backend/src/routes/whatsapp.routes.js` L40-45 & `backend/src/controllers/whatsapp.controller.js` L88-100
- `GET /dashboard/owner?shopId=...&date=YYYY-MM-DD`: `backend/src/routes/dashboard.routes.js` L66 & `backend/src/services/dashboard.service.js` L45-193
- `GET /dashboard/staff/today?shopId=...&date=YYYY-MM-DD`: `backend/src/routes/dashboard.routes.js` L67 & `backend/src/services/dashboard.service.js` L195-246
- `GET /auth/staff`: `backend/src/routes/auth.routes.js` L79 & `backend/src/controllers/auth.controller.js` L120
- Permissions Matrix: `backend/src/utils/permissions.js` L1-94 (`PERMISSIONS`, `OWNER_PERMISSIONS`, `STAFF_PERMISSIONS`)

---

## 4. Work That Is In Scope

1. **Outcome 1**: Audit & clean WhatsApp page (`app/(dashboard)/whatsapp/page.tsx`). Remove all fake data/logs. Connect `GET /whatsapp/capability` and display real status or clear "WhatsApp integration is not connected for this shop" / "WhatsApp conversations are not implemented in the web dashboard yet" empty states.
2. **Outcome 2**: Create `ModuleUnavailable.tsx` component. Disable unsafe write routes (`/sales/new`, `/orders/new`, `/delivery-memos/new`, `/payments/new`, `/inventory/stock-entry`, `/inventory/physical-stock`, `/inventory/stock-transfer`). Disable "New" trigger buttons or point them safely to explicit unavailable feedback.
3. **Outcome 3**: Make `hasPermission()` fail closed (`no user -> false`, `owner -> true`, `staff with permission -> true`, `staff without permission -> false`, `missing permissions array -> false`, `unknown permission -> false`). Guard Sidebar, Command Palette, Rail, Administration, Approvals, Corrections, Cash Sessions. Write unit tests.
4. **Outcome 4**: Implement protected route handling (redirect unauthenticated to `/login`, redirect authenticated on `/login` to `/dashboard`). Implement thorough logout cleanup (stores, query cache, socket connection). Handle 401 (logout) vs 403 (forbidden modal/state). Create `frontend/docs/AUTH_TRANSITIONAL_SECURITY.md`.
5. **Outcome 5**: Consolidate global keyboard engine (`ShortcutProvider`, priority stack `DIALOG > FORM > TABLE > PAGE > GLOBAL`, input safety, Escape handling, Alt+G palette trigger, F-keys permission check, OS label formatting). Add unit tests.
6. **Outcome 6**: Correct Dashboard API types & mapping for `fetchOwnerDashboard` and `fetchStaffDashboard`. Use exact backend fields (`todaySales`, `salesCount`, `todayExpenses`, `pendingDmAmount`, `cashCollected`, `upiCollected`, `cardCollected`, `bankCollected`, `chequeReceived`, `ordersCreated`, `ordersToPack`, `ordersDispatched`, `paymentVerificationPending`, `cashMismatch`, `pendingApprovalRequests`, `gstInvoicesPendingCount`, `lowStockAlerts`, `newCustomersToday`, `outstandingCustomersCount`, `inactiveCustomersCount`, `topCustomers`). Handle single "Business Date".
7. **Outcome 7**: Establish centralized query keys (`query-keys.ts`), `HTTP_CACHE_ETAG_PLAN.md`, setup testing dependencies (Vitest, Testing Library, Playwright), add npm scripts, write unit and e2e Playwright tests.

---

## 5. Work Deliberately Deferred

- Full keyboard-first Sale Entry workflow (deferred to next sprint)
- Complete WhatsApp inbox / conversation messaging UI
- Dashboard redesign / new charts / new Aceternity or React Bits components
- ETag backend implementation & HTTP 304 revalidation
- Secure HttpOnly refresh token backend migration
- Transaction form submission engines

---

## 6. Implementation Order

1. **Outcome 1**: Clean up WhatsApp page (`app/(dashboard)/whatsapp/page.tsx`), remove hardcoded mock logs/chats, connect `GET /whatsapp/capability`.
2. **Outcome 2**: Create `ModuleUnavailable.tsx` and disable all unsafe `/new` transaction write routes.
3. **Outcome 3**: Fix `hasPermission()` in `lib/permissions/permissions.ts` to fail closed. Add permission unit tests. Update navigation/rail guards.
4. **Outcome 4**: Implement auth protected route guard & auth store cleanup on logout. Create `AUTH_TRANSITIONAL_SECURITY.md`.
5. **Outcome 5**: Build centralized `ShortcutProvider` & keyboard engine. Remove duplicate listeners. Write shortcut engine unit tests.
6. **Outcome 6**: Fix dashboard page (`app/(dashboard)/dashboard/page.tsx`) mapping & API client types (`fetchOwnerDashboard` / `fetchStaffDashboard`).
7. **Outcome 7**: Create query key factory (`query-keys.ts`), `HTTP_CACHE_ETAG_PLAN.md`, setup testing dependencies (Vitest, Testing Library, Playwright), add npm scripts, write unit and e2e Playwright tests.
8. **Validation**: Run `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run build`, and `npm run test:e2e`.

---

## 7. Risk Assessment

- **Low Risk**: Frontend-only changes; no backend database migrations or backend service code changes.
- **Permission Fail-Closed**: Ensures staff users cannot trigger unauthorized actions or navigate to restricted modules.
- **Form Disabling**: Prevents data corruption from incomplete draft forms until full transaction engines are ready in the next sprint.
- **Keyboard Isolation**: Prevents shortcut conflicts, rogue navigation on Escape, or browser shortcut hijacking.
