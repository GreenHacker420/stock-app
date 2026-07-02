import { useState, useMemo } from "react";
import { Alert, Pressable, ScrollView, View, StyleSheet } from "react-native";
import { useRoute } from "@react-navigation/native";
import { ActivityIndicator, Button, Text, TextInput, Divider, HelperText, Icon, Switch, Portal, Dialog } from "react-native-paper";
import { ApiUser } from "../../api/client";
import { useStaffQuery, useCreateStaffMutation, useUpdateStaffMutation } from "../../hooks/useAuth";
import { useStaffTodaySummaryQuery } from "../../hooks/useDashboard";
import { useAttendanceQuery } from "../../hooks/useAttendance";
import { useAuditLogsQuery } from "../../hooks/useAuditLogs";
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
              <Pressable key={staff.id} onPress={() => navigate("StaffDetail", { staff })}>
                <View style={styles.staffCard}>
                  <View style={styles.cardHeader}>
                    {/* Left: Round Avatar */}
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{getInitials(staff.name)}</Text>
                    </View>

                    <View style={styles.cardInfo}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                        <Text style={styles.staffName}>{staff.name}</Text>
                        {staff.role === "OWNER" && (
                          <View style={{ backgroundColor: colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm }}>
                            <Text style={{ fontSize: 9, fontWeight: fontWeight.black, color: colors.primaryDark }}>OWNER</Text>
                          </View>
                        )}
                      </View>
                      
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
            <Icon source="chart-timeline-variant" size={22} color={colors.primary} />
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>Activity tracking active</Text>
              <Text style={styles.secondaryText}>
                Select any staff member from the list above to view their real-time performance summary, check-in history, and audit trail logs.
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
    status: staff?.status ?? "ACTIVE",
    role: staff?.role ?? "STAFF" as "STAFF" | "OWNER"
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

            <Divider style={styles.divider} />
            <View style={styles.statusToggleRow}>
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleTitle}>Account Role</Text>
                <Text style={styles.toggleSubtitle}>Select whether this user is Staff or an Owner</Text>
              </View>
              <View style={styles.roleContainer}>
                <Pressable
                  style={[styles.roleBtn, form.role === "STAFF" && styles.roleBtnActive]}
                  onPress={() => set("role", "STAFF")}
                >
                  <Text style={[styles.roleBtnText, form.role === "STAFF" && styles.roleBtnTextActive]}>Staff</Text>
                </Pressable>
                <Pressable
                  style={[styles.roleBtn, form.role === "OWNER" && styles.roleBtnActive]}
                  onPress={() => set("role", "OWNER")}
                >
                  <Text style={[styles.roleBtnText, form.role === "OWNER" && styles.roleBtnTextActive]}>Owner</Text>
                </Pressable>
              </View>
            </View>

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
  roleContainer: {
    flexDirection: "row",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  roleBtnActive: {
    backgroundColor: colors.primary,
  },
  roleBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  roleBtnTextActive: {
    color: "#fff",
  },
  profileSummaryCard: {
    margin: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    ...shadow.sm,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatarLarge: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(22, 163, 74, 0.2)",
  },
  avatarLargeText: {
    color: colors.primaryDark,
    fontSize: 20,
    fontWeight: fontWeight.bold,
  },
  profileInfo: {
    gap: 4,
  },
  profileName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  profileRole: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
    letterSpacing: 1,
  },
  profileDetails: {
    gap: spacing.sm,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  editBtn: {
    borderRadius: radius.md,
    borderColor: colors.primary,
    marginTop: spacing.sm,
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTabButton: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  activeTabText: {
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  scrollContentDetail: {
    paddingBottom: spacing.huge,
  },
  detailTabContent: {
    padding: spacing.lg,
  },
  tabSectionTitle: {
    fontSize: 16,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    letterSpacing: -0.3,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  metricItem: {
    width: "47%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    ...shadow.sm,
  },
  metricVal: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  metricLbl: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
  },
  footerInfoBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
  },
  infoSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  listContainer: {
    gap: spacing.md,
  },
  logCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logDateText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  logTimes: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  timeCol: {
    gap: 2,
  },
  timeLbl: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
  },
  timeVal: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  logNote: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 2,
  },
  auditCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    ...shadow.sm,
  },
  auditRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  auditAction: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  auditTime: {
    fontSize: 10,
    color: colors.textMuted,
  },
  auditEntity: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  auditReason: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 2,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    marginVertical: spacing.xl,
  },
  presetsScroll: {
    paddingHorizontal: 2,
    gap: spacing.sm,
  },
  presetPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  presetPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetPillText: {
    fontSize: fontSize.xs + 1,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  presetPillTextActive: {
    color: "#fff",
  },
});

