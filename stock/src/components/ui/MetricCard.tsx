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
  green: { bg: "#ffffff", iconBg: "rgba(16, 185, 129, 0.08)", color: "#065f46" },
  amber: { bg: "#ffffff", iconBg: "rgba(245, 158, 11, 0.08)", color: "#92400e" },
  blue: { bg: "#ffffff", iconBg: "rgba(30, 64, 175, 0.08)", color: "#1e3a8a" },
  red: { bg: "#ffffff", iconBg: "rgba(239, 68, 68, 0.08)", color: "#991b1b" },
};

export function MetricCard({ label, value, icon, tone = "green", helper }: MetricCardProps) {
  const palette = tones[tone];

  return (
    <View
      className="flex-1 gap-3 rounded-lg border border-[#e5e7eb] p-4"
      style={{
        backgroundColor: palette.bg,
        minHeight: 124,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      <View className="flex-row justify-between items-start">
        <View
          className="h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: palette.iconBg }}
        >
          <Icon source={icon} size={20} color={palette.color} />
        </View>
        {helper ? (
          <View className="rounded-full bg-[#f3f4f6] px-2 py-0.5 border border-[#e5e7eb]">
            <Text style={{ color: "#4b5563", fontSize: 10, fontWeight: "700" }}>
              {helper}
            </Text>
          </View>
        ) : null}
      </View>
      <View className="gap-0.5">
        <Text variant="headlineSmall" style={{ color: "#111827", fontWeight: "800", letterSpacing: -0.5 }}>
          {value}
        </Text>
        <Text variant="labelLarge" style={{ color: "#4b5563", fontWeight: "600" }}>
          {label}
        </Text>
      </View>
    </View>
  );
}
