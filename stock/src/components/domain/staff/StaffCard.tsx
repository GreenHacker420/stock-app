import { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";

import { StatusPill } from "../../ui/StatusPill";
import { colors, fontSize, fontWeight, radius, shadow, spacing } from "../../../theme";

type StaffCardProps = {
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  status?: string;
  assignedShopName?: string;
  attendanceSummary?: string;
  subtitle?: string;
  onPress?: () => void;
  actions?: ReactNode;
};

export function StaffCard({
  name,
  role,
  phone,
  email,
  status,
  assignedShopName,
  attendanceSummary,
  subtitle,
  onPress,
  actions,
}: StaffCardProps) {
  const meta = subtitle || [phone, email].filter(Boolean).join(" • ");
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Open staff member ${name}` : undefined}
    >
      <View style={styles.avatar}>
        <Icon source="account-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {status ? <StatusPill label={status} tone={status === "Assigned" || status === "Active" ? "green" : "neutral"} /> : null}
        </View>
        {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
        <View style={styles.detailRow}>
          {role ? <Text style={styles.detail} numberOfLines={1}>{role}</Text> : null}
          {assignedShopName ? <Text style={styles.detail} numberOfLines={1}>{assignedShopName}</Text> : null}
          {attendanceSummary ? <Text style={styles.detail} numberOfLines={1}>{attendanceSummary}</Text> : null}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 72,
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  pressed: { opacity: 0.72 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { flex: 1, color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.black },
  meta: { color: colors.textSecondary, fontSize: fontSize.xs },
  detailRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  detail: { color: colors.textMuted, fontSize: 10, fontWeight: fontWeight.semibold },
  actions: { marginTop: spacing.xs },
});
