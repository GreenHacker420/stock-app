import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";

import type { WaConversation, WaMessage } from "../../api/whatsapp.api";
import { invalidateForDomainEvent } from "../../realtime/domainEvents";
import {
  appendWhatsAppMessage,
  replaceWhatsAppMessage,
} from "./whatsapp-query-cache";
import {
  parseWaConversationPage,
  parseWaMessagePage,
  whatsappConversationCacheKey,
  whatsappMessageCacheKey,
} from "./whatsapp-validation";

test("a durable retry reconciles to one server message", () => {
  const clientMessageId = "client-1";
  const local: WaMessage = {
    id: `local:${clientMessageId}`,
    clientMessageId,
    conversationId: "conversation-1",
    direction: "OUTBOUND",
    operationState: "SUBMITTING",
    providerStatus: "PENDING",
    contentState: "VISIBLE",
    type: "TEXT",
    content: { text: "hello" },
    createdAt: "2026-07-26T00:00:00.000Z",
  };
  const remote: WaMessage = {
    ...local,
    id: "server-1",
    operationState: "QUEUED",
    providerStatus: "ACCEPTED",
  };

  const optimistic = appendWhatsAppMessage(undefined, local);
  const reconciled = replaceWhatsAppMessage(
    optimistic,
    clientMessageId,
    remote,
  );

  assert.deepEqual(
    reconciled?.pages.flatMap((page) => page.items).map((message) => message.id),
    ["server-1"],
  );
});

test("fast-start cache keys are isolated by shop, integration, and conversation", () => {
  assert.notEqual(
    whatsappConversationCacheKey("shop-1", "integration-1"),
    whatsappConversationCacheKey("shop-1", "integration-2"),
  );
  assert.notEqual(
    whatsappMessageCacheKey("shop-1", "integration-1", "conversation-1"),
    whatsappMessageCacheKey("shop-1", "integration-2", "conversation-1"),
  );
  assert.notEqual(
    whatsappMessageCacheKey("shop-1", "integration-1", "conversation-1"),
    whatsappMessageCacheKey("shop-1", "integration-1", "conversation-2"),
  );
});

test("API page validation rejects malformed and cross-conversation records", () => {
  const conversation: WaConversation = {
    id: "conversation-1",
    shopId: "shop-1",
    phone: "+919999999999",
    unreadCount: 0,
    isArchived: false,
    isPinned: false,
  };
  assert.throws(() => parseWaConversationPage({
    items: [{ ...conversation, phone: "" }],
    nextCursor: null,
    snapshotCursor: null,
  }));

  const message: WaMessage = {
    id: "message-1",
    conversationId: "conversation-2",
    direction: "INBOUND",
    type: "TEXT",
    content: { text: "hello" },
    createdAt: "2026-07-30T00:00:00.000Z",
  };
  assert.throws(() => parseWaMessagePage({
    items: [message],
    nextCursor: null,
    snapshotCursor: null,
  }, "conversation-1"));
});

test("realtime reaction patches are merged into the message payload", () => {
  const queryClient = new QueryClient();
  const queryKey = ["whatsapp", "messages", "shop-1", "integration-1", "conversation-1"];
  const message: WaMessage = {
    id: "message-1",
    conversationId: "conversation-1",
    direction: "INBOUND",
    type: "TEXT",
    content: { text: "hello" },
    payload: { reactions: [] },
    entityVersion: 1,
    createdAt: "2026-07-30T00:00:00.000Z",
  };
  queryClient.setQueryData(queryKey, {
    pageParams: [undefined],
    pages: [{ items: [message], nextCursor: null, snapshotCursor: null }],
  });

  invalidateForDomainEvent(queryClient, {
    eventId: "event-reaction-1",
    shopId: "shop-1",
    entity: "waMessage",
    action: "reaction_updated",
    entityId: "message-1",
    actorUserId: "system:whatsapp",
    integrationId: "integration-1",
    conversationId: "conversation-1",
    entityVersion: 2,
    patch: {
      reactions: [{ from: "+919999999999", emoji: "👍", timestamp: "2026-07-30T00:01:00.000Z" }],
      entityVersion: 2,
    },
  });

  const data = queryClient.getQueryData<{
    pages: Array<{ items: WaMessage[] }>;
  }>(queryKey);
  assert.equal(data?.pages[0]?.items[0]?.payload?.reactions?.[0]?.emoji, "👍");
});
