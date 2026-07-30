import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Embedded Signup isolates webhook routing at the phone-number level", async () => {
  const source = await readFile(
    new URL("../services/whatsapp.onboarding.service.js", import.meta.url),
    "utf8",
  );

  const appSubscription = source.match(
    /if \(!steps\.has\("APP_SUBSCRIBED"\)\) \{([\s\S]*?)steps\.add\("APP_SUBSCRIBED"\)/,
  )?.[1];
  assert.ok(appSubscription, "APP_SUBSCRIBED onboarding step is missing");
  assert.match(appSubscription, /graphPost\(`\$\{session\.wabaId\}\/subscribed_apps`, accessToken\)/);
  assert.doesNotMatch(
    appSubscription,
    /override_callback_uri|verify_token/,
    "WABA subscription must not override callbacks for every number in the WABA",
  );

  const phoneOverride = source.match(
    /if \(!steps\.has\("PHONE_WEBHOOK_CONFIGURED"\)\) \{([\s\S]*?)steps\.add\("PHONE_WEBHOOK_CONFIGURED"\)/,
  )?.[1];
  assert.ok(phoneOverride, "PHONE_WEBHOOK_CONFIGURED onboarding step is missing");
  assert.match(phoneOverride, /graphPost\(session\.phoneNumberId, accessToken/);
  assert.match(phoneOverride, /webhook_configuration/);
  assert.match(phoneOverride, /override_callback_uri: `\$\{publicApiBase\(\)\}\/whatsapp\/webhook`/);
  assert.match(phoneOverride, /verify_token: session\.verifyToken/);
});
