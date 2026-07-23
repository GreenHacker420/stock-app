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
    | "notification"
    | "shop"
    | "category"
    | "staff"
    | "attendance"
    | "expense"
    | "dailySummary"
    | "waMessage"
    | "waConversation";
  action: string;
  entityId: string;
  actorUserId: string;
  sourceDeviceId?: string | null;
  sequence?: string;
  eventVersion?: number;
  entityVersion?: number;
  integrationId?: string | null;
  phoneNumberId?: string | null;
  conversationId?: string | null;
  occurredAt?: string;
  createdAt?: string;
  updatedAt?: string;
  queryKeys?: string[];
  patch?: Record<string, unknown>;
  notification?: {
    title: string;
    body: string;
    severity?: "info" | "success" | "warning" | "critical";
    deepLink?: string;
  };
  visibility?: {
    owners?: boolean;
    staff?: boolean;
    targetUserIds?: string[];
    targetDeviceIds?: string[];
  };
};

const seenEventIds = new Map<string, number>();
const SEEN_LIMIT = 300;

type EntityRecord = Record<string, unknown> & {
  id?: string;
  clientMessageId?: string;
  entityVersion?: number;
};

function patchEntity(item: unknown, event: DomainEvent) {
  if (!item || typeof item !== "object") return item;
  const entity = item as EntityRecord;
  const patch = event.patch || {};
  const patchClientId = typeof patch.clientMessageId === "string" ? patch.clientMessageId : undefined;
  if (entity.id !== event.entityId && (!patchClientId || entity.clientMessageId !== patchClientId)) {
    return item;
  }
  const incomingVersion = event.entityVersion ?? Number(patch.entityVersion || 0);
  if ((entity.entityVersion ?? 0) >= incomingVersion) return item;
  return { ...entity, ...patch, id: event.entityId, entityVersion: incomingVersion };
}

function patchCollection(data: unknown, event: DomainEvent): unknown {
  if (Array.isArray(data)) {
    const patched = data.map((item) => patchEntity(item, event));
    const found = patched.some((item) => item !== undefined
      && typeof item === "object"
      && (item as EntityRecord).id === event.entityId);
    if (!found && event.action === "created" && event.patch) {
      return [{ ...event.patch, id: event.entityId, entityVersion: event.entityVersion }, ...patched];
    }
    return patched;
  }
  if (!data || typeof data !== "object") return data;
  const value = data as Record<string, unknown>;
  if (Array.isArray(value.items)) return { ...value, items: patchCollection(value.items, event) };
  if (Array.isArray(value.pages)) return {
    ...value,
    pages: value.pages.map((page) => patchCollection(page, event)),
  };
  return patchEntity(data, event);
}

function patchWhatsAppEvent(queryClient: QueryClient, event: DomainEvent) {
  if (!event.integrationId) return;
  if (event.entity === "waMessage" && event.conversationId) {
    queryClient.setQueriesData(
      { queryKey: ["whatsapp", "messages", event.shopId, event.integrationId, event.conversationId] },
      (data) => patchCollection(data, event),
    );
    queryClient.setQueryData(
      ["wa-messages", event.conversationId],
      (data: unknown) => patchCollection(data, event),
    );
    return;
  }
  if (event.entity === "waConversation") {
    queryClient.setQueriesData(
      { queryKey: ["whatsapp", "conversations", event.shopId, event.integrationId] },
      (data) => patchCollection(data, event),
    );
    queryClient.setQueryData(
      ["wa-conversations", event.shopId],
      (data: unknown) => patchCollection(data, event),
    );
  }
}

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

  if (event.entity === "waMessage" || event.entity === "waConversation") {
    patchWhatsAppEvent(queryClient, event);
    return;
  }

  if (event.entity === "sale") {
    invalidate(["sales", shopId]);
    invalidate(["sale", event.entityId]);
    invalidate(["owner-dashboard", { shopId }]);
    invalidate(["staff-today-summary", shopId]);
    invalidate(["customers", shopId]);
  }

  if (event.entity === "payment") {
    invalidate(["payments", shopId]);
    invalidate(["owner-dashboard", { shopId }]);
    invalidate(["staff-today-summary", shopId]);
    invalidate(["customers", shopId]);
    invalidate(["current-cash-session", shopId]);
    invalidate(["cash-sessions", shopId]);
  }

  if (event.entity === "stock" || event.entity === "item") {
    invalidate(["items", shopId]);
    invalidate(["current-stock", shopId]);
    invalidate(["stock-movements", shopId]);
    invalidate(["owner-dashboard", { shopId }]);
  }

  if (event.entity === "category") {
    invalidate(["categories", shopId]);
    invalidate(["items", shopId]);
  }

  if (event.entity === "shop") {
    queryClient.invalidateQueries({ queryKey: ["shops"] });
    queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  if (event.entity === "staff") {
    queryClient.invalidateQueries({ queryKey: ["staff"] });
    queryClient.invalidateQueries({ queryKey: ["shops"] });
    queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  if (event.entity === "attendance") {
    queryClient.invalidateQueries({ queryKey: ["attendance"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-infinite"] });
    invalidate(["staff-today-summary", shopId]);
    invalidate(["owner-dashboard", { shopId }]);
  }

  if (event.entity === "expense") {
    invalidate(["expenses", shopId]);
    invalidate(["current-cash-session", shopId]);
    invalidate(["cash-sessions", shopId]);
    invalidate(["owner-dashboard", { shopId }]);
  }

  if (event.entity === "dailySummary") {
    queryClient.invalidateQueries({ queryKey: ["daily-summary"] });
    queryClient.invalidateQueries({ queryKey: ["daily-summaries"] });
    invalidate(["owner-dashboard", { shopId }]);
  }

  if (event.entity === "customer") {
    invalidate(["customers", shopId]);
    invalidate(["customer", event.entityId]);
  }

  if (event.entity === "deliveryMemo") {
    invalidate(["delivery-memos", shopId]);
    invalidate(["owner-dashboard", { shopId }]);
    invalidate(["customers", shopId]);
  }

  if (event.entity === "order") {
    invalidate(["orders", shopId]);
    invalidate(["order", event.entityId]);
    invalidate(["owner-dashboard", { shopId }]);
  }

  if (event.entity === "cashSession") {
    invalidate(["current-cash-session", shopId]);
    invalidate(["cash-sessions", shopId]);
    invalidate(["owner-dashboard", { shopId }]);
  }

  if (event.entity === "approval" || event.entity === "notification") {
    queryClient.invalidateQueries({ queryKey: ["notifications", { shopId }] });
    invalidate(["rate-change-requests", shopId]);
    invalidate(["correction-requests", shopId]);
  }

  for (const key of event.queryKeys || []) {
    if (key === "dashboard") invalidate(["owner-dashboard", { shopId }]);
    if (key === "notifications") queryClient.invalidateQueries({ queryKey: ["notifications", { shopId }] });
  }
}

export function handleDomainEvent(queryClient: QueryClient, event: DomainEvent, currentDeviceId?: string | null) {
  if (!event?.eventId || hasSeenDomainEvent(event.eventId)) return false;

  // Skip processing if event was originated by the current device to avoid duplicate local updates
  if (
    currentDeviceId
    && event.sourceDeviceId === currentDeviceId
    && event.entity !== "waMessage"
    && event.entity !== "waConversation"
  ) {
    console.log(`[domainEvents] Ignoring event ${event.eventId} because it originated from the current device ${currentDeviceId}`);
    return false;
  }

  invalidateForDomainEvent(queryClient, event);
  return true;
}
