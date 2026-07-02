import type { QueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "../api/client";
import { handleDomainEvent, type DomainEvent } from "./domainEvents";
import { getDomainEventCursor, setDomainEventCursor } from "./domainEventCursor";

// ─── Throttle / In-flight guard ──────────────────────────────────────────────

const MIN_RECONCILE_INTERVAL_MS = 5_000; // min 5 s between reconcile calls per shop
const lastReconcileAt = new Map<string, number>();
const inFlight = new Set<string>();

function isThrottled(shopId: string): boolean {
  const last = lastReconcileAt.get(shopId) ?? 0;
  return Date.now() - last < MIN_RECONCILE_INTERVAL_MS;
}

// ─── Targeted fallback invalidation ─────────────────────────────────────────

function invalidateCriticalQueriesForShop(queryClient: QueryClient, shopId: string): void {
  const invalidate = (key: unknown[]) => queryClient.invalidateQueries({ queryKey: key });
  invalidate(["sales", shopId]);
  invalidate(["payments", shopId]);
  invalidate(["current-stock", shopId]);
  invalidate(["items", shopId]);
  invalidate(["orders", shopId]);
  invalidate(["delivery-memos", shopId]);
  invalidate(["current-cash-session", shopId]);
  invalidate(["cash-sessions", shopId]);
  invalidate(["customers", shopId]);
  invalidate(["owner-dashboard", { shopId }]);
  invalidate(["notifications", { shopId }]);
}

// ─── HTTP reconciliation call ─────────────────────────────────────────────────

interface ReconcileResponse {
  success: boolean;
  data: {
    events: DomainEvent[];
    nextCursor: string | null;
  };
}

async function fetchMissedEvents(
  shopId: string,
  after: string | null,
  token: string,
): Promise<ReconcileResponse> {
  let url = `${API_BASE_URL}/sync/domain-events?shopId=${encodeURIComponent(shopId)}&limit=100`;
  if (after) {
    url += `&after=${encodeURIComponent(after)}`;
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Reconciliation HTTP ${res.status}`);
  }
  return res.json() as Promise<ReconcileResponse>;
}

// ─── Main reconciliation function ────────────────────────────────────────────
export async function reconcileDomainEventsForShop(
  shopId: string,
  token: string,
  queryClient: QueryClient,
  currentDeviceId?: string | null,
): Promise<"processed" | "throttled" | "in-flight" | "error"> {
  if (!shopId || !token) return "error";
  if (isThrottled(shopId)) return "throttled";
  if (inFlight.has(shopId)) return "in-flight";

  inFlight.add(shopId);
  lastReconcileAt.set(shopId, Date.now());

  try {
    const cursor = await getDomainEventCursor(shopId);
    const response = await fetchMissedEvents(shopId, cursor, token);

    if (!response.success || !Array.isArray(response.data?.events)) {
      console.warn("[reconcile] unexpected response shape for shop", shopId);
      invalidateCriticalQueriesForShop(queryClient, shopId);
      return "error";
    }

    const { events, nextCursor } = response.data;

    console.log("[reconcile] processing", events.length, "events for shop", shopId, "cursor:", cursor ?? "none");

    for (const event of events) {
      try {
	        handleDomainEvent(queryClient, event, currentDeviceId);
	        const eventCursor = event.createdAt ?? event.updatedAt;
	        if (eventCursor) {
	          await setDomainEventCursor(shopId, eventCursor);
	        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[reconcile] event processing failed, stopping at eventId", event?.eventId, "—", msg);
        break;
      }
    }

    if (nextCursor) {
      await setDomainEventCursor(shopId, nextCursor);
    }

    return "processed";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[reconcile] endpoint failed for shop", shopId, "—", msg, "— falling back to targeted invalidation");
    invalidateCriticalQueriesForShop(queryClient, shopId);
    return "error";
  } finally {
    inFlight.delete(shopId);
  }
}

export function resetReconcileThrottle(shopId: string): void {
  lastReconcileAt.delete(shopId);
}
