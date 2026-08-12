import crypto from "crypto";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { resolveEffectiveWhatsAppChannelForShop } from "./whatsapp.channel-resolution.js";
import { connection as redis } from "./whatsapp.queue.js";
import { normalizePhone } from "./whatsapp.phone.js";
import { whatsappService } from "./whatsapp.service.js";

export const MAX_BROADCAST_RECIPIENT_BATCH = 500;
const SCHEDULE_JOB_PREFIX = "wa-broadcast-scheduled";

function normalizeRecipientPhone(phone) {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

function bindingKey(binding) {
  return `${binding.component}:${binding.cardIndex ?? ""}:${binding.buttonIndex ?? ""}:${binding.position}`;
}

function templateButtonType(template, buttonIndex = 0) {
  const draftButton = template.draftDefinition?.buttons?.[buttonIndex];
  if (draftButton?.type) return String(draftButton.type).toUpperCase();
  const buttons = Array.isArray(template.components)
    ? template.components.find((component) => String(component?.type || "").toUpperCase() === "BUTTONS")?.buttons || []
    : [];
  return String(buttons[buttonIndex]?.type || "").toUpperCase();
}

function templateHeaderFormat(template) {
  if (template.draftDefinition?.header?.format) {
    return String(template.draftDefinition.header.format).toUpperCase();
  }
  const components = Array.isArray(template.components) ? template.components : [];
  return String(
    components.find((component) => String(component?.type || "").toUpperCase() === "HEADER")?.format || "NONE",
  ).toUpperCase();
}

function recipientValue(value, recipient) {
  if (value == null) return "";
  const name = recipient.name || recipient.phone;
  return String(value)
    .replaceAll("{{recipient.name}}", name)
    .replaceAll("{{recipient.phone}}", recipient.phone);
}

function getPath(source, path) {
  if (!source || !path) return undefined;
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function formatAttributeValue(value, type) {
  if (value == null || value === "") return "";
  if (type === "CURRENCY") {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString("en-IN", { style: "currency", currency: "INR" })
      : String(value);
  }
  if (type === "DATE") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN");
  }
  if (type === "DATETIME") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-IN");
  }
  if (type === "BOOLEAN") return value ? "Yes" : "No";
  return String(value);
}

async function resolveBroadcastIntegration(shopId, integrationId) {
  const scope = await resolveEffectiveWhatsAppChannelForShop(shopId, {
    permission: "canSend",
  });
  const integration = scope.integration;
  if (!integration || (integrationId && integration.id !== integrationId)) {
    return null;
  }
  return { id: integration.id, shopId: integration.shopId };
}

async function loadApprovedTemplate(integration, templateId) {
  return prisma.waTemplate.findFirst({
    where: {
      id: templateId,
      shopId: integration.shopId,
      status: "APPROVED",
      OR: [
        { integrationId: null },
        { integrationId: integration.id },
      ],
    },
    include: { variableMappings: true },
  });
}

