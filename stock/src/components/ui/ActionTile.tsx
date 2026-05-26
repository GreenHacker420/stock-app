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
  green: { bg: "#d8f2e3", color: "#246b4b" },
  amber: { bg: "#ffe2ad", color: "#8a5a12" },
  blue: { bg: "#dcecff", color: "#2c5d89" },
  red: { bg: "#ffe1dc", color: "#b42318" },
};

export function ActionTile({ title, subtitle, icon, tone = "green", onPress }: ActionTileProps) {
  const palette = tones[tone];

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg border border-[#d9dfd2] bg-white p-4"
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-lg"
        style={{ backgroundColor: palette.bg }}
      >
        <Icon source={icon} size={22} color={palette.color} />
      </View>
      <View className="flex-1 gap-1">
        <Text variant="titleMedium" style={{ color: "#17211b", fontWeight: "700" }}>
          {title}
        </Text>
        <Text variant="bodySmall" style={{ color: "#667064", lineHeight: 18 }}>
          {subtitle}
        </Text>
      </View>
      <Icon source="chevron-right" size={22} color="#7a8578" />
    </Pressable>
  );
}
