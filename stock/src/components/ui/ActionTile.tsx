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
  green: { bg: "rgba(36, 107, 75, 0.08)", color: "#1c5138" },
  amber: { bg: "rgba(138, 90, 18, 0.08)", color: "#744b0e" },
  blue: { bg: "rgba(44, 93, 137, 0.08)", color: "#214668" },
  red: { bg: "rgba(180, 35, 24, 0.08)", color: "#8c1c13" },
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
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.04,
          shadowRadius: 12,
          elevation: 2,
        }
      ]}
      className="flex-row items-center gap-4 rounded-2xl border border-[#e5eadd] bg-white p-4"
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: palette.bg }}
      >
        <Icon source={icon} size={22} color={palette.color} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="titleMedium" style={{ color: "#17211b", fontWeight: "700", letterSpacing: -0.1 }}>
          {title}
        </Text>
        <Text variant="bodySmall" style={{ color: "#667064", lineHeight: 16 }}>
          {subtitle}
        </Text>
      </View>
      <Icon source="chevron-right" size={22} color="#909b8f" />
    </Pressable>
  );
}
