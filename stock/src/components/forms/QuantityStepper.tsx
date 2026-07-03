import { StyleProp, StyleSheet, View, ViewStyle, Pressable } from "react-native";
import { Icon, Text } from "react-native-paper";

import { colors, fontSize, fontWeight, radius, spacing } from "../../theme";
import { triggerLightHaptic } from "../../utils/haptics";

type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function QuantityStepper({ value, onChange, min = 0, max, step = 1, unit, disabled, style }: QuantityStepperProps) {
  const canDecrease = !disabled && value - step >= min;
  const canIncrease = !disabled && (max === undefined || value + step <= max);
  const setValue = (next: number) => {
    triggerLightHaptic();
    onChange(next);
  };

  return (
    <View style={[styles.container, style]}>
      <Pressable
        onPress={() => canDecrease && setValue(value - step)}
        disabled={!canDecrease}
        hitSlop={8}
        style={[styles.button, !canDecrease && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
      >
        <Icon source="minus" size={18} color={canDecrease ? colors.textPrimary : colors.textMuted} />
      </Pressable>
      <View style={styles.valueWrap}>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {unit ? <Text style={styles.unit} numberOfLines={1}>{unit}</Text> : null}
      </View>
      <Pressable
        onPress={() => canIncrease && setValue(value + step)}
        disabled={!canIncrease}
        hitSlop={8}
        style={[styles.button, styles.primaryButton, !canIncrease && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
      >
        <Icon source="plus" size={18} color={canIncrease ? colors.primary : colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary + "44",
  },
  disabled: {
    opacity: 0.45,
  },
  valueWrap: {
    minWidth: 56,
    flex: 1,
    alignItems: "center",
  },
  value: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  unit: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
});
