import prisma from "../lib/db.js";
import { publishWhatsAppEvent } from "../utils/realtime.js";
import { normalizeManagementWebhook } from "./whatsapp.management-parser.js";

const TEMPLATE_STATUSES = new Set([
  "APPROVED",
  "REJECTED",
  "PENDING",
  "PAUSED",
  "DISABLED",
  "IN_APPEAL",
]);

function normalizeTemplateStatus(status) {
  if (TEMPLATE_STATUSES.has(status)) return status;
  if (status === "FLAGGED") return "PAUSED";
  return null;
}

function stringifyReason(reason) {
  if (!reason) return null;
  return typeof reason === "string" ? reason : JSON.stringify(reason);
}

function templateWhere(shopId, event) {
  const candidates = [];
  if (event.templateId) candidates.push({ metaTemplateId: String(event.templateId) });
  if (event.name && event.language) {
    candidates.push({ name: String(event.name), language: String(event.language) });
  } else if (event.name) {
    candidates.push({ name: String(event.name) });
  }
  return candidates.length > 0 ? { shopId, OR: candidates } : null;
}

async function updateTemplateStatus(shopId, event) {
  const where = templateWhere(shopId, event);
  const status = normalizeTemplateStatus(event.status);
  if (!where || !status) return { updatedTemplates: 0 };

  const result = await prisma.waTemplate.updateMany({
    where,
    data: {
      status,
      metaRejectionReason: stringifyReason(event.reason),
      statusUpdatedAt: new Date(),
      syncedAt: new Date(),
    },
  });

  return { updatedTemplates: result.count, templateStatus: status };
}

async function updateTemplateQuality(shopId, event) {
  const where = templateWhere(shopId, event);
  if (!where) return { updatedTemplates: 0 };

  const result = await prisma.waTemplate.updateMany({
    where,
    data: {
      qualityScore: event.qualityScore,
      qualityUpdatedAt: new Date(),
      syncedAt: new Date(),
    },
  });

  return { updatedTemplates: result.count, templateQuality: event.qualityScore };
}

async function updateIntegrationHealth(shopId, event) {
  const data = {
    lastManagementEventAt: new Date(),
    lastManagementEventField: event.field,
  };

  if (event.kind === "phone_quality") {
    data.qualityRating = event.qualityRating;
    if (event.messagingLimitTier) data.messagingLimitTier = event.messagingLimitTier;
  }
  if (event.kind === "phone_name") {
    data.displayNameStatus = event.displayNameStatus;
    if (event.businessName) data.businessName = String(event.businessName);
  }
  if (event.kind === "business_capability") {
    data.capabilities = event.capabilities;
    if (event.messagingLimitTier) data.messagingLimitTier = event.messagingLimitTier;
  }
  if (event.kind === "account_review") {
    data.accountReviewStatus = event.accountReviewStatus;
  }
  if (event.kind === "account") {
    data.accountStatus = event.accountStatus;
  }

  await prisma.waIntegration.updateMany({
    where: { shopId },
    data,
  });

  return data;
}

export async function processManagementWebhook(envelope) {
  const event = normalizeManagementWebhook(envelope.payloadJson);
  if (!event) return null;

  let summary = {};
  if (event.kind === "template_status") {
    summary = await updateTemplateStatus(envelope.shopId, event);
  } else if (event.kind === "template_quality") {
    summary = await updateTemplateQuality(envelope.shopId, event);
  } else {
    summary = await updateIntegrationHealth(envelope.shopId, event);
  }

  await publishWhatsAppEvent(envelope.shopId, "wa:integration_health_updated", {
    field: envelope.field,
    kind: event.kind,
    ...summary,
    occurredAt: new Date().toISOString(),
  });

  return { event, summary };
}
