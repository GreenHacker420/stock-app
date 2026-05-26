import { Pressable, View } from "react-native";
import { Icon, Text } from "react-native-paper";

type ActionTileProps = {
  title: string;
  subtitle: string;
  icon: string;
  tone?: "green" | "amber" | "blue" | "red";
  onPress?: () => void;
};

const tones = {
  green: { bg: "rgba(16, 185, 129, 0.08)", color: "#065f46" },
  amber: { bg: "rgba(245, 158, 11, 0.08)", color: "#92400e" },
  blue: { bg: "rgba(30, 64, 175, 0.08)", color: "#1e3a8a" },
  red: { bg: "rgba(239, 68, 68, 0.08)", color: "#991b1b" },
};

export function ActionTile({ title, subtitle, icon, tone = "green", onPress }: ActionTileProps) {
  const palette = tones[tone];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          opacity: pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: 1,
        }
      ]}
      className="flex-row items-center gap-4 rounded-lg border border-[#e5e7eb] bg-white p-4"
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-lg"
        style={{ backgroundColor: palette.bg }}
      >
        <Icon source={icon} size={22} color={palette.color} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="titleMedium" style={{ color: "#111827", fontWeight: "700", letterSpacing: -0.1 }}>
          {title}
        </Text>
        <Text variant="bodySmall" style={{ color: "#4b5563", lineHeight: 16 }}>
          {subtitle}
        </Text>
      </View>
      <Icon source="chevron-right" size={22} color="#9ca3af" />
    </Pressable>
  );
}
