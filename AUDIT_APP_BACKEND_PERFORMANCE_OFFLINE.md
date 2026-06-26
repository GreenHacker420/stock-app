# App + Backend Performance and Offline Audit

## Executive summary

The system is a mostly online-first Expo app backed by an Express/Prisma API. React Query is persisted to MMKV and gives some warm-cache behavior, but SQLite is not used for core business data or durable offline mutations. Critical writes such as sales, orders, payments, stock entries, customers, and delivery memos go directly to HTTP and are not durable when offline.

The largest immediate performance issues are overfetching and duplicate independent queries:

- `GET /customers` returns every active customer as a full record. This matches the observed ~269 KB payload.
- `GET /sales` returns every sale with full customer, items, item details, payments, and staff.
- `GET /cash-sessions/current` includes all cash payments, although the app type only needs the session summary.
- Several screens bypass shared hooks and create their own query keys for `shops`, `customers`, `items`, and cash session data.
- Device registration is idempotent on the backend, but the app can still post the same device payload repeatedly after app startup/remount.
- `/health` is not called by core mobile code. Repeated `/health` logs are likely from deployment monitoring or an external checker.

The safest P0/P1 path is to add compatible pagination/limits and lightweight selects, keep old response shapes where legacy app calls expect arrays, reduce repeated device posts, add dev instrumentation, and fix clear API route mismatches.

## Current startup request waterfall

| Flow | Current requests from code | Notes |
| --- | --- | --- |
| Cold start logged out | none after bootstrap token check | `restoreSession` reads SecureStore; renders login. |
| Login | `POST /auth/login`, likely `GET /shops` from `SelectShop`, device registration after token set | `useSignInMutation` invalidates `me` and `shops`; persisted query cache may already contain stale data. |
| Cold start logged in | `GET /auth/me`, notification setup posts `/users/devices`, selected-shop navigation opens realtime socket | `restoreSession` always validates token by calling `/auth/me`. |
| Shop selection | `GET /shops`; after choosing shop, Home queries begin | Shop id is MMKV persisted. |
| Opening Home owner | `GET /shops`, `GET /dashboard/owner?shopId=...`, `GET /cash-sessions/current?shopId=...` | Shared hooks dedupe only if keys match. |
| Opening Home staff | `GET /shops`, `GET /cash-sessions/current?shopId=...` and/or staff summary depending screen path | Cash session stale time is only 30 seconds. |
| Opening Customers | `GET /customers?shopId=...&includeWalkin=true` | Full customer list, then client-side search. |
| Opening Items | `GET /items/summary`, `GET /items/categories`; list fetch only after category/search, but current screen asks for `limit=1000`. |
| Opening Sales | `GET /sales?shopId=...` | Full sale list with nested includes. |

## Slow endpoint table

| Endpoint | Evidence | Likely cause | Fix recommendation |
| --- | --- | --- | --- |
| `GET /dashboard/owner` | observed 200-270 ms; service loads many full rows | Uses `findMany` for sales/orders/dms/payments/expenses/GST pending, then computes in JS | Replace broad reads with aggregate/count queries and select-only top customer data. |
| `GET /customers` | observed 269 KB payload | No pagination; full rows; client-side filtering | Add `page`, `limit`, `search`; return lightweight fields; update app to request bounded/search pages. |
| `GET /sales` | observed 33 KB payload | No pagination; nested `customer`, `items.item`, `payments`, `staff` on list | Add `page`, `limit`, date filters; list select should be summary-only. Keep detail endpoint rich. |
| `POST /users/devices` | observed ~210 ms sometimes | Backend upsert plus user update; frontend repeats unchanged payload | Deduplicate unchanged registrations on app; only update user push token if changed. |
| `GET /cash-sessions/current` | repeated | 30s stale time and route includes payment rows | Increase client stale time modestly and remove payments include from current summary. |

## Large payload table

| Endpoint | Observed size | Current shape | Issue | Fix |
| --- | ---:| --- | --- | --- |
| `GET /customers` | ~269 KB | `Customer[]` full records | Startup/search screens load all customers | Add limit/page/search; default cap for legacy calls. |
| `GET /items` | ~31 KB | paginated object, default 50, but some screens request high limits | `OwnerItems` asks `limit=1000`; search uses embeddings | Keep paginated default; reduce app high-limit calls; avoid search embedding on empty search. |
| `GET /sales` | ~33 KB | `Sale[]` with nested details | List endpoint behaves like detail endpoint | Add paginated summary response while preserving array for no-pagination legacy calls. |

## Duplicate request table

