import assert from "node:assert/strict";
import test from "node:test";

import type { WaMessage } from "../../api/whatsapp.api";
import {
  appendWhatsAppMessage,
  replaceWhatsAppMessage,
} from "./whatsapp-query-cache";

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
