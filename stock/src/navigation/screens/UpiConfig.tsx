import { useRef, useState, useEffect } from "react";
import { View, StyleSheet, Modal, Alert, Platform, TouchableOpacity } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Text, TextInput, Icon } from "react-native-paper";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { updateShop } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useShopsQuery } from "../../hooks/useShops";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { FormScreen } from "../../components/layout/FormScreen";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { StickyFooterActions } from "../../components/layout/StickyFooterActions";
import { FormTextField } from "../../components/forms/FormTextField";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { triggerSuccessHaptic } from "../../utils/haptics";

type UpiConfigRouteParams = {
  shop: {
    id: string;
    name: string;
    upiId?: string | null;
    upiName?: string | null;
  };
};

const isValidUpiId = (value: string) => {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{2,64}$/.test(value.trim());
};

const extractUpiFromUrl = (url: string): { upiId: string; upiName: string } | null => {
  try {
    const trimmed = url.trim();
    if (!trimmed.toLowerCase().startsWith("upi://pay")) {
      return null;
    }
    
    const queryStartIndex = trimmed.indexOf("?");
    if (queryStartIndex === -1) {
      return null;
    }
    
    const queryString = trimmed.slice(queryStartIndex + 1);
    const searchParams = new URLSearchParams(queryString);
    const pa = searchParams.get("pa")?.trim();
    const pn = searchParams.get("pn")?.trim() ?? "";
    
    if (!pa || !isValidUpiId(pa)) {
      return null;
    }
    
    return {
      upiId: pa,
      upiName: pn,
    };
  } catch (error) {
    console.error("Error parsing UPI URL", error);
    return null;
  }
};

