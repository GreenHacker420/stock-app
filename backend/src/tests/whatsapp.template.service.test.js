import test from "node:test";
import assert from "node:assert/strict";
import { compileTemplateDefinition } from "../services/whatsapp.template-compiler.js";

test("compiles a mapped utility template definition", () => {
  const result = compileTemplateDefinition({
    name: "order_ready",
    language: "en_US",
    category: "UTILITY",
    header: {
      format: "TEXT",
      text: "Order {{1}}",
    },
    body: {
      text: "Hello {{1}}, your order {{2}} is ready.",
    },
    footer: {
      text: "ShopControl",
    },
    buttons: [
      {
        type: "URL",
        text: "Track order",
        url: "https://example.com/orders/{{1}}",
        example: "ABC-100",
      },
    ],
    mappings: [
      { component: "HEADER", position: 1, sampleValue: "ABC-100", fallbackValue: "your order" },
      { component: "BODY", position: 1, sampleValue: "Asha", fallbackValue: "Customer" },
      { component: "BODY", position: 2, sampleValue: "ABC-100", fallbackValue: "your order" },
    ],
  });

  assert.equal(result.metaPayload.name, "order_ready");
  assert.deepEqual(result.metaPayload.components[0].example.header_text, ["ABC-100"]);
  assert.deepEqual(result.metaPayload.components[1].example.body_text, [["Asha", "ABC-100"]]);
  assert.equal(result.metaPayload.components[3].buttons[0].type, "URL");
});

test("rejects missing mappings and invalid authentication configuration", () => {
  assert.throws(
    () => compileTemplateDefinition({
      name: "missing_mapping",
      category: "MARKETING",
      body: { text: "Hello {{1}}" },
      mappings: [],
    }),
    /missing body mapping/i,
  );

  assert.throws(
    () => compileTemplateDefinition({
      name: "otp_one_tap",
      category: "AUTHENTICATION",
      body: { text: "{{1}}" },
      authentication: { otpType: "ONE_TAP" },
      mappings: [{ component: "BODY", position: 1, sampleValue: "123456" }],
    }),
    /package name and signature hash/i,
  );
});
