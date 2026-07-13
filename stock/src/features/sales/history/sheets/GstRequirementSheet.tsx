import { View, StyleSheet } from "react-native";
import { Text, Switch } from "react-native-paper";
import { AppBottomSheetModal } from "@/components/overlays/AppBottomSheetModal";
import { Button } from "@/components/ui/Button";
import { colors, spacing, fontWeight } from "@/theme";

interface GstRequirementSheetProps {
  visible: boolean;
  onDismiss: () => void;
  editGstRequired: boolean;
  setEditGstRequired: (val: boolean) => void;
  onSave: () => void;
  isPending: boolean;
}

export function GstRequirementSheet({
  visible,
  onDismiss,
  editGstRequired,
  setEditGstRequired,
  onSave,
  isPending,
}: GstRequirementSheetProps) {
  return (
    <AppBottomSheetModal
      visible={visible}
      title="Edit GST Details"
      onDismiss={onDismiss}
      isBusy={isPending}
    >
      <View style={styles.contentContainer}>
        <View style={styles.switchRow}>
          <Text style={styles.label}>
            GST Invoice Required
          </Text>
          <Switch
            value={editGstRequired}
            onValueChange={setEditGstRequired}
            color={colors.primary}
          />
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Button
          label="Cancel"
          variant="ghost"
          onPress={onDismiss}
          style={styles.cancelBtn}
        />
        <Button
          label="Save"
          variant="primary"
          loading={isPending}
          disabled={isPending}
          onPress={onSave}
          style={styles.saveBtn}
        />
      </View>
    </AppBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    marginVertical: spacing.md,
    gap: spacing.md,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
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
  saveBtn: {
    flex: 1.5,
  },
});