async function validateTemplateVariables(shopId, template, templateVariables) {
  const bindings = Array.isArray(templateVariables?.bindings) ? templateVariables.bindings : [];
  if (!bindings.length) return;
  if (bindings.length > 100) throw new ApiError(400, "Too many broadcast template bindings");

  const expectedMappings = template.variableMappings || [];
  const expected = new Set(expectedMappings.map(bindingKey));
  const seen = new Set();
  const attributeIds = [];

  for (const binding of bindings) {
    if (!binding || !["HEADER", "BODY", "BUTTON", "CARD"].includes(binding.component)) {
      throw new ApiError(400, "Invalid broadcast template binding component");
    }
    if (!Number.isInteger(binding.position) || binding.position < 1) {
      throw new ApiError(400, "Invalid broadcast template binding position");
    }
    const key = bindingKey(binding);
    if (seen.has(key)) throw new ApiError(400, `Duplicate runtime binding for ${binding.component} {{${binding.position}}}`);
    seen.add(key);
    if (!expected.has(key)) {
      throw new ApiError(400, `Runtime binding does not match template variable ${binding.component} {{${binding.position}}}`);
    }
    if (binding.component === "CARD") {
      throw new ApiError(400, "Carousel runtime bindings are not enabled for broadcasts yet");
    }
    if (binding.component === "BUTTON" && templateButtonType(template, binding.buttonIndex) !== "URL") {
      throw new ApiError(400, "Only dynamic URL button values are enabled for broadcasts");
    }
    if (binding.mode === "FIXED") {
      if (typeof binding.value !== "string" || !binding.value.trim()) {
        throw new ApiError(400, `Fixed value required for ${binding.component} {{${binding.position}}}`);
      }
    } else if (binding.mode === "ATTRIBUTE") {
      if (typeof binding.attributeId !== "string" || !binding.attributeId) {
        throw new ApiError(400, `Attribute required for ${binding.component} {{${binding.position}}}`);
      }
      attributeIds.push(binding.attributeId);
    } else {
      throw new ApiError(400, "Broadcast template binding mode must be ATTRIBUTE or FIXED");
    }
  }

  if (seen.size !== expected.size) {
    throw new ApiError(400, "Every template variable must be configured for this broadcast");
  }

  if (attributeIds.length) {
    const uniqueAttributeIds = [...new Set(attributeIds)];
    const attributes = await prisma.waTemplateAttribute.findMany({
      where: {
        id: { in: uniqueAttributeIds },
        shopId,
        isActive: true,
        source: { in: ["CUSTOMER", "CONVERSATION", "SHOP"] },
      },
      select: { id: true },
    });
    if (attributes.length !== uniqueAttributeIds.length) {
      throw new ApiError(400, "One or more runtime template fields are unavailable for this shop");
    }
  }
}

async function buildTestTemplateMessage({
  shopId,
  integration,
  template,
  templateVariables,
  recipient,
}) {
  const bindings = Array.isArray(templateVariables?.bindings) ? templateVariables.bindings : [];
  const bindingsByKey = new Map(bindings.map((binding) => [bindingKey(binding), binding]));
  const attributeIds = [...new Set(
    bindings
      .filter((binding) => binding?.mode === "ATTRIBUTE" && typeof binding.attributeId === "string")
      .map((binding) => binding.attributeId),
  )];

  const [attributes, shop, customer, conversation] = await Promise.all([
    attributeIds.length
      ? prisma.waTemplateAttribute.findMany({
          where: { id: { in: attributeIds }, shopId, isActive: true },
        })
      : Promise.resolve([]),
    prisma.shop.findUnique({ where: { id: shopId } }),
    whatsappService.findCustomerByPhone(shopId, recipient.phone),
    prisma.waConversation.findFirst({
      where: {
        integrationId: integration.id,
        phone: { in: [recipient.phone, recipient.phone.replace(/\D/g, "")] },
      },
    }),
  ]);

  const attributesById = new Map(attributes.map((attribute) => [attribute.id, attribute]));
  const contexts = {
    CUSTOMER: {
      ...(customer || {}),
      name: customer?.name || recipient.name || recipient.phone,
      phone: customer?.phone || recipient.phone,
    },
    CONVERSATION: {
      ...(conversation || {}),
      contactName: conversation?.contactName || recipient.name || recipient.phone,
      phone: conversation?.phone || recipient.phone,
    },
    SHOP: shop,
  };

  const resolved = (template.variableMappings || []).map((mapping) => {
    const binding = bindingsByKey.get(bindingKey(mapping));
    let value = "";
    if (binding?.mode === "FIXED") {
      value = recipientValue(binding.value || binding.fallbackValue || "", recipient).trim();
    } else if (binding?.mode === "ATTRIBUTE") {
      const attribute = attributesById.get(binding.attributeId);
      const source = attribute ? contexts[attribute.source] : null;
      const liveValue = attribute
        ? formatAttributeValue(getPath(source, attribute.sourcePath), attribute.type)
        : "";
      value = recipientValue(
        liveValue || binding.fallbackValue || attribute?.fallbackValue || "",
        recipient,
      ).trim();
    }
    if (!value) {
      throw new ApiError(400, `No test value could be resolved for ${mapping.component} {{${mapping.position}}}`);
    }
    return { mapping, value };
  });

  const components = [];
  const format = templateHeaderFormat(template);
  const assetId = templateVariables?.headerAssetId;
  if (assetId && ["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) {
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, shopId, status: "READY", kind: format },
      select: { externalProvider: true, externalId: true, fileName: true },
    });
    if (!asset?.externalId || asset.externalProvider !== "META_WHATSAPP") {
      throw new ApiError(400, "Campaign header media is not available in WhatsApp");
    }
    const type = format.toLowerCase();
    components.push({
      type: "header",
      parameters: [{
        type,
        [type]: {
          id: asset.externalId,
          ...(format === "DOCUMENT"
            ? { filename: templateVariables.headerFileName || asset.fileName || "document" }
            : {}),
        },
      }],
    });
  } else {
    const headerValues = resolved
      .filter(({ mapping }) => mapping.component === "HEADER")
      .sort((left, right) => left.mapping.position - right.mapping.position);
    if (headerValues.length) {
      components.push({
        type: "header",
        parameters: headerValues.map(({ value }) => ({ type: "text", text: value })),
      });
    }
  }

  const bodyValues = resolved
    .filter(({ mapping }) => mapping.component === "BODY")
    .sort((left, right) => left.mapping.position - right.mapping.position);
  if (bodyValues.length) {
    components.push({
      type: "body",
      parameters: bodyValues.map(({ value }) => ({ type: "text", text: value })),
    });
  }

  const buttonGroups = new Map();
  for (const item of resolved.filter(({ mapping }) => mapping.component === "BUTTON")) {
    const index = item.mapping.buttonIndex ?? 0;
    if (!buttonGroups.has(index)) buttonGroups.set(index, []);
    buttonGroups.get(index).push(item);
  }
  for (const [index, values] of buttonGroups.entries()) {
    if (templateButtonType(template, index) !== "URL") {
      throw new ApiError(400, "Only dynamic URL button values are enabled for campaign test sends");
    }
    values.sort((left, right) => left.mapping.position - right.mapping.position);
    components.push({
      type: "button",
      sub_type: "url",
      index: String(index),
      parameters: values.map(({ value }) => ({ type: "text", text: value })),
    });
  }

  return {
    kind: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(components.length ? { components } : {}),
    },
  };
}

