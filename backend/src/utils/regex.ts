export const DIMENSION_PATTERNS = {
  /** Matches a single dimension pair like "70x100" or "70*100" with capture groups for [1] and [2] */
  PAIR: /(\d+)\s*[*xX×]\s*(\d+)/,
  /** Global match for dimension pairs */
  PAIR_GLOBAL: /(\d+)\s*[*xX×]\s*(\d+)/g,
  /** Matches dimension delimiter between digits to normalize or split ("70x100" -> "70 100") */
  SEPARATOR: /(?<=\d)\s*[*xX×]\s*(?=\d)/g,
} as const;

export const SEARCH_PATTERNS = {
  /** Extracts lowercase alphanumeric words and numbers for search tokens */
  ALPHANUMERIC_TOKENS: /[a-z0-9]+/g,
  /** Whitespace and common symbols (hyphens, slashes, brackets) */
  SPACE_AND_SYMBOLS: /[\s\-\/_.\(\)]+/g,
  /** Simple whitespace splitting */
  TOKEN_SPLIT: /\s+/,
  /** Unicode letter or number cleaning */
  NON_ALPHANUMERIC_UNICODE: /[^\p{L}\p{N}]+/gu,
} as const;

export const VALIDATION_PATTERNS = {
  /** Standard 10-digit Indian mobile number */
  INDIAN_MOBILE: /^[6-9]\d{9}$/,
  /** 15-character Indian GSTIN */
  GSTIN: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i,
  /** Pure integer digits */
  INTEGER_ONLY: /^\d+$/,
  /** Floating point decimal number */
  DECIMAL_NUMBER: /^\d+(\.\d+)?$/,
} as const;

export const CLEANING_PATTERNS = {
  NON_DIGITS: /\D/g,
  PHONE_PUNCTUATION: /[\s\-\(\)]/g,
} as const;
