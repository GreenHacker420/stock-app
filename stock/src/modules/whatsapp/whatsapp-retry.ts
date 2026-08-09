import { ApiError } from "../../api/client";

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429]);
const RETRYABLE_MESSAGE_PATTERN = /network|timeout|timed out|temporar|connection|fetch|unavailable|offline|socket/i;

export const WHATSAPP_CLIENT_MAX_ATTEMPTS = 6;

export function isRetryableWhatsAppClientError(error: unknown) {
  if (error instanceof ApiError) {
    return RETRYABLE_HTTP_STATUSES.has(error.status) || error.status >= 500;
  }
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error || "");
  return RETRYABLE_MESSAGE_PATTERN.test(message);
}

export function whatsappClientRetryDelayMs(attempt: number) {
  const cappedAttempt = Math.max(1, Math.min(attempt, 6));
  const ceiling = Math.min(2 ** cappedAttempt * 1_000, 60_000);
  return Math.max(750, Math.floor(Math.random() * ceiling));
}