| Request | Duplicate source | Current issue | Fix recommendation |
| --- | --- | --- | --- |
| `/auth/me` | `restoreSession`, quick login, `useMeQuery` if mounted | Validation is always network-first | Cache user in SecureStore/MMKV for instant render, then background validate. |
| `/shops` | `useShopsQuery` plus screen-local `useQuery(["shops"])` | Some duplication but same key dedupes when concurrent | Prefer shared `useShopsQuery`; keep long stale time. |
| `/cash-sessions/current` | Home, open/close day screens, Updates cards | 30s stale time can refetch often | Use 2 minute stale time and realtime invalidation. |
| `/users/devices` | `useNotificationSetup` after token set/remount | Backend idempotent, but unchanged payload still posts | Persist registration signature and skip unchanged posts. |
| `/health` | Not found in core app code | External monitor likely polling every few seconds | Reduce monitor interval outside app or keep route cheap/no DB. |

## API contract mismatch table

| Frontend call | Backend route | Status | Issue | Fix recommendation |
| --- | --- | --- | --- | --- |
| `GET /customers/:id/delivery-memos` | `GET /customers/:id/dms` | mismatch | Customer detail DMs can 404 | Add compatibility route or update client. |
| `GET /customers/:id/returns` | service exists, route missing | mismatch | Customer returns can 404 | Add route. |
| `fetchItems()` returns paginated object | Some older screen code treats `itemsQuery.data` carefully, but direct `CreateOrder` uses raw result | mixed | Direct screen may expect array in filters | Update direct screen or keep helper shape clear. |
| `OwnerDashboardData.pendingVerifications` | backend returns `pendingApprovalRequests` | mismatch | UI may show zero/undefined for pending count | Return aliases expected by app. |
| Error response | backend `{ success:false,message,details }`; frontend only reads `message` | partial | Validation details not surfaced | Standardize parser later. |

## Frontend screen-to-endpoint map

| Screen/hook | Endpoint | Method | Request shape | Response shape | Cache key | Local persistence | Online/offline behavior | Current issue | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `auth-store.restoreSession` | `/auth/me` | GET | bearer token | `ApiUser` | none | token in SecureStore | fails logout on network/auth error | offline start can sign out | cache user separately, validate in background. |
| `SelectShop`, `Home`, many admin screens | `/shops` | GET | bearer token | `Shop[]` | `["shops"]` | React Query MMKV | persisted cache can show stale | multiple local queries | use shared hook. |
| `Home` | `/dashboard/owner` | GET | `shopId? date?` | dashboard object | `["owner-dashboard",{shopId,date}]` | React Query MMKV | stale if offline | backend overfetch | aggregate backend. |
| `Home`, cash screens | `/cash-sessions/current` | GET | `shopId` | `CashSession|null` | `["current-cash-session",shopId]` | React Query MMKV | stale cache only | repeated + overfetch payments | remove payments include, increase stale time. |
| `OwnerCustomers`, `RegularSale`, `CreateOrder`, `TakePayment` | `/customers` | GET | `shopId`, `includeWalkin`, search absent in many places | `Customer[]` | mixed | React Query MMKV | full cached list only | huge payload and client filtering | add search/page/limit; update heavy screens. |
| `OwnerItems`, `WalkInSale`, `CreateOrder` | `/items` | GET | `shopId`, `search?`, `page?`, `limit?` | `{items,total,page,hasMore}` | item keys | React Query MMKV | cached pages only | high limits and some direct calls | keep bounded limits, use infinite query for browsing. |
| `OwnerSales`, `NewSaleType` | `/sales` | GET | `shopId` | `Sale[]` | `["sales",shopId]` | React Query MMKV | cached full list | nested list payload | add summary pagination. |
| `OrderList`, packing screens | `/orders` | GET | `shopId`, `status?` | `Order[]` | `["orders",shopId]` | React Query MMKV | cached list only | no pagination | add later. |
| `DeliveryMemoList` | `/delivery-memos` | GET | `shopId` | `any[]` | `["delivery-memos",shopId]` | React Query MMKV | cached list only | no pagination | add later. |
| `PaymentVerification`, `TakePayment` | `/payments` | GET/POST | shop/customer/status filters | `Payment[]` or `Payment` | `["payments",shopId,{status}]` | React Query MMKV | write fails offline | no idempotency/offline queue | add idempotency and queue. |
| `FCMManager` | `/users/devices` | POST | installation and push token metadata | public device | none | installation id in SecureStore | repeats unchanged post | unnecessary backend writes | persisted signature dedupe. |

## Local storage responsibility audit

| Layer | Current use | Fit | Gap |
| --- | --- | --- | --- |
| SecureStore | auth token, quick token, PIN/biometric flags, installation id | Good for secrets/small identity | No cached user profile for offline bootstrap. |
| MMKV | Zustand shop selection and full React Query persisted cache | Good for preferences; risky for large server-state cache | Persisting large customer/sale payloads in MMKV is not ideal. |
| SQLite | Dependency installed; no core business SQLite usage found outside WhatsApp module | Not currently used for core offline-first | Missing read models and pending mutation queue. |
| React Query | In-memory server state, persisted to MMKV | Good for online cache | Not a durable offline database or mutation log. |

