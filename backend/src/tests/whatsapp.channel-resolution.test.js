import assert from "node:assert/strict";
import test from "node:test";
import { createWhatsAppChannelResolver } from "../services/whatsapp.channel-resolution.js";

const connected = (id, shopId) => ({
  id,
  shopId,
  status: "CONNECTED",
  isArchived: false,
});

function fixture({
  direct = null,
  assigned = null,
  groupDefault = null,
  tenantDefault = null,
  groupAccess = null,
  tenantAccess = null,
} = {}) {
  const shop = {
    id: "branch-b",
    tenantId: "tenant-a",
    shopGroupId: "group-a",
  };
  const db = {
    shop: {
      findUnique: async () => shop,
    },
    waIntegration: {
      findFirst: async () => direct,
    },
    waIntegrationShopAccess: {
      findFirst: async () => assigned,
      findUnique: async ({ where }) => {
        const integrationId = where.integrationId_shopId.integrationId;
        if (integrationId === groupDefault?.id) return groupAccess;
        if (integrationId === tenantDefault?.id) return tenantAccess;
        return null;
      },
    },
    shopGroup: {
      findUnique: async () => ({
        id: "group-a",
        defaultWaIntegration: groupDefault,
      }),
    },
    tenant: {
      findUnique: async () => ({
        id: "tenant-a",
        defaultWaIntegration: tenantDefault,
      }),
    },
  };
  const resolver = createWhatsAppChannelResolver({
    db,
    authorizeShop: async () => shop,
  });
  return resolver;
}

test("branch-owned channel overrides group and tenant defaults", async () => {
  const resolver = fixture({
    direct: connected("branch-channel", "branch-b"),
    groupDefault: connected("group-channel", "branch-a"),
    tenantDefault: connected("tenant-channel", "branch-a"),
  });
  const scope = await resolver.resolveEffectiveWhatsAppChannel(
    { id: "user-a" },
    "branch-b",
  );
  assert.equal(scope.integration.id, "branch-channel");
  assert.equal(scope.resolution, "BRANCH_OWNED");
});

test("explicit primary branch assignment overrides group default", async () => {
  const integration = connected("assigned-channel", "branch-a");
  const resolver = fixture({
    assigned: {
      integration,
      canView: true,
      canSend: true,
      canManage: false,
    },
    groupDefault: connected("group-channel", "branch-a"),
  });
  const scope = await resolver.resolveEffectiveWhatsAppChannel(
    { id: "user-a" },
    "branch-b",
  );
  assert.equal(scope.integration.id, "assigned-channel");
  assert.equal(scope.resolution, "BRANCH_ASSIGNED");
});

test("group default is used for a branch with an explicit view grant", async () => {
  const groupDefault = connected("group-channel", "branch-a");
  const resolver = fixture({
    groupDefault,
    tenantDefault: connected("tenant-channel", "branch-a"),
    groupAccess: { canView: true, canSend: true, canManage: false },
  });
  const scope = await resolver.resolveEffectiveWhatsAppChannel(
    { id: "user-a" },
    "branch-b",
  );
  assert.equal(scope.integration.id, "group-channel");
  assert.equal(scope.resolution, "SHOP_GROUP_DEFAULT");
});

test("tenant fallback requires a grant and respects requested permission", async () => {
  const tenantDefault = connected("tenant-channel", "branch-a");
  const resolver = fixture({
    tenantDefault,
    tenantAccess: { canView: true, canSend: false, canManage: false },
  });
  const viewScope = await resolver.resolveEffectiveWhatsAppChannel(
    { id: "user-a" },
    "branch-b",
  );
  assert.equal(viewScope.integration.id, "tenant-channel");

  const sendScope = await resolver.resolveEffectiveWhatsAppChannel(
    { id: "user-a" },
    "branch-b",
    { permission: "canSend" },
  );
  assert.equal(sendScope.integration, null);
});

test("a channel ID from another effective scope is hidden", async () => {
  const resolver = fixture({
    direct: connected("branch-channel", "branch-b"),
  });
  await assert.rejects(
    resolver.resolveWhatsAppChannelById(
      { id: "user-a" },
      "branch-b",
      "other-channel",
    ),
    (error) => error.statusCode === 404
      && error.details?.code === "WHATSAPP_RESOURCE_NOT_FOUND",
  );
});
