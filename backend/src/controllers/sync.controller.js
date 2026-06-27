import prisma from "../lib/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";


const RECONCILE_STATUS = "delivered";
const DEFAULT_LIMIT = 100;

export const syncDomainEvents = asyncHandler(async (req, res) => {
  const { shopId, after, limit } = req.validated.query;
  const parsedLimit = Math.min(Number(limit) || DEFAULT_LIMIT, 500);
  const userId = req.user?.id ?? "unknown";

  const where = {
    shopId,
    status: RECONCILE_STATUS,
    ...(after ? { createdAt: { gt: new Date(after) } } : {}),
  };

  const outboxEntries = await prisma.domainEventOutbox.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: parsedLimit,
    // Only expose the eventJson blob — no internal outbox metadata
    select: { id: true, createdAt: true, eventJson: true },
  });

  const events = outboxEntries.map((entry) => {
    const ev = entry.eventJson;

    return ev;
  });

  const nextCursor =
    outboxEntries.length > 0
      ? outboxEntries[outboxEntries.length - 1].createdAt.toISOString()
      : after ?? null; // return same cursor when no new events

  console.log("[sync] domain-events reconciliation", {
    userId,
    shopId,
    count: events.length,
    after: after ?? null,
    nextCursor,
    limit: parsedLimit,
  });

  res.json({
    success: true,
    data: { events, nextCursor },
  });
});
