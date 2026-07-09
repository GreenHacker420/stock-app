import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../ui/Button";
import { colors, fontSize, fontWeight, radius, spacing } from "../../theme";

type ConfirmActionSheetProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmActionSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  loading,
  onConfirm,
  onCancel,
}: ConfirmActionSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel action"
          style={styles.dismiss}
          onPress={onCancel}
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Button label={cancelLabel} variant="secondary" onPress={onCancel} fullWidth />
            <Button label={confirmLabel} variant={destructive ? "danger" : "primary"} onPress={onConfirm} loading={loading} fullWidth />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
  },
  message: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
