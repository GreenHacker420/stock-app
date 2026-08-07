import {
  Prisma,
  CustomerLedgerEntryType,
  CustomerLedgerDirection,
  CustomerLedgerSourceType,
  LedgerAttachmentPurpose,
} from "../generated/prisma/index.js";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { money, add, sub } from "../utils/money.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";
import { createDomainEvent, enqueueDomainEvent } from "./domain-event.service.js";

const VALID_SOURCE_TYPES = new Set(Object.values(CustomerLedgerSourceType));
const VALID_ENTRY_TYPES = new Set(Object.values(CustomerLedgerEntryType));
const VALID_DIRECTIONS = new Set(Object.values(CustomerLedgerDirection));
const VALID_ATTACHMENT_PURPOSES = new Set(Object.values(LedgerAttachmentPurpose));

/** Sensible source/entry combinations */
const SOURCE_ENTRY_COMPAT = {
  OPENING_BALANCE: new Set(["OPENING_RECEIVABLE", "OPENING_ADVANCE"]),
  SALE: new Set(["SALE_POSTED"]),
  DELIVERY_MEMO: new Set(["DELIVERY_MEMO_POSTED"]),
  PAYMENT: new Set(["PAYMENT_RECEIVED"]),
  PAYMENT_AMENDMENT: new Set(["PAYMENT_VALUE_INCREASE", "PAYMENT_VALUE_DECREASE"]),
  RETURN: new Set(["RETURN_CREDIT"]),
  SALE_AMENDMENT: new Set(["SALE_VALUE_INCREASE", "SALE_VALUE_DECREASE"]),
  MANUAL_ADJUSTMENT: new Set(["ADJUSTMENT_DEBIT", "ADJUSTMENT_CREDIT"]),
  CHEQUE: new Set(["CHEQUE_BOUNCED"]),
  REVERSAL: new Set(["REVERSAL"]),
  LEGACY_RECONCILIATION: new Set(["LEGACY_RECONCILIATION"]),
};

function assertCompatibleEnums({ sourceType, entryType, direction }) {
  if (!VALID_SOURCE_TYPES.has(sourceType)) {
    throw new ApiError(400, `Invalid sourceType: ${sourceType}`, { code: "INVALID_LEDGER_SOURCE_TYPE" });
  }
  if (!VALID_ENTRY_TYPES.has(entryType)) {
    throw new ApiError(400, `Invalid entryType: ${entryType}`, { code: "INVALID_LEDGER_ENTRY_TYPE" });
  }
  if (!VALID_DIRECTIONS.has(direction)) {
    throw new ApiError(400, `Invalid direction: ${direction}`, { code: "INVALID_LEDGER_DIRECTION" });
  }
  const allowed = SOURCE_ENTRY_COMPAT[sourceType];
  if (allowed && !allowed.has(entryType)) {
    throw new ApiError(400, `Incompatible ledger combination: ${sourceType} + ${entryType}`, {
      code: "INVALID_LEDGER_COMBINATION",
    });
  }
}

function assertIdempotencyPayloadMatch(existing, expected) {
  const mismatches = [];
  if (existing.customerId !== expected.customerId) mismatches.push("customerId");
  if (existing.sourceType !== expected.sourceType) mismatches.push("sourceType");
  if (existing.sourceId !== expected.sourceId) mismatches.push("sourceId");
  if (existing.entryType !== expected.entryType) mismatches.push("entryType");
  if (existing.direction !== expected.direction) mismatches.push("direction");
  if (Number(existing.amount) !== Number(expected.amount)) mismatches.push("amount");
  if (mismatches.length > 0) {
    throw new ApiError(409, `Idempotency key reused with incompatible payload (${mismatches.join(", ")})`, {
      code: "IDEMPOTENCY_KEY_REUSED",
    });
  }
}

