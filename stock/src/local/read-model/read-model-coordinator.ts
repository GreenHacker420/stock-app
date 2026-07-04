import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { getDomainReadCache, initializeDomainReadCache } from "../../auth/domain-cache";
import { queryKeys } from "../../hooks/query-keys";
import type { DomainEvent } from "../../realtime/domainEvents";
import { fetchReadModelBootstrap, fetchReadModelDomain } from "./read-model-api";
import {
  getStoredSequenceCursor,
  readLocalReadModelEnvelope,
  removeLocalReadModelEnvelope,
  removeStoredSequenceCursor,
  setStoredSequenceCursor,
  validateDomainRepairResponse,
  validateBootstrapResponse,
  writeLocalReadModelDomains,
  writeLocalReadModelEnvelope,
} from "./read-model-cache-core";
import { doesEventAffectReadModels } from "./read-model-event-policy";
import type { LocalReadModelEnvelope, ReadModelDomain, ReadModelDomainRecords } from "./read-model-types";

type Context = {
  userId: string;
  shopId: string;
};

type RefreshOptions = Context & {
  token: string;
  queryClient: QueryClient;
  reason: "bootstrap" | "reconciliation" | "realtime";
  writeCursor?: boolean;
};

const activeTokens = new Map<string, number>();
const refreshFlights = new Map<string, { promise: Promise<LocalReadModelEnvelope | null>; rerun: boolean }>();

function contextKey({ userId, shopId }: Context) {
  return `${userId}:${shopId}`;
}

function getActiveToken(context: Context) {
  return activeTokens.get(contextKey(context)) ?? 0;
}

function isStillActive(context: Context, token: number) {
  return getActiveToken(context) === token;
}

export function activateReadModelContext(userId: string, shopId: string) {
  const key = contextKey({ userId, shopId });
  const token = (activeTokens.get(key) ?? 0) + 1;
  activeTokens.set(key, token);
  return token;
}

export function deactivateReadModelContext(userId: string, shopId: string) {
  const key = contextKey({ userId, shopId });
  activeTokens.set(key, (activeTokens.get(key) ?? 0) + 1);
}

export function clearReadModelQuery(queryClient: QueryClient, shopId: string) {
  queryClient.removeQueries({ queryKey: queryKeys.readModels.bootstrap(shopId) });
}

async function ensureStorage(userId: string) {
  await initializeDomainReadCache(userId);
  return getDomainReadCache().storage;
}

export async function hydrateReadModelForShop(options: RefreshOptions) {
  const context = { userId: options.userId, shopId: options.shopId };
  const token = getActiveToken(context);
  const storage = await ensureStorage(options.userId);
  if (!isStillActive(context, token)) return null;

  const local = readLocalReadModelEnvelope(storage, options.shopId);
  if (local) {
    options.queryClient.setQueryData(queryKeys.readModels.bootstrap(options.shopId), local);
    return local;
  }

  return refreshReadModelBootstrap(options);
}

export async function getReadModelReconciliationCursor(userId: string, shopId: string) {
  const storage = await ensureStorage(userId);
  const stored = getStoredSequenceCursor(storage, userId, shopId);
  if (stored) return stored;
  const local = readLocalReadModelEnvelope(storage, shopId);
  return local?.baseCursor ?? null;
}

export async function refreshReadModelBootstrap(options: RefreshOptions): Promise<LocalReadModelEnvelope | null> {
  const key = contextKey(options);
  const existing = refreshFlights.get(key);
  if (existing) {
    existing.rerun = true;
    return existing.promise;
  }

  const promise = runRefresh(options).finally(async () => {
    const flight = refreshFlights.get(key);
    refreshFlights.delete(key);
    if (flight?.rerun) {
      await refreshReadModelBootstrap(options);
    }
  });

  refreshFlights.set(key, { promise, rerun: false });
  return promise;
}

export async function refreshReadModelDomains(
  options: RefreshOptions,
  domains: ReadModelDomain[],
): Promise<LocalReadModelEnvelope | null> {
  const uniqueDomains = [...new Set(domains)];
  if (uniqueDomains.length === 0) return readLocalReadModelEnvelope(await ensureStorage(options.userId), options.shopId);

  const context = { userId: options.userId, shopId: options.shopId };
  const token = getActiveToken(context);
  const storage = await ensureStorage(options.userId);
  if (!isStillActive(context, token)) return null;

  const current = readLocalReadModelEnvelope(storage, options.shopId);
  if (!current) {
    return refreshReadModelBootstrap({ ...options, writeCursor: false });
  }

  const updates: Partial<ReadModelDomainRecords> = {};
  for (const domain of uniqueDomains) {
    const response = await fetchReadModelDomain(options.token, options.shopId, domain);
    if (!validateDomainRepairResponse<typeof domain>(response, options.shopId)) {
      throw new Error(`Invalid ${domain} read-model repair response`);
    }
    updates[domain] = response.records as never;
  }
  if (!isStillActive(context, token)) return null;

  const envelope = writeLocalReadModelDomains(storage, options.shopId, updates);
  if (envelope) {
    options.queryClient.setQueryData(queryKeys.readModels.bootstrap(options.shopId), envelope);
  }
  return envelope;
}

async function runRefresh(options: RefreshOptions) {
  const context = { userId: options.userId, shopId: options.shopId };
  const token = getActiveToken(context);
  const storage = await ensureStorage(options.userId);
  if (!isStillActive(context, token)) return null;

  try {
    const bootstrap = await fetchReadModelBootstrap(options.token, options.shopId);
    if (!validateBootstrapResponse(bootstrap, options.shopId)) {
      throw new Error("Invalid read-model bootstrap response");
    }
    if (!isStillActive(context, token)) return null;

    const previous = options.writeCursor === false ? readLocalReadModelEnvelope(storage, options.shopId) : null;
    const envelope = writeLocalReadModelEnvelope(storage, bootstrap, {
      baseCursor: options.writeCursor === false ? previous?.baseCursor ?? null : bootstrap.baseCursor,
    });
    options.queryClient.setQueryData(queryKeys.readModels.bootstrap(options.shopId), envelope);
    if (options.writeCursor !== false) {
      setStoredSequenceCursor(storage, options.userId, options.shopId, bootstrap.baseCursor);
    }
    return envelope;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      removeLocalReadModelEnvelope(storage, options.shopId);
      removeStoredSequenceCursor(storage, options.userId, options.shopId);
      clearReadModelQuery(options.queryClient, options.shopId);
    }
    throw error;
  }
}

export function doesReadModelBatchNeedRefresh(events: DomainEvent[], shopId: string) {
  return events.some((event) => event?.shopId === shopId && doesEventAffectReadModels(event));
}

export async function handleReadModelLiveEvent(options: RefreshOptions & { event: DomainEvent }) {
  if (options.event.shopId !== options.shopId) return;
  if (!doesEventAffectReadModels(options.event)) return;
  await refreshReadModelBootstrap({ ...options, reason: "realtime" });
}
