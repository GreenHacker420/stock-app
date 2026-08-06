import { ApiError } from "../utils/ApiError.js";
import { money } from "../utils/money.js";
import {
  postOpeningBalance,
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

  const { amount, direction, notes, attachmentAssetIds, effectiveAt } = req.body;

  if (!amount || Number(amount) <= 0) throw new ApiError(400, "amount must be a positive number");
  if (!direction || !["DEBIT", "CREDIT"].includes(direction)) {
    throw new ApiError(400, "direction must be DEBIT (receivable) or CREDIT (advance)");
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new ApiError(404, "Customer not found");
  await assertShopAccess(user, customer.shopId);
  if (customer.type === "WALK_IN") throw new ApiError(400, "Walk-in customers cannot have an opening balance");

  const result = await prisma.$transaction(async (tx) => {
    return postOpeningBalance(tx, {
      shopId: customer.shopId,
      customerId,
      amount: money(amount),
      direction,
      createdById: user.id,
      effectiveAt: effectiveAt ? new Date(effectiveAt) : new Date(),
      notes,
      attachmentAssetIds: attachmentAssetIds || [],
    });
  });

  res.status(201).json({
    success: true,
    entry: result.entry,
    customer: {
      id: result.customer.id,
      name: result.customer.name,
      outstandingAmount: Number(result.customer.outstandingAmount),
      advanceBalance: Number(result.customer.advanceBalance),
    },
  });
}


export async function getLedger(req, res) {
  const { id: customerId } = req.params;
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new ApiError(404, "Customer not found");

  const data = await getCustomerLedger(req.user, customerId, {
    shopId: customer.shopId,
    cursor: req.query.cursor,
    limit: req.query.limit,
    from: req.query.from,
    to: req.query.to,
    direction: req.query.direction,
    entryType: req.query.entryType,
    sourceType: req.query.sourceType,
    search: req.query.search,
  });

  res.json(data);
}

export async function getLedgerSummary(req, res) {
  const { id: customerId } = req.params;
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new ApiError(404, "Customer not found");

  const summary = await getCustomerLedgerSummary(req.user, customerId, { shopId: customer.shopId });
  res.json({ customerId, summary });
}


export async function getLedgerStatement(req, res) {
  const { id: customerId } = req.params;
  const { from, to } = req.query;

  if (!from || !to) throw new ApiError(400, "Both from and to query parameters are required");

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new ApiError(404, "Customer not found");

  const statement = await getCustomerLedgerStatement(req.user, customerId, {
    shopId: customer.shopId,
    from,
    to,
  });

  res.json(statement);
}
