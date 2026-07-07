import { useMemo } from "react";
import { View, StyleSheet, Text } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

interface DynamicUpiQrProps {
  upiId: string;
  upiName?: string | null;
  amount: number;
  transactionNote?: string;
  size?: number;
}

export function DynamicUpiQr({
  upiId,
  upiName,
  amount,
  transactionNote = "Payment",
  size = 180,
}: DynamicUpiQrProps) {
  const upiPayload = useMemo(() => {
    return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName || "")}&am=${amount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;
  }, [upiId, upiName, amount, transactionNote]);

  const moneyFormatted = `₹${Number(amount).toLocaleString("en-IN")}`;

  return (
    <View style={styles.container}>
      <View style={[styles.qrWrapper, { width: size + 32, height: size + 32 }]}>
        <QRCode value={upiPayload} size={size} />
      </View>
      <Text style={styles.upiQrText}>
        Scan to pay <Text style={styles.boldText}>{moneyFormatted}</Text>
      </Text>
      <Text style={styles.upiQrSubtext}>
        UPI ID: {upiId}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  qrWrapper: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  upiQrText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  boldText: {
    fontWeight: fontWeight.black,
    color: colors.primary,
  },
  upiQrSubtext: {
    fontSize: 11,
    color: colors.textSecondary,
  },
});
