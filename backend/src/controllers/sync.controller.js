import prisma from "../lib/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const syncDomainEvents = asyncHandler(async (req, res) => {
  const { shopId, after, limit = 100 } = req.validated.query;

  const parsedLimit = parseInt(limit, 10) || 100;

  const where = {
    shopId,
    status: "published",
  };

  if (after) {
    where.createdAt = {
      gt: new Date(after),
    };
  }

  const outboxEntries = await prisma.domainEventOutbox.findMany({
    where,
    orderBy: {
      createdAt: "asc",
    },
    take: parsedLimit,
  });

  const events = outboxEntries.map((entry) => entry.eventJson);

  let nextCursor = null;
  if (outboxEntries.length > 0) {
    nextCursor = outboxEntries[outboxEntries.length - 1].createdAt.toISOString();
  }

  res.json({
    success: true,
    data: {
      events,
      nextCursor,
    },
  });
});