async function validateLedgerAttachments(tx, shopId, attachmentAssetIds) {
  if (!attachmentAssetIds || attachmentAssetIds.length === 0) return;

  for (const item of attachmentAssetIds) {
    const assetId = typeof item === "string" ? item : item.assetId;
    const purpose = typeof item === "object" && item.purpose ? item.purpose : "OTHER";
    if (!VALID_ATTACHMENT_PURPOSES.has(purpose)) {
      throw new ApiError(400, `Invalid attachment purpose: ${purpose}`, { code: "INVALID_ATTACHMENT_PURPOSE" });
    }
    const asset = await tx.asset.findFirst({ where: { id: assetId, shopId } });
    if (!asset) throw new ApiError(400, `Asset ${assetId} not found`);
    if (asset.status !== "READY") {
      throw new ApiError(400, `Asset ${assetId} is not ready (status: ${asset.status})`);
    }
    if (asset.domain !== "CUSTOMER_LEDGER") {
      throw new ApiError(400, `Asset ${assetId} domain must be CUSTOMER_LEDGER`, { code: "ATTACHMENT_WRONG_DOMAIN" });
    }
    if (asset.deletionStatus && asset.deletionStatus !== "NONE") {
      throw new ApiError(400, `Asset ${assetId} is pending deletion`, { code: "ATTACHMENT_PENDING_DELETION" });
    }
  }
}

export async function postLedgerEntry(tx, input) {
  const {
    shopId,
    customerId,
    sourceType,
    sourceId,
    entryType,
    direction,
    amount,
    createdById,
    effectiveAt = new Date(),
    notes,
    idempotencyKey,
    clientMutationId,
    metadata,
    attachmentAssetIds = [],
    allocations = [],
  } = input;

  const amtNum = Number(amount);
  if (!Number.isFinite(amtNum) || amtNum <= 0) {
    throw new ApiError(400, "Ledger entry amount must be greater than zero");
  }
  const amtDecimal = money(amtNum);

  assertCompatibleEnums({ sourceType, entryType, direction });

  const customerRows = await tx.$queryRaw`
    SELECT * FROM "Customer" WHERE "id" = ${customerId} AND "shopId" = ${shopId} FOR UPDATE
  `;
  const customer = customerRows[0];
  if (!customer) {
    throw new ApiError(404, "Customer not found or shop mismatch");
  }
  if (customer.type === "WALK_IN") {
    throw new ApiError(400, "Walk-in customers cannot carry debt or credit balance");
  }

  let existingEntry = null;
  if (idempotencyKey) {
    existingEntry = await tx.customerLedgerEntry.findFirst({
      where: { shopId, idempotencyKey },
      include: { ledgerAttachments: { include: { asset: true } } },
    });
  }
  if (!existingEntry && clientMutationId) {
    existingEntry = await tx.customerLedgerEntry.findFirst({
      where: { shopId, clientMutationId },
      include: { ledgerAttachments: { include: { asset: true } } },
    });
  }
  if (!existingEntry && sourceType && sourceId && entryType) {
    existingEntry = await tx.customerLedgerEntry.findFirst({
      where: { shopId, sourceType, sourceId, entryType },
      include: { ledgerAttachments: { include: { asset: true } } },
    });
  }

  if (existingEntry) {
    assertIdempotencyPayloadMatch(existingEntry, {
      customerId,
      sourceType,
      sourceId,
      entryType,
      direction,
      amount: amtNum,
    });
    const currentCustomer = await tx.customer.findUnique({ where: { id: customerId } });
    return {
      entry: existingEntry,
      customer: currentCustomer,
      isDuplicate: true,
    };
  }

  await validateLedgerAttachments(tx, shopId, attachmentAssetIds);

  const createdEntry = await tx.customerLedgerEntry.create({
    data: {
      shopId,
      customerId,
      sourceType,
      sourceId,
      entryType,
      direction,
      amount: amtDecimal,
      createdById,
      idempotencyKey: idempotencyKey || null,
      clientMutationId: clientMutationId || null,
      notes: notes || null,
      metadata: metadata || undefined,
      effectiveAt: new Date(effectiveAt),
    },
  });

  if (attachmentAssetIds && attachmentAssetIds.length > 0) {
    for (let i = 0; i < attachmentAssetIds.length; i++) {
      const item = attachmentAssetIds[i];
      const assetId = typeof item === "string" ? item : item.assetId;
      const purpose = typeof item === "object" && item.purpose ? item.purpose : "OTHER";
      const sortOrder = typeof item === "object" && typeof item.sortOrder === "number" ? item.sortOrder : i;
      await tx.customerLedgerAttachment.create({
        data: { shopId, ledgerEntryId: createdEntry.id, assetId, purpose, sortOrder },
      });
    }
  }

  const currentNet = sub(customer.outstandingAmount, customer.advanceBalance);
  const delta = direction === "DEBIT" ? amtDecimal : sub(0, amtDecimal);
  const newNet = add(currentNet, delta);

  const newOutstanding = newNet.gt(0) ? newNet : money(0);
  const newAdvance = newNet.lt(0) ? sub(0, newNet) : money(0);
  const newVersion = (Number(customer.ledgerVersion) || 0) + 1;

  const updatedCustomer = await tx.customer.update({
    where: { id: customerId },
    data: { outstandingAmount: newOutstanding, advanceBalance: newAdvance, ledgerVersion: newVersion },
  });

  if (allocations && allocations.length > 0) {
    for (const alloc of allocations) {
      await allocateLedgerCredit(tx, {
        shopId,
        customerId,
        debitEntryId: alloc.debitEntryId,
        creditEntryId: alloc.creditEntryId || createdEntry.id,
        amount: alloc.amount,
        createdById,
        clientMutationId: alloc.clientMutationId,
      });
    }
  }

  await tx.auditLog.create({
    data: {
      shopId,
      user: createdById ? { connect: { id: createdById } } : undefined,
      entityType: "CUSTOMER_LEDGER_ENTRY",
      entityId: createdEntry.id,
      action: "POSTED",
      reason: notes || `${entryType} ${direction} of ₹${amtNum}`,
      newValueJson: {
        sourceType,
        sourceId,
        entryType,
        direction,
        amount: amtNum,
        newOutstanding: Number(newOutstanding),
        newAdvance: Number(newAdvance),
      },
    },
  });

  await enqueueDomainEvent(tx, createDomainEvent({
    shopId,
    entity: "customerLedgerEntry",
    action: "posted",
    entityId: createdEntry.id,
    actorUserId: createdById,
    visibility: { owners: true, staff: true },
  }));
  await enqueueDomainEvent(tx, createDomainEvent({
    shopId,
    entity: "customer",
    action: "updated",
    entityId: customerId,
    actorUserId: createdById,
    visibility: { owners: true, staff: true },
  }));

  const fullEntry = await tx.customerLedgerEntry.findUnique({
    where: { id: createdEntry.id },
    include: { ledgerAttachments: { include: { asset: true } }, debitAllocations: true, creditAllocations: true },
  });

  return { entry: fullEntry, customer: updatedCustomer, isDuplicate: false };
}

