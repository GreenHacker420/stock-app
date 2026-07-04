# QA-01 Test Matrix

Commit under test: `dbf73f7 feat: introduce domain event reconciliation to ensure sequential data consistency and add service for robust sequence allocation.`

Status legend:

- `PASS`: verified in this pass.
- `PENDING_DEVICE`: requires real Android device/dev-client or release-like build.
- `PENDING_STAGING`: requires controlled staging infrastructure such as backend restart or Redis outage.
- `NOT_RUN`: documented but not executed.

No real customer PII should be used as evidence. Use synthetic shop/customer/item names.

| ID | Scenario | Preconditions | Devices / Accounts / Shops | Steps | Expected Result | Actual Result | Status | Evidence | Defect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA01-AUTO-01 | Backend test suite | Local backend test DB available | Local backend | Run `npm test` from `backend` | All backend tests pass | 115 core + 32 WhatsApp tests passed | PASS | terminal validation | - |
| QA01-AUTO-02 | Mobile static validation | Mobile dependencies installed | Local mobile project | Run `npm run typecheck` from `stock` | TypeScript passes | passed | PASS | terminal validation | - |
| QA01-AUTO-03 | Sequence frontier | Existing realtime tests | Local backend | Run realtime suite through `npm test` | Pending lower sequence blocks later published event | covered and passing | PASS | `realtime.test.js` | - |
| QA01-AUTO-04 | Cursor write ordering | Existing hardening tests | Local backend reading mobile source | Run harden-mobile suite through `npm test` | read-model persistence before cursor write | covered and passing | PASS | `harden-mobile.test.js` | - |
| QA01-AUTO-05 | Repair projection safety | Existing snapshot tests | Local backend | Run read-model snapshot suite through `npm test` | repair endpoints reuse bootstrap projection and exclude stock authority | covered and passing | PASS | `read-model-snapshot.test.js` | - |
| QA01-AUTO-06 | WhatsApp isolation | Git diff | Local repo | `git diff --name-only \| grep -i whatsapp` | no output | no output | PASS | final guard | - |
| QA01-001 | Fresh login | App data cleared, backend online | One Android device, owner account, active shop | Launch, login, wait for active shop and bootstrap | one combined bootstrap, local customer/item/category data visible, cursor written after data | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-002 | Restored authenticated session | Valid encrypted local cache, app process killed | One Android device | Reopen app | cached data visible quickly, reconciliation runs in background | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-003 | Offline cached startup | Completed bootstrap, app killed, network disabled | One Android device | Reopen offline | cached data visible, no destructive cache clear, cursor unchanged | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-004 | First startup offline | No bootstrap, no network | One Android device | Clear app data, disable network, launch | clear unavailable/offline state, no fake complete cache or cursor | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-005 | Background to foreground recovery | App active, second device available | Owner A + Staff B, same shop | Background device A, mutate customer on B, foreground A | one foreground sync, customer repair, new data visible | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-006 | Socket disconnect and reconnect | Two devices, backend online | Owner + staff, same shop | Disable network on A, mutate on B, restore network | socket reconnect wakes reconciliation; cursor not advanced directly | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-007 | Process kill during reconciliation fetch | Instrumented/dev build | One Android device | Trigger reconciliation, kill app after events fetched before cursor write | replay after restart, no duplicate records, cursor advances later | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-008 | Process kill after domain persist | Instrumented/dev build | One Android device | Kill after repair persisted before cursor write | repaired data may remain, events replay safely, cursor advances later | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-009 | Same-device customer create | Bootstrapped shop | One Android device | Create customer in customer flow | new customer visible without socket echo | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-010 | TakePayment quick customer create | Bootstrapped shop, TakePayment reachable | One Android device and optional second device | Create quick customer from TakePayment | same-device repair shows customer; other device converges via socket/reconcile | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-011 | Customer edit cross-device | Two devices online | Owner + staff, same shop | Edit customer on A, verify B; edit on B, verify A | both devices converge without restart | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-012 | Item catalog change | Two devices online | Owner + staff, same shop | Update item name/SKU/catalog metadata/category | item catalog repair updates other device; stock remains server authoritative | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-013 | Category mutation | Two devices online | Owner + staff, same shop | Create, rename, delete/archive category | categories and denormalized item category names refresh | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-014 | Rapid event burst | Two devices online | Same shop | Generate 20 customer updates quickly | coalesced reconciliation; bounded customer repair; no bootstrap for bootstrapped shop | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-015 | Shop switching | User with multiple shops | One Android device | Shop A -> Shop B -> Shop A | no cross-shop customers/items/categories/cursors appear | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-016 | Switch during active request | Slow network or instrumentation | One Android device, two shops | Start Shop A refresh then switch to Shop B | Shop A result cannot overwrite active Shop B state | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-017 | Account switch | Two user accounts | One Android device | User A login/bootstrap/logout, User B login | no User A business data or cursor visible to User B | Not run on device | PENDING_DEVICE | manual evidence required | QA01-GATE-001 |
| QA01-018 | Backend Redis outage | Local/staging only | One Android device or API client | Stop read-cache Redis, use app/API | reads/bootstrap/repair fall back to PostgreSQL where expected | Not run | PENDING_STAGING | staging evidence required | QA01-GATE-002 |
| QA01-019 | Backend restart | Local/staging backend | App open on Android device | Restart backend | cached data remains visible, socket reconnects, reconciliation runs | Not run | PENDING_STAGING | staging evidence required | QA01-GATE-002 |
| QA01-020 | Large synthetic dataset | Synthetic no-PII data loaded | Android build with dev mode disabled for performance | 5k customers, 10k items, 100 categories; measure bootstrap/read/write/search | acceptable startup/search responsiveness; no PII logs | Not run | PENDING_DEVICE | performance evidence required | QA01-GATE-003 |
| QA01-021 | Memory and UI responsiveness | Large synthetic data | Android build with dev mode disabled | Open pickers/lists, search repeatedly, switch shops, background/foreground | no severe JS stalls or memory growth | Not run | PENDING_DEVICE | profiling evidence required | QA01-GATE-003 |
| QA01-022 | 320px critical UI smoke | Small Android viewport/device | Android device/emulator | Login, Home, OwnerCustomers, ItemList, TakePayment, CreateOrder, RegularSale, WalkInSale, CreateDeliveryMemo, CloseDay, OwnerStaff | keyboard/footer/text remain usable | Not run | PENDING_DEVICE | screenshots/video required | QA01-GATE-004 |
| QA01-023 | Accessibility smoke | TalkBack enabled | Android device | Login, customer create, TakePayment, shop switch, sale/order primary actions | critical actions identifiable and tappable | Not run | PENDING_DEVICE | screen-reader evidence required | QA01-GATE-005 |
