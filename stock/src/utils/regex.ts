export const SEARCH_PATTERNS = {
  SPACE_AND_SYMBOLS: /[\s\-\/_.\(\)]+/g,
  NON_ALPHANUMERIC: /[^a-zA-Z0-9]/g,
  TOKEN_SPLIT: /\s+/,
  BRACKETED_CODE: /\(([A-Z_]+)\)/,
  NON_ASCII: /[^\x20-\x7E]/g,
} as const;

export const VALIDATION_PATTERNS = {
  INDIAN_MOBILE: /^[6-9]\d{9}$/,
  GSTIN: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i,
  INTEGER_ONLY: /^\d+$/,
  DECIMAL_NUMBER: /^\d+(\.\d+)?$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;

export const CLEANING_PATTERNS = {
  NON_DIGITS: /\D/g,
  PHONE_PUNCTUATION: /[\s\-\(\)]/g,
  NON_NUMERIC_DECIMAL: /[^0-9.]/g,
  UPPER_CODE_CLEAN: /[^A-Z0-9\-_]/g,
} as const;

export const FORMATTING_PATTERNS = {
  UNDERSCORE: /_/g,
  CAMEL_CASE: /([A-Z])/g,
} as const;
