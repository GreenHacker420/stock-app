import { Badge } from "@rneui/themed";

type StatusPillProps = {
  label: string;
  tone?: "green" | "amber" | "blue" | "red" | "neutral";
};

const tones = {
  green: { bg: "#d8f2e3", fg: "#0b3d28" },
  amber: { bg: "#ffe2ad", fg: "#3f2800" },
  blue: { bg: "#dcecff", fg: "#1e4568" },
  red: { bg: "#ffe1dc", fg: "#7a1b14" },
  neutral: { bg: "#eef2ea", fg: "#4d584f" },
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  const palette = tones[tone];
  return (
    <Badge
      value={label}
      badgeStyle={{
        backgroundColor: palette.bg,
        borderColor: "transparent",
        minHeight: 24,
        paddingHorizontal: 10,
      }}
      textStyle={{ color: palette.fg, fontSize: 12, fontWeight: "700" }}
    />
  );
}
