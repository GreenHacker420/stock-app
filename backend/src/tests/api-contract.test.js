import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = path.resolve(__dirname, "../routes");
const SRC_DIR = path.resolve(__dirname, "..");

function readRoute(file) {
  return fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");
}

function readSrc(file) {
  return fs.readFileSync(path.join(SRC_DIR, file), "utf8");
}

function assertRoute(src, method, pattern, label) {
  const m = method.toLowerCase();
  const hit = src.includes(pattern);
  assert.ok(hit, `Route missing: ${label} — expected router.${m}("${pattern}")`);
}

// ─── AUTH ────────────────────────────────────────────────────────────────────
test("auth routes contract", () => {
  const src = readRoute("auth.routes.js");
  assertRoute(src, "POST", '"/login"', "POST /auth/login");
  assertRoute(src, "POST", '"/truecaller"', "POST /auth/truecaller");
  assertRoute(src, "POST", '"/truecaller-otp"', "POST /auth/truecaller-otp");
  assertRoute(src, "POST", '"/logout"', "POST /auth/logout");
  assertRoute(src, "POST", '"/refresh"', "POST /auth/refresh");
  assertRoute(src, "GET",  '"/me"', "GET /auth/me");
  assertRoute(src, "PATCH", '"/me"', "PATCH /auth/me");
  assertRoute(src, "GET",  '"/staff"', "GET /auth/staff");
  assertRoute(src, "POST", '"/staff"', "POST /auth/staff");
  assertRoute(src, "PATCH", '"/staff/:id"', "PATCH /auth/staff/:id");
  assertRoute(src, "DELETE", '"/staff/:id"', "DELETE /auth/staff/:id");
});

// ─── SHOPS ───────────────────────────────────────────────────────────────────
test("shop routes contract", () => {
  const src = readRoute("shop.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /shops");
  assertRoute(src, "POST", '"/"', "POST /shops");
  assertRoute(src, "PATCH", '"/:id"', "PATCH /shops/:id");
  assertRoute(src, "POST", '"/:id/assign-staff"', "POST /shops/:id/assign-staff");
  assertRoute(src, "POST", '"/:id/set-opening-stock"', "POST /shops/:id/set-opening-stock");
});

// ─── CUSTOMERS ───────────────────────────────────────────────────────────────
test("customer routes contract", () => {
  const src = readRoute("customer.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /customers");
  assertRoute(src, "POST", '"/"', "POST /customers");
  assertRoute(src, "GET",  '"/:id"', "GET /customers/:id");
  assertRoute(src, "PATCH", '"/:id"', "PATCH /customers/:id");
  assertRoute(src, "DELETE", '"/:id"', "DELETE /customers/:id");
  assertRoute(src, "GET",  '"/:id/outstanding"', "GET /customers/:id/outstanding");
  assertRoute(src, "GET",  '"/:id/timeline"', "GET /customers/:id/timeline");
  assertRoute(src, "GET",  '"/:id/sales"', "GET /customers/:id/sales");
  assertRoute(src, "GET",  '"/:id/payments"', "GET /customers/:id/payments");
  assertRoute(src, "GET",  '"/:id/delivery-memos"', "GET /customers/:id/delivery-memos");
  assertRoute(src, "GET",  '"/:id/returns"', "GET /customers/:id/returns");
  assertRoute(src, "GET",  '"/:id/price-history"', "GET /customers/:id/price-history");
});

// ─── ITEMS ───────────────────────────────────────────────────────────────────
test("item routes contract", () => {
  const src = readRoute("item.routes.js");
  assertRoute(src, "GET",  '"/summary"', "GET /items/summary");
  assertRoute(src, "GET",  '"/categories"', "GET /items/categories");
  assertRoute(src, "POST", '"/categories"', "POST /items/categories");
  assertRoute(src, "PATCH", '"/categories/:id"', "PATCH /items/categories/:id");
  assertRoute(src, "DELETE", '"/categories/:id"', "DELETE /items/categories/:id");
  assertRoute(src, "GET",  '"/"', "GET /items");
  assertRoute(src, "POST", '"/"', "POST /items");
  assertRoute(src, "POST", '"/image"', "POST /items/image");
  assertRoute(src, "PATCH", '"/:id"', "PATCH /items/:id");
  assertRoute(src, "DELETE", '"/:id"', "DELETE /items/:id");
  assertRoute(src, "GET",  '"/:id/stock"', "GET /items/:id/stock");
});

