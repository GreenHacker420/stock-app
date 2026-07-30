import { useState, useEffect } from "react";
import { Alert, StyleSheet, View, ScrollView, Modal, TextInput } from "react-native";
import { Icon, Text, Divider } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
import { Button } from "../../../../components/ui/Button";
import { InfoRow } from "../../../../components/ui/InfoRow";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cleanPhoneNumber } from "../../../../utils/items/validation";
import { useAuthStore } from "../../../../auth/auth-store";
import { sendSaleWhatsAppReceipt } from "../../../../api/client";

interface SaleSuccessViewProps {
  invoiceSale: {
    id?: string;
    saleNumber: string;
    totalAmount: number;
  };
  customerName: string;
  customerPhone?: string | null;
  paymentMode: string;
  paidAmount: number;
  changeAmount: number;
  creditAmount: number;
  onStartNewSale: () => void;
  onViewInvoice: () => void;
  onSharePdf: () => void;
  onPrintDirect?: () => void;
  autoSendWhatsApp?: boolean;
  isSharing?: boolean;
  isPrinting?: boolean;
}

export function SaleSuccessView({
  invoiceSale,
  customerName,
  customerPhone,
  paymentMode,
  paidAmount,
  changeAmount,
  creditAmount,
  onStartNewSale,
  onViewInvoice,
  onSharePdf,
  onPrintDirect,
  autoSendWhatsApp = false,
  isSharing = false,
  isPrinting = false,
}: SaleSuccessViewProps) {
  const token = useAuthStore((state) => state.token);
  const insets = useSafeAreaInsets();

  const [isPhoneModalVisible, setIsPhoneModalVisible] = useState(false);
  const [phoneInput, setPhoneInput] = useState(customerPhone ?? "");
  const [isSendingWa, setIsSendingWa] = useState(false);
  const storedCustomerPhone = customerPhone ? cleanPhoneNumber(customerPhone) : "";
  const enteredPhone = cleanPhoneNumber(phoneInput);
  const isAlternateDeliveryNumber = storedCustomerPhone.length === 10
    && enteredPhone.length === 10
    && storedCustomerPhone !== enteredPhone;

  useEffect(() => {
    if (autoSendWhatsApp) {
      setPhoneInput(customerPhone ? cleanPhoneNumber(customerPhone) : "");
      setIsPhoneModalVisible(true);
    }
  }, []);

  const openWhatsAppWithNumber = async (targetPhone: string) => {
    const cleaned = cleanPhoneNumber(targetPhone);
    if (!token) {
      Alert.alert("Receipt Not Sent", "Please sign in again before sending the WhatsApp receipt.");
      return;
    }
    if (!invoiceSale.id) {
      Alert.alert("Receipt Not Sent", "The completed sale ID is unavailable. Refresh the sale and try again.");
      return;
    }

    setIsSendingWa(true);
    try {
      await sendSaleWhatsAppReceipt(token, invoiceSale.id, cleaned);
      Alert.alert(
        "Receipt Queued",
        `The invoice PDF was queued for +91 ${cleaned}. Delivery status will appear in WhatsApp chat.`,
      );
    } catch (err: any) {
      Alert.alert(
        "Receipt Not Sent",
        err?.message || "The invoice PDF or WhatsApp template could not be sent.",
      );
    } finally {
      setIsSendingWa(false);
    }
  };

  const handleWhatsAppPress = () => {
    const cleaned = customerPhone ? cleanPhoneNumber(customerPhone) : "";
    setPhoneInput(cleaned.length === 10 ? cleaned : "");
    setIsPhoneModalVisible(true);
  };
  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.lg },
      ]}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.successCard}>
        <View style={styles.iconWrapper}>
          <Icon source="check-circle" size={64} color={colors.success} />
        </View>
        <Text style={styles.title}>Sale Completed!</Text>
        <Text style={styles.subtitle}>
          Recorded sale of ₹{invoiceSale.totalAmount.toLocaleString("en-IN")} successfully.
        </Text>
      </View>

      {/* Premium Receipt Card */}
      <View style={styles.receiptCard}>
        <Text style={styles.receiptHeader}>RECEIPT SUMMARY</Text>
        <Divider style={styles.divider} />

        <InfoRow label="Sale Number" value={invoiceSale.saleNumber} />
        <InfoRow label="Customer" value={customerName} />
        {customerPhone ? <InfoRow label="Phone" value={customerPhone} /> : null}
        <InfoRow label="Payment Mode" value={paymentMode} />
        <InfoRow label="Amount Received" value={`₹${paidAmount.toLocaleString("en-IN")}`} />

        {changeAmount > 0.01 && (
          <View style={styles.specialRowContainer}>
            <InfoRow
              label="Change Returned"
              value={`₹${changeAmount.toLocaleString("en-IN")}`}
              tone="green"
            />
          </View>
        )}

        {creditAmount > 0.01 && (
          <View style={styles.specialRowContainer}>
            <InfoRow
              label="Balance to Credit"
              value={`₹${creditAmount.toLocaleString("en-IN")}`}
              tone="red"
            />
          </View>
        )}
      </View>

      {/* Actions Section — Stacked for anti-wrapping and one-handed thumb reach */}
      <View style={styles.actionsContainer}>
        {onPrintDirect && (
          <Button
            label="PRINT RECEIPT"
            variant="primary"
            icon="printer"
            onPress={onPrintDirect}
            loading={isPrinting}
            fullWidth
          />
        )}

        <View style={styles.rowActions}>
          <Button
            label="View Invoice"
            variant="ghost"
            icon="eye-outline"
            onPress={onViewInvoice}
            style={styles.flex1}
          />
          <Button
            label="Share PDF"
            variant="secondary"
            icon="share-variant-outline"
            onPress={onSharePdf}
            loading={isSharing}
            style={styles.flex1}
          />
        </View>

        <Button
          label="SEND VIA WHATSAPP"
          variant="success"
          icon="whatsapp"
          onPress={handleWhatsAppPress}
          loading={isSendingWa}
          fullWidth
          style={{ backgroundColor: "#25D366", borderColor: "#25D366" }}
        />

        <Button
          label="START NEW SALE"
          variant="success"
          icon="plus"
          onPress={onStartNewSale}
          fullWidth
        />
      </View>

      {/* Phone Number Modal */}
      <Modal
        visible={isPhoneModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPhoneModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Icon source="whatsapp" size={28} color="#25D366" />
              <Text style={styles.modalTitle}>WhatsApp Mobile Number</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              Invoice customer: {customerName}. Confirm the delivery number before sending.
            </Text>

            <TextInput
              style={styles.phoneInput}
              placeholder="Enter 10-digit mobile number"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              maxLength={10}
              value={phoneInput}
              onChangeText={setPhoneInput}
              autoFocus
            />
            <Text style={styles.deliveryNote}>
              {isAlternateDeliveryNumber
                ? "This is an alternate delivery number. The customer name and saved customer phone will not be changed."
                : "Sending a receipt does not edit the customer or WhatsApp contact name."}
            </Text>

            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setIsPhoneModalVisible(false)}
                style={styles.flex1}
              />
              <Button
                label="Send WhatsApp"
                variant="success"
                icon="whatsapp"
                disabled={cleanPhoneNumber(phoneInput).length < 10}
                onPress={() => {
                  setIsPhoneModalVisible(false);
                  openWhatsAppWithNumber(phoneInput);
                }}
                style={[{ backgroundColor: "#25D366", borderColor: "#25D366" }, styles.flex1]}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.lg,
  },
  successCard: {
    alignItems: "center",
    marginVertical: spacing.md,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.successLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  receiptCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    width: "100%",
    ...shadow.md,
  },
  receiptHeader: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  divider: {
    marginBottom: spacing.md,
  },
  specialRowContainer: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  actionsContainer: {
    width: "100%",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  rowActions: {
    flexDirection: "row",
    gap: spacing.md,
    width: "100%",
  },
  flex1: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 400,
    ...shadow.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  phoneInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceOffset,
    marginBottom: spacing.sm,
  },
  deliveryNote: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.xl,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
    width: "100%",
  },
});
