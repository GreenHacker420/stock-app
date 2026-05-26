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
  green: { bg: "#ffffff", iconBg: "rgba(36, 107, 75, 0.08)", color: "#1c5138" },
  amber: { bg: "#ffffff", iconBg: "rgba(138, 90, 18, 0.08)", color: "#744b0e" },
  blue: { bg: "#ffffff", iconBg: "rgba(44, 93, 137, 0.08)", color: "#214668" },
  red: { bg: "#ffffff", iconBg: "rgba(180, 35, 24, 0.08)", color: "#8c1c13" },
};

export function MetricCard({ label, value, icon, tone = "green", helper }: MetricCardProps) {
  const palette = tones[tone];

  return (
    <View
      className="flex-1 gap-3 rounded-2xl border border-[#e5eadd] p-4"
      style={{
        backgroundColor: palette.bg,
        minHeight: 124,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      <View className="flex-row justify-between items-start">
        <View
          className="h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: palette.iconBg }}
        >
          <Icon source={icon} size={20} color={palette.color} />
        </View>
        {helper ? (
          <View className="rounded-full bg-[#f4f6f1] px-2 py-0.5 border border-[#eef2ea]">
            <Text style={{ color: "#667064", fontSize: 10, fontWeight: "700" }}>
              {helper}
            </Text>
          </View>
        ) : null}
      </View>
      <View className="gap-0.5">
        <Text variant="headlineSmall" style={{ color: "#17211b", fontWeight: "800", letterSpacing: -0.5 }}>
          {value}
        </Text>
        <Text variant="labelLarge" style={{ color: "#4d584f", fontWeight: "600" }}>
          {label}
        </Text>
      </View>
    </View>
  );
}
