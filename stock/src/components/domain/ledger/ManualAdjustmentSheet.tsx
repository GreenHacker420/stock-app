import { useState, useMemo } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { Text, Portal, Modal, TextInput, RadioButton } from "react-native-paper";
import { Button } from "../../ui/Button";
import { AttachmentUploader, UploadedAttachment } from "../../ui/AttachmentUploader";
import { useLedgerAdjustment } from "../../../hooks/useCustomerLedger";
import { newIdempotencyKey } from "../../../utils/idempotency";
import { colors, spacing, radius, fontSize } from "../../../theme";
import { useNetworkStore } from "../../../auth/network-store";
import { queueLedgerMutationOrSubmitOnline } from "../../../offline/ledgerMutationProcessor";

interface ManualAdjustmentSheetProps {
  visible: boolean;
  onDismiss: () => void;
  customerId: string;
  customerName: string;
  shopId: string;
}

export function ManualAdjustmentSheet({
  visible,
  onDismiss,
  customerId,
  customerName,
  shopId,
}: ManualAdjustmentSheetProps) {
  const [direction, setDirection] = useState<"DEBIT" | "CREDIT">("DEBIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const clientMutationId = useMemo(() => newIdempotencyKey("adj"), [visible]);
  const adjustmentMutation = useLedgerAdjustment(customerId);

  const handleSubmit = () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive amount");
      return;
    }
    if (!reason.trim()) {
      Alert.alert("Reason Required", "A mandatory adjustment reason must be provided");
      return;
    }
    setConfirmVisible(true);
  };

  const handleConfirmSubmit = async () => {
    const numAmount = parseFloat(amount);
    const payload = {
      shopId,
      direction,
      amount: numAmount,
      reason: reason.trim(),
      clientMutationId,
      attachmentAssetIds: attachments.map((a, idx) => ({
        assetId: a.assetId,
        purpose: "ADJUSTMENT_PROOF" as const,
        sortOrder: idx,
      })),
    };

    try {
      const online = useNetworkStore.getState().isServerReachable !== false;
      const outcome = await queueLedgerMutationOrSubmitOnline({
        online,
        id: clientMutationId,
        type: "MANUAL_ADJUSTMENT",
        shopId,
        customerId,
        clientMutationId,
        payload,
        submitOnline: () => adjustmentMutation.mutateAsync(payload),
      });

      setConfirmVisible(false);
      onDismiss();
      if (outcome.queued) {
        Alert.alert("Pending sync", "Adjustment saved offline and will sync when connectivity returns. Confirmed balance is unchanged until sync succeeds.");
      } else {
        Alert.alert("Success", "Manual adjustment posted successfully");
      }
    } catch (err: any) {
      setConfirmVisible(false);
      Alert.alert("Error", err?.response?.data?.message || err?.message || "Failed to post manual adjustment");
    }
  };

  const formattedAmount = `₹${parseFloat(amount || "0").toLocaleString("en-IN")}`;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Post Manual Adjustment</Text>
          <Text style={styles.subtitle}>For {customerName}</Text>

          <View style={styles.section}>
            <Text style={styles.label}>Adjustment Direction</Text>
            <RadioButton.Group onValueChange={(val) => setDirection(val as any)} value={direction}>
              <View style={styles.radioOption}>
                <RadioButton value="DEBIT" color={colors.danger} />
                <View>
                  <Text style={styles.radioTitle}>Debit Adjustment (Customer owes more)</Text>
                  <Text style={styles.radioSub}>Increases what the customer owes</Text>
                </View>
              </View>

              <View style={styles.radioOption}>
                <RadioButton value="CREDIT" color={colors.success} />
                <View>
                  <Text style={styles.radioTitle}>Credit Adjustment (Customer owes less)</Text>
                  <Text style={styles.radioSub}>Reduces debt or creates advance credit</Text>
                </View>
              </View>
            </RadioButton.Group>
          </View>

          <TextInput
            label="Adjustment Amount (₹) *"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Mandatory Reason *"
            value={reason}
            onChangeText={setReason}
            mode="outlined"
            multiline
            numberOfLines={2}
            style={styles.input}
            placeholder="e.g. Correction after physical register audit"
          />

          <AttachmentUploader
            shopId={shopId}
            domain="CUSTOMER_LEDGER"
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />

          <View style={styles.buttonRow}>
            <Button label="Cancel" variant="secondary" onPress={onDismiss} style={styles.flex1} />
            <Button
              label="Post Adjustment"
              variant="primary"
              onPress={handleSubmit}
              loading={adjustmentMutation.isPending}
              style={styles.flex1}
            />
          </View>
        </ScrollView>
      </Modal>

      {/* Confirmation Dialog */}
      <Modal visible={confirmVisible} onDismiss={() => setConfirmVisible(false)} contentContainerStyle={styles.confirmModal}>
        <Text style={styles.confirmTitle}>Confirm Manual Adjustment</Text>
        <Text style={styles.confirmMessage}>
          {direction === "DEBIT"
            ? `Debit adjustment increases what ${customerName} owes by ${formattedAmount}.`
            : `Credit adjustment reduces what ${customerName} owes by ${formattedAmount}.`}
        </Text>
        <Text style={styles.confirmNote}>This action will immediately update the customer balance. Reason: "{reason}"</Text>

        <View style={styles.buttonRow}>
          <Button label="Go Back" variant="secondary" onPress={() => setConfirmVisible(false)} style={styles.flex1} />
          <Button
            label="Confirm & Post"
            variant="primary"
            onPress={handleConfirmSubmit}
            loading={adjustmentMutation.isPending}
            style={styles.flex1}
          />
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: colors.surface,
    margin: spacing.md,
    borderRadius: radius.lg,
    maxHeight: "85%",
  },
  scrollContent: {
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  section: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  radioOption: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.xs,
  },
  radioTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  radioSub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  input: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  flex1: {
    flex: 1,
  },
  confirmModal: {
    backgroundColor: colors.surface,
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  confirmTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  confirmMessage: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  confirmNote: {
    fontSize: fontSize.xs,
    color: colors.warning,
    marginBottom: spacing.md,
  },
});
