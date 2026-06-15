import { useState } from "react";
import { Pressable, ScrollView, View, StyleSheet } from "react-native";
import { useRoute } from "@react-navigation/native";
import { Button, Text, TextInput } from "react-native-paper";
import { ApiUser } from "../../api/client";
import { useStaffQuery, useCreateStaffMutation, useUpdateStaffMutation } from "../../hooks/useAuth";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { colors, spacing, radius, fontWeight } from "../../theme";
import { navigate, goBack } from "../navigation-ref";

export function StaffManagement() {
  const staffQuery = useStaffQuery();

  return (
    <Screen scroll={false}>
      <AppHeader title="Staff Management" subtitle="Create staff accounts and manage access." />
      <Button mode="contained" icon="account-plus" onPress={() => navigate("AddEditStaff")} style={styles.addButton} contentStyle={styles.buttonContent}>Add Staff</Button>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.listGap}>
          {(staffQuery.data ?? []).map((staff) => (
            <Pressable key={staff.id} onPress={() => navigate("AddEditStaff", { staff })}>
              <View style={styles.staffCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text variant="titleMedium" style={styles.boldText}>{staff.name}</Text>
                    <Text style={styles.secondaryText}>{staff.mobile} • {staff.email ?? "No email"}</Text>
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
  const route = useRoute();
  const staff = (route.params as { staff?: ApiUser } | undefined)?.staff;
  const [form, setForm] = useState({ name: staff?.name ?? "", mobile: staff?.mobile ?? "", email: staff?.email ?? "", password: "", status: "ACTIVE" });
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  
  const createMutation = useCreateStaffMutation();
  const updateMutation = useUpdateStaffMutation();

  const handleSave = () => {
    const payload = { ...form, email: form.email || null, password: form.password || undefined };
    if (staff) {
      updateMutation.mutate({ id: staff.id, data: payload }, {
        onSuccess: () => goBack()
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => goBack()
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Screen>
      <AppHeader 
        title={staff ? "Edit Staff" : "Add Staff"} 
        subtitle="Create login and update staff status." 
        fallbackRoute="StaffManagement"
      />
      <Section title="Staff account">
        <View style={styles.formCard}>
          <TextInput mode="outlined" label="Name" value={form.name} onChangeText={(v) => set("name", v)} outlineStyle={styles.inputOutline} />
          <TextInput mode="outlined" label="Mobile" keyboardType="phone-pad" value={form.mobile} onChangeText={(v) => set("mobile", v)} outlineStyle={styles.inputOutline} />
          <TextInput mode="outlined" label="Email" value={form.email ?? ""} onChangeText={(v) => set("email", v)} outlineStyle={styles.inputOutline} />
          <TextInput mode="outlined" label={staff ? "New password (optional)" : "Password"} secureTextEntry value={form.password} onChangeText={(v) => set("password", v)} outlineStyle={styles.inputOutline} />
        </View>
      </Section>
      <Button mode="contained" loading={isPending} disabled={!form.name || !form.mobile || (!staff && form.password.length < 4)} onPress={handleSave} style={styles.addButton} contentStyle={styles.buttonContent}>
        Save Staff
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addButton: {
    borderRadius: radius.md,
  },
  buttonContent: {
    height: 44,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  listGap: {
    gap: spacing.md,
  },
  staffCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  boldText: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  secondaryText: {
    color: colors.textSecondary,
  },
  formCard: {
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
});
