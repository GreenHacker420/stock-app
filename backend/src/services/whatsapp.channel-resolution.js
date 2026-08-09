import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";

const CONNECTED_CHANNEL = {
  status: "CONNECTED",
  isArchived: false,
};

function resourceNotFound() {
  return new ApiError(404, "WhatsApp integration not found", {
    code: "WHATSAPP_RESOURCE_NOT_FOUND",
  });
}

function accessForScope(scope, permission) {
  if (scope === "BRANCH_OWNED") return true;
  if (!permission) return true;
  return Boolean(scope?.[permission]);
}

export function createWhatsAppChannelResolver({
  db = prisma,
  authorizeShop = assertShopAccess,
} = {}) {
  async function getActiveShop(user, shopId) {
    try {
      return await authorizeShop(user, shopId);
    } catch (error) {
      if (error?.statusCode === 400) throw error;
      throw resourceNotFound();
    }
  }

  async function resolveEffectiveChannel(user, shopId, { permission = "canView" } = {}) {
    const shop = await getActiveShop(user, shopId);
    const fullShop = shop.tenantId !== undefined && shop.shopGroupId !== undefined
      ? shop
      : await db.shop.findUnique({
          where: { id: shop.id },
          select: {
            id: true,
            tenantId: true,
            shopGroupId: true,
          },
        });

    const direct = await db.waIntegration.findFirst({
      where: {
        shopId: shop.id,
        ...CONNECTED_CHANNEL,
      },
    });
    if (direct) {
      return {
        integration: direct,
        shop,
        resolution: "BRANCH_OWNED",
        access: { canView: true, canSend: true, canManage: true },
      };
    }

    const assigned = await db.waIntegrationShopAccess.findFirst({
      where: {
        shopId: shop.id,
        isPrimary: true,
        [permission]: true,
        integration: CONNECTED_CHANNEL,
      },
      include: { integration: true },
      orderBy: { updatedAt: "desc" },
    });
    if (assigned) {
      return {
        integration: assigned.integration,
        shop,
        resolution: "BRANCH_ASSIGNED",
        access: assigned,
      };
    }

    if (fullShop?.shopGroupId) {
      const group = await db.shopGroup.findUnique({
        where: { id: fullShop.shopGroupId },
        include: { defaultWaIntegration: true },
      });
      if (
        group?.defaultWaIntegration
        && group.defaultWaIntegration.status === "CONNECTED"
        && !group.defaultWaIntegration.isArchived
      ) {
        const access = await db.waIntegrationShopAccess.findUnique({
          where: {
            integrationId_shopId: {
              integrationId: group.defaultWaIntegration.id,
              shopId: shop.id,
            },
          },
        });
        if (accessForScope(access, permission)) {
          return {
            integration: group.defaultWaIntegration,
            shop,
            resolution: "SHOP_GROUP_DEFAULT",
            access,
          };
        }
      }
    }

    if (fullShop?.tenantId) {
      const tenant = await db.tenant.findUnique({
        where: { id: fullShop.tenantId },
        include: { defaultWaIntegration: true },
      });
      if (
        tenant?.defaultWaIntegration
        && tenant.defaultWaIntegration.status === "CONNECTED"
        && !tenant.defaultWaIntegration.isArchived
      ) {
        const access = await db.waIntegrationShopAccess.findUnique({
          where: {
            integrationId_shopId: {
              integrationId: tenant.defaultWaIntegration.id,
              shopId: shop.id,
            },
          },
        });
        if (accessForScope(access, permission)) {
          return {
            integration: tenant.defaultWaIntegration,
            shop,
            resolution: "TENANT_DEFAULT",
            access,
          };
        }
      }
    }

    return {
      integration: null,
      shop,
      resolution: "NONE",
      access: null,
    };
  }

  async function resolveChannelById(
    user,
    shopId,
    integrationId,
    { permission = "canView", requireEffective = true } = {},
  ) {
    if (!integrationId) throw resourceNotFound();
    const effective = await resolveEffectiveChannel(user, shopId, { permission });
    if (!effective.integration) throw resourceNotFound();
    if (requireEffective && effective.integration.id !== integrationId) {
      throw resourceNotFound();
    }
    return effective;
  }

  return {
    resolveEffectiveWhatsAppChannel: resolveEffectiveChannel,
    resolveWhatsAppChannelById: resolveChannelById,
  };
}

const resolver = createWhatsAppChannelResolver();

export const resolveEffectiveWhatsAppChannel =
  resolver.resolveEffectiveWhatsAppChannel;
export const resolveWhatsAppChannelById =
  resolver.resolveWhatsAppChannelById;

const authorizedShopResolver = createWhatsAppChannelResolver({
  authorizeShop: async (_user, shopId) => {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        tenantId: true,
        shopGroupId: true,
      },
    });
    if (!shop) throw resourceNotFound();
    return shop;
  },
});

/**
 * Internal resolver for service code whose caller has already authorized the shop.
 * Keeps channel precedence identical to the request-level capability resolver.
 */
export function resolveEffectiveWhatsAppChannelForShop(shopId, options) {
  return authorizedShopResolver.resolveEffectiveWhatsAppChannel(null, shopId, options);
}