export function StaffDetail() {
  const route = useRoute();
  const staff = (route.params as { staff: ApiUser }).staff;
  const [activeTab, setActiveTab] = useState<"activity" | "attendance" | "audit">("activity");

  const [rangePreset, setRangePreset] = useState<"today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "custom">("today");
  const [customDates, setCustomDates] = useState({ from: "", to: "" });
  const [customDatesModalVisible, setCustomDatesModalVisible] = useState(false);

  const activeRange = useMemo(() => {
    const today = new Date();
    const formatLocal = (d: Date) => {
      return d.toLocaleDateString('en-CA');
    };

    const todayStr = formatLocal(today);

    if (rangePreset === "today") {
      return { dateFrom: todayStr, dateTo: todayStr, label: "Today" };
    }
    if (rangePreset === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      return { dateFrom: formatLocal(yesterday), dateTo: formatLocal(yesterday), label: "Yesterday" };
    }
    if (rangePreset === "thisWeek") {
      const startOfWeek = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      return { dateFrom: formatLocal(startOfWeek), dateTo: todayStr, label: "This Week" };
    }
    if (rangePreset === "lastWeek") {
      const startOfWeek = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      
      const startOfLastWeek = new Date(startOfWeek);
      startOfLastWeek.setDate(startOfWeek.getDate() - 7);
      const endOfLastWeek = new Date(startOfWeek);
      endOfLastWeek.setDate(startOfWeek.getDate() - 1);
      return { dateFrom: formatLocal(startOfLastWeek), dateTo: formatLocal(endOfLastWeek), label: "Last Week" };
    }
    if (rangePreset === "thisMonth") {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return { dateFrom: formatLocal(startOfMonth), dateTo: todayStr, label: "This Month" };
    }
    return { dateFrom: customDates.from || todayStr, dateTo: customDates.to || todayStr, label: "Custom Range" };
  }, [rangePreset, customDates]);
  
  const summaryQuery = useStaffTodaySummaryQuery({
    staffId: staff.id,
    dateFrom: activeRange.dateFrom,
    dateTo: activeRange.dateTo
  });
  const attendanceQuery = useAttendanceQuery({ staffId: staff.id });
  const auditLogsQuery = useAuditLogsQuery({ userId: staff.id });

  const renderActivityTab = () => {
    return (
      <View style={styles.detailTabContent}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.presetsScroll}
          style={{ marginBottom: spacing.md }}
        >
          {(["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "custom"] as const).map((preset) => {
            const isActive = rangePreset === preset;
            const labels = {
              today: "Today",
              yesterday: "Yesterday",
              thisWeek: "This Week",
              lastWeek: "Last Week",
              thisMonth: "This Month",
              custom: "Custom...",
            };
            return (
              <Pressable
                key={preset}
                onPress={() => {
                  if (preset === "custom") {
                    setCustomDatesModalVisible(true);
                  } else {
                    setRangePreset(preset);
                  }
                }}
                style={[styles.presetPill, isActive && styles.presetPillActive]}
              >
                <Text style={[styles.presetPillText, isActive && styles.presetPillTextActive]}>
                  {preset === "custom" && rangePreset === "custom" && customDates.from
                    ? `${customDates.from} - ${customDates.to}`
                    : labels[preset]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {summaryQuery.isLoading ? (
          <ActivityIndicator style={{ margin: spacing.lg }} color={colors.primary} />
        ) : summaryQuery.isError || !summaryQuery.data ? (
          <Text style={styles.errorText}>Failed to load activity summary.</Text>
        ) : (() => {
          const data = summaryQuery.data;
          return (
            <>
              <Text style={styles.tabSectionTitle}>
                {rangePreset === "today" 
                  ? `Today's Summary (${data.date})` 
                  : `Activity Summary (${activeRange.label})`}
              </Text>
              <View style={styles.metricsGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{data.salesCount}</Text>
                  <Text style={styles.metricLbl}>Sales Count</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>₹{data.salesTotal}</Text>
                  <Text style={styles.metricLbl}>Sales Volume</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{data.dmsCreated}</Text>
                  <Text style={styles.metricLbl}>DMs Created</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>₹{data.dmTotal}</Text>
                  <Text style={styles.metricLbl}>DM Volume</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>₹{data.cashCollected}</Text>
                  <Text style={styles.metricLbl}>Cash Collected</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>₹{data.upiRecorded}</Text>
                  <Text style={styles.metricLbl}>UPI Recorded</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{data.ordersPacked}</Text>
                  <Text style={styles.metricLbl}>Orders Packed</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{data.stockEntries}</Text>
                  <Text style={styles.metricLbl}>Stock Entries</Text>
                </View>
              </View>
              {rangePreset === "today" && (
                <View style={styles.footerInfoBox}>
                  <Text style={styles.infoSubtitle}>Day Close Status: <Text style={{fontWeight: 'bold', color: data.dayCloseStatus === 'CLOSED' ? colors.success : colors.warning}}>{data.dayCloseStatus}</Text></Text>
                </View>
              )}
            </>
          );
        })()}
      </View>
    );
  };

  const renderAttendanceTab = () => {
    if (attendanceQuery.isLoading) return <ActivityIndicator style={{ margin: spacing.lg }} color={colors.primary} />;
    const list = attendanceQuery.data ?? [];
    if (list.length === 0) {
      return <Text style={styles.emptyText}>No attendance records found.</Text>;
    }
    return (
      <View style={styles.detailTabContent}>
        <Text style={styles.tabSectionTitle}>Attendance Logs</Text>
        <View style={styles.listContainer}>
          {list.map((log: any) => {
            const checkInTime = log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A";
            const checkOutTime = log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A";
            const logDate = new Date(log.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            return (
              <View key={log.id} style={styles.logCard}>
                <View style={styles.logHeader}>
                  <Text style={styles.logDateText}>{logDate}</Text>
                  <StatusPill label={log.status} tone={log.status === "PRESENT" ? "green" : "red"} />
                </View>
                <View style={styles.logTimes}>
                  <View style={styles.timeCol}>
                    <Text style={styles.timeLbl}>CHECK IN</Text>
                    <Text style={styles.timeVal}>{checkInTime}</Text>
                  </View>
                  <View style={styles.timeCol}>
                    <Text style={styles.timeLbl}>CHECK OUT</Text>
                    <Text style={styles.timeVal}>{checkOutTime}</Text>
                  </View>
                </View>
                {log.note ? <Text style={styles.logNote}>Note: "{log.note}"</Text> : null}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderAuditTab = () => {
    if (auditLogsQuery.isLoading) return <ActivityIndicator style={{ margin: spacing.lg }} color={colors.primary} />;
    const list = auditLogsQuery.data ?? [];
    if (list.length === 0) {
      return <Text style={styles.emptyText}>No system activity logs found.</Text>;
    }
    return (
      <View style={styles.detailTabContent}>
        <Text style={styles.tabSectionTitle}>System Activity (Audit Log)</Text>
        <View style={styles.listContainer}>
          {list.map((log: any) => {
            const time = new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const date = new Date(log.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
            return (
              <View key={log.id} style={styles.auditCard}>
                <View style={styles.auditRow}>
                  <Text style={styles.auditAction}>{log.action}</Text>
                  <Text style={styles.auditTime}>{date} {time}</Text>
                </View>
                <Text style={styles.auditEntity}>{log.entityType} ID: {log.entityId}</Text>
                {log.reason ? <Text style={styles.auditReason}>Reason: "{log.reason}"</Text> : null}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Screen edges={["top", "left", "right"]} scroll={true}>
      <AppHeader title="Staff Details" subtitle="View performance and logs." showBack={true} />
      
      <View style={styles.profileSummaryCard}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{getInitials(staff.name)}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{staff.name}</Text>
            <Text style={styles.profileRole}>STAFF MEMBER</Text>
          </View>
        </View>
        
        <Divider style={styles.divider} />
        
        <View style={styles.profileDetails}>
          <View style={styles.detailsRow}>
            <Icon source="phone" size={16} color={colors.textSecondary} />
            <Text style={styles.secondaryText}>{staff.mobile}</Text>
          </View>
          {staff.email ? (
            <View style={styles.detailsRow}>
              <Icon source="email-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.secondaryText}>{staff.email}</Text>
            </View>
          ) : null}
        </View>

        <Button 
          mode="outlined" 
          icon="account-cog"
          onPress={() => navigate("AddEditStaff", { staff })}
          style={styles.editBtn}
          textColor={colors.primary}
        >
          Edit Staff Account
        </Button>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <Pressable 
          style={[styles.tabButton, activeTab === "activity" && styles.activeTabButton]}
          onPress={() => setActiveTab("activity")}
        >
          <Text style={[styles.tabText, activeTab === "activity" && styles.activeTabText]}>Activity</Text>
        </Pressable>
        <Pressable 
          style={[styles.tabButton, activeTab === "attendance" && styles.activeTabButton]}
          onPress={() => setActiveTab("attendance")}
        >
          <Text style={[styles.tabText, activeTab === "attendance" && styles.activeTabText]}>Attendance</Text>
        </Pressable>
        <Pressable 
          style={[styles.tabButton, activeTab === "audit" && styles.activeTabButton]}
          onPress={() => setActiveTab("audit")}
        >
          <Text style={[styles.tabText, activeTab === "audit" && styles.activeTabText]}>Logs</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContentDetail}>
        {activeTab === "activity" && renderActivityTab()}
        {activeTab === "attendance" && renderAttendanceTab()}
        {activeTab === "audit" && renderAuditTab()}
      </ScrollView>

      {/* Custom Dates Dialog */}
      <Portal>
        <Dialog visible={customDatesModalVisible} onDismiss={() => setCustomDatesModalVisible(false)} style={{ borderRadius: radius.lg, backgroundColor: colors.surface }}>
          <Dialog.Title style={{ fontWeight: fontWeight.bold }}>Select Custom Range</Dialog.Title>
          <Dialog.Content style={{ gap: spacing.md }}>
            <TextInput
              mode="outlined"
              label="Start Date (YYYY-MM-DD)"
              placeholder="YYYY-MM-DD"
              value={customDates.from || new Date().toISOString().slice(0, 10)}
              onChangeText={(v) => setCustomDates((prev) => ({ ...prev, from: v }))}
              outlineStyle={{ borderRadius: radius.md }}
              activeOutlineColor={colors.primary}
              style={{ backgroundColor: colors.surface }}
            />
            <TextInput
              mode="outlined"
              label="End Date (YYYY-MM-DD)"
              placeholder="YYYY-MM-DD"
              value={customDates.to || new Date().toISOString().slice(0, 10)}
              onChangeText={(v) => setCustomDates((prev) => ({ ...prev, to: v }))}
              outlineStyle={{ borderRadius: radius.md }}
              activeOutlineColor={colors.primary}
              style={{ backgroundColor: colors.surface }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCustomDatesModalVisible(false)} textColor={colors.textSecondary}>Cancel</Button>
            <Button
              onPress={() => {
                const regex = /^\d{4}-\d{2}-\d{2}$/;
                if (!regex.test(customDates.from) || !regex.test(customDates.to)) {
                  Alert.alert("Invalid Format", "Please enter dates as YYYY-MM-DD.");
                  return;
                }
                setRangePreset("custom");
                setCustomDatesModalVisible(false);
              }}
              textColor={colors.primary}
              labelStyle={{ fontWeight: fontWeight.bold }}
            >
              Apply
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}
