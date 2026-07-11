import { useCallback, useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";
import { colors, fontSize, fontWeight, radius, spacing } from "../../../../theme";

type QuantityStepperProps = {
  itemName: string;
  quantity: number;
  maximum: number;
  onIncrement: () => void;
  onDecrement: () => void;
  compact?: boolean;
};

export function QuantityStepper({
  itemName,
  quantity,
  maximum,
  onIncrement,
  onDecrement,
  compact = false,
}: QuantityStepperProps) {
  const repeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didRepeatRef = useRef(false);

  const safeMaximum =
    Number.isFinite(maximum) && maximum > 0
      ? Math.floor(maximum)
      : 0;

  const canDecrement = quantity > 0;
  const canIncrement = quantity < safeMaximum;

  const stopRepeating = useCallback(() => {
    if (repeatTimeoutRef.current) {
      clearTimeout(repeatTimeoutRef.current);
    }
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
    }
    repeatTimeoutRef.current = null;
    repeatIntervalRef.current = null;
  }, []);

  useEffect(() => stopRepeating, [stopRepeating]);

  useEffect(() => {
    if (!canIncrement && !canDecrement) {
      stopRepeating();
    }
  }, [canDecrement, canIncrement, stopRepeating]);

  const beginRepeating = useCallback(
    (action: () => void) => {
      stopRepeating();
      didRepeatRef.current = false;

      repeatTimeoutRef.current = setTimeout(() => {
        didRepeatRef.current = true;
        action();

        repeatIntervalRef.current = setInterval(action, 120);
      }, 350);
    },
    [stopRepeating]
  );

  const handlePress = useCallback((action: () => void) => {
    if (!didRepeatRef.current) {
      action();
    }
  }, []);

  return (
    <View
      style={styles.row}
      accessibilityRole="adjustable"
      accessibilityLabel={`${itemName} quantity`}
      accessibilityValue={{
        min: 0,
        max: safeMaximum,
        now: quantity,
        text: String(quantity),
      }}
    >
      <Pressable
        onPressIn={() => beginRepeating(onDecrement)}
        onPressOut={stopRepeating}
        onPress={() => handlePress(onDecrement)}
        disabled={!canDecrement}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${itemName} quantity`}
        accessibilityState={{ disabled: !canDecrement }}
        style={({ pressed }) => [
          styles.button,
          compact && styles.compactButton,
          !canDecrement && styles.disabled,
          pressed && canDecrement && styles.pressed,
        ]}
      >
        <Icon
          source="minus"
          size={compact ? 18 : 20}
          color={
            canDecrement
              ? colors.primary
              : colors.textMuted
          }
        />
      </Pressable>

      <View style={[styles.value, compact && styles.compactValue]}>
        <Text style={styles.valueText}>{quantity}</Text>
      </View>

      <Pressable
        onPressIn={() => beginRepeating(onIncrement)}
        onPressOut={stopRepeating}
        onPress={() => handlePress(onIncrement)}
        disabled={!canIncrement}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${itemName} quantity`}
        accessibilityState={{ disabled: !canIncrement }}
        style={({ pressed }) => [
          styles.button,
          compact && styles.compactButton,
          !canIncrement && styles.disabled,
          pressed && canIncrement && styles.pressed,
        ]}
      >
        <Icon
          source="plus"
          size={compact ? 18 : 20}
          color={
            canIncrement
              ? colors.primary
              : colors.textMuted
          }
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  button: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  compactButton: { width: 32, height: 32 },
  value: { minWidth: 34, height: 36, alignItems: "center", justifyContent: "center" },
  compactValue: { height: 32 },
  valueText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
