import prisma from "../lib/db.js";
import { connection as redis } from "./whatsapp.queue.js";

/**
 * Resolves the audience based on filter criteria.
 * @param {string} shopId
 * @param {object} filter
 */
export async function resolveAudience(shopId, filter) {
  const whereClause = {
    shopId,
    phone: { not: null },
  };

  // Skip WALK_IN customer by default since walk-ins don't have permanent chat numbers
  whereClause.type = { not: "WALK_IN" };

  if (filter) {
    if (filter.type) {
      whereClause.type = filter.type;
    }
    if (filter.outstanding) {
      if (filter.outstanding.gt !== undefined) {
        whereClause.outstanding = { gt: Number(filter.outstanding.gt) };
      }
    }
  }

  const customers = await prisma.customer.findMany({
    where: whereClause,
    select: { id: true, name: true, phone: true },
  });

  // Normalize and filter out invalid phone numbers
  return customers.filter(c => {
    if (!c.phone) return false;
    const clean = c.phone.replace(/\D/g, "");
    return clean.length >= 10;
  });
}

class WhatsAppBroadcastService {
  /**
   * Creates a draft broadcast campaign.
   */
  async createBroadcast(shopId, { name, templateId, templateVariables, audienceFilter, createdById }) {
    // 1. Validate template
    const template = await prisma.waTemplate.findFirst({
      where: { id: templateId, shopId },
    });
    if (!template) {
      throw new Error("Template not found or does not belong to this shop");
    }

    // 2. Resolve audience to count recipients
    const audience = await resolveAudience(shopId, audienceFilter);

    // 3. Create the database record
    return await prisma.waBroadcast.create({
      data: {
        shopId,
        name,
        templateId,
        templateVariables: templateVariables || {},
        audienceFilter: audienceFilter || {},
        audienceCount: audience.length,
        status: "DRAFT",
        createdById,
      },
      include: {
        template: true,
      }
    });
  }

  /**
   * Schedules a broadcast for later.
   */
  async scheduleBroadcast(broadcastId, scheduledAt) {
    const parsedDate = new Date(scheduledAt);
    if (isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
      throw new Error("Invalid schedule date. Must be in the future.");
    }

    return await prisma.waBroadcast.update({
      where: { id: broadcastId },
      data: {
        status: "SCHEDULED",
        scheduledAt: parsedDate,
      },
    });
  }

  /**
   * Dispatches a broadcast campaign (non-blocking).
   */
  async dispatchBroadcast(broadcastId) {
    const broadcast = await prisma.waBroadcast.findUnique({
      where: { id: broadcastId },
    });

    if (!broadcast) throw new Error("Broadcast not found");
    if (broadcast.status !== "DRAFT" && broadcast.status !== "SCHEDULED") {
      throw new Error(`Cannot dispatch broadcast in status: ${broadcast.status}`);
    }

    // Update status to SENDING
    await prisma.waBroadcast.update({
      where: { id: broadcastId },
      data: {
        status: "SENDING",
        startedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Enqueue dispatch job ( Stage 1: Fan-out )
    const { broadcastQueue } = await import("./whatsapp.queue.js");
    await broadcastQueue.add("dispatch", { broadcastId });
  }

  /**
   * Cancels a scheduled or draft broadcast.
   */
  async cancelBroadcast(broadcastId) {
    const broadcast = await prisma.waBroadcast.findUnique({
      where: { id: broadcastId },
    });

    if (!broadcast) throw new Error("Broadcast not found");
    if (broadcast.status !== "DRAFT" && broadcast.status !== "SCHEDULED") {
      throw new Error("Can only cancel draft or scheduled broadcasts");
    }

    return await prisma.waBroadcast.update({
      where: { id: broadcastId },
      data: {
        status: "CANCELLED",
      },
    });
  }

  /**
   * Retrieves live broadcast stats.
   */
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
      },
    });

    if (!broadcast) throw new Error("Broadcast not found");

    // Fetch Redis remaining counter if active
    let remaining = null;
    try {
      const redisVal = await redis.get(`broadcast:${broadcastId}:remaining`);
      if (redisVal !== null) {
        remaining = parseInt(redisVal, 10);
      }
    } catch (err) {
      console.error("[Broadcast Service] Redis count fetch error:", err.message);
    }

    return {
      ...broadcast,
      remainingInQueue: remaining,
    };
  }
}

export const whatsappBroadcastService = new WhatsAppBroadcastService();
