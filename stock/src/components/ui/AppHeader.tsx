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
    <View className="flex-row items-center justify-between gap-4 pb-1">
      <View className="flex-1 gap-0.5">
        <Text variant="headlineMedium" style={{ color: "#17211b", fontWeight: "800", letterSpacing: -0.6 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodyMedium" style={{ color: "#667064", lineHeight: 18, fontSize: 13, fontWeight: "500" }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-1.5">
        <View style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 2,
          borderRadius: 22,
        }}>
          <Avatar
            rounded
            title={initials}
            containerStyle={{ backgroundColor: "#246b4b", width: 44, height: 44, borderWidth: 1.5, borderColor: "#ffffff" }}
            titleStyle={{ fontSize: 14, fontWeight: "800", color: "#ffffff" }}
          />
        </View>
        {role ? (
          <Badge
            value={role}
            badgeStyle={{
              backgroundColor: role === "OWNER" ? "#d8f2e3" : "#ffe2ad",
              borderColor: "transparent",
              minHeight: 18,
              borderRadius: 6,
              paddingHorizontal: 6,
            }}
            textStyle={{
              color: role === "OWNER" ? "#0b3d28" : "#3f2800",
              fontWeight: "800",
              fontSize: 9,
              letterSpacing: 0.5,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
