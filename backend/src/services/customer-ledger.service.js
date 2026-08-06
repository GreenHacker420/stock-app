import { Prisma, CustomerLedgerEntryType, CustomerLedgerDirection, CustomerLedgerSourceType } from "../generated/prisma/index.js";
import prisma from "../lib/db.js";
import { ApiError } from "../utils/ApiError.js";
import { money, add, sub } from "../utils/money.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";


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

  // 1. Lock customer row for update
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

  // 2. Idempotency: check for duplicate entry
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
    const currentCustomer = await tx.customer.findUnique({ where: { id: customerId } });
    return {
      entry: existingEntry,
      customer: currentCustomer,
      isDuplicate: true,
    };
  }

  // 3. Validate attachments if provided
  if (attachmentAssetIds && attachmentAssetIds.length > 0) {
    for (const item of attachmentAssetIds) {
      const assetId = typeof item === "string" ? item : item.assetId;
      const asset = await tx.asset.findFirst({ where: { id: assetId, shopId } });
      if (!asset) throw new ApiError(400, `Asset ${assetId} not found`);
      if (asset.status !== "READY") throw new ApiError(400, `Asset ${assetId} is not ready (status: ${asset.status})`);
    }
  }

  // 4. Create immutable CustomerLedgerEntry
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

  // 5. Create attachments
  if (attachmentAssetIds && attachmentAssetIds.length > 0) {
    for (let i = 0; i < attachmentAssetIds.length; i++) {
      const item = attachmentAssetIds[i];
      const assetId = typeof item === "string" ? item : item.assetId;
      const purpose = (typeof item === "object" && item.purpose) ? item.purpose : "OTHER";
      const sortOrder = (typeof item === "object" && typeof item.sortOrder === "number") ? item.sortOrder : i;
      await tx.customerLedgerAttachment.create({
        data: { shopId, ledgerEntryId: createdEntry.id, assetId, purpose, sortOrder },
      });
    }
  }

  // 6. Compute new net balance from the row-locked cached state
  const currentNet = sub(customer.outstandingAmount, customer.advanceBalance);
  const delta = direction === "DEBIT" ? amtDecimal : sub(0, amtDecimal);
  const newNet = add(currentNet, delta);

  const newOutstanding = newNet.gt(0) ? newNet : money(0);
  const newAdvance = newNet.lt(0) ? sub(0, newNet) : money(0);
  const newVersion = (Number(customer.ledgerVersion) || 0) + 1;

  // 7. Update Customer cached balances and version
  const updatedCustomer = await tx.customer.update({
    where: { id: customerId },
    data: { outstandingAmount: newOutstanding, advanceBalance: newAdvance, ledgerVersion: newVersion },
  });

  // 8. Process allocations
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

  // 9. Audit Log
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

  const fullEntry = await tx.customerLedgerEntry.findUnique({
    where: { id: createdEntry.id },
    include: { ledgerAttachments: { include: { asset: true } }, debitAllocations: true, creditAllocations: true },
  });

  return { entry: fullEntry, customer: updatedCustomer, isDuplicate: false };
}

// ---------------------------------------------------------------------------
// reverseLedgerEntry
// ---------------------------------------------------------------------------

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

  // Row-lock customer
  const customerRows = await tx.$queryRaw`
    SELECT * FROM "Customer" WHERE "id" = ${originalEntry.customerId} AND "shopId" = ${shopId} FOR UPDATE
  `;
  const customer = customerRows[0];
  if (!customer) throw new ApiError(404, "Customer not found");

  // Create the reversal entry — sourceId is the original entry id, not the original source entity
  const reversalEntry = await tx.customerLedgerEntry.create({
    data: {
      shopId,
      customerId: originalEntry.customerId,
      sourceType: CustomerLedgerSourceType.REVERSAL,
      sourceId: originalEntry.id,  // CRITICAL: entry id, not originalEntry.sourceId
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

  // Compute balance adjustment
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

  return { reversalEntry, customer: updatedCustomer };
}

// ---------------------------------------------------------------------------
// insertReconciliationEntryWithoutBalanceMutation
// ---------------------------------------------------------------------------

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

  // Re-read cached state and write it back unchanged (bump version only)
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

// ---------------------------------------------------------------------------
// allocateLedgerCredit  (concurrency-safe, immutable rows)
// ---------------------------------------------------------------------------

export async function allocateLedgerCredit(tx, input) {
  const { shopId, customerId, debitEntryId, creditEntryId, amount, createdById, clientMutationId } = input;

  const amtNum = Number(amount);
  if (!Number.isFinite(amtNum) || amtNum <= 0) throw new ApiError(400, "Allocation amount must be greater than zero");
  const allocAmt = money(amtNum);

  if (debitEntryId === creditEntryId) throw new ApiError(400, "Cannot allocate a debit entry to itself");

  // Idempotency: return existing allocation on retry
  if (clientMutationId) {
    const existing = await tx.customerLedgerAllocation.findFirst({ where: { shopId, clientMutationId } });
    if (existing) return existing;
  }

  // Row-lock both entries in deterministic order to prevent deadlocks
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

  // Re-validate unallocated capacity
  const [existingDebitAllocations, existingCreditAllocations] = await Promise.all([
    tx.customerLedgerAllocation.aggregate({ where: { debitEntryId }, _sum: { amount: true } }),
    tx.customerLedgerAllocation.aggregate({ where: { creditEntryId }, _sum: { amount: true } }),
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

  // Create immutable allocation row
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

// ---------------------------------------------------------------------------
// getCustomerLedger
// ---------------------------------------------------------------------------

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

  // Authorization
  await assertShopAccess(user, shopId);

  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);

  // Validate customer belongs to shop
  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new ApiError(404, "Customer not found");

  // Parse cursor
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

  // Validate direction enum
  if (direction && !["DEBIT", "CREDIT"].includes(direction)) {
    throw new ApiError(400, `Invalid direction: ${direction}`);
  }

  // Build display filter conditions for the outer CTE
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

  const cursorSql = (cursorEffectiveAt && cursorId)
    ? Prisma.sql`WHERE ("effectiveAt", id) < (${cursorEffectiveAt}, ${cursorId})`
    : Prisma.empty;

  // CTE: compute running balance over ALL customer entries (not filtered)
  // then filter + paginate in outer query.
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

  // Enrich with attachments
  const entryIds = items.map((r) => r.id);
  const attachments = entryIds.length > 0 ? await prisma.customerLedgerAttachment.findMany({
    where: { ledgerEntryId: { in: entryIds } },
    include: { asset: true },
  }) : [];

  const attachmentMap = new Map();
  attachments.forEach((att) => {
    if (!attachmentMap.has(att.ledgerEntryId)) attachmentMap.set(att.ledgerEntryId, []);
    attachmentMap.get(att.ledgerEntryId).push(att);
  });

  // Collect all reversal entry IDs so we can mark originals as "reversed"
  const reversedEntryIds = new Set(
    items.filter((r) => r.reversalOfId).map((r) => r.reversalOfId)
  );

  const formattedEntries = items.map((row) => ({
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
    isReversed: reversedEntryIds.has(row.id),
    reversalReason: row.reversalReason,
    notes: row.notes,
    metadata: row.metadata,
    effectiveAt: row.effectiveAt,
    createdAt: row.createdAt,
    attachments: attachmentMap.get(row.id) || [],
  }));

  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = Buffer.from(`${new Date(lastItem.effectiveAt).toISOString()}::${lastItem.id}`).toString("base64");
  }

  const summary = await getCustomerLedgerSummary(user, customerId, { shopId });

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      type: customer.type,
      outstandingAmount: Number(customer.outstandingAmount),
      advanceBalance: Number(customer.advanceBalance),
      creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
    },
    summary,
    entries: formattedEntries,
    nextCursor,
  };
}