export async function reverseLedgerEntry(tx, input) {
  const { shopId, entryId, reversalReason, createdById, effectiveAt = new Date() } = input;

  if (!reversalReason || typeof reversalReason !== "string" || !reversalReason.trim()) {
    throw new ApiError(400, "Reversal reason is mandatory");
  }

  const originalEntry = await tx.customerLedgerEntry.findFirst({ where: { id: entryId, shopId } });
  if (!originalEntry) throw new ApiError(404, "Ledger entry to reverse not found");
  if (originalEntry.reversalOfId) throw new ApiError(400, "Cannot reverse a reversal entry");

  const existingReversal = await tx.customerLedgerEntry.findFirst({ where: { reversalOfId: entryId } });
  if (existingReversal) throw new ApiError(409, "Ledger entry has already been reversed");

  const oppositeDirection = originalEntry.direction === "DEBIT" ? "CREDIT" : "DEBIT";

  const customerRows = await tx.$queryRaw`
    SELECT * FROM "Customer" WHERE "id" = ${originalEntry.customerId} AND "shopId" = ${shopId} FOR UPDATE
  `;
  const customer = customerRows[0];
  if (!customer) throw new ApiError(404, "Customer not found");

  await reverseLedgerAllocations(tx, {
    shopId,
    entryId,
    createdById,
    reason: reversalReason.trim(),
  });

  const reversalEntry = await tx.customerLedgerEntry.create({
    data: {
      shopId,
      customerId: originalEntry.customerId,
      sourceType: CustomerLedgerSourceType.REVERSAL,
      sourceId: originalEntry.id,
      entryType: CustomerLedgerEntryType.REVERSAL,
      direction: oppositeDirection,
      amount: originalEntry.amount,
      createdById,
      reversalOfId: entryId,
      reversalReason: reversalReason.trim(),
      notes: `Reversal of ${originalEntry.entryType} (${originalEntry.id}): ${reversalReason.trim()}`,
      effectiveAt: new Date(effectiveAt),
      metadata: {
        originalEntryId: originalEntry.id,
        originalSourceType: originalEntry.sourceType,
        originalSourceId: originalEntry.sourceId,
        originalEntryType: originalEntry.entryType,
      },
    },
  });

  const currentNet = sub(customer.outstandingAmount, customer.advanceBalance);
  const amtDecimal = money(originalEntry.amount);
  const delta = oppositeDirection === "DEBIT" ? amtDecimal : sub(0, amtDecimal);
  const newNet = add(currentNet, delta);

  const newOutstanding = newNet.gt(0) ? newNet : money(0);
  const newAdvance = newNet.lt(0) ? sub(0, newNet) : money(0);
  const newVersion = (Number(customer.ledgerVersion) || 0) + 1;

  const updatedCustomer = await tx.customer.update({
    where: { id: originalEntry.customerId },
    data: { outstandingAmount: newOutstanding, advanceBalance: newAdvance, ledgerVersion: newVersion },
  });

  await tx.auditLog.create({
    data: {
      shopId,
      user: createdById ? { connect: { id: createdById } } : undefined,
      entityType: "CUSTOMER_LEDGER_ENTRY",
      entityId: reversalEntry.id,
      action: "REVERSED",
      reason: reversalReason.trim(),
      newValueJson: {
        reversedEntryId: entryId,
        reversalReason: reversalReason.trim(),
        amount: Number(originalEntry.amount),
      },
    },
  });

  await enqueueDomainEvent(tx, createDomainEvent({
    shopId,
    entity: "customerLedgerEntry",
    action: "reversed",
    entityId: entryId,
    actorUserId: createdById,
    visibility: { owners: true, staff: true },
  }));
  await enqueueDomainEvent(tx, createDomainEvent({
    shopId,
    entity: "customer",
    action: "updated",
    entityId: originalEntry.customerId,
    actorUserId: createdById,
    visibility: { owners: true, staff: true },
  }));

  return { reversalEntry, customer: updatedCustomer };
}

