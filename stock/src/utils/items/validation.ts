import { isValidPhoneNumber } from "libphonenumber-js";
import { z } from "zod";
import { CLEANING_PATTERNS } from "../regex";

export const integerQuantitySchema = z.coerce.number().int().nonnegative();
export const gstinSchema = z.string().trim().toUpperCase().length(15).regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/);
export const emailSchema = z.string().trim().email();

export function parseAmount(value: string, fallback: number | null = null): number | null {
  if (!value.trim()) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

export function parseQty(value: string, fallback = 0): number | null {
  if (!value.trim()) return fallback;
  const result = integerQuantitySchema.safeParse(value.trim());
  return result.success ? result.data : null;
}

export function extractDigits(value: string): string {
  return (value || "").replace(CLEANING_PATTERNS.NON_DIGITS, "");
}

export function extractPhoneSuffix(phone: string, length = 10): string {
  return extractDigits(phone).slice(-length);
}

export function cleanPhoneNumber(phone: string): string {
  let cleaned = (phone || "").replace(CLEANING_PATTERNS.PHONE_PUNCTUATION, "");
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }
  return extractDigits(cleaned);
}

export function isValidMobile(phone: string): boolean {
  if (!phone) return false;
  return isValidPhoneNumber(phone.trim().startsWith("+") ? phone.trim() : `+91${phone.trim()}`, "IN");
}

export function isValidGstin(gstin: string): boolean {
  return gstinSchema.safeParse(gstin.trim()).success;
}

export function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email.trim()).success;
}
