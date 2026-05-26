import { View } from "react-native";
import { Avatar, Badge } from "@rneui/themed";
import { Text } from "react-native-paper";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  role?: "OWNER" | "STAFF";
  initials?: string;
};

export function AppHeader({ title, subtitle, role, initials = "SC" }: AppHeaderProps) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <View className="flex-1 gap-1">
        <Text variant="headlineMedium" style={{ color: "#17211b", fontWeight: "800" }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodyMedium" style={{ color: "#667064", lineHeight: 20 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-2">
        <Avatar
          rounded
          title={initials}
          containerStyle={{ backgroundColor: "#246b4b", width: 44, height: 44 }}
          titleStyle={{ fontSize: 15, fontWeight: "800" }}
        />
        {role ? (
          <Badge
            value={role}
            badgeStyle={{
              backgroundColor: role === "OWNER" ? "#d8f2e3" : "#ffe2ad",
              borderColor: "transparent",
              minHeight: 22,
              paddingHorizontal: 8,
            }}
            textStyle={{
              color: role === "OWNER" ? "#0b3d28" : "#3f2800",
              fontWeight: "700",
              fontSize: 11,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
