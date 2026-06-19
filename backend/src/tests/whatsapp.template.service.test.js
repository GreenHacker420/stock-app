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
      { component: "BUTTON", buttonIndex: 0, position: 1, sampleValue: "ABC-100", fallbackValue: "order" },
    ],
  });

  assert.equal(result.metaPayload.name, "order_ready");
  assert.deepEqual(result.metaPayload.components[0].example.header_text, ["ABC-100"]);
  assert.deepEqual(result.metaPayload.components[1].example.body_text, [["Asha", "ABC-100"]]);
  assert.equal(result.metaPayload.components[3].buttons[0].type, "URL");
  assert.deepEqual(result.metaPayload.components[3].buttons[0].example, ["ABC-100"]);
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

test("compiles media carousel cards with card-scoped variables", () => {
  const result = compileTemplateDefinition({
    name: "summer_carousel",
    language: "en_US",
    category: "MARKETING",
    body: { text: "Offers selected for {{1}}" },
    carousel: {
      type: "MEDIA",
      cards: [
        {
          header: { format: "IMAGE", exampleHandle: "4::image-one" },
          body: { text: "{{1}} is now available" },
          buttons: [{ type: "URL", text: "View", url: "https://example.com/{{1}}" }],
        },
        {
          header: { format: "IMAGE", exampleHandle: "4::image-two" },
          body: { text: "{{1}} is now available" },
          buttons: [{ type: "URL", text: "View", url: "https://example.com/{{1}}" }],
        },
      ],
    },
    mappings: [
      { component: "BODY", position: 1, sampleValue: "Asha", fallbackValue: "Customer" },
      { component: "CARD", cardIndex: 0, position: 1, sampleValue: "Blue", fallbackValue: "Product" },
      { component: "CARD", cardIndex: 0, buttonIndex: 0, position: 1, sampleValue: "blue", fallbackValue: "product" },
      { component: "CARD", cardIndex: 1, position: 1, sampleValue: "Green", fallbackValue: "Product" },
      { component: "CARD", cardIndex: 1, buttonIndex: 0, position: 1, sampleValue: "green", fallbackValue: "product" },
    ],
  });

  const carousel = result.metaPayload.components.find((component) => component.type === "CAROUSEL");
  assert.equal(carousel.cards.length, 2);
  assert.deepEqual(carousel.cards[0].components[1].example.body_text, ["Blue"]);
  assert.deepEqual(carousel.cards[1].components[2].buttons[0].example, ["green"]);
});

test("compiles product carousel and call permission templates", () => {
  const product = compileTemplateDefinition({
    name: "product_carousel",
    language: "en_US",
    category: "MARKETING",
    body: { text: "Recommended products" },
    carousel: {
      type: "PRODUCT",
      cards: [
        { header: { format: "PRODUCT" }, buttons: [{ type: "SPM", text: "View" }] },
        { header: { format: "PRODUCT" }, buttons: [{ type: "SPM", text: "View" }] },
      ],
    },
  });
  assert.equal(product.metaPayload.components[1].cards[0].components[0].format, "PRODUCT");
  assert.equal(product.metaPayload.components[1].cards[0].components[1].buttons[0].type, "SPM");

  const callPermission = compileTemplateDefinition({
    name: "request_callback",
    language: "en_US",
    category: "UTILITY",
    body: { text: "Can we call you about your order?" },
    callPermissionRequest: true,
  });
  assert.equal(callPermission.metaPayload.components.at(-1).type, "CALL_PERMISSION_REQUEST");
});