export async function insertReconciliationEntryWithoutBalanceMutation(tx, input) {
  const { shopId, customerId, direction, amount, createdById, notes, metadata } = input;

  const amtNum = Number(amount);
  if (!Number.isFinite(amtNum) || amtNum <= 0) {
    throw new ApiError(400, "Reconciliation amount must be positive");
  }

  const customerRows = await tx.$queryRaw`
    SELECT * FROM "Customer" WHERE "id" = ${customerId} AND "shopId" = ${shopId} FOR UPDATE
  `;
  const customer = customerRows[0];
  if (!customer) throw new ApiError(404, "Customer not found");

  const entry = await tx.customerLedgerEntry.create({
    data: {
      shopId,
      customerId,
      sourceType: CustomerLedgerSourceType.LEGACY_RECONCILIATION,
      sourceId: customerId,
      entryType: CustomerLedgerEntryType.LEGACY_RECONCILIATION,
      direction,
      amount: money(amtNum),
      createdById,
      notes: notes || "Legacy ledger balance reconciliation",
      metadata: metadata || undefined,
    },
  });

  const cachedNet = sub(customer.outstandingAmount, customer.advanceBalance);
  const targetOutstanding = cachedNet.gt(0) ? cachedNet : money(0);
  const targetAdvance = cachedNet.lt(0) ? sub(0, cachedNet) : money(0);

  const updatedCustomer = await tx.customer.update({
    where: { id: customerId },
    data: {
      outstandingAmount: targetOutstanding,
      advanceBalance: targetAdvance,
      ledgerVersion: { increment: 1 },
    },
  });

  return { entry, customer: updatedCustomer };
}