// ─── STOCK ───────────────────────────────────────────────────────────────────
test("stock routes contract", () => {
  const src = readRoute("stock.routes.js");
  assertRoute(src, "GET",  '"/current"', "GET /stock/current");
  assertRoute(src, "GET",  '"/movements"', "GET /stock/movements");
  assertRoute(src, "POST", '"/movements"', "POST /stock/movements");
  assertRoute(src, "POST", '"/entry"', "POST /stock/entry");
});

// ─── SALES ───────────────────────────────────────────────────────────────────
test("sale routes contract", () => {
  const src = readRoute("sale.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /sales");
  assertRoute(src, "GET",  '"/:id"', "GET /sales/:id");
  assertRoute(src, "POST", '"/"', "POST /sales");
  assertRoute(src, "PATCH", '"/:id"', "PATCH /sales/:id");
});

// ─── ORDERS ──────────────────────────────────────────────────────────────────
test("order routes contract", () => {
  const src = readRoute("order.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /orders");
  assertRoute(src, "GET",  '"/:id"', "GET /orders/:id");
  assertRoute(src, "POST", '"/"', "POST /orders");
  assertRoute(src, "POST", '"/:id/confirm"', "POST /orders/:id/confirm");
  assertRoute(src, "POST", '"/:id/assign-staff"', "POST /orders/:id/assign-staff");
  assertRoute(src, "POST", '"/:id/start-packing"', "POST /orders/:id/start-packing");
  assertRoute(src, "POST", '"/:id/mark-item-packed"', "POST /orders/:id/mark-item-packed");
  assertRoute(src, "POST", '"/:id/report-shortage"', "POST /orders/:id/report-shortage");
  assertRoute(src, "POST", '"/:id/add-payment"', "POST /orders/:id/add-payment");
  assertRoute(src, "POST", '"/:id/create-dm"', "POST /orders/:id/create-dm");
  assertRoute(src, "POST", '"/:id/convert-to-sale"', "POST /orders/:id/convert-to-sale");
  assertRoute(src, "POST", '"/:id/cancel"', "POST /orders/:id/cancel");
});

// ─── DELIVERY MEMOS ──────────────────────────────────────────────────────────
test("delivery memo routes contract", () => {
  const src = readRoute("deliveryMemo.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /delivery-memos");
  assertRoute(src, "GET",  '"/:id"', "GET /delivery-memos/:id");
  assertRoute(src, "POST", '"/"', "POST /delivery-memos");
  assertRoute(src, "POST", '"/drafts"', "POST /delivery-memos/drafts");
  assertRoute(src, "PATCH", '"/:id/draft"', "PATCH /delivery-memos/:id/draft");
  assertRoute(src, "POST", '"/:id/post"', "POST /delivery-memos/:id/post");
  assertRoute(src, "POST", '"/:id/convert-to-sale"', "POST /delivery-memos/:id/convert-to-sale");
  assertRoute(src, "GET", '"/:id/timeline"', "GET /delivery-memos/:id/timeline");
  assert.ok(src.includes("customerPhone: z.string().nullish()"), "DM customerPhone must accept nullish mobile payloads");
  assert.ok(src.includes("customerAddress: z.string().nullish()"), "DM customerAddress must accept nullish mobile payloads");
  assert.ok(!src.includes("reason: z.string().optional()"), "DM reason must not remain half-connected in create schema");
});

// ─── PAYMENTS ────────────────────────────────────────────────────────────────
test("payment routes contract", () => {
  const src = readRoute("payment.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /payments");
  assertRoute(src, "GET",  '"/:id"', "GET /payments/:id");
  assertRoute(src, "POST", '"/"', "POST /payments");
  assertRoute(src, "POST", '"/:id/verify"', "POST /payments/:id/verify");
  assertRoute(src, "POST", '"/:id/mark-mismatch"', "POST /payments/:id/mark-mismatch");
  assertRoute(src, "POST", '"/:id/attach"', "POST /payments/:id/attach");
});

