import type {
  WaConversation,
  WaMessage,
  WaPage,
} from "../../api/whatsapp.api";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalCursor(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isValidVersion(value: unknown) {
  return value === undefined
    || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

export function isWaMessage(
  value: unknown,
  expectedConversationId?: string,
): value is WaMessage {
  if (!isObject(value)) return false;
  if (
    !isNonEmptyString(value.id)
    || !isNonEmptyString(value.conversationId)
    || !isNonEmptyString(value.direction)
    || !isNonEmptyString(value.type)
    || !isNonEmptyString(value.createdAt)
    || !isValidVersion(value.entityVersion)
  ) {
    return false;
  }
  if (value.direction !== "INBOUND" && value.direction !== "OUTBOUND") return false;
  if (expectedConversationId && value.conversationId !== expectedConversationId) return false;
  return Number.isFinite(Date.parse(value.createdAt));
}

export function isWaConversation(
  value: unknown,
  expectedShopId?: string,
): value is WaConversation {
  if (!isObject(value)) return false;
  if (
    !isNonEmptyString(value.id)
    || !isNonEmptyString(value.shopId)
    || !isNonEmptyString(value.phone)
    || typeof value.unreadCount !== "number"
    || !Number.isInteger(value.unreadCount)
    || value.unreadCount < 0
    || typeof value.isArchived !== "boolean"
    || typeof value.isPinned !== "boolean"
    || !isValidVersion(value.entityVersion)
  ) {
    return false;
  }
  if (expectedShopId && value.shopId !== expectedShopId) return false;
  return value.messages === undefined
    || (Array.isArray(value.messages) && value.messages.every((message) => isWaMessage(message)));
}

function parsePage<T>(
  value: unknown,
  itemGuard: (item: unknown) => item is T,
  label: string,
): WaPage<T> {
  if (!isObject(value) || !Array.isArray(value.items)) {
    throw new Error(`Invalid ${label} response`);
  }
  if (!isOptionalCursor(value.nextCursor) || !isOptionalCursor(value.snapshotCursor)) {
    throw new Error(`Invalid ${label} cursor`);
  }
  const invalidIndex = value.items.findIndex((item) => !itemGuard(item));
  if (invalidIndex >= 0) {
    throw new Error(`Invalid ${label} item at index ${invalidIndex}`);
  }
  return value as WaPage<T>;
}

export function parseWaConversationPage(value: unknown) {
  return parsePage(
    value,
    (item): item is WaConversation => isWaConversation(item),
    "WhatsApp conversation",
  );
}

export function parseWaMessagePage(value: unknown, conversationId: string) {
  return parsePage(
    value,
    (item): item is WaMessage => isWaMessage(item, conversationId),
    "WhatsApp message",
  );
}

export function parseStoredConversation(
  json: string,
): WaConversation | null {
  try {
    const value: unknown = JSON.parse(json);
    return isWaConversation(value) ? value : null;
  } catch {
    return null;
  }
}

export function parseStoredMessage(
  json: string,
  conversationId: string,
): WaMessage | null {
  try {
    const value: unknown = JSON.parse(json);
    return isWaMessage(value, conversationId) ? value : null;
  } catch {
    return null;
  }
}

export function whatsappConversationCacheKey(shopId: string, integrationId: string) {
  return `wa_fast_convs_v2_${shopId}_${integrationId}`;
}

export function whatsappMessageCacheKey(
  shopId: string,
  integrationId: string,
  conversationId: string,
) {
  return `wa_fast_msgs_v2_${shopId}_${integrationId}_${conversationId}`;
}
