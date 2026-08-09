import prisma from "../lib/db.js";
import { connection as redis } from "./whatsapp.queue.js";
import { normalizePhone } from "./whatsapp.phone.js";

const MAX_RECIPIENT_BATCH = 500;

function normalizeRecipientPhone(phone) {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
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
      throw new Error("No connected WhatsApp integration is available for this shop");
    }

    const template = await prisma.waTemplate.findFirst({
      where: {
        id: templateId,
        shopId,
        status: "APPROVED",
        OR: [
          { integrationId: null },
          { integrationId: integration.id },
        ],
      },
    });
    if (!template) {
      throw new Error("Approved template not found for this shop and WhatsApp integration");
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
   * Adds only the selected device/manual contacts to a draft campaign.
   * The full phonebook never reaches the backend.
   */
  async addRecipients(broadcastId, shopId, inputRecipients) {
    if (!Array.isArray(inputRecipients) || inputRecipients.length === 0) {
      throw new Error("recipients must be a non-empty array");
    }
    if (inputRecipients.length > MAX_RECIPIENT_BATCH) {
      throw new Error(`A maximum of ${MAX_RECIPIENT_BATCH} recipients can be uploaded per request`);
    }

    const broadcast = await prisma.waBroadcast.findFirst({
      where: { id: broadcastId, shopId },
      select: { id: true, status: true, audienceFilter: true },
    });
    if (!broadcast) throw new Error("Broadcast not found");
    if (broadcast.status !== "DRAFT") {
      throw new Error("Recipients can only be changed while a broadcast is in draft");
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
    const validCustomerIds = requestedCustomerIds.length
      ? new Set((await prisma.customer.findMany({
          where: { id: { in: requestedCustomerIds }, shopId, status: "ACTIVE" },
          select: { id: true },
        })).map((customer) => customer.id))
      : new Set();

    await prisma.$transaction(async (tx) => {
      for (const recipient of normalized.recipients) {
        const customerId = recipient.customerId && validCustomerIds.has(recipient.customerId)
          ? recipient.customerId
          : null;
        const source = customerId ? "CUSTOMER" : recipient.source;

        await tx.waBroadcastRecipient.upsert({
          where: {
            broadcastId_customerPhone: {
              broadcastId,
              customerPhone: recipient.phone,
            },
          },
          create: {
            broadcastId,
            customerId,
            customerName: recipient.name,
            customerPhone: recipient.phone,
            source,
            sourceContactId: recipient.sourceContactId,
            status: "PENDING",
          },
          update: {
            customerId,
            customerName: recipient.name,
            source,
            sourceContactId: recipient.sourceContactId,
            status: "PENDING",
            errorMessage: null,
            metaMessageId: null,
            sentAt: null,
            deliveredAt: null,
            readAt: null,
          },
        });
      }

      const totalCount = await tx.waBroadcastRecipient.count({ where: { broadcastId } });
      await tx.waBroadcast.update({
        where: { id: broadcastId },
        data: {
          audienceFilter: { mode: "EXPLICIT" },
          audienceCount: totalCount,
        },
      });
    });

    const totalCount = await prisma.waBroadcastRecipient.count({ where: { broadcastId } });
    return {
      acceptedCount: normalized.recipients.length,
      invalidCount: normalized.invalidCount,
      duplicateCount: normalized.duplicateCount,
      totalCount,
    };
  }

  async scheduleBroadcast(broadcastId, scheduledAt) {
    const parsedDate = new Date(scheduledAt);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
      throw new Error("Invalid schedule date. Must be in the future.");
    }

    return prisma.waBroadcast.update({
      where: { id: broadcastId },
      data: { status: "SCHEDULED", scheduledAt: parsedDate },
    });
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

    if (!broadcast) throw new Error("Broadcast not found");
    if (!["DRAFT", "SCHEDULED"].includes(broadcast.status)) {
      throw new Error(`Cannot dispatch broadcast in status: ${broadcast.status}`);
    }

    let audienceCount = broadcast.audienceCount;
    if (broadcast.audienceFilter?.mode === "EXPLICIT") {
      audienceCount = await prisma.waBroadcastRecipient.count({
        where: { broadcastId, status: "PENDING" },
      });
      if (audienceCount === 0) {
        throw new Error("Select at least one valid recipient before sending the broadcast");
      }
    }

    await prisma.waBroadcast.update({
      where: { id: broadcastId },
      data: {
        audienceCount,
        status: "SENDING",
        startedAt: new Date(),
        completedAt: null,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
        skippedCount: 0,
      },
    });

    try {
      const { broadcastQueue } = await import("./whatsapp.queue.js");
      await broadcastQueue.add(
        "dispatch",
        { broadcastId },
        { jobId: `wa-broadcast-${broadcastId}-dispatch` },
      );
    } catch (error) {
      await prisma.waBroadcast.update({
        where: { id: broadcastId },
        data: { status: "DRAFT", startedAt: null },
      }).catch(() => undefined);
      throw error;
    }
  }

  async cancelBroadcast(broadcastId) {
    const broadcast = await prisma.waBroadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) throw new Error("Broadcast not found");
    if (!["DRAFT", "SCHEDULED"].includes(broadcast.status)) {
      throw new Error("Can only cancel draft or scheduled broadcasts");
    }

    return prisma.waBroadcast.update({
      where: { id: broadcastId },
      data: { status: "CANCELLED" },
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
    if (!broadcast) throw new Error("Broadcast not found");

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
