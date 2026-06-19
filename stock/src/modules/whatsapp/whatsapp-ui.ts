export const waColors = {
  greenDark: "#075E54",
  green: "#128C7E",
  greenBright: "#25D366",
  greenPale: "#D9FDD3",
  chatBackground: "#EFEAE2",
  surface: "#FFFFFF",
  surfaceMuted: "#F0F2F5",
  border: "#E9EDEF",
  text: "#111B21",
  textPrimary: "#111B21",
  textSecondary: "#667781",
  textMuted: "#8696A0",
  blue: "#53BDEB",
  danger: "#EA0038",
  warning: "#F7B928",
};

export function initials(name?: string) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export const initialsFor = initials;

export const waScreen = {
  backgroundColor: waColors.surface,
  flex: 1,
} as const;
