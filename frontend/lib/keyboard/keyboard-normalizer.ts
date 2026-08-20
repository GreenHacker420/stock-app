const MODIFIERS = new Set(["control", "meta", "alt", "shift"]);

export function normalizeKeyString(value: string): string {
  const parts = value.toLowerCase().replace(/cmd\+/g, "ctrl+").replace(/meta\+/g, "ctrl+").split("+").filter(Boolean);
  const key = parts.pop() ?? "";
  const mods = new Set(parts);
  return [mods.has("ctrl") ? "ctrl" : "", mods.has("alt") ? "alt" : "", mods.has("shift") ? "shift" : "", key === "escape" ? "esc" : key].filter(Boolean).join("+");
}

export function normalizeKeyboardEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  let key = event.key.toLowerCase();
  if (key === " ") key = "space";
  if (key === "escape") key = "esc";
  if (!MODIFIERS.has(key)) parts.push(key);
  return parts.join("+");
}
