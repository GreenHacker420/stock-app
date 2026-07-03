export const money = (value?: string | number | null) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export const CAT_PALETTES = [
  { bg: "#dcfce7", icon: "#16a34a", border: "#bbf7d0" }, // emerald
  { bg: "#dbeafe", icon: "#2563eb", border: "#bfdbfe" }, // blue
  { bg: "#fef3c7", icon: "#d97706", border: "#fde68a" }, // amber
  { bg: "#fce7f3", icon: "#db2777", border: "#fbcfe8" }, // pink
  { bg: "#ede9fe", icon: "#7c3aed", border: "#ddd6fe" }, // violet
  { bg: "#ffedd5", icon: "#ea580c", border: "#fed7aa" }, // orange
  { bg: "#ccfbf1", icon: "#0d9488", border: "#99f6e4" }, // teal
  { bg: "#f0fdf4", icon: "#166534", border: "#bbf7d0" }, // forest
];

export function getCatPalette(name: string) {
  const sum = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return CAT_PALETTES[sum % CAT_PALETTES.length];
}

export const CAT_ICONS = [
  "tag", "package-variant", "cube-outline", "basket-outline",
  "star-outline", "lightning-bolt-outline", "leaf", "fire",
];

export function getCatIcon(name: string) {
  const sum = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return CAT_ICONS[sum % CAT_ICONS.length];
}

const AVATAR_COLORS = [
  "#16a34a", "#2563eb", "#d97706", "#db2777", "#7c3aed", "#ea580c",
];

export function getAvatarColor(name: string) {
  const sum = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export function initialsOf(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
