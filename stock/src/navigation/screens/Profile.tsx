import { useState } from "react";
import { View } from "react-native";
import { Avatar, ListItem } from "@rneui/themed";
import { useMutation } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Button, Text, TextInput } from "react-native-paper";
import { updateMe } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

export function Profile() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const signOut = useAuthStore((state) => state.signOut);
  const setActiveShopId = useShopStore((state) => state.setActiveShopId);
  const navigation = useNavigation();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => updateMe(token ?? "", { name, email: email || null, password: password || undefined }),
  });

  return (
    <Screen>
      <AppHeader title="Profile" subtitle="Signed-in user and permissions." role={user?.role} />
      <View className="rounded-lg border border-gray-200 bg-white p-5">
        <View className="flex-row items-center gap-4">
          <Avatar
            rounded
            size={56}
            title={user?.name?.slice(0, 2).toUpperCase() ?? "SC"}
            containerStyle={{ backgroundColor: "#1e40af" }}
            titleStyle={{ fontWeight: "800" }}
          />
          <View className="flex-1">
            <Text variant="titleLarge" style={{ color: "#111827", fontWeight: "800" }}>
              {user?.name}
            </Text>
            <Text variant="bodyMedium" style={{ color: "#4b5563" }}>
              {user?.mobile}
            </Text>
          </View>
          <StatusPill label={user?.role ?? "USER"} tone={user?.role === "OWNER" ? "blue" : "amber"} />
        </View>
      </View>

      <Section title="Account">
        <View className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <ListItem bottomDivider containerStyle={{ backgroundColor: "#ffffff" }}>
            <ListItem.Content>
              <ListItem.Title style={{ fontWeight: "700", color: "#111827" }}>Email</ListItem.Title>
              <ListItem.Subtitle style={{ color: "#4b5563" }}>{user?.email || "Not set"}</ListItem.Subtitle>
            </ListItem.Content>
          </ListItem>
          <ListItem containerStyle={{ backgroundColor: "#ffffff" }}>
            <ListItem.Content>
              <ListItem.Title style={{ fontWeight: "700", color: "#111827" }}>Permissions</ListItem.Title>
              <ListItem.Subtitle style={{ color: "#4b5563" }}>{user?.permissions.length ?? 0} enabled actions</ListItem.Subtitle>
            </ListItem.Content>
          </ListItem>
        </View>
      </Section>

      <Section title="Update profile">
        <View className="gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <TextInput mode="outlined" label="Name" value={name} onChangeText={setName} />
          <TextInput mode="outlined" label="Email" value={email ?? ""} onChangeText={setEmail} />
          <TextInput mode="outlined" label="New password" secureTextEntry value={password} onChangeText={setPassword} />
          <Button mode="contained" loading={mutation.isPending} onPress={() => mutation.mutate()} style={{ borderRadius: 10 }}>Save Profile</Button>
        </View>
      </Section>

      {user?.role === "OWNER" ? (
        <Section title="Owner tools">
          <View className="gap-3">
            <Button mode="contained-tonal" icon="storefront-outline" onPress={() => { setActiveShopId(null); }}>Change Shop</Button>
            <Button mode="contained-tonal" icon="account-plus" onPress={() => (navigation as any).navigate("AddEditStaff")}>Add Staff</Button>
            <Button mode="contained-tonal" icon="account-group-outline" onPress={() => (navigation as any).navigate("StaffManagement")}>Staff Management</Button>
            <Button mode="contained-tonal" icon="warehouse" onPress={() => (navigation as any).navigate("ItemList")}>Inventory Management</Button>
          </View>
        </Section>
      ) : null}

      <Button mode="outlined" icon="logout" onPress={signOut} contentStyle={{ height: 48 }} style={{ borderRadius: 8, borderColor: "#e5e7eb" }} textColor="#111827">
        Sign out
      </Button>
    </Screen>
  );
}
