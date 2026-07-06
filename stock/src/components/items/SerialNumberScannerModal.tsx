import { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  Vibration,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Text, Icon, TextInput } from "react-native-paper";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { Button } from "../ui/Button";

interface SerialNumberScannerModalProps {
  visible: boolean;
  itemName: string;
  quantity: number;
  serialNumbers: string[];
  onSave: (serials: string[]) => void;
  onDismiss: () => void;
}

export function SerialNumberScannerModal({
  visible,
  itemName,
  quantity,
  serialNumbers,
  onSave,
  onDismiss,
}: SerialNumberScannerModalProps) {
  const [localSerials, setLocalSerials] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState("");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isScanningActive, setIsScanningActive] = useState(true);
  const lastScannedRef = useRef<string | null>(null);

  // Sync state when modal becomes visible
  useEffect(() => {
    if (visible) {
      setLocalSerials([...serialNumbers]);
      setManualInput("");
      lastScannedRef.current = null;
      setIsScanningActive(true);
    }
  }, [visible, serialNumbers]);

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (!isScanningActive) return;
    const scanned = data.trim();
    if (!scanned) return;

    // Throttle / Debounce duplicate scans of the same code
    if (lastScannedRef.current === scanned) return;
    lastScannedRef.current = scanned;
    setTimeout(() => {
      lastScannedRef.current = null;
    }, 2000);

    if (localSerials.includes(scanned)) {
      Vibration.vibrate([0, 100, 50, 100]); // double vibrate for warning
      return;
    }

    if (localSerials.length >= quantity) {
      Vibration.vibrate([0, 150]);
      return;
    }

    Vibration.vibrate(80); // success vibration
    setLocalSerials((prev) => [...prev, scanned]);
  };

  const addManualSerial = () => {
    const trimmed = manualInput.trim();
    if (!trimmed) return;

    if (localSerials.includes(trimmed)) {
      Alert.alert("Duplicate Code", "This serial number is already in the list.");
      return;
    }

    if (localSerials.length >= quantity) {
      Alert.alert("Quantity Limit", `You have already added ${quantity} serial numbers.`);
      return;
    }

    setLocalSerials((prev) => [...prev, trimmed]);
    setManualInput("");
  };

  const removeSerial = (index: number) => {
    setLocalSerials((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave(localSerials);
  };

  const hasAllSerials = localSerials.length === quantity;

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onDismiss} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close scanner">
            <Icon source="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.title} numberOfLines={1}>{itemName}</Text>
            <Text style={styles.subtitle}>Scan exactly {quantity} serial number(s)</Text>
          </View>
        </View>

        {/* Camera Scanner View */}
        <View style={styles.scannerWrapper}>
          {!cameraPermission ? (
            <View style={styles.permissionPlaceholder}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : !cameraPermission.granted ? (
            <View style={styles.permissionPlaceholder}>
              <Icon source="camera-off" size={40} color={colors.textMuted} />
              <Text style={styles.permissionText}>Camera permission is required to scan serial numbers.</Text>
              <Button label="Grant Permission" onPress={requestCameraPermission} size="sm" style={{ marginTop: spacing.md }} />
            </View>
          ) : (
            <View style={styles.cameraContainer}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ["ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "itf14"],
                }}
                onBarcodeScanned={handleBarcodeScanned}
              />
              <View style={styles.scanTargetFrame} />
              {hasAllSerials && (
                <View style={styles.scannedSuccessOverlay}>
                  <Icon source="check-circle" size={48} color={colors.success} />
                  <Text style={styles.successOverlayText}>All {quantity} serials scanned</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Counter Badge */}
        <View style={styles.counterRow}>
          <Text style={styles.counterText}>
            Scanned:{" "}
            <Text style={[styles.counterNumber, hasAllSerials ? { color: colors.success } : { color: colors.danger }]}>
              {localSerials.length}
            </Text>{" "}
            / {quantity}
          </Text>
          {hasAllSerials && (
            <View style={styles.completeBadge}>
              <Icon source="check" size={14} color="#ffffff" />
              <Text style={styles.completeBadgeText}>Ready</Text>
            </View>
          )}
        </View>

        {/* Manual Fallback Input */}
        <View style={styles.manualInputRow}>
          <TextInput
            mode="outlined"
            placeholder="Type serial number manually..."
            value={manualInput}
            onChangeText={setManualInput}
            style={styles.manualField}
            outlineStyle={{ borderRadius: radius.md }}
            onSubmitEditing={addManualSerial}
            dense
          />
          <Pressable
            onPress={addManualSerial}
            disabled={!manualInput.trim() || hasAllSerials}
            style={({ pressed }) => [
              styles.manualAddBtn,
              (!manualInput.trim() || hasAllSerials) && { opacity: 0.5 },
              pressed && { opacity: 0.7 }
            ]}
          >
            <Icon source="plus" size={20} color={colors.primary} />
          </Pressable>
        </View>

        {/* Serial Numbers List */}
        <Text style={styles.listHeader}>Scanned Serials</Text>
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
          {localSerials.length === 0 ? (
            <View style={styles.emptyListPlaceholder}>
              <Text style={styles.emptyListText}>No serial numbers scanned yet.</Text>
            </View>
          ) : (
            localSerials.map((sn, index) => (
              <View key={`${sn}-${index}`} style={styles.serialRow}>
                <Text style={styles.serialIndex}>{index + 1}.</Text>
                <Text style={styles.serialText} numberOfLines={1}>{sn}</Text>
                <Pressable
                  onPress={() => removeSerial(index)}
                  style={styles.deleteBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove serial number ${sn}`}
                >
                  <Icon source="trash-can-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>

        {/* Footer actions */}
        <View style={styles.footer}>
          <Button
            label="Cancel"
            variant="ghost"
            onPress={onDismiss}
            style={{ flex: 1 }}
          />
          <Button
            label="Save Serials"
            onPress={handleSave}
            disabled={localSerials.length !== quantity}
            style={{ flex: 2 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: 48,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  scannerWrapper: {
    height: 200,
    backgroundColor: "#000",
    position: "relative",
  },
  permissionPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.surfaceOffset,
  },
  permissionText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
  },
  scanTargetFrame: {
    position: "absolute",
    width: 240,
    height: 80,
    borderWidth: 2,
    borderColor: colors.primary,
    alignSelf: "center",
    top: "30%",
    borderRadius: radius.md,
    backgroundColor: "transparent",
  },
  scannedSuccessOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  successOverlayText: {
    color: "#ffffff",
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceOffset,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  counterText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  counterNumber: {
    fontWeight: fontWeight.bold,
  },
  completeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    gap: 4,
  },
  completeBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  manualInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  manualField: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  manualAddBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceOffset,
  },
  listHeader: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    letterSpacing: 1,
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  emptyListPlaceholder: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyListText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  serialRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  serialIndex: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
    width: 24,
  },
  serialText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerLight,
  },
  footer: {
    flexDirection: "row",
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
