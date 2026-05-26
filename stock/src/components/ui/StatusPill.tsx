import { Badge } from "@rneui/themed";

type StatusPillProps = {
  label: string;
  tone?: "green" | "amber" | "blue" | "red" | "neutral";
};

const tones = {
  green: { bg: "#d1fae5", fg: "#065f46" },
  amber: { bg: "#fef3c7", fg: "#92400e" },
  blue: { bg: "#dbeafe", fg: "#1e40af" },
  red: { bg: "#fee2e2", fg: "#b91c1c" },
  neutral: { bg: "#f3f4f6", fg: "#4b5563" },
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
