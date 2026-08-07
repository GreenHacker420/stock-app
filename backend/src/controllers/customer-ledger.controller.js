import { ApiError } from "../utils/ApiError.js";
import { money } from "../utils/money.js";
import {
  postOpeningBalance,
  postManualAdjustment,
  reverseLedgerEntry,
  getCustomerLedger,
  getCustomerLedgerSummary,
  getCustomerLedgerStatement,
} from "../services/customer-ledger.service.js";
import prisma from "../lib/db.js";
import { assertShopAccess } from "../middleware/shopAccess.middleware.js";

export async function setOpeningBalance(req, res) {
  const { id: customerId } = req.params;
  const user = req.user;

  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required to set opening balance");

  const body = req.validated?.body || req.body;
  const {
    shopId,
    amount,
    direction,
    notes,
    attachmentAssetIds,
    effectiveAt,
    clientMutationId,
  } = body;

  if (!amount || Number(amount) <= 0) throw new ApiError(400, "amount must be a positive number");
  if (!direction || !["DEBIT", "CREDIT"].includes(direction)) {
    throw new ApiError(400, "direction must be DEBIT (receivable) or CREDIT (advance)");
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new ApiError(404, "Customer not found");
  const resolvedShopId = shopId || customer.shopId;
  await assertShopAccess(user, resolvedShopId);
  if (customer.shopId !== resolvedShopId) throw new ApiError(403, "Customer does not belong to this shop");
  if (customer.type === "WALK_IN") throw new ApiError(400, "Walk-in customers cannot have an opening balance");

  const result = await prisma.$transaction(async (tx) => {
    return postOpeningBalance(tx, {
      shopId: resolvedShopId,
      customerId,
      amount: money(amount),
      direction,
      createdById: user.id,
      effectiveAt: effectiveAt ? new Date(effectiveAt) : new Date(),
      notes,
      attachmentAssetIds: attachmentAssetIds || [],
      clientMutationId,
    });
  });

  res.status(result.isDuplicate ? 200 : 201).json({
    success: true,
    entry: result.entry,
    customer: {
      id: result.customer.id,
      name: result.customer.name,
      outstandingAmount: Number(result.customer.outstandingAmount),
      advanceBalance: Number(result.customer.advanceBalance),
      ledgerVersion: result.customer.ledgerVersion,
    },
    isDuplicate: Boolean(result.isDuplicate),
  });
}

export async function postLedgerAdjustment(req, res) {
  const { id: customerId } = req.params;
  const user = req.user;
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required for manual adjustments");

  const body = req.validated?.body || req.body;
  const {
    shopId,
    amount,
    direction,
    reason,
    attachmentAssetIds,
    effectiveAt,
    clientMutationId,
  } = body;

  if (!amount || Number(amount) <= 0) throw new ApiError(400, "amount must be a positive number");
  if (!direction || !["DEBIT", "CREDIT"].includes(direction)) {
    throw new ApiError(400, "direction must be DEBIT or CREDIT");
  }
  if (!reason || !String(reason).trim()) throw new ApiError(400, "reason is mandatory");

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new ApiError(404, "Customer not found");
  const resolvedShopId = shopId || customer.shopId;
  await assertShopAccess(user, resolvedShopId);
  if (customer.shopId !== resolvedShopId) throw new ApiError(403, "Customer does not belong to this shop");
  if (customer.type === "WALK_IN") throw new ApiError(400, "Walk-in customers cannot receive ledger adjustments");

  const result = await prisma.$transaction(async (tx) => {
    return postManualAdjustment(tx, {
      shopId: resolvedShopId,
      customerId,
      amount: money(amount),
      direction,
      reason,
      createdById: user.id,
      effectiveAt: effectiveAt ? new Date(effectiveAt) : new Date(),
      attachmentAssetIds: attachmentAssetIds || [],
      clientMutationId,
    });
  });

  res.status(result.isDuplicate ? 200 : 201).json({
    success: true,
    entry: result.entry,
    customer: {
      id: result.customer.id,
      name: result.customer.name,
      outstandingAmount: Number(result.customer.outstandingAmount),
      advanceBalance: Number(result.customer.advanceBalance),
      ledgerVersion: result.customer.ledgerVersion,
    },
    isDuplicate: Boolean(result.isDuplicate),
  });
}

export async function reverseCustomerLedgerEntry(req, res) {
  const { id: customerId, entryId } = req.params;
  const user = req.user;
  if (user.role !== "OWNER") throw new ApiError(403, "Owner access required to reverse ledger entries");

  const body = req.validated?.body || req.body;
  const { shopId, reversalReason } = body;
  if (!reversalReason || !String(reversalReason).trim()) {
    throw new ApiError(400, "reversalReason is mandatory");
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new ApiError(404, "Customer not found");
  const resolvedShopId = shopId || customer.shopId;
  await assertShopAccess(user, resolvedShopId);
  if (customer.shopId !== resolvedShopId) throw new ApiError(403, "Customer does not belong to this shop");

  const entry = await prisma.customerLedgerEntry.findFirst({
    where: { id: entryId, customerId, shopId: resolvedShopId },
  });
  if (!entry) throw new ApiError(404, "Ledger entry not found for this customer");

  const result = await prisma.$transaction(async (tx) => {
    return reverseLedgerEntry(tx, {
      shopId: resolvedShopId,
      entryId,
      reversalReason: String(reversalReason).trim(),
      createdById: user.id,
    });
  });

  res.status(201).json({
    success: true,
    reversalEntry: result.reversalEntry,
    customer: {
      id: result.customer.id,
      name: result.customer.name,
      outstandingAmount: Number(result.customer.outstandingAmount),
      advanceBalance: Number(result.customer.advanceBalance),
      ledgerVersion: result.customer.ledgerVersion,
    },
  });
}

export async function getLedger(req, res) {
  const { id: customerId } = req.params;
  const query = req.validated?.query || req.query;
  const shopId = query.shopId;
  if (!shopId) throw new ApiError(400, "shopId is required");

  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new ApiError(404, "Customer not found");

  const data = await getCustomerLedger(req.user, customerId, {
    shopId,
    cursor: query.cursor,
    limit: query.limit,
    from: query.from,
    to: query.to,
    direction: query.direction,
    entryType: query.entryType,
    sourceType: query.sourceType,
    search: query.search,
  });

  res.json({ success: true, data });
}

export async function getLedgerSummary(req, res) {
  const { id: customerId } = req.params;
  const query = req.validated?.query || req.query;
  const shopId = query.shopId;
  if (!shopId) throw new ApiError(400, "shopId is required");

  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new ApiError(404, "Customer not found");

  const summary = await getCustomerLedgerSummary(req.user, customerId, {
    shopId,
    from: query.from,
    to: query.to,
  });
  res.json({ success: true, data: summary });
}

export async function getLedgerStatement(req, res) {
  const { id: customerId } = req.params;
  const query = req.validated?.query || req.query;
  const { shopId, from, to } = query;

  if (!shopId) throw new ApiError(400, "shopId is required");
  if (!from || !to) throw new ApiError(400, "Both from and to query parameters are required");

  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new ApiError(404, "Customer not found");

  const statement = await getCustomerLedgerStatement(req.user, customerId, {
    shopId,
    from,
    to,
  });

  res.json({ success: true, data: statement });
}
