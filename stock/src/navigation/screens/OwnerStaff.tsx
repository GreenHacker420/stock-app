import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Button, Text, TextInput } from "react-native-paper";
import { ApiUser, createStaff, fetchStaff, updateStaff } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

export function StaffManagement() {
  const token = useAuthStore((state) => state.token);
  const navigation = useNavigation();
  const staffQuery = useQuery({ queryKey: ["staff"], queryFn: () => fetchStaff(token ?? ""), enabled: !!token });

  return (
    <Screen scroll={false}>
      <AppHeader title="Staff Management" subtitle="Create staff accounts and manage access." />
      <Button mode="contained" icon="account-plus" onPress={() => (navigation as any).navigate("AddEditStaff")} style={{ borderRadius: 10 }}>Add Staff</Button>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="gap-3">
          {(staffQuery.data ?? []).map((staff) => (
            <Pressable key={staff.id} onPress={() => (navigation as any).navigate("AddEditStaff", { staff })}>
              <View className="rounded-lg border border-[#e5e7eb] bg-white p-4">
                <View className="flex-row justify-between gap-3">
                  <View>
                    <Text variant="titleMedium" style={{ fontWeight: "900" }}>{staff.name}</Text>
                    <Text style={{ color: "#64748b" }}>{staff.mobile} • {staff.email ?? "No email"}</Text>
                  </View>
                  <StatusPill label="STAFF" tone="amber" />
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

export function AddEditStaff() {
  const token = useAuthStore((state) => state.token);
  const route = useRoute();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const staff = (route.params as { staff?: ApiUser } | undefined)?.staff;
  const [form, setForm] = useState({ name: staff?.name ?? "", mobile: staff?.mobile ?? "", email: staff?.email ?? "", password: "", status: "ACTIVE" });
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const mutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, email: form.email || null, password: form.password || undefined };
      return staff ? updateStaff(token ?? "", staff.id, payload) : createStaff(token ?? "", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      navigation.goBack();
    },
  });

  return (
    <Screen>
      <AppHeader title={staff ? "Edit Staff" : "Add Staff"} subtitle="Create login and update staff status." />
      <Section title="Staff account">
        <View className="gap-3 rounded-lg border border-[#e5e7eb] bg-white p-4">
          <TextInput mode="outlined" label="Name" value={form.name} onChangeText={(v) => set("name", v)} />
          <TextInput mode="outlined" label="Mobile" keyboardType="phone-pad" value={form.mobile} onChangeText={(v) => set("mobile", v)} />
          <TextInput mode="outlined" label="Email" value={form.email ?? ""} onChangeText={(v) => set("email", v)} />
          <TextInput mode="outlined" label={staff ? "New password (optional)" : "Password"} secureTextEntry value={form.password} onChangeText={(v) => set("password", v)} />
        </View>
      </Section>
      <Button mode="contained" loading={mutation.isPending} disabled={!form.name || !form.mobile || (!staff && form.password.length < 4)} onPress={() => mutation.mutate()} style={{ borderRadius: 10 }}>
        Save Staff
      </Button>
    </Screen>
  );
}
