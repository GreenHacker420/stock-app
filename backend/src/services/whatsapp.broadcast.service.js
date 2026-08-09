import crypto from "crypto";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { connection as redis } from "./whatsapp.queue.js";
import { normalizePhone } from "./whatsapp.phone.js";

export const MAX_BROADCAST_RECIPIENT_BATCH = 500;

function normalizeRecipientPhone(phone) {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
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

async function resolveBroadcastIntegration(shopId, integrationId) {
  if (integrationId) {
    return prisma.waIntegration.findFirst({
      where: {
        id: integrationId,
        status: "CONNECTED",
        isArchived: false,
        OR: [
          { shopId },
          { shopAccesses: { some: { shopId, canSend: true } } },
        ],
      },
      select: { id: true, shopId: true },
    });
  }

  return prisma.waIntegration.findFirst({
    where: {
      status: "CONNECTED",
      isArchived: false,
      OR: [
        { shopId },
        { shopAccesses: { some: { shopId, canSend: true, isPrimary: true } } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, shopId: true },
  });
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

    const template = await prisma.waTemplate.findFirst({
      where: {
        id: templateId,
        shopId: integration.shopId,
        status: "APPROVED",
        OR: [
          { integrationId: null },
          { integrationId: integration.id },
        ],
      },
    });
    if (!template) {
      throw new ApiError(404, "Approved template not found for this shop and WhatsApp integration");
    }

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

  async scheduleBroadcast(broadcastId, scheduledAt) {
    const parsedDate = new Date(scheduledAt);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
      throw new ApiError(400, "Invalid schedule date. Must be in the future.");
    }

    const scheduled = await prisma.waBroadcast.updateMany({
      where: { id: broadcastId, status: "DRAFT" },
      data: { status: "SCHEDULED", scheduledAt: parsedDate },
    });
    if (scheduled.count === 0) {
      throw new ApiError(409, "Only draft broadcasts can be scheduled");
    }
    return prisma.waBroadcast.findUnique({ where: { id: broadcastId } });
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

  async cancelBroadcast(broadcastId) {
    const broadcast = await prisma.waBroadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) throw new ApiError(404, "Broadcast not found");
    if (!["DRAFT", "SCHEDULED"].includes(broadcast.status)) {
      throw new ApiError(409, "Can only cancel draft or scheduled broadcasts");
    }

    return prisma.$transaction(async (tx) => {
      const cancelled = await tx.waBroadcast.updateMany({
        where: { id: broadcastId, status: { in: ["DRAFT", "SCHEDULED"] } },
        data: { status: "CANCELLED", audienceCount: 0 },
      });
      if (cancelled.count === 0) {
        throw new ApiError(409, "Can only cancel draft or scheduled broadcasts");
      }
      await tx.waBroadcastRecipient.deleteMany({ where: { broadcastId } });
      return tx.waBroadcast.findUnique({ where: { id: broadcastId } });
    });
  }

  async getBroadcastStats(broadcastId) {
    const broadcast = await prisma.waBroadcast.findUnique({
      where: { id: broadcastId },
      select: {
        id: true,
        name: true,
        status: true,
        audienceCount: true,
        sentCount: true,
        deliveredCount: true,
        readCount: true,
        failedCount: true,
        skippedCount: true,
        startedAt: true,
        completedAt: true,
        scheduledAt: true,
        integrationId: true,
        template: { select: { id: true, name: true, language: true, category: true } },
      },
    });
    if (!broadcast) throw new ApiError(404, "Broadcast not found");

    let remaining = null;
    try {
      const redisVal = await redis.get(`broadcast:${broadcastId}:remaining`);
      if (redisVal !== null) remaining = Number.parseInt(redisVal, 10);
    } catch (error) {
      console.error("[Broadcast Service] Redis count fetch error:", error.message);
    }

    return { ...broadcast, remainingInQueue: remaining };
  }
}

export const whatsappBroadcastService = new WhatsAppBroadcastService();
