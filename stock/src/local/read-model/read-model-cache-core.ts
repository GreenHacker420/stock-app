import type { DomainCacheStorage } from "../../auth/domain-cache-core";
import type {
  LocalReadModelEnvelope,
  MobileReadModelBootstrap,
  MobileReadModelDomainRepair,
  ReadModelDomain,
  ReadModelDomainRecords,
} from "./read-model-types";

export const EVENT_SEQUENCE_MIGRATION_MARKER = "storage-migration:event-sequence:v1";
export const NUMERIC_CURSOR_PATTERN = /^\d+$/;

function encodePart(value: string) {
  return encodeURIComponent(value.trim());
}

export function readModelBootstrapKey(shopId: string) {
  if (!shopId.trim()) throw new Error("Read-model bootstrap key requires shopId");
  return `cache:v1:shop:${encodePart(shopId)}:bootstrap`;
}

export function readModelSequenceCursorKey(userId: string, shopId: string) {
  if (!userId.trim()) throw new Error("Read-model cursor key requires userId");
  if (!shopId.trim()) throw new Error("Read-model cursor key requires shopId");
  return `domain-event-sequence-cursor:v1:user:${encodePart(userId)}:shop:${encodePart(shopId)}`;
}

export function isNumericSequenceCursor(value: string | null | undefined): value is string {
  return typeof value === "string" && NUMERIC_CURSOR_PATTERN.test(value);
}

export function getLegacyDomainEventCursorKeys(keys: string[]) {
  return keys.filter((key) => key.startsWith("domain_event_cursor:"));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateLocalReadModelEnvelope(
  value: unknown,
  shopId: string,
): value is LocalReadModelEnvelope {
  if (!isObject(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (value.shopId !== shopId) return false;
  if (value.complete !== true) return false;
  if (typeof value.serverGeneratedAt !== "string") return false;
  if (typeof value.writtenAt !== "string") return false;
  if (value.baseCursor !== null && !isNumericSequenceCursor(value.baseCursor as string | null)) return false;
  return Array.isArray(value.customers) && Array.isArray(value.items) && Array.isArray(value.categories);
}

export function toLocalReadModelEnvelope(
  bootstrap: MobileReadModelBootstrap,
  writtenAt = new Date().toISOString(),
  baseCursor = bootstrap.baseCursor,
): LocalReadModelEnvelope {
  return {
    schemaVersion: 1,
    shopId: bootstrap.shopId,
    serverGeneratedAt: bootstrap.generatedAt,
    writtenAt,
    baseCursor,
    complete: true,
    customers: bootstrap.customers,
    items: bootstrap.items,
    categories: bootstrap.categories,
  };
}

export function validateBootstrapResponse(value: unknown, shopId: string): value is MobileReadModelBootstrap {
  if (!isObject(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (value.shopId !== shopId) return false;
  if (value.complete !== true) return false;
  if (typeof value.generatedAt !== "string") return false;
  if (value.baseCursor !== null && !isNumericSequenceCursor(value.baseCursor as string | null)) return false;
  return Array.isArray(value.customers) && Array.isArray(value.items) && Array.isArray(value.categories);
}

export function validateDomainRepairResponse<T extends ReadModelDomain>(
  value: unknown,
  shopId: string,
): value is MobileReadModelDomainRepair<T> {
  if (!isObject(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (value.shopId !== shopId) return false;
  if (value.complete !== true) return false;
  return Array.isArray(value.records);
}

export function readLocalReadModelEnvelope(storage: DomainCacheStorage, shopId: string) {
  const key = readModelBootstrapKey(shopId);
  const raw = storage.getString(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (validateLocalReadModelEnvelope(parsed, shopId)) return parsed;
  } catch {
    // Corrupt local JSON is treated as a cache miss.
  }

  storage.remove(key);
  return null;
}

export function writeLocalReadModelEnvelope(
  storage: DomainCacheStorage,
  bootstrap: MobileReadModelBootstrap,
  options: { baseCursor?: string | null } = {},
) {
  const envelope = toLocalReadModelEnvelope(bootstrap, new Date().toISOString(), options.baseCursor ?? bootstrap.baseCursor);
  storage.set(readModelBootstrapKey(bootstrap.shopId), JSON.stringify(envelope));
  return envelope;
}

export function writeLocalReadModelDomains(
  storage: DomainCacheStorage,
  shopId: string,
  updates: Partial<ReadModelDomainRecords>,
) {
  const current = readLocalReadModelEnvelope(storage, shopId);
  if (!current) return null;

  const envelope: LocalReadModelEnvelope = {
    ...current,
    writtenAt: new Date().toISOString(),
    customers: updates.customers ?? current.customers,
    items: updates.items ?? current.items,
    categories: updates.categories ?? current.categories,
  };
  storage.set(readModelBootstrapKey(shopId), JSON.stringify(envelope));
  return envelope;
}

export function removeLocalReadModelEnvelope(storage: DomainCacheStorage, shopId: string) {
  storage.remove(readModelBootstrapKey(shopId));
}

export function getStoredSequenceCursor(storage: DomainCacheStorage, userId: string, shopId: string) {
  const key = readModelSequenceCursorKey(userId, shopId);
  const value = storage.getString(key);
  if (!value) return null;
  if (isNumericSequenceCursor(value)) return value;
  storage.remove(key);
  return null;
}

export function setStoredSequenceCursor(
  storage: DomainCacheStorage,
  userId: string,
  shopId: string,
  cursor: string | null,
) {
  const key = readModelSequenceCursorKey(userId, shopId);
  if (cursor === null) {
    storage.remove(key);
    return;
  }
  if (!isNumericSequenceCursor(cursor)) throw new Error("Read-model cursor must be a decimal sequence string");
  storage.set(key, cursor);
}

export function removeStoredSequenceCursor(storage: DomainCacheStorage, userId: string, shopId: string) {
  storage.remove(readModelSequenceCursorKey(userId, shopId));
}