export async function allocateLedgerCredit(tx, input) {
  const { shopId, customerId, debitEntryId, creditEntryId, amount, createdById, clientMutationId } = input;

  const amtNum = Number(amount);
  if (!Number.isFinite(amtNum) || amtNum <= 0) throw new ApiError(400, "Allocation amount must be greater than zero");
  const allocAmt = money(amtNum);

  if (debitEntryId === creditEntryId) throw new ApiError(400, "Cannot allocate a debit entry to itself");

  if (clientMutationId) {
    const existing = await tx.customerLedgerAllocation.findFirst({
      where: { shopId, clientMutationId, reversedAt: null },
    });
    if (existing) return existing;
  }

  const [lowId, highId] = [debitEntryId, creditEntryId].sort();
  await tx.$queryRaw`
    SELECT id FROM "CustomerLedgerEntry"
    WHERE id IN (${lowId}, ${highId})
    ORDER BY id ASC
    FOR UPDATE
  `;

  const [debitEntry, creditEntry] = await Promise.all([
    tx.customerLedgerEntry.findFirst({ where: { id: debitEntryId, shopId, customerId } }),
    tx.customerLedgerEntry.findFirst({ where: { id: creditEntryId, shopId, customerId } }),
  ]);

  if (!debitEntry || debitEntry.direction !== "DEBIT") throw new ApiError(400, "Invalid debit entry for allocation");
  if (!creditEntry || creditEntry.direction !== "CREDIT") throw new ApiError(400, "Invalid credit entry for allocation");

  const debitReversed = await tx.customerLedgerEntry.findFirst({ where: { reversalOfId: debitEntryId } });
  const creditReversed = await tx.customerLedgerEntry.findFirst({ where: { reversalOfId: creditEntryId } });
  if (debitReversed) throw new ApiError(400, "Cannot allocate against a reversed debit entry");
  if (creditReversed) throw new ApiError(400, "Cannot allocate against a reversed credit entry");

  const [existingDebitAllocations, existingCreditAllocations] = await Promise.all([
    tx.customerLedgerAllocation.aggregate({
      where: { debitEntryId, reversedAt: null },
      _sum: { amount: true },
    }),
    tx.customerLedgerAllocation.aggregate({
      where: { creditEntryId, reversedAt: null },
      _sum: { amount: true },
    }),
  ]);

  const allocatedDebit = money(existingDebitAllocations._sum.amount || 0);
  const allocatedCredit = money(existingCreditAllocations._sum.amount || 0);

  const unallocatedDebit = sub(debitEntry.amount, allocatedDebit);
  const unallocatedCredit = sub(creditEntry.amount, allocatedCredit);

  if (allocAmt.gt(unallocatedDebit)) {
    throw new ApiError(400, `Allocation ₹${allocAmt} exceeds unallocated debit ₹${unallocatedDebit}`);
  }
  if (allocAmt.gt(unallocatedCredit)) {
    throw new ApiError(400, `Allocation ₹${allocAmt} exceeds unallocated credit ₹${unallocatedCredit}`);
  }

  return tx.customerLedgerAllocation.create({
    data: {
      shopId,
      customerId,
      debitEntryId,
      creditEntryId,
      amount: allocAmt,
      createdById,
      clientMutationId: clientMutationId || null,
    },
  });
}

/**
 * Immutable reversal of all active allocations referencing a ledger entry.
 */
export async function reverseLedgerAllocations(tx, { shopId, entryId, createdById, reason }) {
  const active = await tx.customerLedgerAllocation.findMany({
    where: {
      shopId,
      reversedAt: null,
      OR: [{ debitEntryId: entryId }, { creditEntryId: entryId }],
    },
  });

  const results = [];
  for (const alloc of active) {
    const now = new Date();
    await tx.customerLedgerAllocation.update({
      where: { id: alloc.id },
      data: { reversedAt: now },
    });
    const reversal = await tx.customerLedgerAllocation.create({
      data: {
        shopId: alloc.shopId,
        customerId: alloc.customerId,
        debitEntryId: alloc.debitEntryId,
        creditEntryId: alloc.creditEntryId,
        amount: alloc.amount,
        createdById,
        reversalOfId: alloc.id,
        reversedAt: now,
        clientMutationId: `rev-alloc:${alloc.id}`,
      },
    });
    results.push(reversal);
  }
  return results;
}

