export const IS_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const CUID_REGEX = /^c[a-z0-9]{24}$/;

export const EVENT_SEQUENCE_CURSOR_REGEX = /^\d+$/;

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
