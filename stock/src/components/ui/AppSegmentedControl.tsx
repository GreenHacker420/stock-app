import { StyleSheet, Pressable, ScrollView, View, StyleProp, ViewStyle } from "react-native";
import { Text, Icon } from "react-native-paper";

import { colors, spacing, radius, fontSize, fontWeight } from "../../theme";

export type AppSegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: string;
  badge?: string | number;
};

type AppSegmentedControlProps<T extends string> = {
  options: readonly AppSegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  scrollable?: boolean;
  minOptionWidth?: number;
};

export function AppSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  scrollable = false,
  minOptionWidth,
}: AppSegmentedControlProps<T>) {
  const content = (
    <View style={[styles.row, scrollable && styles.scrollRow, !scrollable && style]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              scrollable && styles.scrollOption,
              minOptionWidth ? { minWidth: minOptionWidth } : undefined,
              active && styles.optionActive,
              pressed && styles.pressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            {option.icon ? (
              <Icon source={option.icon} size={14} color={active ? colors.primary : colors.textMuted} />
            ) : null}
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {option.label}
            </Text>
            {option.badge !== undefined ? (
              <View style={[styles.badge, active && styles.badgeActive]}>
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

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={[styles.scrollContainer, style]}
      >
        {content}
      </ScrollView>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 0,
  },
  row: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  scrollRow: {
    flexGrow: 1,
  },
  option: {
    flex: 1,
    minWidth: 0,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  scrollOption: {
    flex: 0,
  },
  optionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: fontWeight.black,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceOffset,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeActive: {
    backgroundColor: colors.surface,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
  },
  badgeTextActive: {
    color: colors.primary,
  },
  pressed: {
    opacity: 0.72,
  },
});
