import { StyleSheet, Pressable, ScrollView } from "react-native";
import { Text, Icon } from "react-native-paper";

import { colors, spacing, radius, fontSize, fontWeight } from "../../theme";
import { triggerLightHaptic } from "../../utils/haptics";

export type StockFilter = "ALL" | "IN" | "LOW" | "OUT";

export function FilterChips({
  value,
  onChange,
}: {
  value: StockFilter;
  onChange: (v: StockFilter) => void;
}) {
  const chips: { id: StockFilter; label: string; icon: string; color: string }[] = [
    { id: "ALL", label: "All", icon: "package-variant", color: colors.primary },
    { id: "IN", label: "In Stock", icon: "check-circle-outline", color: colors.primary },
    { id: "LOW", label: "Low", icon: "alert-circle-outline", color: colors.warning },
    { id: "OUT", label: "Out", icon: "close-circle-outline", color: colors.danger },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
      {chips.map((c) => {
        const active = value === c.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => {
              triggerLightHaptic();
              onChange(c.id);
            }}
            style={[styles.filterChip, active && { backgroundColor: c.color + "18", borderColor: c.color }]}
          >
            <Icon source={c.icon} size={13} color={active ? c.color : colors.textMuted} />
            <Text style={[styles.filterChipText, active && { color: c.color, fontWeight: fontWeight.bold }]}>
              {c.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
});
