import { asyncHandler } from "../utils/asyncHandler.js";
import { parseEventSequenceCursor } from "../lib/validate.js";
import {
  getShopCategoryReadModel,
  getShopCustomerReadModel,
  getShopItemCatalogReadModel,
  getShopReadModelBootstrap,
} from "../services/read-model-snapshot.service.js";
import { getContiguousPublishedDomainEvents } from "../services/domain-event-reconciliation.service.js";

const DEFAULT_LIMIT = 100;

export const syncDomainEvents = asyncHandler(async (req, res) => {
  const { shopId, after, limit } = req.validated.query;
  const parsedLimit = Math.min(Number(limit) || DEFAULT_LIMIT, 500);
  const userId = req.user?.id ?? "unknown";
  const afterSequence = after !== undefined ? parseEventSequenceCursor(after) : undefined;

  const outboxEntries = await getContiguousPublishedDomainEvents({
    shopId,
    afterSequence,
    limit: parsedLimit,
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

function repairEnvelope(shopId, records) {
  return {
    schemaVersion: 1,
    shopId,
    complete: true,
    records,
  };
}

export const getCustomerReadModel = asyncHandler(async (req, res) => {
  const { shopId } = req.validated.query;
  const records = await getShopCustomerReadModel(req.user, shopId);
  res.json({ success: true, data: repairEnvelope(shopId, records) });
});

export const getItemCatalogReadModel = asyncHandler(async (req, res) => {
  const { shopId } = req.validated.query;
  const records = await getShopItemCatalogReadModel(req.user, shopId);
  res.json({ success: true, data: repairEnvelope(shopId, records) });
});

export const getCategoryReadModel = asyncHandler(async (req, res) => {
  const { shopId } = req.validated.query;
  const records = await getShopCategoryReadModel(req.user, shopId);
  res.json({ success: true, data: repairEnvelope(shopId, records) });
});
