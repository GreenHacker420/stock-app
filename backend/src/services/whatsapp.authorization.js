import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { ApiError } from "../utils/ApiError.js";

function notFound(resource) {
  return new ApiError(404, `${resource} not found`, {
    code: "WHATSAPP_RESOURCE_NOT_FOUND",
  });
}

export function createWhatsAppAuthorization({
  db = prisma,
  authorizeShop = assertShopAccess,
} = {}) {
  const resolveIntegration = async (user, integrationId) => {
    if (!integrationId) throw notFound("WhatsApp integration");
    const integration = await db.waIntegration.findUnique({
      where: { id: integrationId },
    });
    if (!integration) throw notFound("WhatsApp integration");
    let shop;
    try {
      shop = await authorizeShop(user, integration.shopId);
    } catch {
      throw notFound("WhatsApp integration");
    }
    return { integration, shop };
  };

  const resolveConversation = async (user, integrationId, conversationId) => {
    const scope = await resolveIntegration(user, integrationId);
    const conversation = await db.waConversation.findFirst({
      where: { id: conversationId, shopId: scope.integration.shopId },
    });
    if (!conversation) throw notFound("WhatsApp conversation");
    return { ...scope, conversation };
  };

  const resolveMessage = async (user, integrationId, messageId) => {
    const scope = await resolveIntegration(user, integrationId);
    const message = await db.waMessage.findFirst({
      where: {
        id: messageId,
        conversation: { shopId: scope.integration.shopId },
      },
      include: { conversation: true },
    });
    if (!message) throw notFound("WhatsApp message");
    return { ...scope, conversation: message.conversation, message };
  };

  return {
    resolveWhatsAppIntegration: resolveIntegration,
    resolveWhatsAppConversation: resolveConversation,
    resolveWhatsAppMessage: resolveMessage,
  };
}

const authorization = createWhatsAppAuthorization();
export const resolveWhatsAppIntegration = authorization.resolveWhatsAppIntegration;
export const resolveWhatsAppConversation = authorization.resolveWhatsAppConversation;
export const resolveWhatsAppMessage = authorization.resolveWhatsAppMessage;

export function requireWhatsAppIntegration(req, _res, next) {
  resolveWhatsAppIntegration(req.user, req.params.integrationId)
    .then((scope) => {
      req.waScope = scope;
      req.shop = scope.shop;
      next();
    })
    .catch(next);
}

export function requireWhatsAppConversation(req, _res, next) {
  resolveWhatsAppConversation(req.user, req.params.integrationId, req.params.conversationId)
    .then((scope) => {
      req.waScope = scope;
      req.shop = scope.shop;
      next();
    })
    .catch(next);
}

export function requireWhatsAppMessage(req, _res, next) {
  resolveWhatsAppMessage(req.user, req.params.integrationId, req.params.messageId)
    .then((scope) => {
      req.waScope = scope;
      req.shop = scope.shop;
      next();
    })
    .catch(next);
}

export function requireWhatsAppBroadcast(req, _res, next) {
  prisma.waBroadcast.findUnique({ where: { id: req.params.id } })
    .then(async (broadcast) => {
      if (!broadcast) throw notFound("WhatsApp broadcast");
      let shop;
      try {
        shop = await assertShopAccess(req.user, broadcast.shopId);
      } catch {
        throw notFound("WhatsApp broadcast");
      }
      req.shop = shop;
      req.waScope = { shop, broadcast };
      next();
    })
    .catch(next);
}
