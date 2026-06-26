# Phase 2 Offline-First Billing Report

## Backend Prisma Schema Audit

The backend PostgreSQL Prisma schema is the source of truth. It is intentionally richer than the mobile app needs: it includes staff/admin flows, approval/audit tables, WhatsApp tables, notification delivery, PostgreSQL-specific vector search, and reporting tables. The mobile schema should be a local billing/sync subset, not a copy.

### Billing-Related Backend Models

| Model | Primary id | Shop scope | Important relations | Offline fields needed | Fields not needed offline | Indexes / unique constraints | Create/update behavior | Mirror locally? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Shop` | `id String @id @default(cuid())` | Own record | owner, staff access, customers, items, sales, payments, cash sessions | `id`, `name`, `code`, `city`, `address`, `phone`, `email`, `gstin`, `logo`, UPI fields, `updatedAt` | WhatsApp/assets/admin relations | `code` unique, `ownerId` index | Created server-side; selected shop cached in app | Mirror only minimal shop metadata later, not required for initial billing tables |
| `User` | `id String @id @default(cuid())` | Role/access controls | owned shops, staff access, created/received records, devices | `id`, `name`, `role`, selected shop access metadata | password hash, push token, attendance, WhatsApp relations | `mobile` unique, `email` unique | Auth/session source of truth remains server/MMKV | Do not mirror full user; store `userId` on mutations |
| `Customer` | `id String @id @default(cuid())` | `shopId` required | orders, sales, delivery memos, payments, returns | name, phone, email, address, city, gstin, contact person, type, status, balance snapshots, server id, timestamps | audit relations, WhatsApp relations, full timeline | indexes: `shopId`, `(shopId,status,createdAt)`, `phone`, `(shopId,phone)`, `(shopId,gstin)`, `(shopId,email)` | Explicit create and implicit create from sale `customerInfo`; phone lookup reuses existing customer | Yes, as `LocalCustomer`; local id and nullable `serverId` |
| `Item` | `id String @id @default(cuid())` | `shopId` required | category, stock balance, stock ledger, sale/order/DM items | name, sku, category name/id, unit, selling price snapshot, stock quantity, updatedAt | embedding, price history, image if not needed for billing | unique `(shopId,sku)`, indexes `(shopId,name)`, `(shopId,status)`, `(shopId,sku)` | Server manages item catalog and prices | Yes, as `LocalItem`; include stock snapshot and pending stock delta |
| `StockBalance` | `id String @id @default(cuid())` | `shopId` required | item | physical/reserved/available snapshot | relation graph | `itemId` unique, indexes `shopId`, `(shopId,availableStock)` | Updated by stock ledger helpers | Fold into `LocalItem` for Phase 2 |
| `StockLedger` | `id String @id @default(cuid())` | `shopId` required | item, createdBy/approvedBy | local sale stock delta only | approval fields, full stock audit | indexes `(shopId,itemId)`, `(shopId,itemId,createdAt)`, `(referenceType,referenceId)` | `createStockOut` writes SALE movement during sale transaction | Optional `LocalStockMovement`; initial schema can use `LocalItem.pendingStockDelta` |
| `Sale` | `id String @id @default(cuid())` | `shopId` required | customer, staff, items, payments, optional order/DM | bill number, customer local/server ref, totals, paid/balance/payment status, signature, notes via payload, timestamps | GST generation internals, dispatch/return relations, cancellation fields for initial offline create | unique `(shopId,saleNumber)`, indexes `(shopId,createdAt)`, `(shopId,customerId,createdAt)`, `customerId` | Transaction creates sale, sale items, stock out, debt, payments, audit | Yes, as `LocalSale`; never use local id as server sale id |
| `SaleItem` | `id String @id @default(cuid())` | via sale | sale, item | local sale id, local/server item ref, name/rate/unit snapshots, quantity, line total | server relation enforcement | indexes `itemId`; cascade delete with sale | Nested create inside sale transaction | Yes, as `LocalSaleItem` |
| `Payment` | `id String @id @default(cuid())` | `shopId` required | sale/DM/order optional, customer, cash session, receiver/verifier, details | amount, mode, reference, notes, local/server sale/customer refs, status, timestamps | verification workflow, proof images initially, full payment detail split | indexes `(shopId,receivedAt)`, `(shopId,createdAt)`, `customerId`, `saleId` | `applyPayments` creates rows and adjusts customer balances | Yes, as `LocalPayment` |
| `Order` | `id String @id @default(cuid())` | `shopId` required | customer, created/assigned staff, items, payments, reservations | not needed for initial offline billing except optional server reference | packing, dispatch, reservation workflow | unique `(shopId,orderNumber)`, indexes `(shopId,status)`, `(shopId,status,createdAt)`, `customerId` | Online order workflow remains server-first | Do not mirror in first mobile schema unless offline order creation becomes P0 |
| `DeliveryMemo` | `id String @id @default(cuid())` | `shopId` required | customer, staff, items, sale, payments | not needed for initial offline billing except optional server reference | conversion/return workflow | unique `(shopId,dmNumber)`, indexes `(shopId,status)`, `customerId` | Online DM workflow remains server-first | Defer local DM until Phase 2.2 |
| `CashSession` | `id String @id @default(cuid())` | `shopId` required | staff, reviewer, payments | current cash session id/status/opening cash snapshot | review chain, payment rows by default | indexes `(shopId,openedAt)`, `(staffId,status)` | Server opens/closes/reviews sessions | Mirror minimal metadata later if offline cash close is required |
| `IdempotencyKey` | absent before this patch | should be `shopId` scoped | user/request/resource | key, endpoint, hash, saved response/resource | none | must be unique `(key,shopId,endpoint)` | Needed to make retry safe | Add on backend only |

### PostgreSQL Features That Do Not Map Cleanly To Mobile SQLite

- Native decimal money/quantity columns (`@db.Decimal`) should not be copied directly into mobile billing logic without a clear precision strategy. The mobile schema stores money/quantity as strings to preserve decimal text and avoid JavaScript floating point surprises at the persistence boundary.
- PostgreSQL enum columns are widespread. SQLite has no native enum enforcement, so the mobile schema uses strings for statuses and modes.
- Backend JSON fields (`Json`) exist for devices, approvals, audit logs, summaries, WhatsApp, and onboarding. Mobile `PendingMutation.payloadJson` is stored as a stringified JSON payload for compatibility with Expo SQLite and mobile Prisma generation constraints.
- `Unsupported("vector(384)")` on `Item.embedding` is PostgreSQL/pgvector-specific and must not be mirrored.
- Backend relation constraints and cascade/restrict behavior are authoritative server-side. Mobile local relations are simple local read/write references; conflict handling must not rely on SQLite cascades deleting business records.
- Backend defaults such as `cuid()`, `now()`, and `@updatedAt` are server semantics. Mobile code generates local ids and timestamps explicitly.
- Database-specific index behavior, expression behavior, extensions, and native types in migrations remain backend-only.

### Current Create Logic Findings

- Customer create is a direct `Customer.create` with shop access checks and audit log. `captureCustomer` reuses an existing customer by `(shopId, phone)` when sale payload carries `customerInfo`.
- Sale create is already transactional: it resolves customer, calculates totals, creates sale/items, creates stock-out ledger rows, increases customer debt, applies payments, validates walk-in payment, updates sale status, and writes audit log.
- Payment create resolves customer from sale/DM/order when present, falls back to walk-in, calls `applyPayments`, and returns the latest created payment.
- None of the create paths had durable idempotency-key storage before this patch, so mobile retry after timeout could duplicate customers/sales/payments.

## Proposed Mobile SQLite Prisma Schema

The mobile database should be a sync/read/write model optimized for offline billing. It should use different model names (`LocalCustomer`, `LocalSale`, etc.) so app code never confuses local ids with server ids.

Included:

- `LocalCustomer`: offline customer capture and server customer cache.
- `LocalItem`: local item/stock/price snapshot for billing.
- `LocalSale`: local bill header with local/server customer references, totals, signature reference/base64, sync state.
- `LocalSaleItem`: immutable item snapshots for each local bill.
- `LocalPayment`: local payment records attached to local/server sale/customer.
- `PendingMutation`: durable ordered queue with idempotency key, dependency, payload JSON string, retry/error/status.
- `IdMapping`: local-to-server id lookup.
- `SyncMetadata`: shop-scoped cursor/last-sync metadata.

Not included in the initial mobile schema:

- WhatsApp tables.
- Backend admin/audit/approval/reporting tables.
- Full `Order` and `DeliveryMemo` mirrors. They can be added when offline order/DM creation is explicitly implemented.
- Full stock ledger. `LocalItem.pendingStockDelta` is enough to make local billing stock-aware before sync.

Local id rules:

- `local_customer_<uuid>`
- `local_item_<uuid>`
- `local_sale_<uuid>`
- `local_sale_item_<uuid>`
- `local_payment_<uuid>`
- `mutation_<uuid>`

Server ids are nullable `serverId` fields and are never written into local primary keys.

## Prisma Mobile Feasibility Check

### Repo Compatibility

- Expo SDK: `~56.0.12` from `stock/package.json`.
- React Native: `0.85.3`.
- SQLite dependency: `expo-sqlite ~56.0.5` is already installed and the `expo-sqlite` plugin is already configured.
- App runtime: this repo is configured for dev builds (`expo-dev-client`, `expo run:*`, and EAS `developmentClient: true`). Prisma React Native ships native iOS/Android engine binaries, so Expo Go is not sufficient.
- Existing Metro config: default Expo Metro config. No Metro change was required for TypeScript/generate.
- EAS config: no EAS profile change required, but native projects must include the Prisma Expo plugin output through prebuild/EAS.

### Prisma Packages Added

- `@prisma/client@6.0.1`
- `prisma@6.0.1`
- `@prisma/react-native@6.0.1`
- `react-native-quick-base64@2.0.8`

The package README for `@prisma/react-native@6.0.1` marks React Native/Expo support as Early Access. It requires `previewFeatures = ["reactNative"]`, imports from `@prisma/client/react-native`, and runtime migration application through `$applyPendingMigrations()`.

### Config Changes Required

- Added `@prisma/react-native` to `stock/app.json` plugins so migrations can be copied into native bundles during prebuild/EAS.
- Added `stock/prisma/schema.prisma` with SQLite datasource and only the local billing/sync subset.
- Added `stock/prisma/migrations/20260626120000_init_offline_billing/migration.sql`.

### Validation Results

- `npx prisma validate --schema prisma/schema.prisma`: passed.
- `npx prisma generate --schema prisma/schema.prisma`: passed, generated React Native client under `stock/node_modules/@prisma/client`.
- `npx tsc --noEmit`: passed after adjusting transaction callback typing.
- `npx prisma migrate dev --schema prisma/schema.prisma --name init_offline_billing`: failed in this local environment with an empty `Schema engine error`.
- `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`: passed and was used to create the initial migration SQL.
- Runtime smoke test: helper added in `stock/src/local/prisma.ts`, but not executed in this terminal because it requires the native React Native runtime/dev build. This remains the blocking gate before UI integration.

### Feasibility Decision

Prisma Mobile is feasible enough to add the minimal schema and isolated helpers: package install, schema validation, client generation, and app TypeScript compile all pass in this repo.

Do not wire billing screens yet until `runLocalPrismaSmokeTest()` passes inside an Android/iOS development build. The early-access runtime and on-device migration behavior are the primary risks.

### Limitations / Risks

- React Native support is Early Access and uses native engine binaries. Android and iOS dev/production builds must be verified separately.
- Expo Go is not supported for this Prisma runtime.
- Runtime migrations run on the user device; failed migrations may require explicit recovery UX or app data reset.
- `migrate dev` failed locally, so initial migration SQL was generated through `migrate diff`. Future mobile schema changes should keep migrations small and manually review SQL.
- Interactive transaction support compiles, but must be smoke-tested on device before relying on it for production offline writes.

## Patch Plan

1. Add backend `IdempotencyKey` Prisma model and migration with unique `(key, shopId, endpoint)`.
2. Add a small backend idempotency service that:
   - reads `Idempotency-Key` or `X-Idempotency-Key`,
   - hashes the validated request body,
   - replays stored responses for exact duplicate requests,
   - returns `409` when the same key is reused with a different payload,
   - stores response JSON, status code, resource type, and resource id.
3. Wrap create customer, create sale, and add payment controllers. Replayed sale/payment requests must not emit duplicate realtime events.
4. Add `stock/prisma/schema.prisma` for the mobile SQLite subset.
5. Add a small mobile local data layer:
   - `stock/src/local/prisma.ts`: mobile Prisma client boundary and local id helpers.
   - `stock/src/local/offlineQueue.ts`: enqueue/dequeue/mark helpers.
   - `stock/src/local/localBilling.ts`: local customer/sale/payment write helpers.
   - `stock/src/local/syncWorker.ts`: deterministic single-worker sync skeleton that posts pending mutations with idempotency keys.
6. Do not wire a full offline UI rewrite yet. The next patch can integrate these helpers into `RegularSale`, `TakePayment`, and customer creation with explicit UX states.

## Phase 2B UI Integration

### Screens Wired

- `RegularSale`: offline customer picker/search, offline item source, offline bill save, offline local payment creation, offline success message.
- `WalkInSale`: offline item source, optional local customer capture from walk-in name/phone, offline bill save, offline payment creation, offline success message.
- `TakePayment`: offline customer picker/search and offline payment creation.
- `AddEditCustomer`: new customer creation can save locally while offline. Existing customer edits remain online-only.
- `SalesList`: merges local pending/failed/conflict sales into the list and prevents server detail navigation for unsynced local sales.
- `Settings`: shows minimal pending/failed/conflict sync counts.
- `App`: starts guarded sync after authenticated startup, network restoration, and foreground resume.

### Online Behavior

- Existing online API flow is preserved for sale/customer/payment creates.
- Online create calls now send an `Idempotency-Key` header.
- Online customer/item queries write successful results into the local Prisma cache for later offline use.

### Offline Behavior

- Billing screens use `useNetworkStatus`.
- If offline, screens do not call the backend.
- If online request fails with a network-like error, the sale/payment screens offer or perform local offline save.
- Every offline write first calls `ensureLocalDbReady()`. If Prisma runtime or migrations fail, the screen shows a controlled local DB unavailable message.

### Local Customer Flow

- Offline customer creation writes `LocalCustomer` with `syncStatus = pending`.
- Pending customer create writes a `PendingMutation` with a stable idempotency key.
- Local customer creation reuses an existing local customer with the same phone in the shop.
- Customer pickers merge server customers with pending local customers and show pending sync text in descriptions.

### Local Sale Flow

- Offline sale creates `LocalSale` and `LocalSaleItem[]`.
- Sale mutation depends on the customer mutation when the selected customer is local-only.
- Local sale item rows store item name, price, quantity, unit, and line-total snapshots.
- Offline sale decrements `LocalItem.pendingStockDelta`; `stockQty` remains the last server-confirmed stock snapshot.
- Pending local sales appear in the sales list with `Pending sync`.

### Local Payment Flow

- Offline payment creates `LocalPayment` and a `PendingMutation`.
- Payment created from an offline sale depends on the sale mutation.
- Standalone payment preserves `orderId` / `dmId` in the pending payload even though the local payment table does not add dedicated order/DM columns yet.

### Item Cache / Stock Behavior

- Online item results are upserted into `LocalItem`.
- Offline billing uses `LocalItem`.
- Effective offline stock is `stockQty + pendingStockDelta`.
- If the offline item cache is empty, billing shows: “Items are not available offline yet. Open this shop online once to sync items.”

### Sync Trigger Behavior

- `useOfflineSync()` runs only after auth token and selected shop exist.
- Sync runs on first authenticated online state, offline-to-online transition, and app foreground.
- `runOfflineSyncOnce()` still has a single-run lock.
- Sync sends customer, sale, then payment mutations in dependency-aware order.
- Sync sends idempotency keys to backend.
- Sync writes `IdMapping`, updates local `serverId`, and marks local records as synced.
- After processed mutations, React Query invalidates customers, sales, payments, items, dashboard, and cash-session queries.

### Conflict Behavior

- `409` marks the pending mutation as `conflict`.
- Related local customer/sale/payment is marked `conflict` where the local table supports it.
- Local records are preserved and not deleted.
- Backend customer create now returns an existing active same-shop customer by phone with `merged: true` and `conflictType: "CUSTOMER_ALREADY_EXISTS"` instead of creating a duplicate.
- Stock/price conflicts are not auto-resolved; affected sale remains local/conflict when backend returns a conflict response.

### Known Limitations

- Native Prisma runtime smoke could not be executed from this terminal. It must be verified inside an Android/iOS development build.
- `migrate dev` failed earlier with an empty schema-engine error; the mobile migration SQL was generated via `migrate diff`.
- Offline order and delivery memo creation are not wired in this patch.
- Offline sale detail screen is not implemented; pending local sales show in the list and display a pending-sync message on tap.
- Payment local schema does not have dedicated order/DM columns; those references are preserved in queued payload JSON only.
- Conflict resolution UI is minimal: counts in Settings and status labels. Detailed conflict review is still needed.

### Manual Verification Result

Manual device verification was not run in this terminal session. Automated checks passed:

- Mobile Prisma schema validation.
- Mobile Prisma generation.
- Mobile TypeScript compile.
- Backend Prisma generation.
- Backend syntax checks for changed files.
- Existing backend test suite.
