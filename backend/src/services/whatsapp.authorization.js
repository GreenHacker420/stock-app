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

export function requireLegacyWhatsAppConversation(req, _res, next) {
  const conversationId = req.params.id || req.params.conversationId;
  prisma.waConversation.findUnique({ where: { id: conversationId } })
    .then(async (conversation) => {
      if (!conversation) throw notFound("WhatsApp conversation");
      let shop;
      try {
        shop = await assertShopAccess(req.user, conversation.shopId);
      } catch {
        throw notFound("WhatsApp conversation");
      }
      req.shop = shop;
      req.waScope = { shop, conversation };
      next();
    })
    .catch(next);
}

export function requireLegacyWhatsAppMessage(req, _res, next) {
  const messageId = req.params.id || req.body?.messageId;
  prisma.waMessage.findUnique({
    where: { id: messageId },
    include: { conversation: true },
  })
    .then(async (message) => {
      if (!message) throw notFound("WhatsApp message");
      let shop;
      try {
        shop = await assertShopAccess(req.user, message.conversation.shopId);
      } catch {
        throw notFound("WhatsApp message");
      }
      req.shop = shop;
      req.waScope = { shop, conversation: message.conversation, message };
      next();
    })
    .catch(next);
}
