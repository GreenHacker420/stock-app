import { useState, useMemo } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { Text, Portal, Modal, TextInput, RadioButton } from "react-native-paper";
import { Button } from "../../ui/Button";
import { AttachmentUploader, UploadedAttachment } from "../../ui/AttachmentUploader";
import { useOpeningBalance } from "../../../hooks/useCustomerLedger";
import { newIdempotencyKey } from "../../../utils/idempotency";
import { colors, spacing, radius, fontSize } from "../../../theme";
import { useNetworkStore } from "../../../auth/network-store";
import { queueLedgerMutationOrSubmitOnline } from "../../../offline/ledgerMutationProcessor";


interface OpeningBalanceSheetProps {
  visible: boolean;
  onDismiss: () => void;
  customerId: string;
  customerName: string;
  shopId: string;
}

export function OpeningBalanceSheet({
  visible,
  onDismiss,
  customerId,
  customerName,
  shopId,
}: OpeningBalanceSheetProps) {
  const [direction, setDirection] = useState<"DEBIT" | "CREDIT">("DEBIT");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [confirmVisible, setConfirmVisible] = useState(false);

  // Preserve single clientMutationId for this dialog instance
  const clientMutationId = useMemo(() => newIdempotencyKey("opbal"), [visible]);

  const openingBalanceMutation = useOpeningBalance(customerId);

  const handleSubmit = () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive amount");
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
      notes: notes || undefined,
      clientMutationId,
      attachmentAssetIds: attachments.map((a, idx) => ({
        assetId: a.assetId,
        purpose: "OPENING_BALANCE_BILL" as const,
        sortOrder: idx,
      })),
    };

    try {
      const online = useNetworkStore.getState().isServerReachable !== false;

      const outcome = await queueLedgerMutationOrSubmitOnline({
        online,
        id: clientMutationId,
        type: "OPENING_BALANCE",
        shopId,
        customerId,
        clientMutationId,
        payload,
        submitOnline: () => openingBalanceMutation.mutateAsync(payload),
      });

      setConfirmVisible(false);
      onDismiss();
      if (outcome.queued) {
        Alert.alert("Pending sync", "Opening balance saved offline and will sync when connectivity returns. Confirmed balance is unchanged until sync succeeds.");
      } else {
        Alert.alert("Success", "Opening balance posted successfully");
      }
    } catch (err: any) {
      setConfirmVisible(false);
      Alert.alert("Error", err?.response?.data?.message || err?.message || "Failed to post opening balance");
    }
  };

  const formattedAmount = `₹${parseFloat(amount).toLocaleString("en-IN")}`;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Set Opening Balance</Text>
          <Text style={styles.subtitle}>For {customerName}</Text>

          <View style={styles.section}>
            <Text style={styles.label}>Balance Type</Text>
            <RadioButton.Group onValueChange={(val) => setDirection(val as any)} value={direction}>
              <View style={styles.radioOption}>
                <RadioButton value="DEBIT" color={colors.primary} />
                <View>
                  <Text style={styles.radioTitle}>Customer owes us (Receivable)</Text>
                  <Text style={styles.radioSub}>Increases customer outstanding balance</Text>
                </View>
              </View>

              <View style={styles.radioOption}>
                <RadioButton value="CREDIT" color={colors.success} />
                <View>
                  <Text style={styles.radioTitle}>We owe / Customer has advance</Text>
                  <Text style={styles.radioSub}>Creates customer advance balance</Text>
                </View>
              </View>
            </RadioButton.Group>
          </View>

          <TextInput
            label="Amount (₹) *"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Notes / Reference"
            value={notes}
            onChangeText={setNotes}
            mode="outlined"
            multiline
            numberOfLines={2}
            style={styles.input}
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
              label="Post Opening Balance"
              variant="primary"
              onPress={handleSubmit}
              loading={openingBalanceMutation.isPending}
              style={styles.flex1}
            />
          </View>
        </ScrollView>
      </Modal>

      {/* Confirmation Dialog */}
      <Modal visible={confirmVisible} onDismiss={() => setConfirmVisible(false)} contentContainerStyle={styles.confirmModal}>
        <Text style={styles.confirmTitle}>Confirm Financial Action</Text>
        <Text style={styles.confirmMessage}>
          {direction === "DEBIT"
            ? `This will add ${formattedAmount} to ${customerName}'s outstanding balance.`
            : `This will create ${formattedAmount} of customer advance for ${customerName}.`}
        </Text>
        <Text style={styles.confirmNote}>This action cannot be edited after submission. Only owner reversal is permitted.</Text>

        <View style={styles.buttonRow}>
          <Button label="Go Back" variant="secondary" onPress={() => setConfirmVisible(false)} style={styles.flex1} />
          <Button
            label="Confirm & Post"
            variant="primary"
            onPress={handleConfirmSubmit}
            loading={openingBalanceMutation.isPending}
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
