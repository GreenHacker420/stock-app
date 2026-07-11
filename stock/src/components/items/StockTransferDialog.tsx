import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Platform, Alert } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Text, Icon, Portal, Dialog, TextInput } from "react-native-paper";

import { Shop } from "../../api/client";
import { Button } from "../ui/Button";
import { colors, spacing, radius, fontSize, fontWeight } from "../../theme";

export function StockTransferDialog({
  visible,
  unit,
  availableStock,
  otherShops,
  isPending,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  unit: string;
  availableStock: number;
  otherShops: Shop[];
  isPending: boolean;
  onDismiss: () => void;
  onConfirm: (params: { targetShopId: string; quantity: number; reason: string }) => void;
}) {
  const [targetShopId, setTargetShopId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (visible) {
      setTargetShopId("");
      setQuantity("");
      setReason("");
    }
  }, [visible]);

  const handleConfirm = () => {
    if (!targetShopId) {
      Alert.alert("Error", "Please select a target shop.");
      return;
    }
    const qtyNum = Number(quantity);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      Alert.alert("Error", "Please enter a valid positive whole quantity.");
      return;
    }
    if (qtyNum > availableStock) {
      Alert.alert(
        "Not enough available stock",
        `Only ${availableStock} ${unit} is available for transfer. Reserved stock cannot be transferred.`
      );
      return;
    }
    onConfirm({ targetShopId, quantity: qtyNum, reason });
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={isPending ? undefined : onDismiss} style={styles.dialog}>
        <KeyboardAvoidingView automaticOffset behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Dialog.Title style={styles.title}>Inter-Shop Stock Transfer</Dialog.Title>
          <Dialog.Content style={styles.content}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Select target shop for transfer:</Text>

              <View style={styles.shopListBox}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {otherShops.map((shop) => {
                    const selected = targetShopId === shop.id;
                    return (
                      <Pressable
                        key={shop.id}
                        onPress={() => {
                          if (!isPending) setTargetShopId(shop.id);
                        }}
                        style={[styles.shopRow, selected && styles.shopRowSelected]}
                        disabled={isPending}
                      >
                        <Text style={[styles.shopRowText, selected && styles.shopRowTextSelected]}>
                          {shop.name} ({shop.city})
                        </Text>
                        {selected && <Icon source="check" size={16} color={colors.primary} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <TextInput
                mode="outlined"
                label={`Quantity (${unit})`}
                placeholder="e.g. 10"
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
                editable={!isPending}
                outlineStyle={styles.inputOutline}
                activeOutlineColor={colors.primary}
                style={styles.input}
              />

              <TextInput
                mode="outlined"
                label="Optional Note / Reason"
                placeholder="e.g. Stock replenishment"
                value={reason}
                onChangeText={setReason}
                editable={!isPending}
                outlineStyle={styles.inputOutline}
                activeOutlineColor={colors.primary}
                style={styles.input}
              />
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onDismiss} disabled={isPending} />
            <Button label="Transfer" onPress={handleConfirm} loading={isPending} disabled={isPending} />
          </Dialog.Actions>
        </KeyboardAvoidingView>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    maxHeight: "85%",
  },
  title: {
    fontWeight: fontWeight.bold,
  },
  content: {
    gap: spacing.md,
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  shopListBox: {
    maxHeight: 150,
  },
  shopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
  shopRowSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  shopRowText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  shopRowTextSelected: {
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
  },
  input: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  actions: {
    gap: spacing.sm,
  },
});
