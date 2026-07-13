import React from "react";
import { View, StyleSheet } from "react-native";
import { TextInput as PaperTextInput } from "react-native-paper";
import { AppBottomSheetModal } from "@/components/overlays/AppBottomSheetModal";
import { Button } from "@/components/ui/Button";
import { colors, spacing } from "@/theme";

interface IssueInvoiceSheetProps {
  visible: boolean;
  onDismiss: () => void;
  invoiceNumber: string;
  setInvoiceNumber: (val: string) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function IssueInvoiceSheet({
  visible,
  onDismiss,
  invoiceNumber,
  setInvoiceNumber,
  onConfirm,
  isPending,
}: IssueInvoiceSheetProps) {
  return (
    <AppBottomSheetModal
      visible={visible}
      title="Issue GST Invoice"
      onDismiss={onDismiss}
      isBusy={isPending}
      scrollable
    >
      <View style={styles.contentContainer}>
        <PaperTextInput
          mode="outlined"
          label="Tally Invoice Number"
          value={invoiceNumber}
          onChangeText={setInvoiceNumber}
          outlineColor={colors.border}
          activeOutlineColor={colors.primary}
          textColor={colors.textPrimary}
          placeholder="e.g. VS-2026-145"
          autoCapitalize="characters"
          style={styles.textInput}
        />
      </View>

      <View style={styles.actionsRow}>
        <Button
          label="Cancel"
          variant="ghost"
          onPress={onDismiss}
          style={styles.cancelBtn}
        />
        <Button
          label="Issue"
          variant="primary"
          loading={isPending}
          disabled={isPending || !invoiceNumber.trim()}
          onPress={onConfirm}
          style={styles.confirmBtn}
        />
      </View>
    </AppBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    marginVertical: spacing.md,
  },
  textInput: {
    backgroundColor: colors.surface,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
  },
  confirmBtn: {
    flex: 1.5,
  },
});
