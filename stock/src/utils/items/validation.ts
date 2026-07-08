export function parseAmount(value: string, fallback: number | null = null): number | null {
  if (!value.trim()) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}


export function parseQty(value: string, fallback = 0): number | null {
  if (!value.trim()) return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value);
}

export function cleanPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
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
  return /^[6-9]\d{9}$/.test(phone);
}
