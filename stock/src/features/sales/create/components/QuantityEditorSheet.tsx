import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text, TextInput } from "react-native-paper";

import { AppBottomSheetModal } from "@/components/overlays/AppBottomSheetModal";
import { Button } from "@/components/ui/Button";
import { colors, fontSize, radius, spacing } from "@/theme";

type QuantityEditorSheetProps = {
  visible: boolean;
  itemName: string;
  quantity: number;
  maximum: number;
  onDismiss: () => void;
  onSave: (quantity: number) => void;
};

export function QuantityEditorSheet({
  visible,
  itemName,
  quantity,
  maximum,
  onDismiss,
  onSave,
}: QuantityEditorSheetProps) {
  const safeMaximum = Number.isFinite(maximum) ? Math.max(0, Math.floor(maximum)) : 0;
  const [value, setValue] = useState(String(quantity));

  useEffect(() => {
    if (visible) setValue(String(quantity));
  }, [quantity, visible]);

  const parsed = Number(value);
  const isWholeNumber = Number.isInteger(parsed);
  const isValid = value.trim().length > 0
    && isWholeNumber
    && parsed >= 0
    && parsed <= safeMaximum;

  const error = !value.trim()
    ? "Enter a quantity."
    : !isWholeNumber || parsed < 0
      ? "Quantity must be a whole number."
      : parsed > safeMaximum
        ? `Only ${safeMaximum} available.`
        : null;

  return (
    <AppBottomSheetModal
      visible={visible}
      title="Set quantity"
      subtitle={itemName}
      onDismiss={onDismiss}
      maxHeight={0.55}
    >
      <View style={styles.content}>
        <TextInput
          mode="outlined"
          label={`Quantity (max ${safeMaximum})`}
          value={value}
          onChangeText={(next) => setValue(next.replace(/[^\d]/g, ""))}
          keyboardType="number-pad"
          selectTextOnFocus
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => {
            if (isValid) {
              onSave(parsed);
              onDismiss();
            }
          }}
          error={Boolean(error)}
          outlineStyle={styles.inputOutline}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.hint}>
          Enter 0 to remove the item. Serial numbers are kept up to the new quantity.
        </Text>
        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" onPress={onDismiss} style={styles.button} />
          <Button
            label="Set quantity"
            variant="success"
            disabled={!isValid}
            onPress={() => {
              onSave(parsed);
              onDismiss();
            }}
            style={styles.button}
          />
        </View>
      </View>
    </AppBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    fontSize: fontSize.lg,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  button: {
    flex: 1,
  },
});