// ---------------------------------------------------------------------------
// getCustomerLedgerSummary
// ---------------------------------------------------------------------------
export async function getCustomerLedgerSummary(user, customerId, { shopId }) {
  await assertShopAccess(user, shopId);

  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new ApiError(404, "Customer not found");

  const totals = await prisma.customerLedgerEntry.groupBy({
    by: ["direction"],
    where: { customerId, shopId },
    _sum: { amount: true },
  });

  let totalDebits = 0;
  let totalCredits = 0;
  totals.forEach((t) => {
    if (t.direction === "DEBIT") totalDebits = Number(t._sum.amount || 0);
    if (t.direction === "CREDIT") totalCredits = Number(t._sum.amount || 0);
  });

  const netBalance = totalDebits - totalCredits;
  const outstandingAmount = Math.max(netBalance, 0);
  const advanceBalance = Math.max(-netBalance, 0);

  return {
    openingBalance: 0,
    periodDebits: totalDebits,
    periodCredits: totalCredits,
    closingBalance: netBalance,
    outstandingAmount,
    advanceBalance,
  };
}

// ---------------------------------------------------------------------------
// getCustomerLedgerStatement
// ---------------------------------------------------------------------------

export async function getCustomerLedgerStatement(user, customerId, { shopId, from, to }) {
  await assertShopAccess(user, shopId);

  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new ApiError(404, "Customer not found");

  if (!from || !to) throw new ApiError(400, "Both from and to dates are required for a statement");

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new ApiError(400, "Invalid from or to date");
  }
  if (fromDate > toDate) throw new ApiError(400, "from must be before to");

  // Opening balance = net before fromDate
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
  const openingBalance = openingDebits - openingCredits;

  // Period entries
  const periodEntries = await prisma.customerLedgerEntry.findMany({
    where: { customerId, shopId, effectiveAt: { gte: fromDate, lte: toDate } },
    orderBy: [{ effectiveAt: "asc" }, { id: "asc" }],
    include: { ledgerAttachments: { include: { asset: true } } },
  });

  let periodDebits = 0;
  let periodCredits = 0;
  let running = openingBalance;

  const entries = periodEntries.map((e) => {
    const amt = Number(e.amount);
    if (e.direction === "DEBIT") { running += amt; periodDebits += amt; }
    else { running -= amt; periodCredits += amt; }
    return {
      id: e.id,
      entryType: e.entryType,
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

  const closingBalance = running;

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      type: customer.type,
    },
    period: { from: fromDate, to: toDate },
    openingBalance,
    periodDebits,
    periodCredits,
    closingBalance,
    outstandingAmount: Math.max(closingBalance, 0),
    advanceBalance: Math.max(-closingBalance, 0),
    entries,
  };
}

// ---------------------------------------------------------------------------
// postOpeningBalance
// ---------------------------------------------------------------------------

export async function postOpeningBalance(tx, input) {
  const { shopId, customerId, amount, direction, createdById, effectiveAt, notes, attachmentAssetIds } = input;

  // Check existing opening balance
  const existing = await tx.customerLedgerEntry.findFirst({
    where: {
      shopId,
      customerId,
      sourceType: CustomerLedgerSourceType.OPENING_BALANCE,
    },
  });
  if (existing) {
    throw new ApiError(409, "Opening balance has already been set for this customer. Use a manual adjustment to correct it.");
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
  });
}
