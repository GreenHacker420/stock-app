import type { QueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api/client";
import { handleDomainEvent, type DomainEvent } from "./domainEvents";
import { getDomainEventCursor, setDomainEventCursor } from "./domainEventCursor";
import {
  getReadModelReconciliationCursor,
  hydrateReadModelForShop,
  refreshReadModelDomains,
} from "../local/read-model/read-model-coordinator";
import { getReadModelDomainsForBatch } from "../local/read-model/read-model-event-policy";

// ─── Throttle / In-flight guard ──────────────────────────────────────────────

const syncFlights = new Map<string, { rerun: boolean; promise: Promise<"processed" | "error"> }>();

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
  let url = `/sync/domain-events?shopId=${encodeURIComponent(shopId)}&limit=100`;
  if (after) {
    url += `&after=${encodeURIComponent(after)}`;
  }
  const data = await apiRequest<ReconcileResponse["data"]>(url, { token });
  return { success: true, data };
}

// ─── Main reconciliation function ────────────────────────────────────────────
export async function reconcileDomainEventsForShop(
  userId: string,
  shopId: string,
  token: string,
  queryClient: QueryClient,
  currentDeviceId?: string | null,
): Promise<"processed" | "coalesced" | "error"> {
  if (!userId || !shopId || !token) return "error";
  const key = `${userId}:${shopId}`;
  const existing = syncFlights.get(key);
  if (existing) {
    existing.rerun = true;
    return "coalesced";
  }

  const flight = {
    rerun: false,
    promise: Promise.resolve<"processed" | "error">("processed"),
  };

  flight.promise = (async () => {
    let result: "processed" | "error" = "processed";
    do {
      flight.rerun = false;
      result = await runReconciliation(userId, shopId, token, queryClient, currentDeviceId);
    } while (flight.rerun && result !== "error");
    return result;
  })().finally(() => {
    syncFlights.delete(key);
  });

  syncFlights.set(key, flight);
  return flight.promise;
}

async function runReconciliation(
  userId: string,
  shopId: string,
  token: string,
  queryClient: QueryClient,
  currentDeviceId?: string | null,
): Promise<"processed" | "error"> {
  try {
    await hydrateReadModelForShop({ userId, shopId, token, queryClient, reason: "bootstrap" });

    let cursor = await getDomainEventCursor(userId, shopId);
    if (!cursor) {
      cursor = await getReadModelReconciliationCursor(userId, shopId);
    }

    for (let page = 0; page < 20; page += 1) {
      const response = await fetchMissedEvents(shopId, cursor, token);

      if (!response.success || !Array.isArray(response.data?.events)) {
        console.warn("[reconcile] unexpected response shape for shop", shopId);
        invalidateCriticalQueriesForShop(queryClient, shopId);
        return "error";
      }

      const { events, nextCursor } = response.data;

      console.log("[reconcile] processing", events.length, "events for shop", shopId, "cursor:", cursor ?? "none");

      for (const event of events) {
        if (event?.shopId !== shopId) continue;
        handleDomainEvent(queryClient, event, currentDeviceId);
      }

      const domains = getReadModelDomainsForBatch(events.filter((event) => event?.shopId === shopId));
      if (domains.length > 0) {
        await refreshReadModelDomains({ userId, shopId, token, queryClient, reason: "reconciliation", writeCursor: false }, domains);
      }

      if (nextCursor) {
        await setDomainEventCursor(userId, shopId, nextCursor);
      }

      if (!nextCursor || nextCursor === cursor || events.length < 100) {
        break;
      }
      cursor = nextCursor;
    }

    return "processed";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[reconcile] endpoint failed for shop", shopId, "—", msg, "— falling back to targeted invalidation");
    invalidateCriticalQueriesForShop(queryClient, shopId);
    return "error";
  }
}

export function resetReconcileThrottle(shopId: string): void {
  syncFlights.delete(shopId);
}
