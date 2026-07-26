export function sanitizeEmail(value?: string): string {
  const email = value?.trim();
  if (
    !email ||
    email.includes("\r") ||
    email.includes("\n") ||
    email.includes("?") ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return "";
  }
  return email;
}

export function parseCoordinate(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
