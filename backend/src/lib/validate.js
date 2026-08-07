export const EVENT_SEQUENCE_CURSOR_REGEX = /^\d+$/;
export const TEMPLATE_NAME_REGEX = /^[a-z0-9_]+$/;
export const TEMPLATE_KEY_REGEX = /^[a-zA-Z0-9_.]+$/;
export const EXPO_PUSH_TOKEN_REGEX = /^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/;
export const NON_DIGIT_REGEX = /[^0-9]/g;
export const HTML_ESCAPE_AMP_REGEX = /&/g;
export const HTML_ESCAPE_LT_REGEX = /</g;
export const HTML_ESCAPE_GT_REGEX = />/g;
export const HTML_ESCAPE_QUOT_REGEX = /"/g;
export const HTML_ESCAPE_APOS_REGEX = /'/g;
export const CODE128_ASCII_REGEX = /[^\x20-\x7E]/g;
export const SVG_NUMERIC_MATCH_REGEX = /[-+]?[0-9]*\.?[0-9]+/g;

const MAX_BIGINT_64 = 9223372036854775807n;

export function parseEventSequenceCursor(value) {
  if (typeof value !== "string" || !EVENT_SEQUENCE_CURSOR_REGEX.test(value)) {
    throw new Error("Cursor must be a decimal sequence");
  }
  const cursor = BigInt(value);
  if (cursor < 0n || cursor > MAX_BIGINT_64) {
    throw new Error("Cursor is outside the valid range");
  }
  return cursor;
}
