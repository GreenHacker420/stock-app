import { VALIDATION_PATTERNS, CLEANING_PATTERNS } from "../regex";

export function parseAmount(value: string, fallback: number | null = null): number | null {
  if (!value.trim()) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

export function parseQty(value: string, fallback = 0): number | null {
  if (!value.trim()) return fallback;
  if (!VALIDATION_PATTERNS.INTEGER_ONLY.test(value.trim())) return null;
  return Number(value);
}

export function cleanPhoneNumber(phone: string): string {
  let cleaned = phone.replace(CLEANING_PATTERNS.PHONE_PUNCTUATION, "");
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

export function isValidMobile(phone: string): boolean {
  return VALIDATION_PATTERNS.INDIAN_MOBILE.test(phone);
}

export function isValidGstin(gstin: string): boolean {
  return VALIDATION_PATTERNS.GSTIN.test(gstin.trim());
}

export function isValidEmail(email: string): boolean {
  return VALIDATION_PATTERNS.EMAIL.test(email.trim());
}
