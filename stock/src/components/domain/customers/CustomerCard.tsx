import { ActivityIndicator, GestureResponderEvent, Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";

import { StatusPill } from "../../ui/StatusPill";
import { colors, fontSize, fontWeight, radius, shadow, spacing } from "../../../theme";

type CustomerCardProps = {
  name: string;
  subtitle?: string;
  statusLabel?: string;
  statusTone?: "green" | "amber" | "red" | "blue" | "neutral";
  outstandingLabel?: string;
  limitLabel?: string;
  onPress?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
};

export function CustomerCard({
  name,
  subtitle,
  statusLabel,
  statusTone,
  outstandingLabel,
  limitLabel,
  onPress,
  onDelete,
  deleting = false,
}: CustomerCardProps) {
  const handleDelete = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onDelete?.();
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Open ${name}` : undefined}
    >
      <View style={styles.header}>
        <View style={styles.main}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        <View style={styles.headerActions}>
          {statusLabel ? <StatusPill label={statusLabel} tone={statusTone} /> : null}
          {onDelete ? (
            <Pressable
              onPress={handleDelete}
              disabled={deleting}
              hitSlop={8}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.deletePressed]}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${name}`}
            >
              {deleting ? (
                <ActivityIndicator size={18} color={colors.danger} />
              ) : (
                <Icon source="trash-can-outline" size={19} color={colors.danger} />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
      {(outstandingLabel || limitLabel) ? (
        <View style={styles.footer}>
          {outstandingLabel ? <Text style={styles.meta} numberOfLines={1}>{outstandingLabel}</Text> : null}
          {limitLabel ? <Text style={styles.metaMuted} numberOfLines={1}>{limitLabel}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadow.sm,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerActions: { alignItems: "flex-end", gap: spacing.sm },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerLight,
  },
  deletePressed: { opacity: 0.65 },
  main: { flex: 1, minWidth: 0 },
  name: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.black },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 3 },
  footer: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  meta: { flex: 1, color: colors.textPrimary, fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  metaMuted: { flexShrink: 1, color: colors.textMuted, fontSize: fontSize.xs, textAlign: "right" },
});