export async function getCustomerLedger(user, customerId, filters = {}) {
  const {
    shopId,
    cursor,
    limit = 20,
    from,
    to,
    direction,
    entryType,
    sourceType,
    search,
  } = filters;

  await assertShopAccess(user, shopId);

  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new ApiError(404, "Customer not found");

  let cursorEffectiveAt = null;
  let cursorId = null;
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, "base64").toString("utf-8");
      const [effStr, idStr] = decoded.split("::");
      if (!effStr || !idStr) throw new Error("bad format");
      const parsed = new Date(effStr);
      if (Number.isNaN(parsed.getTime())) throw new Error("bad date");
      cursorEffectiveAt = parsed;
      cursorId = idStr;
    } catch {
      throw new ApiError(400, "Invalid pagination cursor");
    }
  }

  if (direction && !VALID_DIRECTIONS.has(direction)) {
    throw new ApiError(400, `Invalid direction: ${direction}`);
  }
  if (entryType && !VALID_ENTRY_TYPES.has(entryType)) {
    throw new ApiError(400, `Invalid entryType: ${entryType}`);
  }
  if (sourceType && !VALID_SOURCE_TYPES.has(sourceType)) {
    throw new ApiError(400, `Invalid sourceType: ${sourceType}`);
  }
  if (search && String(search).length > 100) {
    throw new ApiError(400, "Search term too long");
  }
  if (from && to && new Date(from) > new Date(to)) {
    throw new ApiError(400, "from must be before or equal to to");
  }

  const displayConditions = [
    Prisma.sql`entry."customerId" = ${customerId}`,
    Prisma.sql`entry."shopId" = ${shopId}`,
  ];
  if (from) displayConditions.push(Prisma.sql`entry."effectiveAt" >= ${new Date(from)}`);
  if (to) displayConditions.push(Prisma.sql`entry."effectiveAt" <= ${new Date(to)}`);
  if (direction) displayConditions.push(Prisma.sql`entry.direction = ${direction}::\"CustomerLedgerDirection\"`);
  if (entryType) displayConditions.push(Prisma.sql`entry."entryType" = ${entryType}::\"CustomerLedgerEntryType\"`);
  if (sourceType) displayConditions.push(Prisma.sql`entry."sourceType" = ${sourceType}::\"CustomerLedgerSourceType\"`);
  if (search) displayConditions.push(Prisma.sql`(entry.notes ILIKE ${`%${search}%`} OR entry."sourceId" ILIKE ${`%${search}%`})`);

  const displayWhereSql = Prisma.sql`WHERE ${Prisma.join(displayConditions, " AND ")}`;

  const cursorSql = cursorEffectiveAt && cursorId
    ? Prisma.sql`WHERE ("effectiveAt", id) < (${cursorEffectiveAt}, ${cursorId})`
    : Prisma.empty;

  const rawRows = await prisma.$queryRaw`
    WITH full_ledger AS (
      SELECT
        entry.id,
        entry."shopId",
        entry."customerId",
        entry."sourceType",
        entry."sourceId",
        entry."entryType",
        entry.direction,
        entry.amount,
        entry."createdById",
        entry."reversalOfId",
        entry."idempotencyKey",
        entry."clientMutationId",
        entry."reversalReason",
        entry.notes,
        entry.metadata,
        entry."effectiveAt",
        entry."createdAt",
        entry."updatedAt",
        SUM(CASE WHEN entry.direction = 'DEBIT' THEN entry.amount ELSE -entry.amount END)
          OVER (PARTITION BY entry."customerId" ORDER BY entry."effectiveAt" ASC, entry.id ASC)
          AS "runningBalance"
      FROM "CustomerLedgerEntry" entry
      WHERE entry."customerId" = ${customerId} AND entry."shopId" = ${shopId}
    ),
    filtered_ledger AS (
      SELECT entry.*, full_ledger."runningBalance"
      FROM "CustomerLedgerEntry" entry
      JOIN full_ledger ON full_ledger.id = entry.id
      ${displayWhereSql}
    )
    SELECT * FROM filtered_ledger
    ${cursorSql}
    ORDER BY "effectiveAt" DESC, id DESC
    LIMIT ${take + 1};
  `;

  const hasMore = rawRows.length > take;
  const items = hasMore ? rawRows.slice(0, take) : rawRows;

  const entryIds = items.map((r) => r.id);
  const attachments = entryIds.length > 0
    ? await prisma.customerLedgerAttachment.findMany({
        where: { ledgerEntryId: { in: entryIds } },
        include: { asset: true },
      })
    : [];

  const attachmentMap = new Map();
  attachments.forEach((att) => {
    if (!attachmentMap.has(att.ledgerEntryId)) attachmentMap.set(att.ledgerEntryId, []);
    attachmentMap.get(att.ledgerEntryId).push(att);
  });

  // Reversal status across pages: query reversals for displayed originals
  const originalIds = items.filter((r) => !r.reversalOfId).map((r) => r.id);
  const reversals = originalIds.length > 0
    ? await prisma.customerLedgerEntry.findMany({
        where: { reversalOfId: { in: originalIds } },
        select: { id: true, reversalOfId: true, reversalReason: true },
      })
    : [];
  const reversalByOriginal = new Map(reversals.map((r) => [r.reversalOfId, r]));

  const formattedEntries = items.map((row) => {
    const reversal = reversalByOriginal.get(row.id);
    return {
      id: row.id,
      shopId: row.shopId,
      customerId: row.customerId,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      entryType: row.entryType,
      direction: row.direction,
      amount: Number(row.amount),
      debit: row.direction === "DEBIT" ? Number(row.amount) : 0,
      credit: row.direction === "CREDIT" ? Number(row.amount) : 0,
      runningBalance: Number(row.runningBalance),
      createdById: row.createdById,
      reversalOfId: row.reversalOfId,
      isReversal: Boolean(row.reversalOfId),
      isReversed: Boolean(reversal),
      reversalEntryId: reversal?.id || null,
      reversalReason: reversal?.reversalReason || row.reversalReason || null,
      notes: row.notes,
      metadata: row.metadata,
      effectiveAt: row.effectiveAt,
      createdAt: row.createdAt,
      attachments: attachmentMap.get(row.id) || [],
    };
  });

  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = Buffer.from(`${new Date(lastItem.effectiveAt).toISOString()}::${lastItem.id}`).toString("base64");
  }

  const summary = await getCustomerLedgerSummary(user, customerId, { shopId, from, to });

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      type: customer.type,
      outstandingAmount: Number(customer.outstandingAmount),
      advanceBalance: Number(customer.advanceBalance),
      creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
      ledgerVersion: customer.ledgerVersion,
    },
    summary,
    entries: formattedEntries,
    nextCursor,
    hasMore,
  };
}