function countsFromGroups(groups) {
  const byStatus = Object.fromEntries(groups.map((entry) => [entry.status, entry._count.id]));
  return {
    sentCount: (byStatus.SENT || 0) + (byStatus.DELIVERED || 0) + (byStatus.READ || 0),
    deliveredCount: (byStatus.DELIVERED || 0) + (byStatus.READ || 0),
    readCount: byStatus.READ || 0,
    failedCount: byStatus.FAILED || 0,
    skippedCount: byStatus.SKIPPED || 0,
    pendingCount: byStatus.PENDING || 0,
  };
}

async function removeScheduledJob(broadcastId) {
  try {
    const { broadcastQueue } = await import("./whatsapp.queue.js");
    const job = await broadcastQueue.getJob(`${SCHEDULE_JOB_PREFIX}-${broadcastId}`);
    if (job) await job.remove();
  } catch (error) {
    console.warn(`[Broadcast Service] Could not remove scheduled job for ${broadcastId}:`, error.message);
  }
}

export function normalizeExplicitRecipients(recipients = []) {
  const normalized = [];
  const seen = new Set();
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const recipient of recipients) {
    const phone = normalizeRecipientPhone(recipient?.phone);
    if (!phone) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(phone)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(phone);
    normalized.push({
      phone,
      name: typeof recipient?.name === "string" && recipient.name.trim()
        ? recipient.name.trim().slice(0, 200)
        : null,
      customerId: typeof recipient?.customerId === "string" && recipient.customerId
        ? recipient.customerId
        : null,
      sourceContactId: typeof recipient?.sourceContactId === "string" && recipient.sourceContactId
        ? recipient.sourceContactId.slice(0, 250)
        : null,
      source: recipient?.source === "MANUAL"
        ? "MANUAL"
        : recipient?.customerId
          ? "CUSTOMER"
          : "DEVICE_CONTACT",
    });
  }

  return { recipients: normalized, invalidCount, duplicateCount };
}

/**
 * Resolves legacy server-side CRM audiences. Device-contact broadcasts are
 * uploaded as an explicit recipient snapshot and do not use this query.
 */
