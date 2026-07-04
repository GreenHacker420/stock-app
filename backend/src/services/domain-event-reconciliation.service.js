import prisma from "../lib/db.js";

export const RECONCILE_STATUS = "published";

export function selectContiguousPublishedFrontier(rows, afterSequence, limit) {
  const selected = [];
  let expected = afterSequence !== undefined ? afterSequence + 1n : rows[0]?.sequence;

  for (const row of rows) {
    if (selected.length >= limit) break;
    if (expected === undefined) break;
    if (row.sequence !== expected) break;
    if (row.status !== RECONCILE_STATUS) break;

    selected.push(row);
    expected += 1n;
  }

  return selected;
}

export async function getContiguousPublishedDomainEvents({ shopId, afterSequence, limit }) {
  const rows = await prisma.domainEventOutbox.findMany({
    where: {
      shopId,
      ...(afterSequence !== undefined ? { sequence: { gt: afterSequence } } : {}),
    },
    orderBy: { sequence: "asc" },
    take: limit,
    select: { id: true, sequence: true, status: true, eventJson: true },
  });

  return selectContiguousPublishedFrontier(rows, afterSequence, limit);
}
