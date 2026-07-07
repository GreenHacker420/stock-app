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

interface ProductSkuScannerModalProps {
  visible: boolean;
  onProductScanned: (sku: string) => Promise<{ success: boolean; name: string; msg?: string }>;
  onDismiss: () => void;
}

export function ProductSkuScannerModal({
  visible,
  onProductScanned,
  onDismiss,
}: ProductSkuScannerModalProps) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isScanningActive, setIsScanningActive] = useState(true);
  const [manualInput, setManualInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanHistory, setScanHistory] = useState<Array<{ sku: string; name: string; success: boolean; timestamp: Date }>>([]);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  
  const lastScannedRef = useRef<string | null>(null);
  const statusTimeoutRef = useRef<any>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (visible) {
      setManualInput("");
      setScanHistory([]);
      setStatusMessage(null);
      lastScannedRef.current = null;
      setIsScanningActive(true);
    }
  }, [visible]);

  // Clean up timeouts
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    };
  }, []);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (!isScanningActive || loading) return;
    const scanned = data.trim();
    if (!scanned) return;

    // Throttle scan triggers for the same barcode (2.5 seconds cooldown)
    if (lastScannedRef.current === scanned) return;
    lastScannedRef.current = scanned;
    setTimeout(() => {
      lastScannedRef.current = null;
    }, 2500);

    await processScannedSku(scanned);
  };

  const processScannedSku = async (sku: string) => {
    setLoading(true);
    setIsScanningActive(false);

    try {
      const res = await onProductScanned(sku);
      if (res.success) {
        Vibration.vibrate(80); // success vibration
        setScanHistory((prev) => [
          { sku, name: res.name, success: true, timestamp: new Date() },
          ...prev,
        ]);
        showStatus(`Added: ${res.name}`, false);
      } else {
        Vibration.vibrate([0, 100, 50, 100]); // warning vibration
        setScanHistory((prev) => [
          { sku, name: res.msg || "Not Found", success: false, timestamp: new Date() },
          ...prev,
        ]);
        showStatus(res.msg || "Product not found", true);
      }
    } catch (err: any) {
      Vibration.vibrate([0, 100, 50, 100]);
      showStatus(err.message || "Failed to find product", true);
    } finally {
      setLoading(false);
      // Wait 1.5 seconds before enabling the camera again for the next product
      setTimeout(() => {
        setIsScanningActive(true);
      }, 1500);
    }
  };

  const showStatus = (text: string, isError: boolean) => {
    setStatusMessage({ text, isError });
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    statusTimeoutRef.current = setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  const handleManualSubmit = async () => {
    const trimmed = manualInput.trim();
    if (!trimmed) return;
    setManualInput("");
    await processScannedSku(trimmed);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Scan Product Barcode</Text>
          <Pressable onPress={onDismiss} style={styles.closeBtn}>
            <Icon source="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Camera Viewfinder */}
        <View style={styles.scannerWrapper}>
          {!cameraPermission ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Initializing camera...</Text>
            </View>
          ) : !cameraPermission.granted ? (
            <View style={styles.permissionBox}>
              <Icon source="camera-off" size={48} color={colors.textMuted} />
              <Text style={styles.permissionText}>
                Camera permission is required to scan item barcodes/SKUs.
              </Text>
              <Button
                label="Grant Permission"
                onPress={requestCameraPermission}
                style={styles.permissionBtn}
              />
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
              {/* Scan Frame Overlay */}
              <View style={styles.overlayFrameContainer}>
                <View style={styles.scanFrame} />
                <Text style={styles.scanInstruction}>
                  Align barcode inside the box
                </Text>
              </View>

              {/* Status Banner */}
              {statusMessage && (
                <View style={[
                  styles.statusBanner,
                  statusMessage.isError ? styles.statusBannerError : styles.statusBannerSuccess
                ]}>
                  <Icon
                    source={statusMessage.isError ? "alert-circle" : "check-circle"}
                    size={20}
                    color={colors.textInverse}
                  />
                  <Text style={styles.statusText} numberOfLines={1}>
                    {statusMessage.text}
                  </Text>
                </View>
              )}

              {/* Scan Throttling/Loading overlay */}
              {loading && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator color={colors.textInverse} size="large" />
                </View>
              )}
            </View>
          )}
        </View>

        {/* Manual Input Fallback */}
        <View style={styles.manualInputRow}>
          <TextInput
            placeholder="Type SKU or barcode manually..."
            value={manualInput}
            onChangeText={setManualInput}
            onSubmitEditing={handleManualSubmit}
            style={styles.textInput}
            mode="outlined"
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            dense
            right={
              manualInput.trim().length > 0 ? (
                <TextInput.Icon icon="keyboard-return" onPress={handleManualSubmit} />
              ) : undefined
            }
          />
        </View>

        {/* Scan History / Results List */}
        <View style={styles.historyContainer}>
          <Text style={styles.historyTitle}>SCANNED PRODUCTS ({scanHistory.length})</Text>
          {scanHistory.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Icon source="barcode" size={36} color={colors.textMuted} />
              <Text style={styles.emptyHistoryText}>
                Scanned items will appear here in real-time.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.historyScroll}>
              {scanHistory.map((item, idx) => (
                <View key={idx} style={styles.historyRow}>
                  <View style={styles.historyIconBg}>
                    <Icon
                      source={item.success ? "check" : "alert-outline"}
                      color={item.success ? colors.success : colors.danger}
                      size={18}
                    />
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={styles.historyName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.historySku}>
                      SKU: {item.sku}
                    </Text>
                  </View>
                  <Text style={styles.historyTime}>
                    {item.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Footer actions */}
        <View style={styles.footer}>
          <Button label="Done / Close Scanner" onPress={onDismiss} style={{ width: "100%" }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  scannerWrapper: {
    height: 260,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textInverse,
    fontSize: fontSize.xs,
  },
  permissionBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  permissionText: {
    color: colors.textInverse,
    textAlign: "center",
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  permissionBtn: {
    borderRadius: radius.md,
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
  },
  overlayFrameContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  scanFrame: {
    width: 220,
    height: 120,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: "transparent",
  },
  scanInstruction: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: fontWeight.bold,
    marginTop: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusBanner: {
    position: "absolute",
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    ...shadow.sm,
  },
  statusBannerSuccess: {
    backgroundColor: colors.success,
  },
  statusBannerError: {
    backgroundColor: colors.danger,
  },
  statusText: {
    color: colors.textInverse,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  manualInputRow: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  textInput: {
    backgroundColor: colors.bg,
  },
  historyContainer: {
    flex: 1,
    padding: spacing.md,
  },
  historyTitle: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  emptyHistory: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingBottom: spacing.huge,
  },
  emptyHistoryText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: "center",
  },
  historyScroll: {
    gap: spacing.xs,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  historyIconBg: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceOffset,
    alignItems: "center",
    justifyContent: "center",
  },
  historyDetails: {
    flex: 1,
  },
  historyName: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  historySku: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  historyTime: {
    fontSize: 10,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