export async function resolveAudience(shopId, filter) {
  if (filter?.mode === "EXPLICIT") return [];

  const whereClause = {
    shopId,
    phone: { not: null },
    type: { not: "WALK_IN" },
  };

  if (filter?.type) whereClause.type = filter.type;
  if (filter?.outstanding?.gt !== undefined) {
    whereClause.outstandingAmount = { gt: Number(filter.outstanding.gt) };
  }

  const customers = await prisma.customer.findMany({
    where: whereClause,
    select: { id: true, name: true, phone: true },
  });

  const seen = new Set();
  return customers.flatMap((customer) => {
    const phone = normalizeRecipientPhone(customer.phone);
    if (!phone || seen.has(phone)) return [];
    seen.add(phone);
    return [{
      customerId: customer.id,
      name: customer.name,
      phone,
      source: "CUSTOMER",
      sourceContactId: null,
    }];
  });
}

class WhatsAppBroadcastService {
  async createBroadcast(shopId, {
    name,
    templateId,
    templateVariables,
    audienceFilter,
    integrationId,
    createdById,
  }) {
    const integration = await resolveBroadcastIntegration(shopId, integrationId);
    if (!integration) {
      throw new ApiError(400, "No connected WhatsApp integration is available for this shop");
    }

    const template = await loadApprovedTemplate(integration, templateId);
    if (!template) {
      throw new ApiError(404, "Approved template not found for this shop and WhatsApp integration");
    }

    await validateTemplateVariables(shopId, template, templateVariables);

    const filter = audienceFilter || { mode: "EXPLICIT" };
    const audience = filter.mode === "EXPLICIT"
      ? []
      : await resolveAudience(shopId, filter);

    return prisma.waBroadcast.create({
      data: {
        shopId,
        integrationId: integration.id,
        name: String(name).trim().slice(0, 160),
        templateId,
        templateVariables: templateVariables || {},
        audienceFilter: filter,
        audienceCount: audience.length,
        status: "DRAFT",
        createdById,
      },
      include: { template: true },
    });
  }

