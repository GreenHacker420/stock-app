import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalizePhone(phone) {
  if (!phone) return "";
  const parsed = parsePhoneNumberFromString(phone, "IN");
  return parsed ? parsed.number : phone.replace(/[^\d+]/g, "");
}