// ─── CASH SESSIONS ───────────────────────────────────────────────────────────
test("cash session routes contract", () => {
  const src = readRoute("cashSession.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /cash-sessions");
  assertRoute(src, "GET",  '"/current"', "GET /cash-sessions/current");
  assertRoute(src, "POST", '"/open"', "POST /cash-sessions/open");
  assertRoute(src, "POST", '"/:id/close"', "POST /cash-sessions/:id/close");
  assertRoute(src, "POST", '"/:id/review"', "POST /cash-sessions/:id/review");
});

// ─── EXPENSES ────────────────────────────────────────────────────────────────
test("expense routes contract", () => {
  const src = readRoute("expense.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /expenses");
  assertRoute(src, "POST", '"/"', "POST /expenses");
  assertRoute(src, "POST", '"/:id/verify"', "POST /expenses/:id/verify");
});

// ─── DAILY SUMMARY ───────────────────────────────────────────────────────────
test("daily summary routes contract", () => {
  const src = readRoute("dailySummary.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /daily-summary");
  assertRoute(src, "POST", '"/generate"', "POST /daily-summary/generate");
  assertRoute(src, "POST", '"/lock"', "POST /daily-summary/lock");
  assertRoute(src, "GET",  '"/list"', "GET /daily-summary/list");
  assertRoute(src, "GET",  '"/:id"', "GET /daily-summary/:id");
  assertRoute(src, "POST", '"/:id/lock"', "POST /daily-summary/:id/lock");
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
test("dashboard routes contract", () => {
  const src = readRoute("dashboard.routes.js");
  assertRoute(src, "GET", '"/owner"', "GET /dashboard/owner");
  assertRoute(src, "GET", '"/staff/today"', "GET /dashboard/staff/today");
});

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
test("notification routes contract", () => {
  const src = readRoute("notification.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /notifications");
  assertRoute(src, "POST", '"/mark-all-read"', "POST /notifications/mark-all-read");
  assertRoute(src, "POST", '"/:id/mark-read"', "POST /notifications/:id/mark-read");
});

// ─── APPROVALS ───────────────────────────────────────────────────────────────
test("approval routes contract", () => {
  const src = readRoute("approval.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /approvals");
  assertRoute(src, "POST", '"/:id/respond"', "POST /approvals/:id/respond");
});

// ─── AUDIT LOGS ──────────────────────────────────────────────────────────────
test("audit log routes contract", () => {
  const src = readRoute("auditLog.routes.js");
  assertRoute(src, "GET", '"/"', "GET /audit-logs");
});

// ─── CHEQUES ─────────────────────────────────────────────────────────────────
test("cheque routes contract", () => {
  const src = readRoute("cheque.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /cheques");  // via validate wrapper
  assertRoute(src, "GET",  '"/:id"', "GET /cheques/:id");
  assertRoute(src, "POST", '"/:id/mark-deposited"', "POST /cheques/:id/mark-deposited");
  assertRoute(src, "POST", '"/:id/mark-cleared"', "POST /cheques/:id/mark-cleared");
  assertRoute(src, "POST", '"/:id/mark-bounced"', "POST /cheques/:id/mark-bounced");
  assertRoute(src, "POST", '"/:id/mark-returned"', "POST /cheques/:id/mark-returned");
});

// ─── RATE CHANGE REQUESTS ────────────────────────────────────────────────────
test("rate change routes contract", () => {
  const src = readRoute("rateChange.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /rate-change-requests");
  assertRoute(src, "POST", '"/"', "POST /rate-change-requests");
  assertRoute(src, "POST", '"/:id/approve"', "POST /rate-change-requests/:id/approve");
  assertRoute(src, "POST", '"/:id/reject"', "POST /rate-change-requests/:id/reject");
});

// ─── CORRECTION REQUESTS ─────────────────────────────────────────────────────
test("correction request routes contract", () => {
  const src = readRoute("correction.routes.js");
  assertRoute(src, "GET",  '"/"', "GET /correction-requests");
  assertRoute(src, "POST", '"/"', "POST /correction-requests");
  assertRoute(src, "POST", '"/:id/approve"', "POST /correction-requests/:id/approve");
  assertRoute(src, "POST", '"/:id/reject"', "POST /correction-requests/:id/reject");
});

// ─── SYNC ────────────────────────────────────────────────────────────────────
test("sync routes contract", () => {
  const src = readRoute("sync.routes.js");
  assertRoute(src, "GET", '"/domain-events"', "GET /sync/domain-events");
});

test("production env hardening contract", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalCorsOrigin = process.env.CORS_ORIGIN;
  const { getJwtSecret, getCorsOrigin } = await import("../utils/env.js");

  try {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    delete process.env.CORS_ORIGIN;
    assert.throws(() => getJwtSecret(), /JWT_SECRET is required in production/);
    assert.throws(() => getCorsOrigin(), /CORS_ORIGIN is required in production/);

    process.env.JWT_SECRET = "prod-secret";
    process.env.CORS_ORIGIN = "https://app.example.com";
    assert.strictEqual(getJwtSecret(), "prod-secret");
    assert.strictEqual(getCorsOrigin(), "https://app.example.com");
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    if (originalCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = originalCorsOrigin;
  }
});

test("disabled WhatsApp startup code is not imported eagerly", () => {
  const indexSrc = readSrc("index.js");
  const workersSrc = readSrc("workers/index.js");
  assert.ok(!indexSrc.includes('from "./lib/wa-cache.js"'), "index.js must not import wa-cache eagerly");
  assert.ok(!indexSrc.includes('from "./services/whatsapp.queue.js"'), "index.js must not import WhatsApp queue eagerly");
  assert.ok(indexSrc.includes("WHATSAPP_ENABLED") || indexSrc.includes("isWhatsAppEnabled"), "index.js must gate WhatsApp startup");
  assert.ok(!workersSrc.includes('from "./whatsapp/'), "worker registry must not import WhatsApp workers eagerly");
});

// ─── USERS ───────────────────────────────────────────────────────────────────
test("user device routes contract", () => {
  const src = readRoute("user.routes.js");
  assertRoute(src, "GET",    '"/devices"', "GET /users/devices");
  assertRoute(src, "POST",   '"/devices"', "POST /users/devices");
  assertRoute(src, "POST",   '"/devices/:deviceId/heartbeat"', "POST /users/devices/:deviceId/heartbeat");
  assertRoute(src, "DELETE", '"/devices/:deviceId"', "DELETE /users/devices/:deviceId");
  assertRoute(src, "POST",   '"/push-token"', "POST /users/push-token");
});

// ─── ENUM CONSISTENCY ────────────────────────────────────────────────────────
test("payment mode enum matches backend", () => {
  const paymentSrc = readRoute("payment.routes.js");
  const modes = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"];
  for (const mode of modes) {
    assert.ok(
      paymentSrc.includes(`"${mode}"`) || paymentSrc.includes(`'${mode}'`),
      `PaymentMode ${mode} not found in payment route schema`
    );
  }
});

test("payment status enum matches backend", () => {
  const paymentSrc = readRoute("payment.routes.js");
  const statuses = ["RECORDED", "VERIFIED", "REJECTED", "CANCELLED"];
  for (const status of statuses) {
    assert.ok(
      paymentSrc.includes(`"${status}"`) || paymentSrc.includes(`'${status}'`),
      `PaymentStatus ${status} not found in payment route schema`
    );
  }
});

test("expense status enum matches backend", () => {
  const expenseSrc = readRoute("expense.routes.js");
  assert.ok(expenseSrc.includes('"APPROVED"') || expenseSrc.includes("APPROVED"), "APPROVED not in expense route");
  assert.ok(expenseSrc.includes('"REJECTED"') || expenseSrc.includes("REJECTED"), "REJECTED not in expense route");
});

test("routes index registers all route prefixes", () => {
  const indexSrc = fs.readFileSync(path.join(ROUTES_DIR, "index.js"), "utf8");
  const expectedPrefixes = [
    '"/auth"', '"/users"', '"/shops"', '"/customers"', '"/items"',
    '"/stock"', '"/cash-sessions"', '"/orders"', '"/sales"',
    '"/delivery-memos"', '"/payments"', '"/daily-summary"', '"/daily-summaries"',
    '"/notifications"', '"/approvals"', '"/audit-logs"', '"/cheques"',
    '"/dashboard"', '"/expenses"', '"/rate-change-requests"',
    '"/correction-requests"', '"/sync"',
  ];
  for (const prefix of expectedPrefixes) {
    assert.ok(indexSrc.includes(prefix), `Route prefix ${prefix} not registered in index.js`);
  }
});
