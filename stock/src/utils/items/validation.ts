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
