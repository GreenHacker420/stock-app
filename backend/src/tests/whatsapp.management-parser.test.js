import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeManagementWebhook,
  normalizeMessagingTier,
  normalizeQualityRating,
} from "../services/whatsapp.management-parser.js";

function managementPayload(field, value) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      changes: [{ field, value }],
    }],
  };
}

test("normalizes phone quality and messaging tier updates", () => {
  const event = normalizeManagementWebhook(managementPayload(
    "phone_number_quality_update",
    {
      quality_rating: "GREEN",
      messaging_limit_tier: "TIER_100K",
    },
  ));

  assert.equal(event.kind, "phone_quality");
  assert.equal(event.qualityRating, "GREEN");
  assert.equal(event.messagingLimitTier, "TIER_100K");
});

test("normalizes numeric business capability limits", () => {
  const event = normalizeManagementWebhook(managementPayload(
    "business_capability_update",
    {
      max_daily_conversations_per_business: 10000,
      max_phone_numbers_per_waba: 25,
    },
  ));

  assert.equal(event.kind, "business_capability");
  assert.equal(event.messagingLimitTier, "TIER_10K");
  assert.equal(event.capabilities.max_phone_numbers_per_waba, 25);
});

test("normalizes template lifecycle identifiers and rejection reason", () => {
  const event = normalizeManagementWebhook(managementPayload(
    "message_template_status_update",
    {
      message_template_id: "template-1",
      message_template_name: "order_ready",
      message_template_language: "en_US",
      event: "REJECTED",
      reason: "INVALID_FORMAT",
    },
  ));

  assert.deepEqual(
    {
      kind: event.kind,
      templateId: event.templateId,
      name: event.name,
      language: event.language,
      status: event.status,
      reason: event.reason,
    },
    {
      kind: "template_status",
      templateId: "template-1",
      name: "order_ready",
      language: "en_US",
      status: "REJECTED",
      reason: "INVALID_FORMAT",
    },
  );
});

test("normalizes display name and account review updates", () => {
  const nameEvent = normalizeManagementWebhook(managementPayload(
    "phone_number_name_update",
    {
      decision: "APPROVED",
      requested_verified_name: "ShopControl Demo",
    },
  ));
  const reviewEvent = normalizeManagementWebhook(managementPayload(
    "account_review_update",
    { decision: "REJECTED" },
  ));

  assert.equal(nameEvent.displayNameStatus, "APPROVED");
  assert.equal(nameEvent.businessName, "ShopControl Demo");
  assert.equal(reviewEvent.accountReviewStatus, "REJECTED");
});

test("maps common quality and tier aliases conservatively", () => {
  assert.equal(normalizeQualityRating({ quality_score: "HIGH" }), "GREEN");
  assert.equal(normalizeQualityRating({ quality_score: "LOW" }), "RED");
  assert.equal(normalizeQualityRating({ quality_score: "unrecognized" }), "UNKNOWN");
  assert.equal(normalizeMessagingTier({ messaging_limit: "1K" }), "TIER_1K");
  assert.equal(normalizeMessagingTier({ messaging_limit: "unknown" }), null);
});

test("returns null for fields without a registered management normalizer", () => {
  assert.equal(
    normalizeManagementWebhook(managementPayload("calls", { event: "connect" })),
    null,
  );
});
