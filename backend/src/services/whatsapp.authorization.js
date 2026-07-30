import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { createWhatsAppChannelResolver } from "./whatsapp.channel-resolution.js";
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
  const channelResolver = createWhatsAppChannelResolver({ db, authorizeShop });

  const resolveIntegration = async (
    user,
    integrationId,
    activeShopId,
    { permission = "canView" } = {},
  ) => {
    if (!integrationId) throw notFound("WhatsApp integration");
    let requestedShopId = activeShopId;
    if (!requestedShopId) {
      const legacyIntegration = await db.waIntegration.findUnique({
        where: { id: integrationId },
        select: { shopId: true },
      });
      requestedShopId = legacyIntegration?.shopId;
    }
    return channelResolver.resolveWhatsAppChannelById(
      user,
      requestedShopId,
      integrationId,
      { permission },
    );
  };

  const resolveConversation = async (
    user,
    integrationId,
    conversationId,
    activeShopId,
    options,
  ) => {
    const scope = await resolveIntegration(user, integrationId, activeShopId, options);
    const conversation = await db.waConversation.findFirst({
      where: {
        id: conversationId,
        integrationId: scope.integration.id,
      },
    });
    if (!conversation) throw notFound("WhatsApp conversation");
    return { ...scope, conversation };
  };

  const resolveMessage = async (user, integrationId, messageId, activeShopId, options) => {
    const scope = await resolveIntegration(user, integrationId, activeShopId, options);
    const message = await db.waMessage.findFirst({
      where: {
        id: messageId,
        conversation: {
          integrationId: scope.integration.id,
        },
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

function activeShopId(req) {
  return req.get?.("X-Shop-Id")
    || req.query?.shopId
    || req.body?.shopId;
}

export function requireWhatsAppIntegration(req, _res, next) {
  resolveWhatsAppIntegration(req.user, req.params.integrationId, activeShopId(req))
    .then((scope) => {
      req.waScope = scope;
      req.shop = scope.shop;
      next();
    })
    .catch(next);
}

export function requireWhatsAppSendIntegration(req, _res, next) {
  resolveWhatsAppIntegration(
    req.user,
    req.params.integrationId,
    activeShopId(req),
    { permission: "canSend" },
  )
    .then((scope) => {
      req.waScope = scope;
      req.shop = scope.shop;
      next();
    })
    .catch(next);
}

export function requireWhatsAppConversation(req, _res, next) {
  resolveWhatsAppConversation(
    req.user,
    req.params.integrationId,
    req.params.conversationId,
    activeShopId(req),
  )
    .then((scope) => {
      req.waScope = scope;
      req.shop = scope.shop;
      next();
    })
    .catch(next);
}

export function requireWhatsAppSendConversation(req, _res, next) {
  resolveWhatsAppConversation(
    req.user,
    req.params.integrationId,
    req.params.conversationId,
    activeShopId(req),
    { permission: "canSend" },
  )
    .then((scope) => {
      req.waScope = scope;
      req.shop = scope.shop;
      next();
    })
    .catch(next);
}

export function requireWhatsAppMessage(req, _res, next) {
  resolveWhatsAppMessage(
    req.user,
    req.params.integrationId,
    req.params.messageId,
    activeShopId(req),
  )
    .then((scope) => {
      req.waScope = scope;
      req.shop = scope.shop;
      next();
    })
    .catch(next);
}

export function requireWhatsAppSendMessage(req, _res, next) {
  resolveWhatsAppMessage(
    req.user,
    req.params.integrationId,
    req.params.messageId,
    activeShopId(req),
    { permission: "canSend" },
  )
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
