import prisma from "../lib/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { parseEventSequenceCursor } from "../lib/validate.js";
import { getShopReadModelBootstrap } from "../services/read-model-snapshot.service.js";

const RECONCILE_STATUS = "published";
const DEFAULT_LIMIT = 100;

export const syncDomainEvents = asyncHandler(async (req, res) => {
  const { shopId, after, limit } = req.validated.query;
  const parsedLimit = Math.min(Number(limit) || DEFAULT_LIMIT, 500);
  const userId = req.user?.id ?? "unknown";
  const afterSequence = after !== undefined ? parseEventSequenceCursor(after) : undefined;

  const where = {
    shopId,
    status: RECONCILE_STATUS,
    ...(afterSequence !== undefined ? { sequence: { gt: afterSequence } } : {}),
  };

  const outboxEntries = await prisma.domainEventOutbox.findMany({
    where,
    orderBy: { sequence: "asc" },
    take: parsedLimit,
    // Only expose the eventJson blob — no internal outbox metadata
    select: { id: true, sequence: true, eventJson: true },
  });

  const events = outboxEntries.map((entry) => {
    const ev = entry.eventJson;

    return ev;
  });

  const nextCursor =
    outboxEntries.length > 0
      ? outboxEntries[outboxEntries.length - 1].sequence.toString()
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

export const getReadModelBootstrap = asyncHandler(async (req, res) => {
  const { shopId } = req.validated.query;
  const snapshot = await getShopReadModelBootstrap(req.user, shopId);
  res.json({ success: true, data: snapshot });
});
