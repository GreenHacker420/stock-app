# Phase 2E: Production Realtime Verification & Reconciliation Sync Report

## Legacy Socket.IO Direct Emit Audit & Migration Table

Below is the audit of direct Socket.IO emits that were cleaned up or kept, detailing their replacement with the transactional Outbox pattern:

| Service / Controller | Action | Direct Emit Event | Status | Reason / Replacement Pattern |
| :--- | :--- | :--- | :--- | :--- |
| `order.controller.js` | `createOrder` | `ORDER_UPDATED` | **Removed** | Replaced by transaction-safe outbox event `order.created` |
| `order.controller.js` | `confirmOrder` | `ORDER_UPDATED` | **Removed** | Replaced by transaction-safe outbox event `order.updated` |
| `order.controller.js` | `assignStaff` | `ORDER_UPDATED` | **Removed** | Replaced by transaction-safe outbox event `order.updated` + `ORDER_ASSIGNED` push |
| `order.controller.js` | `startPacking` | `ORDER_UPDATED` | **Removed** | Replaced by transaction-safe outbox event `order.updated` |
| `order.controller.js` | `markItemPacked` | `ORDER_UPDATED` | **Removed** | Replaced by transaction-safe outbox event `order.updated` |
| `order.controller.js` | `reportShortage` | `ORDER_UPDATED` | **Removed** | Replaced by transaction-safe outbox event `order.updated` |
| `order.controller.js` | `addPayment` | `ORDER_UPDATED` & `PAYMENT_UPDATED` | **Removed** | Replaced by transaction-safe outbox events `order.updated` and `payment.created` |
| `order.controller.js` | `createDmFromOrder` | `DELIVERY_MEMO_UPDATED` & `STOCK_UPDATED` | **Removed** | Replaced by outbox events `deliveryMemo.created` and `stock.updated` |
| `order.controller.js` | `convertOrderToSale` | `SALE_UPDATED` & `STOCK_UPDATED` | **Removed** | Replaced by outbox events `sale.created` and `stock.updated` |
| `stock.controller.js` | `createMovement` | `STOCK_UPDATED` | **Removed** | Wrapped in Prisma transaction and replaced by outbox event `stock.updated` |
| `stock.controller.js` | `bulkStockEntry` (owner) | `STOCK_UPDATED` | **Removed** | Wrapped in Prisma transaction and replaced by outbox event `stock.updated` per entry |
| `stock.controller.js` | `bulkStockEntry` (staff) | `NOTIFICATION_CREATED` | **Removed** | Replaced by outbox event `approval.created` inside the transaction |
| `shop.controller.js` | `setOpeningStock` | `STOCK_UPDATED` | **Removed** | Replaced by outbox event `stock.updated` inside the transaction |
| `sale.controller.js` | `updateGstInvoice` | `SALE_UPDATED` | **Removed** | Wrapped in Prisma transaction and replaced by outbox event `sale.updated` |
| `cheque.controller.js` | `updateStatus` | `PAYMENT_UPDATED` | **Removed** | Replaced by outbox event `payment.updated` inside the transaction |
| `shop.controller.js` | `createShop` | `SHOP_UPDATED` | *Kept* | Pure non-critical metadata update (does not affect ledger transaction consistency) |
| `shop.controller.js` | `updateShop` | `SHOP_UPDATED` | *Kept* | Pure non-critical metadata update (does not affect ledger transaction consistency) |
| `shop.controller.js` | `assignStaff` | `SHOP_UPDATED` | *Kept* | Pure non-critical metadata update (does not affect ledger transaction consistency) |

---

## Observability & Latency Monitoring

The domain event dispatcher worker now measures and prints the following metrics during processing:
- **Outbox Claim Counts**: Number of rows claimed for execution.
- **Latency Speed**: Time taken to publish the event and update outbox status.
- **Event Age**: Time elapsed since the event was created in the outbox database table.
- **Suppressions**: Log notifications when a foreground app user presence triggers push notification suppression.

### Example Dispatch Log Output
```
[DomainEventDispatcher] Claimed 1 pending events for dispatch
[DomainEventDispatcher] Dispatching event: id=evt_test_dedupe_123, shopId=cmquycqkm0003n0s0riu6r6wv, entity=cashSession, action=review_required
[DomainEventDispatcher] Event dispatched successfully: id=evt_test_dedupe_123, shopId=cmquycqkm0003n0s0riu6r6wv, entity=cashSession, action=review_required, latencyMs=10ms, eventAgeMs=14ms
[DomainEventDispatcher] Dispatch batch completed: processed=1 events in durationMs=13ms
```