export async function getCustomerLedgerSummary(user, customerId, { shopId, from, to } = {}) {
  await assertShopAccess(user, shopId);

  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new ApiError(404, "Customer not found");

  if (from && to && new Date(from) > new Date(to)) {
    throw new ApiError(400, "from must be before or equal to to");
  }

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  let openingBalance = 0;
  if (fromDate) {
    const openingTotals = await prisma.customerLedgerEntry.groupBy({
      by: ["direction"],
      where: { customerId, shopId, effectiveAt: { lt: fromDate } },
      _sum: { amount: true },
    });
    let openingDebits = 0;
    let openingCredits = 0;
    openingTotals.forEach((t) => {
      if (t.direction === "DEBIT") openingDebits = Number(t._sum.amount || 0);
      if (t.direction === "CREDIT") openingCredits = Number(t._sum.amount || 0);
    });
    openingBalance = openingDebits - openingCredits;
  }

  const periodWhere = {
    customerId,
    shopId,
    ...(fromDate || toDate
      ? {
          effectiveAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const periodTotals = await prisma.customerLedgerEntry.groupBy({
    by: ["direction"],
    where: periodWhere,
    _sum: { amount: true },
  });

  let periodDebits = 0;
  let periodCredits = 0;
  periodTotals.forEach((t) => {
    if (t.direction === "DEBIT") periodDebits = Number(t._sum.amount || 0);
    if (t.direction === "CREDIT") periodCredits = Number(t._sum.amount || 0);
  });

  const closingBalance = openingBalance + periodDebits - periodCredits;

  return {
    customerId,
    from: fromDate ? fromDate.toISOString() : null,
    to: toDate ? toDate.toISOString() : null,
    openingBalance,
    periodDebits,
    periodCredits,
    closingBalance,
    outstandingAmount: Math.max(closingBalance, 0),
    advanceBalance: Math.max(-closingBalance, 0),
  };
}

export async function getCustomerLedgerStatement(user, customerId, { shopId, from, to }) {
  await assertShopAccess(user, shopId);

  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new ApiError(404, "Customer not found");

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new ApiError(404, "Shop not found");

  if (!from || !to) throw new ApiError(400, "Both from and to dates are required for a statement");

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new ApiError(400, "Invalid from or to date");
  }
  if (fromDate > toDate) throw new ApiError(400, "from must be before to");

  const summary = await getCustomerLedgerSummary(user, customerId, { shopId, from, to });

  const periodEntries = await prisma.customerLedgerEntry.findMany({
    where: { customerId, shopId, effectiveAt: { gte: fromDate, lte: toDate } },
    orderBy: [{ effectiveAt: "asc" }, { id: "asc" }],
    include: { ledgerAttachments: { include: { asset: true } } },
  });

  let running = summary.openingBalance;
  const entries = periodEntries.map((e) => {
    const amt = Number(e.amount);
    if (e.direction === "DEBIT") running += amt;
    else running -= amt;
    return {
      id: e.id,
      entryType: e.entryType,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      direction: e.direction,
      amount: amt,
      debit: e.direction === "DEBIT" ? amt : 0,
      credit: e.direction === "CREDIT" ? amt : 0,
      runningBalance: running,
      notes: e.notes,
      effectiveAt: e.effectiveAt,
      attachments: e.ledgerAttachments,
    };
  });

  return {
    shop: {
      id: shop.id,
      name: shop.name,
      address: shop.address,
      phone: shop.phone,
      gstin: shop.gstin,
      city: shop.city,
    },
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      type: customer.type,
      address: customer.address,
      gstin: customer.gstin,
    },
    dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
    openingBalance: summary.openingBalance,
    periodDebits: summary.periodDebits,
    periodCredits: summary.periodCredits,
    closingBalance: summary.closingBalance,
    outstandingAmount: summary.outstandingAmount,
    advanceBalance: summary.advanceBalance,
    entries,
  };
}

export async function postOpeningBalance(tx, input) {
  const {
    shopId,
    customerId,
    amount,
    direction,
    createdById,
    effectiveAt,
    notes,
    attachmentAssetIds,
    clientMutationId,
    idempotencyKey,
  } = input;

  if (clientMutationId) {
    const byMutation = await tx.customerLedgerEntry.findFirst({
      where: { shopId, clientMutationId },
      include: { ledgerAttachments: { include: { asset: true } } },
    });
    if (byMutation) {
      assertIdempotencyPayloadMatch(byMutation, {
        customerId,
        sourceType: "OPENING_BALANCE",
        sourceId: customerId,
        entryType: direction === "DEBIT" ? "OPENING_RECEIVABLE" : "OPENING_ADVANCE",
        direction,
        amount: Number(amount),
      });
      const currentCustomer = await tx.customer.findUnique({ where: { id: customerId } });
      return { entry: byMutation, customer: currentCustomer, isDuplicate: true };
    }
  }

  const existing = await tx.customerLedgerEntry.findFirst({
    where: {
      shopId,
      customerId,
      sourceType: CustomerLedgerSourceType.OPENING_BALANCE,
    },
  });
  if (existing) {
    throw new ApiError(409, "Opening balance has already been set for this customer. Use a manual adjustment to correct it.", {
      code: "OPENING_BALANCE_EXISTS",
    });
  }

  const entryType = direction === "DEBIT"
    ? CustomerLedgerEntryType.OPENING_RECEIVABLE
    : CustomerLedgerEntryType.OPENING_ADVANCE;

  return postLedgerEntry(tx, {
    shopId,
    customerId,
    sourceType: CustomerLedgerSourceType.OPENING_BALANCE,
    sourceId: customerId,
    entryType,
    direction,
    amount,
    createdById,
    effectiveAt: effectiveAt || new Date(),
    notes: notes || (direction === "DEBIT" ? "Opening receivable balance" : "Opening advance balance"),
    attachmentAssetIds: attachmentAssetIds || [],
    clientMutationId,
    idempotencyKey,
  });
}

export async function postManualAdjustment(tx, input) {
  const {
    shopId,
    customerId,
    amount,
    direction,
    reason,
    createdById,
    effectiveAt,
    attachmentAssetIds,
    clientMutationId,
    idempotencyKey,
  } = input;

  if (!reason || !String(reason).trim()) {
    throw new ApiError(400, "Adjustment reason is mandatory");
  }

  const entryType = direction === "DEBIT"
    ? CustomerLedgerEntryType.ADJUSTMENT_DEBIT
    : CustomerLedgerEntryType.ADJUSTMENT_CREDIT;

  const sourceId = clientMutationId || idempotencyKey || `adj:${customerId}:${Date.now()}`;

  return postLedgerEntry(tx, {
    shopId,
    customerId,
    sourceType: CustomerLedgerSourceType.MANUAL_ADJUSTMENT,
    sourceId,
    entryType,
    direction,
    amount,
    createdById,
    effectiveAt: effectiveAt || new Date(),
    notes: reason.trim(),
    attachmentAssetIds: attachmentAssetIds || [],
    clientMutationId,
    idempotencyKey,
    metadata: { reason: reason.trim() },
  });
}
