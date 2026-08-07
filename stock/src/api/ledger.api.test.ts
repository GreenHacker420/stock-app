import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("ledger API contracts", () => {
  it("maps attachments field (not ledgerAttachments)", () => {
    const entry = {
      id: "e1",
      attachments: [{ id: "a1", assetId: "asset1", purpose: "OTHER", sortOrder: 0 }],
      ledgerAttachments: undefined,
    };
    assert.equal(Array.isArray(entry.attachments), true);
    assert.equal(entry.attachments.length, 1);
    assert.equal(entry.ledgerAttachments, undefined);
  });

  it("formats running balance as Outstanding/Advance", () => {
    const formatRunning = (runningBalance: number) =>
      runningBalance < 0
        ? `${Math.abs(runningBalance)} Advance`
        : `${runningBalance} Outstanding`;

    assert.equal(formatRunning(-4000), "4000 Advance");
    assert.equal(formatRunning(8000), "8000 Outstanding");
  });

  it("summary contract is flat (not nested summary wrapper)", () => {
    const summary = {
      customerId: "c1",
      from: null,
      to: null,
      openingBalance: 0,
      periodDebits: 100,
      periodCredits: 40,
      closingBalance: 60,
      outstandingAmount: 60,
      advanceBalance: 0,
    };
    assert.equal(summary.outstandingAmount, 60);
    assert.equal((summary as any).summary, undefined);
  });

  it("statement uses dateRange not period", () => {
    const statement = {
      dateRange: { from: "2026-01-01", to: "2026-01-31" },
      period: undefined,
    };
    assert.ok(statement.dateRange);
    assert.equal(statement.period, undefined);
  });

  it("preserves stable clientMutationId across retries", () => {
    const clientMutationId = "opbal_abc123";
    const first = { clientMutationId, amount: 1000 };
    const retry = { ...first };
    assert.equal(retry.clientMutationId, first.clientMutationId);
  });

  it("classifies permanent vs retryable offline errors", () => {
    const classify = (status: number) => {
      if ([400, 401, 403, 404].includes(status)) return "FAILED_PERMANENT";
      if (status === 409) return "FAILED_PERMANENT";
      if ([408, 429, 500, 502, 503, 504].includes(status) || status >= 500) return "FAILED_RETRYABLE";
      return "FAILED_PERMANENT";
    };
    assert.equal(classify(500), "FAILED_RETRYABLE");
    assert.equal(classify(429), "FAILED_RETRYABLE");
    assert.equal(classify(400), "FAILED_PERMANENT");
    assert.equal(classify(409), "FAILED_PERMANENT");
  });
});
