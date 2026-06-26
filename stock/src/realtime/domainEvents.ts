import type { QueryClient } from "@tanstack/react-query";

export type DomainEvent = {
  eventId: string;
  shopId: string;
  entity:
    | "sale"
    | "payment"
    | "item"
    | "stock"
    | "deliveryMemo"
    | "order"
    | "customer"
    | "cashSession"
    | "approval"
    | "dashboard"
    | "notification";
  action: string;
  entityId: string;
  actorUserId: string;
  sourceDeviceId?: string | null;
  updatedAt: string;
  queryKeys?: string[];
  patch?: Record<string, unknown>;
  notification?: {
    title: string;
    body: string;
    severity?: "info" | "success" | "warning" | "critical";
    deepLink?: string;
  };
};

const seenEventIds = new Map<string, number>();
const SEEN_LIMIT = 300;

export function hasSeenDomainEvent(eventId?: string | null) {
  if (!eventId) return false;
  if (seenEventIds.has(eventId)) return true;
  seenEventIds.set(eventId, Date.now());
  if (seenEventIds.size > SEEN_LIMIT) {
    const oldest = [...seenEventIds.entries()].sort((a, b) => a[1] - b[1]).slice(0, 50);
    for (const [key] of oldest) seenEventIds.delete(key);
  }
  return false;
}

export function invalidateForDomainEvent(queryClient: QueryClient, event: DomainEvent) {
  const shopId = event.shopId;
  const invalidate = (queryKey: unknown[]) => queryClient.invalidateQueries({ queryKey });

  if (event.entity === "sale") {
    invalidate(["sales", shopId]);
    invalidate(["sale", event.entityId]);
    invalidate(["owner-dashboard"]);
    invalidate(["staff-today-summary", shopId]);
    invalidate(["customers", shopId]);
  }

  if (event.entity === "payment") {
    invalidate(["payments", shopId]);
    invalidate(["owner-dashboard"]);
    invalidate(["staff-today-summary", shopId]);
    invalidate(["customers", shopId]);
    invalidate(["current-cash-session", shopId]);
    invalidate(["cash-sessions", shopId]);
  }

  if (event.entity === "stock" || event.entity === "item") {
    invalidate(["items"]);
    invalidate(["current-stock", shopId]);
    invalidate(["stock-movements", shopId]);
    invalidate(["owner-dashboard"]);
  }

  if (event.entity === "customer") {
    invalidate(["customers", shopId]);
    invalidate(["customer", event.entityId]);
  }

  if (event.entity === "deliveryMemo") {
    invalidate(["delivery-memos", shopId]);
    invalidate(["owner-dashboard"]);
    invalidate(["customers", shopId]);
  }

  if (event.entity === "order") {
    invalidate(["orders", shopId]);
    invalidate(["order", event.entityId]);
    invalidate(["owner-dashboard"]);
  }

  if (event.entity === "cashSession") {
    invalidate(["current-cash-session", shopId]);
    invalidate(["cash-sessions", shopId]);
    invalidate(["owner-dashboard"]);
  }

  if (event.entity === "approval" || event.entity === "notification") {
    invalidate(["notifications"]);
    invalidate(["rate-change-requests", shopId]);
    invalidate(["correction-requests", shopId]);
  }

  for (const key of event.queryKeys || []) {
    if (key === "dashboard") invalidate(["owner-dashboard"]);
    if (key === "notifications") invalidate(["notifications"]);
  }
}

export function handleDomainEvent(queryClient: QueryClient, event: DomainEvent) {
  if (!event?.eventId || hasSeenDomainEvent(event.eventId)) return false;
  invalidateForDomainEvent(queryClient, event);
  return true;
}
