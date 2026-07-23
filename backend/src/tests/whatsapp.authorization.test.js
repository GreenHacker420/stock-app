import assert from "node:assert/strict";
import test from "node:test";
import { createWhatsAppAuthorization } from "../services/whatsapp.authorization.js";

function authorizationFixture({ authorized = true } = {}) {
  const calls = [];
  const db = {
    waIntegration: {
      findUnique: async ({ where }) => where.id === "integration-a"
        ? { id: "integration-a", shopId: "shop-a" }
        : null,
    },
    waConversation: {
      findFirst: async ({ where }) => {
        calls.push({ type: "conversation", where });
        return where.id === "conversation-a" && where.shopId === "shop-a"
          ? { id: where.id, shopId: where.shopId }
          : null;
      },
    },
    waMessage: {
      findFirst: async ({ where }) => {
        calls.push({ type: "message", where });
        return where.id === "message-a" && where.conversation.shopId === "shop-a"
          ? { id: where.id, conversation: { id: "conversation-a", shopId: "shop-a" } }
          : null;
      },
    },
  };
  const service = createWhatsAppAuthorization({
    db,
    authorizeShop: async (_user, shopId) => {
      if (!authorized) throw new Error("forbidden");
      return { id: shopId };
    },
  });
  return { service, calls };
}

test("cross-shop integration access is hidden behind the same resource-not-found response", async () => {
  const { service } = authorizationFixture({ authorized: false });
  await assert.rejects(
    service.resolveWhatsAppIntegration({ id: "user-b" }, "integration-a"),
    (error) => error.statusCode === 404
      && error.details?.code === "WHATSAPP_RESOURCE_NOT_FOUND",
  );
});

test("conversation and message resolution always carries the integration shop boundary", async () => {
  const { service, calls } = authorizationFixture();
  await service.resolveWhatsAppConversation({ id: "user-a" }, "integration-a", "conversation-a");
  await service.resolveWhatsAppMessage({ id: "user-a" }, "integration-a", "message-a");
  assert.deepEqual(calls[0].where, { id: "conversation-a", shopId: "shop-a" });
  assert.equal(calls[1].where.conversation.shopId, "shop-a");
});

test("cross-integration conversation IDs are not resolved", async () => {
  const { service } = authorizationFixture();
  await assert.rejects(
    service.resolveWhatsAppConversation({ id: "user-a" }, "integration-a", "conversation-b"),
    (error) => error.statusCode === 404,
  );
});
