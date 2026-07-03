import { View, StyleSheet } from "react-native";

import { Button } from "../ui/Button";
import { spacing } from "../../theme";

type ItemDetailActionsProps = {
  showEdit: boolean;
  showTransfer: boolean;
  showStockEntry: boolean;
  onEdit: () => void;
  onTransfer: () => void;
  onStockEntry: () => void;
};

export function ItemDetailActions({
  showEdit,
  showTransfer,
  showStockEntry,
  onEdit,
  onTransfer,
  onStockEntry,
}: ItemDetailActionsProps) {
  if (!showEdit && !showTransfer && !showStockEntry) return null;

  return (
    <View style={styles.container}>
      {showStockEntry && (
        <Button label="Stock Entry" onPress={onStockEntry} fullWidth style={styles.primaryButton} />
      )}

      {(showEdit || showTransfer) && (
        <View style={styles.secondaryRow}>
          {showEdit && (
            <Button label="Edit Product" variant="secondary" onPress={onEdit} style={styles.secondaryButton} />
          )}
          {showTransfer && (
            <Button label="Transfer Stock" variant="secondary" onPress={onTransfer} style={styles.secondaryButton} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.xs,
    gap: spacing.sm,
  },
  primaryButton: {
    minHeight: 52,
  },
  secondaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
  },
});
