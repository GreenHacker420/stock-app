import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedMounts = [
  "/auth",
  "/users",
  "/shops",
  "/customers",
  "/items",
  "/stock",
  "/cash-sessions",
  "/orders",
  "/sales",
  "/delivery-memos",
  "/payments",
  "/daily-summary",
  "/daily-summaries",
  "/notifications",
  "/approvals",
  "/audit-logs",
  "/cheques",
  "/dashboard",
  "/expenses",
  "/rate-change-requests",
  "/correction-requests",
  "/whatsapp",
];

test("registers every application router through the central route registry", async () => {
  const source = await readFile(new URL("../routes/index.js", import.meta.url), "utf8");

  for (const prefix of expectedMounts) {
    assert.match(source, new RegExp(`\\["${prefix.replaceAll("/", "\\/")}",\\s*\\w+Routes\\]`));
  }
  assert.match(source, /export function mountAppRoutes\(app\)/);
  assert.match(source, /app\.use\(prefix, router\)/);
});

test("registers the complete WhatsApp Embedded Signup route contract", async () => {
  const source = await readFile(new URL("../routes/whatsapp.routes.js", import.meta.url), "utf8");
  const expectedRoutes = [
    ['get', "/onboarding/launch/:sessionId"],
    ['post', "/onboarding/sessions"],
    ['get', "/onboarding/sessions/:sessionId"],
    ['post', "/onboarding/sessions/:sessionId/continue"],
    ['post', "/onboarding/sessions/:sessionId/complete"],
  ];

  for (const [method, path] of expectedRoutes) {
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(source, new RegExp(`router\\.${method}\\(\\s*"${escapedPath}"`), `Missing ${method.toUpperCase()} ${path}`);
  }
});

test("registers only integration-scoped WhatsApp messaging routes", async () => {
  const source = await readFile(new URL("../routes/whatsapp.routes.js", import.meta.url), "utf8");
  assert.match(source, /"\/integrations\/:integrationId\/conversations"/);
  assert.match(source, /"\/integrations\/:integrationId\/conversations\/:conversationId\/messages"/);
  assert.match(source, /whatsappController\.createScopedConversation/);
  assert.doesNotMatch(source, /router\.post\(\s*"\/messages"/);
  assert.doesNotMatch(source, /router\.get\(\s*"\/conversations"/);
  assert.doesNotMatch(source, /router\.post\(\s*"\/react"/);
});
