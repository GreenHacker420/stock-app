# Phase 2C Realtime + Pub/Sub + FCM + TanStack Report

## Current Audit

### Socket.IO Auth Flow

- Backend Socket.IO is created in `backend/src/index.js`.
- JWT is read from `socket.handshake.auth.token`.
- `getSocketUser()` loads active user and attaches `{ id, role, permissions }`.
- Socket immediately joins `user:{userId}`.
- Client later emits `shop:join` with `shopId`.
- `canAccessShop()` checks owner ownership or staff access before joining `shop:{shopId}`.
- Device presence is updated when `deviceId` is provided in socket auth.

### Current Rooms

- `user:{userId}`
- `shop:{shopId}`

Missing before this patch:

- `shop:{shopId}:owners`
- `shop:{shopId}:staff`
- `device:{deviceId}`
- `tenant:{tenantId}` is not applicable yet; the current tenancy boundary is shop-level.

### Current Events

Legacy socket event names exist:

- `order:updated`
- `sale:updated`
- `delivery-memo:updated`
- `payment:updated`
- `cash-session:updated`
- `stock:updated`
- `daily-summary:updated`
- `shop:updated`
- `notification:created`
- WhatsApp-specific `wa:*` events

Controllers emit many of these directly after service calls. That works for foreground sockets but is not transactionally safe for critical business writes.

### Redis Adapter / PubSub Status

- Socket.IO Redis adapter is configured in `backend/src/index.js`.
- `backend/src/utils/realtime.js` has Redis Pub/Sub only for `whatsapp:events`.
- No canonical business-domain event Redis channel existed before this patch.
- No transactional outbox existed before this patch.

### FCM / Device Registration Flow

- Mobile registers Expo/native push tokens through `FCMManager`.
- Device registration is deduped by a stable signature.
- Backend stores devices in `UserDevice` with `installationId`, `platform`, `pushToken`, `nativePushToken`, app/device metadata, notification flags, and last shop.
- Backend push uses Expo Push API from `notification-push` BullMQ worker.

### Push Queue

- `notification.service.createNotification()` creates `Notification` then enqueues `notification-push`.
- `notification-push.worker.js` selects active user devices and sends Expo messages.
- Delivery status is tracked in `NotificationPushDelivery`.

### TanStack Query Setup

- Query client is in `stock/src/App.tsx`.
- Default stale time is 5 minutes.
- `refetchOnWindowFocus` and `refetchOnReconnect` are disabled.
- Phase 2B added NetInfo-based offline sync but TanStack `onlineManager` / `focusManager` were not wired before this patch.
- RealtimeProvider currently invalidates hard-coded legacy query keys per socket event.

### Owner / Staff Gaps

- Owner/staff role rooms were missing.
- Push targeting was notification-row based, not canonical event based.
- Owner devices did not have one canonical sale/payment/stock/cash event path.
- Offline sync-created backend writes emitted the same controller/service side effects only where the service/controller did so; no outbox ensured after-commit fanout.

### Tenant Isolation Risks

- Client can request `shop:join`, but backend checks DB access before joining.
- Before this patch, there were no role-specific rooms, so all foreground shop members received all shop-level socket events.
- FCM targeting relies on server-selected `Notification.userId`, which is safe when notification creation targets correct users.
- `notifyShopOwner()` previously selected all owners globally rather than the shop owner; that is a cross-tenant risk.

## Multi-Tenant Room Model

Current tenancy is shop-level. The implemented room model is:

- `shop:{shopId}`
- `shop:{shopId}:owners`
- `shop:{shopId}:staff`
- `user:{userId}`
- `device:{deviceId}`

Rules:

- User must authenticate by JWT.
- User joins `user:{userId}` after auth.
- Device room is joined only if provided device id belongs to the authenticated user.
- Owner joins shop and owner room only for owned shops.
- Staff joins shop and staff room only for assigned shops.
- Unauthorized joins are rejected and logged.

## FCM Targeting Model

Sensitive/multi-tenant events are targeted server-side:

- Owner notifications select the owner of the event shop.
- Staff notifications select staff assigned to the event shop.
- Targeted users can be provided in canonical event visibility.
- Existing push worker sends to registered active devices for the target user.

FCM payloads remain small:

- event id / notification id
- shop id
- entity/action/entity id
- trigger type

Full business records are not sent through push.

## Pub/Sub / Event Bus Model

- Canonical channel: `domain-events`.
- Redis Pub/Sub is used now.
- The interface is kept in the dispatcher so Google Pub/Sub or another bus can replace Redis later.
- Socket.IO Redis adapter still handles cross-instance socket fanout.

## Canonical Domain Event Contract

Domain event shape:

