import type { WaConversation, WaMessage } from "../../../api/whatsapp.api";
import type { DomainEvent } from "../../../realtime/domainEvents";
import { isWaConversation, isWaMessage } from "../whatsapp-validation";
import { whatsappDb } from "./whatsapp-db";

function eventVersion(event: DomainEvent) {
  const patchVersion = event.patch?.entityVersion;
  return event.entityVersion
    ?? (typeof patchVersion === "number" ? patchVersion : 0);
}

function normalizeMessagePatch(
  current: WaMessage | null,
  patch: Record<string, unknown>,
) {
  const normalized = { ...patch };
  if (typeof normalized.providerMessageId === "string" && !normalized.metaMessageId) {
    normalized.metaMessageId = normalized.providerMessageId;
  }
  if (Array.isArray(normalized.reactions)) {
    normalized.payload = {
      ...(current?.payload || {}),
      reactions: normalized.reactions,
    };
    delete normalized.reactions;
  }
  return normalized;
}

// Persists durable WhatsApp domain events into the local SQLite replica.
// MMKV is refreshed only by whatsappDb after the SQLite write succeeds.
export async function persistWhatsAppDomainEvent(event: DomainEvent) {
  if (
    (event.entity !== "waMessage" && event.entity !== "waConversation")
    || !event.integrationId
    || !event.conversationId
  ) {
    return false;
  }

  const scope = {
    shopId: event.shopId,
    integrationId: event.integrationId,
    conversationId: event.conversationId,
  };
  const incomingVersion = eventVersion(event);
  const patch = event.patch || {};

  if (event.entity === "waConversation") {
    if (event.action === "deleted") {
      await whatsappDb.removeConversation(
        scope.shopId,
        scope.integrationId,
        scope.conversationId,
      );
      return true;
    }

    const current = await whatsappDb.getConversation(
      scope.shopId,
      scope.integrationId,
      scope.conversationId,
    );
    if ((current?.entityVersion ?? -1) >= incomingVersion) return false;

    const merged: unknown = {
      ...(current || {
        id: event.entityId,
        shopId: event.shopId,
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
      }),
      ...patch,
      id: event.entityId,
      shopId: event.shopId,
      entityVersion: incomingVersion,
      updatedAt: event.updatedAt || event.occurredAt || current?.updatedAt,
    };
    if (!isWaConversation(merged)) return false;
    await whatsappDb.upsertConversations(
      {
        shopId: scope.shopId,
        integrationId: scope.integrationId,
        phoneNumberId: event.phoneNumberId || undefined,
      },
      [merged],
    );
    return true;
  }

  const clientMessageId = typeof patch.clientMessageId === "string"
    ? patch.clientMessageId
    : undefined;
  const current = await whatsappDb.getMessage(
    scope.shopId,
    scope.integrationId,
    scope.conversationId,
    event.entityId,
    clientMessageId,
  );
  if ((current?.entityVersion ?? -1) >= incomingVersion) return false;

  const merged: unknown = {
    ...(current || {}),
    ...normalizeMessagePatch(current, patch),
    id: event.entityId,
    conversationId: scope.conversationId,
    entityVersion: incomingVersion,
  };
  if (!isWaMessage(merged, scope.conversationId)) return false;
  await whatsappDb.upsertMessages(scope, [merged]);

  if (event.action === "created") {
    const conversation = await whatsappDb.getConversation(
      scope.shopId,
      scope.integrationId,
      scope.conversationId,
    );
    if (conversation) {
      await whatsappDb.upsertConversations(
        {
          shopId: scope.shopId,
          integrationId: scope.integrationId,
          phoneNumberId: event.phoneNumberId || undefined,
        },
        [{
          ...conversation,
          messages: [merged],
          updatedAt: merged.createdAt,
        }],
      );
    }
  }
  return true;
}
