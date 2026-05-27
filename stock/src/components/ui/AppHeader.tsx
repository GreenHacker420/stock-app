import { useMemo } from "react";
import { View } from "react-native";
import { Avatar, Badge } from "@rneui/themed";
import { Text } from "react-native-paper";
import { useAuthStore } from "../../auth/auth-store";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  role?: "OWNER" | "STAFF";
  initials?: string;
};

export function AppHeader({ title, subtitle, role, initials }: AppHeaderProps) {
  const user = useAuthStore((state) => state.user);

  const displayInitials = useMemo(() => {
    if (initials) return initials;
    if (user?.name) {
      return user.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    }
    return "SC";
  }, [initials, user?.name]);

  const displayRole = role ?? user?.role;

  return (
    <View className="flex-row items-center justify-between gap-4 pb-1">
      <View className="flex-1 gap-0.5">
        <Text variant="headlineMedium" style={{ color: "#111827", fontWeight: "800", letterSpacing: -0.6 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodyMedium" style={{ color: "#4b5563", lineHeight: 18, fontSize: 13, fontWeight: "500" }}>
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
            title={displayInitials}
            containerStyle={{ backgroundColor: "#1e40af", width: 44, height: 44, borderWidth: 1.5, borderColor: "#ffffff" }}
            titleStyle={{ fontSize: 14, fontWeight: "800", color: "#ffffff" }}
          />
        </View>
        {displayRole ? (
          <Badge
            value={displayRole}
            badgeStyle={{
              backgroundColor: displayRole === "OWNER" ? "#dbeafe" : "#f1f5f9",
              borderColor: "transparent",
              minHeight: 18,
              borderRadius: 6,
              paddingHorizontal: 6,
            }}
            textStyle={{
              color: displayRole === "OWNER" ? "#1e3a8a" : "#475569",
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
