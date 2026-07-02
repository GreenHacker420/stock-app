import { useState } from "react";
import { Alert, Pressable, ScrollView, View, StyleSheet } from "react-native";
import { useRoute } from "@react-navigation/native";
import { ActivityIndicator, Button, Text, TextInput, Divider, HelperText, Icon, Switch } from "react-native-paper";
import { ApiUser } from "../../api/client";
import { useStaffQuery, useCreateStaffMutation, useUpdateStaffMutation } from "../../hooks/useAuth";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate, goBack } from "../navigation-ref";

function getInitials(name: string) {
  if (!name) return "ST";
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function StaffManagement() {
  const staffQuery = useStaffQuery();

  return (
    <Screen scroll={false}>
      <AppHeader title="Staff Management" subtitle="Manage accounts, status, and permissions." />
      
      <View style={styles.headerButtonContainer}>
        <Button 
          mode="contained" 
          icon="account-plus" 
          onPress={() => navigate("AddEditStaff")} 
          style={styles.addButton} 
          contentStyle={styles.buttonContent}
          labelStyle={styles.addButtonLabel}
        >
          Add Staff Member
        </Button>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
      >
        {staffQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.secondaryText}>Loading staff accounts...</Text>
          </View>
        ) : null}

        {staffQuery.isError ? (
          <Section title="Unable to load staff">
            <Text style={styles.errorText}>Check your connection and try again.</Text>
          </Section>
        ) : null}

        {!staffQuery.isLoading && !staffQuery.isError && (staffQuery.data ?? []).length === 0 ? (
          <Section title="No staff yet">
            <Text style={styles.secondaryText}>Create a staff account, then assign it to one or more shops.</Text>
          </Section>
        ) : null}

        <View style={styles.listGap}>
          {(staffQuery.data ?? []).map((staff) => {
            const isActive = staff.status === "ACTIVE" || !staff.status;
            return (
              <Pressable key={staff.id} onPress={() => navigate("AddEditStaff", { staff })}>
                <View style={styles.staffCard}>
                  <View style={styles.cardHeader}>
                    {/* Left: Round Avatar */}
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{getInitials(staff.name)}</Text>
                    </View>

                    {/* Middle: Details */}
                    <View style={styles.cardInfo}>
                      <Text style={styles.staffName}>{staff.name}</Text>
                      
                      <View style={styles.detailsRow}>
                        <Icon source="phone" size={14} color={colors.textSecondary} />
                        <Text style={styles.secondaryText}>{staff.mobile}</Text>
                      </View>
                      
                      {staff.email ? (
                        <View style={styles.detailsRow}>
                          <Icon source="email-outline" size={14} color={colors.textSecondary} />
                          <Text style={styles.secondaryText}>{staff.email}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Right: Status Pill */}
                    <StatusPill 
                      label={isActive ? "ACTIVE" : "INACTIVE"} 
                      tone={isActive ? "green" : "neutral"} 
                      style={styles.statusPill}
                    />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Section title="Staff activity tracking">
          <View style={styles.infoCard}>
            <Icon source="chart-timeline-variant" size={22} color={colors.textSecondary} />
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>Requires backend support</Text>
              <Text style={styles.secondaryText}>
                Attendance, staff-wise sales, payments, expenses, order packing, cash-session history, and performance dashboards need backend activity endpoints before they can be shown here.
              </Text>
            </View>
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}

export function AddEditStaff() {
  const route = useRoute();
  const staff = (route.params as { staff?: ApiUser } | undefined)?.staff;
  
  const [form, setForm] = useState({ 
    name: staff?.name ?? "", 
    mobile: staff?.mobile ?? "", 
    email: staff?.email ?? "", 
    password: "", 
    status: staff?.status ?? "ACTIVE" 
  });
  
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  
  const createMutation = useCreateStaffMutation();
  const updateMutation = useUpdateStaffMutation();
  const [error, setError] = useState("");

  const handleSave = () => {
    if (isPending) return;
    setError("");
    if (!form.name.trim() || !form.mobile.trim() || (!staff && form.password.length < 4)) {
      setError("Enter name, mobile number, and a password of at least 4 characters.");
      return;
    }
    const payload = { 
      ...form, 
      email: form.email || null, 
      password: form.password || undefined 
    };
    const save = () => {
      if (staff) {
      updateMutation.mutate({ id: staff.id, data: payload }, {
        onSuccess: () => goBack(),
        onError: (err: any) => setError(err?.message || "Failed to update staff member."),
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => goBack(),
        onError: (err: any) => setError(err?.message || "Failed to create staff member."),
      });
    }
    };

    if (staff && form.status === "INACTIVE" && staff.status !== "INACTIVE") {
      Alert.alert(
        "Disable staff account?",
        "This staff member will no longer be able to log in.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Disable", style: "destructive", onPress: save },
        ],
      );
      return;
    }

    save();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Screen>
      <AppHeader 
        title={staff ? "Edit Staff" : "Add Staff"} 
        subtitle="Configure access credentials and status." 
        fallbackRoute="StaffManagement"
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Section title="Account details">
          <View style={styles.formCard}>
            <TextInput 
              mode="outlined" 
              label="Full Name" 
              value={form.name} 
              onChangeText={(v) => set("name", v)} 
              outlineStyle={styles.inputOutline}
              activeOutlineColor={colors.primary}
              style={styles.input}
            />
            <TextInput 
              mode="outlined" 
              label="Mobile Number" 
              keyboardType="phone-pad" 
              value={form.mobile} 
              onChangeText={(v) => set("mobile", v)} 
              outlineStyle={styles.inputOutline}
              activeOutlineColor={colors.primary}
              style={styles.input}
            />
            <TextInput 
              mode="outlined" 
              label="Email Address" 
              keyboardType="email-address"
              autoCapitalize="none"
              value={form.email ?? ""} 
              onChangeText={(v) => set("email", v)} 
              outlineStyle={styles.inputOutline}
              activeOutlineColor={colors.primary}
              style={styles.input}
            />
            <TextInput 
              mode="outlined" 
              label={staff ? "New Password (optional)" : "Password"} 
              secureTextEntry 
              value={form.password} 
              onChangeText={(v) => set("password", v)} 
              outlineStyle={styles.inputOutline}
              activeOutlineColor={colors.primary}
              style={styles.input}
            />

            {staff && (
              <>
                <Divider style={styles.divider} />
	                <View style={styles.statusToggleRow}>
                  <View style={styles.toggleTextContainer}>
                    <Text style={styles.toggleTitle}>Active Status</Text>
                    <Text style={styles.toggleSubtitle}>Allow this staff member to log in</Text>
                  </View>
                  <Switch
                    value={form.status === "ACTIVE"}
                    onValueChange={(val) => set("status", val ? "ACTIVE" : "INACTIVE")}
                    color={colors.primary}
                  />
	                </View>
	              </>
	            )}
	            {error ? <HelperText type="error">{error}</HelperText> : null}
	          </View>
        </Section>
        
        <View style={styles.formButtonContainer}>
          <Button 
            mode="contained" 
	            loading={isPending} 
	            disabled={isPending || !form.name.trim() || !form.mobile.trim() || (!staff && form.password.length < 4)} 
            onPress={handleSave} 
            style={styles.addButton} 
            contentStyle={styles.buttonContent}
            labelStyle={styles.addButtonLabel}
          >
            {staff ? "Update Staff Member" : "Create Staff Member"}
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addButton: {
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    ...shadow.md,
  },
  addButtonLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: "white",
  },
  buttonContent: {
    height: 48,
  },
  headerButtonContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.huge,
  },
  listGap: {
    gap: spacing.md,
  },
  centerState: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  errorText: {
    color: colors.danger,
  },
  infoCard: {
    flexDirection: "row",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  infoText: {
    flex: 1,
    gap: 4,
  },
  infoTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  staffCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    ...shadow.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(22, 163, 74, 0.2)",
  },
  avatarText: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: fontWeight.bold,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  staffName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  secondaryText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  statusPill: {
    alignSelf: "center",
  },
  formCard: {
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    ...shadow.sm,
  },
  input: {
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  divider: {
    marginVertical: spacing.md,
    backgroundColor: colors.border,
  },
  statusToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleTextContainer: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  toggleSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  formButtonContainer: {
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
});