```ts
type DomainEvent = {
  eventId: string;
  tenantId?: string;
  shopId: string;
  entity: "sale" | "payment" | "item" | "stock" | "deliveryMemo" | "order" | "customer" | "cashSession" | "approval" | "dashboard" | "notification";
  action: "created" | "updated" | "deleted" | "status_changed" | "synced" | "conflict" | "review_required" | "verified" | "rejected" | "low_stock" | "converted";
  entityId: string;
  actorUserId: string;
  actorRole?: string;
  sourceDeviceId?: string;
  idempotencyKey?: string;
  serverVersion?: number;
  updatedAt: string;
  visibility: {
    owners: boolean;
    staff: boolean;
    targetUserIds?: string[];
    targetDeviceIds?: string[];
  };
  queryKeys: string[];
  patch?: Record<string, unknown>;
  notification?: {
    sendPush: boolean;
    title: string;
    body: string;
    severity: "info" | "success" | "warning" | "critical";
    deepLink?: string;
  };
};
```

Socket event name: `domain:event`.

## Outbox Implementation

Add `DomainEventOutbox`.

Fields:

- id
- tenantId
- shopId
- entity
- action
- entityId
- eventJson
- status
- attempts
- lastError
- createdAt
- publishedAt

Rules:

- Services enqueue events inside the same Prisma transaction as the business write.
- Dispatcher publishes only after commit.
- Dispatcher retries failed events.
- Event delivery is idempotent; clients dedupe by `eventId`.

## Transport Fanout Worker

The dispatcher:

1. Claims pending/failed outbox rows.
2. Publishes canonical event to Redis `domain-events`.
3. Emits `domain:event` to authorized Socket.IO rooms.
4. Creates targeted `Notification` rows when push is requested.
5. Existing notification queue sends Expo push.
6. Marks outbox row published or failed.

## Service Events Covered

Implemented coverage:

- Customer create/merge: `customer.created`
- Sale create: `sale.created`, `stock.updated`, `customer.updated`, `dashboard.updated`, and `payment.created` when payments exist
- Payment create: `payment.created`, `customer.updated`, `cashSession.updated`, `dashboard.updated`
- Cash session open/close/review: `cashSession.created`, `cashSession.review_required`, `cashSession.updated`

Direct controller emits were removed for sale create and payment create. Legacy controller socket emissions remain for several non-create/update routes until those services are migrated; the canonical `domain:event` path is now available for clients and new writes.

## TanStack Query Invalidation Map

Frontend `invalidateForDomainEvent()` maps:

- sale: sales, sale detail, dashboard, customers, payments, items/stock
- payment: payments, dashboard, customers, cash sessions
- stock/item: items, stock, dashboard
- customer: customers and customer detail
- delivery memo: delivery memos, dashboard, customers
- order: orders, dashboard
- cash session: current cash session, cash sessions, dashboard
- notification/approval: notifications, approval/correction request lists

## Owner UX

- Owner foreground devices receive `domain:event` through owner/shop rooms.
- Owner background devices receive push when event notification rules request it, for example staff-created sale/payment review/cash review.
- Owner dashboard/list caches invalidate centrally.

## Staff UX

- Staff foreground devices receive shop staff events only for assigned shops.
- Staff devices receive targeted push for staff-visible events and approval/payment outcomes.
- Staff offline sync creates server-side events after backend commit, so owner/staff devices receive normal realtime updates after sync.

## Push Suppression

- Presence is already tracked in Redis by device/shop/socket/app state.
- This patch does not fully suppress push based on presence yet. Critical push remains allowed when uncertain.
- Next phase can add per-event suppression using `listShopPresence()`.

## Security / Tenant Isolation Checks

- Socket joins re-check shop access from DB.
- Device room joins require the device to belong to the authenticated user.
- Domain events require `shopId`.
- Dispatcher selects owner/staff recipients from server DB, not client subscriptions.
- FCM payloads do not include full customer/payment records.
- Logs include event/shop ids and errors, not sensitive payload bodies.

## Tests Run

- `npm run prisma:generate` in `backend`: passed.
- `node --check` on changed backend domain/realtime/service/worker files: passed.
- `npm test` in `backend`: passed, 32 tests.
- `npx tsc --noEmit` in `stock`: passed.

## Manual Verification

Not run in this terminal session.

## Risks And Next Phase

- Some legacy direct socket emits remain and should be migrated service-by-service.
- Push suppression by active presence is not complete.
- Outbox notification creation is retry-safe for event publishing, but notification-row dedupe by `eventId` is not yet enforced.
- Full backend unit tests for socket room joins, outbox dispatch, and FCM target selection are still needed.
- Outbox dispatcher currently runs in-process with workers; production can split it into a dedicated worker process.
- Google Pub/Sub is not configured; Redis Pub/Sub is used as the current event bus.