export function UpiConfig() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  
  const activeShopId = useShopStore((state) => state.activeShopId);
  const shopsQuery = useShopsQuery();

  const route = useRoute<RouteProp<{ UpiConfig: UpiConfigRouteParams }, "UpiConfig">>();
  const shop = route.params?.shop || shopsQuery.data?.find(s => s.id === activeShopId);
  const shopId = shop?.id;

  const [upiId, setUpiId] = useState("");
  const [upiName, setUpiName] = useState("");

  useEffect(() => {
    if (shop) {
      setUpiId(shop.upiId || "");
      setUpiName(shop.upiName || "");
    }
  }, [shop]);
  const [successVisible, setSuccessVisible] = useState(false);

  // Scanner states & refs
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLockRef = useRef(false);
  const lastAlertTimeRef = useRef(0);

  const mutation = useMutation({
    mutationFn: () => {
      if (!token) {
        throw new Error("You are not logged in.");
      }
      if (!shopId) {
        throw new Error("Shop details are missing.");
      }
      return updateShop(token, shopId, {
        upiId: upiId.trim(),
        upiName: upiName.trim(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shops"] });
      if (shopId) {
        void queryClient.invalidateQueries({ queryKey: ["shop", shopId] });
      }
      setSuccessVisible(true);
    },
    onError: (error) => {
      Alert.alert(
        "Save Failed",
        error instanceof Error ? error.message : "Unable to update UPI configuration."
      );
    },
  });

  if (!shopId) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="QR Management" subtitle="Shop not found" />
        <View style={[styles.container, styles.centerContainer]}>
          <Text style={styles.errorText}>Unable to configure UPI because shop details are missing.</Text>
        </View>
      </Screen>
    );
  }

  const handleStartScan = async () => {
    scanLockRef.current = false;
    let currentPermission = permission;
    if (!currentPermission?.granted) {
      currentPermission = await requestPermission();
    }
    if (!currentPermission.granted) {
      Alert.alert(
        "Camera Access Required",
        "Please grant camera permissions in your device settings to scan merchant QR codes."
      );
      return;
    }
    setIsScanning(true);
  };

  const handleQrScanned = (data: string) => {
    if (!data || scanLockRef.current) return;
    const parsed = extractUpiFromUrl(data);
    if (parsed) {
      scanLockRef.current = true;
      setUpiId(parsed.upiId);
      if (parsed.upiName) {
        setUpiName(parsed.upiName);
      }
      setIsScanning(false);
      
      triggerSuccessHaptic();
      return;
    }

    const now = Date.now();
    if (now - lastAlertTimeRef.current > 2500) {
      lastAlertTimeRef.current = now;
      Alert.alert(
        "Invalid UPI QR Code",
        "The scanned code is not a valid merchant UPI payment QR. Please scan a standard GPay, PhonePe, Paytm, or BHIM QR."
      );
    }
  };

  const handleSave = () => {
    const trimmedUpiId = upiId.trim();

    if (!trimmedUpiId) {
      Alert.alert("UPI ID Required", "Please enter or scan a UPI ID.");
      return;
    }

    if (!isValidUpiId(trimmedUpiId)) {
      Alert.alert(
        "Invalid UPI ID",
        "Please enter a valid UPI ID, for example shopname@okicici."
      );
      return;
    }

    mutation.mutate();
  };

  return (
    <>
      <FormScreen
        title="QR Management"
        subtitle={`Configure UPI for ${shop.name}`}
        footer={
          <StickyFooterActions
            primary={{
              label: "SAVE CONFIGURATION",
              onPress: handleSave,
              loading: mutation.isPending,
              disabled: mutation.isPending || !upiId.trim(),
              haptic: "medium",
            }}
          />
        }
      >
        <View style={styles.heroCard}>
           <View style={styles.heroHeader}>
              <Icon source="qrcode-scan" size={32} color={colors.textInverse} />
              <View style={styles.heroBadge}>
                 <Text style={styles.heroBadgeText}>DYNAMIC GENERATION</Text>
              </View>
           </View>
           <View style={styles.heroBody}>
              <Text style={styles.heroTitle}>Dynamic QR Codes</Text>
              <Text style={styles.heroSubtitle}>
                 Setting a UPI ID allows staff to generate custom payment QR codes for every transaction, including the exact amount and shop name.
              </Text>
           </View>
        </View>

        <ScreenSection title="UPI Details" contentStyle={styles.formCard}>
           <Button
             label="SCAN MERCHANT QR CODE"
             icon="qrcode-scan"
             onPress={handleStartScan}
             variant="secondary"
             fullWidth
           />

           <FormTextField
              label="VPA / UPI ID"
              placeholder="e.g. shopname@okicici"
              value={upiId}
              onChangeText={setUpiId}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="none"
              helperText="Payments will be settled directly to this ID."
              left={<TextInput.Icon icon="at" color={colors.textMuted} />}
              right={
                <TextInput.Icon
                  icon="qrcode-scan"
                  color={colors.primary}
                  onPress={handleStartScan}
                  forceTextInputFocus={false}
                />
              }
           />

           <FormTextField
              label="Display name (on QR)"
              placeholder="e.g. Nagpur Retail Store"
              value={upiName}
              onChangeText={setUpiName}
              left={<TextInput.Icon icon="account-outline" color={colors.textMuted} />}
           />
        </ScreenSection>

        <View style={styles.alertBox}>
           <Icon source="shield-check-outline" size={20} color={colors.warning} />
           <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Security Note</Text>
              <Text style={styles.alertSubtitle}>
                 Ensure the UPI ID is correct. ShopControl does not verify the ID with banks. Test with a small amount after saving.
              </Text>
           </View>
        </View>
      </FormScreen>

      <SuccessModal
        visible={successVisible}
        title="UPI Configured"
        message="UPI Configuration updated successfully."
        onClose={() => {
          setSuccessVisible(false);
          navigation.goBack();
        }}
      />

      {/* QR Code Scanner Overlay */}
      {isScanning && (
        <Modal
          visible={isScanning}
          animationType="slide"
          onRequestClose={() => setIsScanning(false)}
        >
          <View style={styles.scannerContainer}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              onMountError={(event) => {
                setIsScanning(false);
                Alert.alert("Camera Error", event.message || "Unable to start the camera.");
              }}
              onBarcodeScanned={({ data }) => {
                handleQrScanned(data);
              }}
            />
            
            <View style={styles.scannerOverlay}>
              {/* Top Mask */}
              <View style={styles.scannerTopMask}>
                <View style={styles.scannerHeader}>
                  <Text style={styles.scannerTitle}>Scan UPI QR</Text>
                  <TouchableOpacity style={styles.closeScannerButton} onPress={() => setIsScanning(false)}>
                    <Text style={styles.closeScannerText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Middle Section with Cutout */}
              <View style={styles.scannerMiddle}>
                <View style={styles.scannerSideMask} />
                <View style={styles.scannerCutout}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
                <View style={styles.scannerSideMask} />
              </View>

              {/* Bottom Mask */}
              <View style={styles.scannerBottomMask}>
                <Text style={styles.scannerInstruction}>
                  Align any merchant UPI QR (GPay, PhonePe, Paytm, etc.) inside the box to scan.
                </Text>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.md,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  heroCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.md,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  heroBadgeText: {
    color: colors.textInverse,
    fontSize: 9,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  heroBody: {
    gap: 4,
  },
  heroTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textInverse,
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 18,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.xl,
    ...shadow.sm,
  },
  alertBox: {
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.1)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
  },
  alertTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.warning,
  },
  alertSubtitle: {
    fontSize: 12,
    color: colors.warning,
    lineHeight: 18,
    marginTop: 2,
  },
  // Scanner styles
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  scannerTopMask: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-start",
  },
  scannerHeader: {
    paddingTop: Platform.OS === "ios" ? 60 : 30,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scannerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  closeScannerButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  closeScannerText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  scannerMiddle: {
    flexDirection: "row",
    height: 280,
  },
  scannerSideMask: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  scannerCutout: {
    width: 280,
    height: 280,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
    backgroundColor: "transparent",
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: colors.primary,
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  scannerBottomMask: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  scannerInstruction: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    opacity: 0.8,
  },
});