  /**
   * Stores only the selected audience snapshot. createMany keeps the request
   * bounded to a small, constant number of database operations.
   */
  async addRecipients(broadcastId, shopId, inputRecipients) {
    if (!Array.isArray(inputRecipients) || inputRecipients.length === 0) {
      throw new ApiError(400, "recipients must be a non-empty array");
    }
    if (inputRecipients.length > MAX_BROADCAST_RECIPIENT_BATCH) {
      throw new ApiError(400, `A maximum of ${MAX_BROADCAST_RECIPIENT_BATCH} recipients can be uploaded per request`);
    }

    const broadcast = await prisma.waBroadcast.findFirst({
      where: { id: broadcastId, shopId },
      select: { id: true, status: true },
    });
    if (!broadcast) throw new ApiError(404, "Broadcast not found");
    if (broadcast.status !== "DRAFT") {
      throw new ApiError(409, "Recipients can only be changed while a broadcast is in draft");
    }

    const normalized = normalizeExplicitRecipients(inputRecipients);
    if (normalized.recipients.length === 0) {
      return {
        acceptedCount: 0,
        invalidCount: normalized.invalidCount,
        duplicateCount: normalized.duplicateCount,
        totalCount: await prisma.waBroadcastRecipient.count({ where: { broadcastId } }),
      };
    }

    const requestedCustomerIds = [...new Set(
      normalized.recipients.map((recipient) => recipient.customerId).filter(Boolean),
    )];
    const customerPhones = requestedCustomerIds.length
      ? new Map((await prisma.customer.findMany({
          where: { id: { in: requestedCustomerIds }, shopId, status: "ACTIVE" },
          select: { id: true, phone: true },
        })).map((customer) => [customer.id, normalizeRecipientPhone(customer.phone)]))
      : new Map();

    const rows = normalized.recipients.map((recipient) => {
      const customerId = recipient.customerId
        && customerPhones.get(recipient.customerId) === recipient.phone
        ? recipient.customerId
        : null;
      const source = customerId
        ? "CUSTOMER"
        : recipient.source === "CUSTOMER"
          ? "DEVICE_CONTACT"
          : recipient.source;
      return {
        broadcastId,
        customerId,
        customerName: recipient.name,
        customerPhone: recipient.phone,
        source,
        sourceContactId: recipient.sourceContactId,
        status: "PENDING",
      };
    });

    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.waBroadcastRecipient.createMany({
        data: rows,
        skipDuplicates: true,
      });
      const totalCount = await tx.waBroadcastRecipient.count({ where: { broadcastId } });
      const updated = await tx.waBroadcast.updateMany({
        where: { id: broadcastId, shopId, status: "DRAFT" },
        data: {
          audienceFilter: { mode: "EXPLICIT" },
          audienceCount: totalCount,
        },
      });
      if (updated.count === 0) {
        throw new ApiError(409, "Broadcast audience can no longer be changed");
      }
      return { createdCount: created.count, totalCount };
    });

    return {
      acceptedCount: result.createdCount,
      invalidCount: normalized.invalidCount,
      duplicateCount: normalized.duplicateCount + rows.length - result.createdCount,
      totalCount: result.totalCount,
    };
  }

  async sendTest(shopId, {
    integrationId,
    templateId,
    templateVariables,
    phone,
    name,
    actorUserId,
  }) {
    const integration = await resolveBroadcastIntegration(shopId, integrationId);
    if (!integration) throw new ApiError(400, "WhatsApp sending is not enabled for this shop");

    const template = await loadApprovedTemplate(integration, templateId);
    if (!template) throw new ApiError(404, "Approved template not found");
    await validateTemplateVariables(shopId, template, templateVariables);

    const normalizedPhone = normalizeRecipientPhone(phone);
    if (!normalizedPhone) throw new ApiError(400, "Enter a valid WhatsApp test number");
    const recipient = { phone: normalizedPhone, name: String(name || "").trim() || normalizedPhone };
    const message = await buildTestTemplateMessage({
      shopId,
      integration,
      template,
      templateVariables,
      recipient,
    });

    return whatsappService.sendMessage({
      shopId: integration.shopId,
      contextShopId: shopId,
      integrationId: integration.id,
      to: normalizedPhone,
      message,
      actorUserId,
    });
  }

  async scheduleBroadcast(broadcastId, scheduledAt) {
    const parsedDate = new Date(scheduledAt);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now() + 5_000) {
      throw new ApiError(400, "Schedule time must be at least a few seconds in the future");
    }

    const broadcast = await prisma.waBroadcast.findUnique({
      where: { id: broadcastId },
      select: { id: true, status: true, audienceFilter: true, audienceCount: true },
    });
    if (!broadcast) throw new ApiError(404, "Broadcast not found");
    if (broadcast.status !== "DRAFT") throw new ApiError(409, "Only draft broadcasts can be scheduled");

    const audienceCount = broadcast.audienceFilter?.mode === "EXPLICIT"
      ? await prisma.waBroadcastRecipient.count({ where: { broadcastId, status: "PENDING" } })
      : broadcast.audienceCount;
    if (!audienceCount) throw new ApiError(400, "Select at least one valid recipient before scheduling the broadcast");

    const transition = await prisma.waBroadcast.updateMany({
      where: { id: broadcastId, status: "DRAFT" },
      data: { status: "SCHEDULED", scheduledAt: parsedDate, audienceCount },
    });
    if (!transition.count) throw new ApiError(409, "Broadcast can no longer be scheduled");

    try {
      const { broadcastQueue } = await import("./whatsapp.queue.js");
      await broadcastQueue.add(
        "scheduled-dispatch",
        { broadcastId, runId: crypto.randomUUID() },
        {
          jobId: `${SCHEDULE_JOB_PREFIX}-${broadcastId}`,
          delay: Math.max(0, parsedDate.getTime() - Date.now()),
        },
      );
    } catch (error) {
      await prisma.waBroadcast.updateMany({
        where: { id: broadcastId, status: "SCHEDULED", scheduledAt: parsedDate },
        data: { status: "DRAFT", scheduledAt: null },
      }).catch(() => undefined);
      throw error;
    }

    return prisma.waBroadcast.findUnique({ where: { id: broadcastId }, include: { template: true } });
  }

  async dispatchBroadcast(broadcastId) {
    const broadcast = await prisma.waBroadcast.findUnique({
      where: { id: broadcastId },
      select: {
        id: true,
        status: true,
        audienceFilter: true,
        audienceCount: true,
      },
    });

    if (!broadcast) throw new ApiError(404, "Broadcast not found");
    if (!["DRAFT", "SCHEDULED"].includes(broadcast.status)) {
      throw new ApiError(409, `Cannot dispatch broadcast in status: ${broadcast.status}`);
    }

    let audienceCount = broadcast.audienceCount;
    if (broadcast.audienceFilter?.mode === "EXPLICIT") {
      audienceCount = await prisma.waBroadcastRecipient.count({
        where: { broadcastId, status: "PENDING" },
      });
      if (audienceCount === 0) {
        throw new ApiError(400, "Select at least one valid recipient before sending the broadcast");
      }
    }

    const startedAt = new Date();
    const runId = crypto.randomUUID();
    const transition = await prisma.waBroadcast.updateMany({
      where: { id: broadcastId, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: {
        audienceCount,
        status: "SENDING",
        scheduledAt: null,
        startedAt,
        completedAt: null,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
        skippedCount: 0,
      },
    });
    if (transition.count === 0) {
      throw new ApiError(409, "Broadcast is already dispatching");
    }

    if (broadcast.status === "SCHEDULED") await removeScheduledJob(broadcastId);

    try {
      const { broadcastQueue } = await import("./whatsapp.queue.js");
      await broadcastQueue.add(
        "dispatch",
        { broadcastId, runId },
        { jobId: `wa-broadcast-${broadcastId}-${runId}` },
      );
    } catch (error) {
      await prisma.waBroadcast.updateMany({
        where: { id: broadcastId, status: "SENDING", startedAt },
        data: {
          status: broadcast.status,
          startedAt: null,
          ...(broadcast.status === "DRAFT" ? { scheduledAt: null } : {}),
        },
      }).catch(() => undefined);
      throw error;
    }
  }

  async retryFailedRecipients(broadcastId) {
    const broadcast = await prisma.waBroadcast.findUnique({
      where: { id: broadcastId },
      select: { id: true, status: true },
    });
    if (!broadcast) throw new ApiError(404, "Broadcast not found");
    if (!["COMPLETED", "FAILED"].includes(broadcast.status)) {
      throw new ApiError(409, "Failed recipients can only be retried after the campaign has finished");
    }

    const failedCount = await prisma.waBroadcastRecipient.count({
      where: { broadcastId, status: "FAILED" },
    });
    if (!failedCount) throw new ApiError(400, "This campaign has no failed recipients to retry");

    const startedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.waBroadcastRecipient.updateMany({
        where: { broadcastId, status: "FAILED" },
        data: { status: "PENDING", errorMessage: null },
      });
      const updated = await tx.waBroadcast.updateMany({
        where: { id: broadcastId, status: { in: ["COMPLETED", "FAILED"] } },
        data: { status: "SENDING", completedAt: null, failedCount: 0 },
      });
      if (!updated.count) throw new ApiError(409, "Campaign retry already started");
    });

    try {
      const { broadcastQueue } = await import("./whatsapp.queue.js");
      const runId = crypto.randomUUID();
      await broadcastQueue.add(
        "retry-failed",
        { broadcastId, runId },
        { jobId: `wa-broadcast-retry-${broadcastId}-${runId}` },
      );
    } catch (error) {
      await prisma.$transaction(async (tx) => {
        await tx.waBroadcastRecipient.updateMany({
          where: { broadcastId, status: "PENDING" },
          data: { status: "FAILED", errorMessage: "Retry could not be queued" },
        });
        await tx.waBroadcast.updateMany({
          where: { id: broadcastId, status: "SENDING", completedAt: null },
          data: { status: broadcast.status, completedAt: new Date(), failedCount },
        });
      }).catch(() => undefined);
      throw error;
    }

    await redis.set(`broadcast:${broadcastId}:remaining`, failedCount, "EX", 7 * 24 * 60 * 60).catch(() => undefined);
    return { retriedCount: failedCount, startedAt };
  }

  async stopBroadcast(broadcastId) {
    const broadcast = await prisma.waBroadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) throw new ApiError(404, "Broadcast not found");
    if (broadcast.status !== "SENDING") {
      throw new ApiError(409, "Only a sending campaign can be stopped");
    }

    await prisma.$transaction(async (tx) => {
      await tx.waBroadcastRecipient.updateMany({
        where: { broadcastId, status: "PENDING" },
        data: { status: "SKIPPED", errorMessage: "Campaign stopped before send" },
      });
      const stopped = await tx.waBroadcast.updateMany({
        where: { id: broadcastId, status: "SENDING" },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      if (!stopped.count) throw new ApiError(409, "Campaign is no longer sending");
    });
    await redis.del(`broadcast:${broadcastId}:remaining`).catch(() => undefined);
    await this.reconcileCounts(broadcastId);
    return this.getBroadcastStats(broadcastId);
  }

  async cancelBroadcast(broadcastId) {
    const broadcast = await prisma.waBroadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) throw new ApiError(404, "Broadcast not found");
    if (!["DRAFT", "SCHEDULED"].includes(broadcast.status)) {
      throw new ApiError(409, "Can only cancel draft or scheduled broadcasts");
    }

    if (broadcast.status === "SCHEDULED") await removeScheduledJob(broadcastId);

    await prisma.$transaction(async (tx) => {
      await tx.waBroadcastRecipient.updateMany({
        where: { broadcastId, status: "PENDING" },
        data: { status: "SKIPPED", errorMessage: "Campaign cancelled before send" },
      });
      const cancelled = await tx.waBroadcast.updateMany({
        where: { id: broadcastId, status: { in: ["DRAFT", "SCHEDULED"] } },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      if (cancelled.count === 0) {
        throw new ApiError(409, "Can only cancel draft or scheduled broadcasts");
      }
    });
    await this.reconcileCounts(broadcastId);
    return this.getBroadcastStats(broadcastId);
  }

  async discardDraft(broadcastId) {
    const broadcast = await prisma.waBroadcast.findUnique({
      where: { id: broadcastId },
      select: { id: true, status: true },
    });
    if (!broadcast) return { deleted: true };
    if (broadcast.status !== "DRAFT") throw new ApiError(409, "Only draft campaigns can be discarded");
    await prisma.waBroadcast.delete({ where: { id: broadcastId } });
    await redis.del(`broadcast:${broadcastId}:remaining`).catch(() => undefined);
    return { deleted: true };
  }

  async reconcileCounts(broadcastId) {
    const groups = await prisma.waBroadcastRecipient.groupBy({
      by: ["status"],
      where: { broadcastId },
      _count: { id: true },
    });
    const counts = countsFromGroups(groups);
    await prisma.waBroadcast.updateMany({
      where: { id: broadcastId },
      data: {
        sentCount: counts.sentCount,
        deliveredCount: counts.deliveredCount,
        readCount: counts.readCount,
        failedCount: counts.failedCount,
        skippedCount: counts.skippedCount,
      },
    });
    return counts;
  }

  async getBroadcastStats(broadcastId) {
    const [broadcast, groups] = await Promise.all([
      prisma.waBroadcast.findUnique({
        where: { id: broadcastId },
        select: {
          id: true,
          shopId: true,
          name: true,
          status: true,
          audienceCount: true,
          sentCount: true,
          deliveredCount: true,
          readCount: true,
          failedCount: true,
          skippedCount: true,
          scheduledAt: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          integrationId: true,
          templateVariables: true,
          template: { select: { id: true, name: true, language: true, category: true } },
        },
      }),
      prisma.waBroadcastRecipient.groupBy({
        by: ["status"],
        where: { broadcastId },
        _count: { id: true },
      }),
    ]);
    if (!broadcast) throw new ApiError(404, "Broadcast not found");

    const liveCounts = countsFromGroups(groups);
    let remaining = liveCounts.pendingCount;
    try {
      const redisVal = await redis.get(`broadcast:${broadcastId}:remaining`);
      if (redisVal !== null) remaining = Number.parseInt(redisVal, 10);
    } catch (error) {
      console.error("[Broadcast Service] Redis count fetch error:", error.message);
    }

    return {
      ...broadcast,
      sentCount: liveCounts.sentCount,
      deliveredCount: liveCounts.deliveredCount,
      readCount: liveCounts.readCount,
      failedCount: liveCounts.failedCount,
      skippedCount: liveCounts.skippedCount,
      pendingCount: liveCounts.pendingCount,
      remainingInQueue: remaining,
    };
  }
}

export const whatsappBroadcastService = new WhatsAppBroadcastService();