## Redis/Postgres responsibility audit

Redis is used for Socket.IO adapter, device presence, notification/WhatsApp queues, and WhatsApp credential cache. No core business source-of-truth usage was found. PostgreSQL/Prisma is the source of truth for shops, customers, items, sales, orders, payments, cash sessions, stock, and notifications.

Indexes exist for many common query dimensions: `Customer(shopId, phone/gstin/email)`, `Item(shopId,status/name/sku)`, `Sale(shopId,createdAt)`, `Order(shopId,status,createdAt)`, `Payment(shopId,receivedAt/createdAt)`, `CashSession(shopId,openedAt)`, and device uniqueness. Missing or useful additions include `Customer(shopId,status,createdAt)`, `Sale(shopId,customerId,createdAt)`, and status/date composites for some list screens.

## Offline-first gap analysis

| Requirement | Current status | Risk |
| --- | --- | --- |
| Durable pending mutation queue | Missing for core app | Offline sale/payment/order/customer writes can be lost. |
| SQLite read models | Missing for core app | App depends on React Query/MMKV cache, not relational local data. |
| Stable idempotency key for create writes | Missing on sale/order/payment/customer endpoints | Retry can duplicate records. |
| Ordered sync worker | Missing | No deterministic offline replay. |
| Conflict state | Missing | No clear user-visible conflict handling. |
| Cached-first UI | Partial via persisted React Query | Large payloads stored in MMKV, not shop-scoped SQLite. |

## Recommended architecture

- MMKV/SecureStore: tokens, selected shop, installation id, small preferences, last sync cursors.
- SQLite: shop-scoped read models for shops, cash sessions, items, customers, sales, orders, delivery memos, payments, pending mutations, sync metadata.
- React Query: short-lived server-state cache and background refresh orchestration.
- Redis: realtime fanout, queues, presence, rate limits, non-authoritative cache.
- PostgreSQL: authoritative business data.

For offline writes, add a single `pending_mutations` SQLite table with operation id, entity/action, payload, shop/user/device, idempotency key, status, retry count, error, and timestamps. Process in creation order when online, stop on 401, mark validation conflicts, and update local read models after success.

## Prioritized fix plan

### P0 correctness/data-loss

- Add backend idempotency support for create sale, payment, order, customer, delivery memo, and stock entry.
- Add SQLite pending mutation queue and deterministic sync worker.
- Add compatibility routes for customer DMs/returns.
- Prevent repeated unchanged device registration.
- Fix dashboard field aliases expected by app.

### P1 major performance

- Add pagination/search/limits to customers and sales without breaking legacy array callers.
- Reduce list endpoint Prisma payloads with `select`.
- Remove `payments` include from current cash session summary.
- Rewrite dashboard to aggregates/counts instead of full-row reads.
- Reduce high mobile list limits and screen-local duplicate queries.
- Add dev-only backend route timing/payload size and frontend request timing.

### P2 cleanup/refactor

- Move screen-local queries to shared hooks.
- Add typed API response contracts.
- Standardize frontend error parsing with validation details.
- Add SQLite read models and incremental sync endpoints with `updatedSince`.
- Review and trim persisted React Query cache size.

## Exact files that need changes

- `backend/src/app.js`
- `backend/src/lib/db.js`
- `backend/src/routes/customer.routes.js`
- `backend/src/routes/sale.routes.js`
- `backend/src/controllers/customer.controller.js`
- `backend/src/controllers/sale.controller.js`
- `backend/src/services/customer.service.js`
- `backend/src/services/sale.service.js`
- `backend/src/services/cashSession.service.js`
- `backend/src/services/dashboard.service.js`
- `backend/prisma/schema.prisma`
- `stock/src/api/client.ts`
- `stock/src/notifications/FCMManager.ts`
- `stock/src/hooks/useCustomers.ts`
- `stock/src/hooks/useSales.ts`
- `stock/src/hooks/useCashSessions.ts`
- `stock/src/navigation/screens/OwnerCustomers.tsx`
- `stock/src/navigation/screens/RegularSale.tsx`
- `stock/src/navigation/screens/CreateOrder.tsx`
- `stock/src/navigation/screens/OwnerSales.tsx`
- Future offline work: new SQLite local data/sync files under `stock/src`.

## Risks and migration notes

- Do not remove fields from existing list responses until every mobile usage is updated.
- Adding default caps can hide older records from legacy screens unless search/pagination UI is added.
- Prisma migrations for indexes are safe but should be deployed during low traffic.
- Offline queue changes must be idempotent end to end before enabling automatic replay.
- React Query persistence in MMKV should be size-managed before customers/sales continue to grow.
