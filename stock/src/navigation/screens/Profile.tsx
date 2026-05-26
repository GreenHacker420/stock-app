import { View } from "react-native";
import { Avatar, ListItem } from "@rneui/themed";
import { Button, Text } from "react-native-paper";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

export function Profile() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  return (
    <Screen>
      <AppHeader title="Profile" subtitle="Signed-in user and permissions." role={user?.role} />
      <View className="rounded-lg border border-[#d9dfd2] bg-white p-5">
        <View className="flex-row items-center gap-4">
          <Avatar
            rounded
            size={56}
            title={user?.name?.slice(0, 2).toUpperCase() ?? "SC"}
            containerStyle={{ backgroundColor: "#246b4b" }}
            titleStyle={{ fontWeight: "800" }}
          />
          <View className="flex-1">
            <Text variant="titleLarge" style={{ color: "#17211b", fontWeight: "800" }}>
              {user?.name}
            </Text>
            <Text variant="bodyMedium" style={{ color: "#667064" }}>
              {user?.mobile}
            </Text>
          </View>
          <StatusPill label={user?.role ?? "USER"} tone={user?.role === "OWNER" ? "green" : "amber"} />
        </View>
      </View>

      <Section title="Account">
        <View className="overflow-hidden rounded-lg border border-[#d9dfd2] bg-white">
          <ListItem bottomDivider containerStyle={{ backgroundColor: "#ffffff" }}>
            <ListItem.Content>
              <ListItem.Title style={{ fontWeight: "700", color: "#17211b" }}>Email</ListItem.Title>
              <ListItem.Subtitle>{user?.email || "Not set"}</ListItem.Subtitle>
            </ListItem.Content>
          </ListItem>
          <ListItem containerStyle={{ backgroundColor: "#ffffff" }}>
            <ListItem.Content>
              <ListItem.Title style={{ fontWeight: "700", color: "#17211b" }}>Permissions</ListItem.Title>
              <ListItem.Subtitle>{user?.permissions.length ?? 0} enabled actions</ListItem.Subtitle>
            </ListItem.Content>
          </ListItem>
        </View>
      </Section>

      <Button mode="outlined" icon="logout" onPress={signOut} contentStyle={{ height: 48 }}>
        Sign out
      </Button>
    </Screen>
  );
}
