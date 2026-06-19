const TEMPLATE_STATUS_FIELDS = new Set([
  "message_template_status_update",
  "template_status_update",
]);

const TEMPLATE_QUALITY_FIELDS = new Set([
  "message_template_quality_update",
  "template_quality_update",
]);

function firstDefined(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null) return source[key];
  }
  return null;
}

function firstChange(payload) {
  return payload?.entry?.[0]?.changes?.[0] || null;
}

export function normalizeQualityRating(value) {
  const raw = String(
    firstDefined(value, ["quality_rating", "quality_score", "new_quality_score", "event"]) || "UNKNOWN",
  ).toUpperCase();

  if (raw.includes("GREEN") || raw === "HIGH") return "GREEN";
  if (raw.includes("YELLOW") || raw === "MEDIUM") return "YELLOW";
  if (raw.includes("RED") || raw === "LOW") return "RED";
  return "UNKNOWN";
}

export function normalizeMessagingTier(value) {
  const raw = String(
    firstDefined(value, [
      "messaging_limit_tier",
      "messaging_limit",
      "max_daily_conversations_per_business",
    ]) || "",
  ).toUpperCase().replace(/[,\s]/g, "");

  if (!raw) return null;
  if (raw.includes("UNLIMITED")) return "UNLIMITED";
  if (raw.includes("100K") || Number(raw) >= 100000) return "TIER_100K";
  if (raw.includes("10K") || Number(raw) >= 10000) return "TIER_10K";
  if (raw.includes("1K") || Number(raw) >= 1000) return "TIER_1K";
  if (raw.includes("250") || Number(raw) >= 250) return "TIER_250";
  return null;
}

export function normalizeManagementWebhook(payload) {
  const change = firstChange(payload);
  if (!change?.field) return null;

  const field = change.field;
  const value = change.value || {};

  if (TEMPLATE_STATUS_FIELDS.has(field)) {
    return {
      kind: "template_status",
      field,
      templateId: firstDefined(value, ["message_template_id", "template_id", "id"]),
      name: firstDefined(value, ["message_template_name", "template_name", "name"]),
      language: firstDefined(value, ["message_template_language", "language"]),
      status: String(firstDefined(value, ["event", "status"]) || "PENDING").toUpperCase(),
      reason: firstDefined(value, ["reason", "rejection_reason", "disable_info"]),
      raw: value,
    };
  }

  if (TEMPLATE_QUALITY_FIELDS.has(field)) {
    return {
      kind: "template_quality",
      field,
      templateId: firstDefined(value, ["message_template_id", "template_id", "id"]),
      name: firstDefined(value, ["message_template_name", "template_name", "name"]),
      language: firstDefined(value, ["message_template_language", "language"]),
      qualityScore: String(firstDefined(value, ["new_quality_score", "quality_score", "event"]) || "UNKNOWN").toUpperCase(),
      raw: value,
    };
  }

  if (field === "phone_number_quality_update") {
    return {
      kind: "phone_quality",
      field,
      qualityRating: normalizeQualityRating(value),
      messagingLimitTier: normalizeMessagingTier(value),
      raw: value,
    };
  }

  if (field === "phone_number_name_update") {
    return {
      kind: "phone_name",
      field,
      displayNameStatus: String(firstDefined(value, ["decision", "status", "event"]) || "UNKNOWN").toUpperCase(),
      businessName: firstDefined(value, ["requested_verified_name", "verified_name", "display_name"]),
      raw: value,
    };
  }

  if (field === "business_capability_update") {
    return {
      kind: "business_capability",
      field,
      messagingLimitTier: normalizeMessagingTier(value),
      capabilities: value,
      raw: value,
    };
  }

  if (field === "account_review_update") {
    return {
      kind: "account_review",
      field,
      accountReviewStatus: String(firstDefined(value, ["decision", "status", "event"]) || "UNKNOWN").toUpperCase(),
      raw: value,
    };
  }

  if (field === "account_update" || field === "account_alerts") {
    return {
      kind: "account",
      field,
      accountStatus: String(firstDefined(value, ["event", "status", "alert_type"]) || "UNKNOWN").toUpperCase(),
      raw: value,
    };
  }

  return null;
}
