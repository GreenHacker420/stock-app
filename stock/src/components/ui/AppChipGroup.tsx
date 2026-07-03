import { ScrollView, StyleSheet, Pressable, View, StyleProp, ViewStyle } from "react-native";
import { Text, Icon } from "react-native-paper";

import { colors, spacing, radius, fontSize, fontWeight } from "../../theme";
import { triggerLightHaptic } from "../../utils/haptics";

export type AppChipOption<T extends string> = {
  value: T;
  label: string;
  icon?: string;
  badge?: string | number;
  tone?: "green" | "amber" | "red" | "blue" | "neutral";
};

type AppChipGroupProps<T extends string> = {
  options: readonly AppChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  scrollable?: boolean;
  variant?: "pill" | "summary";
  style?: StyleProp<ViewStyle>;
};

const tones = {
  green: colors.success,
  amber: colors.warning,
  red: colors.danger,
  blue: colors.info,
  neutral: colors.primary,
};

export function AppChipGroup<T extends string>({
  options,
  value,
  onChange,
  scrollable = false,
  variant = "pill",
  style,
}: AppChipGroupProps<T>) {
  const row = (
    <View style={[styles.row, style]}>
      {options.map((option) => {
        const active = option.value === value;
        const activeColor = tones[option.tone ?? "neutral"];
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              triggerLightHaptic();
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.chip,
              variant === "summary" && styles.summaryChip,
              !scrollable && styles.flexChip,
              active && { borderColor: activeColor, backgroundColor: `${activeColor}18` },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {option.icon ? (
              <Icon source={option.icon} size={14} color={active ? activeColor : colors.textMuted} />
            ) : null}
            <Text style={[styles.label, variant === "summary" && styles.summaryLabel, active && { color: activeColor }]} numberOfLines={1}>
              {option.label}
            </Text>
            {option.badge !== undefined ? (
              <View style={[styles.badge, active && { backgroundColor: activeColor }]}>
                <Text style={[styles.badgeText, active && styles.badgeTextActive]} numberOfLines={1}>
                  {option.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  if (!scrollable) return row;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {row}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  chip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryChip: {
    minHeight: 62,
    flexDirection: "column",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  flexChip: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  summaryLabel: {
    fontSize: 10,
    color: colors.textMuted,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceOffset,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
  },
  badgeTextActive: {
    color: colors.textInverse,
  },
  pressed: {
    opacity: 0.72,
  },
});
