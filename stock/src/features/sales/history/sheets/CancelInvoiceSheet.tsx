import { View, Pressable, StyleSheet } from "react-native";
import { Text, TextInput as PaperTextInput, Icon } from "react-native-paper";
import { AppBottomSheetModal } from "@/components/overlays/AppBottomSheetModal";
import { Button } from "@/components/ui/Button";
import { colors, spacing, radius, fontWeight } from "@/theme";
import { triggerLightHaptic } from "@/utils/haptics";

interface CancelInvoiceSheetProps {
  visible: boolean;
  onDismiss: () => void;
  cancelReason: string;
  setCancelReason: (val: string) => void;
  cancelNotes: string;
  setCancelNotes: (val: string) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function CancelInvoiceSheet({
  visible,
  onDismiss,
  cancelReason,
  setCancelReason,
  cancelNotes,
  setCancelNotes,
  onConfirm,
  isPending,
}: CancelInvoiceSheetProps) {
  return (
    <AppBottomSheetModal
      visible={visible}
      title="Cancel GST Invoice"
      onDismiss={onDismiss}
      isBusy={isPending}
      scrollable
    >
      <Text style={styles.helperText}>
        Cancellations are permanent and recorded in the audit log. Select a reason:
      </Text>

      <View style={styles.reasonsContainer}>
        {[
          "Incorrect GST number",
          "Duplicate invoice",
          "Customer details incorrect",
          "Sale cancelled",
          "Other",
        ].map((reason) => {
          const isSelected = cancelReason === reason;
          return (
            <Pressable
              key={reason}
              onPress={() => {
                triggerLightHaptic();
                setCancelReason(reason);
              }}
              style={[
                styles.reasonRow,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? colors.surfaceOffset : colors.surface,
                }
              ]}
            >
              <Icon
                source={isSelected ? "radiobox-marked" : "radiobox-blank"}
                size={20}
                color={isSelected ? colors.primary : colors.textSecondary}
              />
              <Text style={[
                styles.reasonText,
                { fontWeight: isSelected ? fontWeight.bold : fontWeight.regular }
              ]}>
                {reason}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {cancelReason === "Other" && (
        <View style={styles.otherInputContainer}>
          <PaperTextInput
            mode="outlined"
            label="Provide cancellation reason"
            value={cancelNotes}
            onChangeText={setCancelNotes}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.textPrimary}
            placeholder="Explain why this invoice is being cancelled..."
            style={styles.otherTextInput}
            multiline
            numberOfLines={2}
          />
        </View>
      )}

      <View style={styles.actionsRow}>
        <Button
          label="Dismiss"
          variant="ghost"
          onPress={onDismiss}
          style={styles.dismissBtn}
        />
        <Button
          label="Cancel Invoice"
          variant="danger"
          loading={isPending}
          disabled={isPending || !cancelReason || (cancelReason === "Other" && !cancelNotes.trim())}
          onPress={onConfirm}
          style={styles.confirmBtn}
        />
      </View>
    </AppBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  helperText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  reasonsContainer: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  reasonText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  otherInputContainer: {
    marginBottom: spacing.md,
  },
  otherTextInput: {
    backgroundColor: colors.surface,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  dismissBtn: {
    flex: 1,
  },
  confirmBtn: {
    flex: 1.5,
  },
});
