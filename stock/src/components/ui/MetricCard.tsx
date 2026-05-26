import { View } from "react-native";
import { Icon, Text } from "react-native-paper";

type MetricCardProps = {
  label: string;
  value: string;
  icon: string;
  tone?: "green" | "amber" | "blue" | "red";
  helper?: string;
};

const tones = {
  green: { bg: "#ffffff", iconBg: "#d8f2e3", color: "#246b4b" },
  amber: { bg: "#ffffff", iconBg: "#ffe2ad", color: "#8a5a12" },
  blue: { bg: "#ffffff", iconBg: "#dcecff", color: "#2c5d89" },
  red: { bg: "#ffffff", iconBg: "#ffe1dc", color: "#b42318" },
};

export function MetricCard({ label, value, icon, tone = "green", helper }: MetricCardProps) {
  const palette = tones[tone];

  return (
    <View
      className="flex-1 gap-3 rounded-lg border border-[#d9dfd2] p-4"
      style={{ backgroundColor: palette.bg, minHeight: 124 }}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: palette.iconBg }}
      >
        <Icon source={icon} size={21} color={palette.color} />
      </View>
      <View className="gap-1">
        <Text variant="headlineSmall" style={{ color: "#17211b", fontWeight: "800" }}>
          {value}
        </Text>
        <Text variant="labelLarge" style={{ color: "#4d584f" }}>
          {label}
        </Text>
        {helper ? (
          <Text variant="bodySmall" style={{ color: "#667064" }}>
            {helper}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
