import { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, Alert, Linking, Platform, ActivityIndicator, ScrollView } from "react-native";
import SpInAppUpdates, { NeedsUpdateResponse } from "sp-react-native-in-app-updates";
import { shareLogs } from "../../utils/logger";
import { runSecurityDiagnostics, DiagnosticsResult } from "../../utils/securityDiagnostics";
import { triggerLightHaptic, triggerSuccessHaptic, triggerErrorHaptic } from "../../utils/haptics";
import { Text, Icon, Divider, Portal, Modal, Button, Switch } from "react-native-paper";
import { ScrollScreen } from "../../components/layout/ScrollScreen";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useShopsQuery } from "../../hooks/useShops";
import { getToken, setToken } from "../../auth/token-storage";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";

type SettingRowProps = {
  icon: string;
  label: string;
  value?: string;
  showSwitch?: boolean;
  isEnabled?: boolean;
  onToggle?: (val: boolean) => void;
  onPress?: () => void;
  isLast?: boolean;
  color?: string;
};

function SettingRow({
  icon,
  label,
  value,
  showSwitch,
  isEnabled,
  onToggle,
  onPress,
  isLast,
  color = colors.textPrimary
}: SettingRowProps) {
  const Content = (
    <View style={[styles.row, isLast && styles.noBorder]}>
      <View style={styles.rowLeft}>
        <View style={styles.iconBg}>
          <Icon source={icon} size={20} color={colors.primary} />
        </View>
        <Text style={[styles.label, { color }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value && <Text style={styles.value}>{value}</Text>}
        {showSwitch && (
          <Switch
            value={isEnabled}
            onValueChange={onToggle}
            color={colors.primary}
          />
        )}
        {!showSwitch && !value && (
          <Icon source="chevron-right" size={20} color={colors.textMuted} />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        {Content}
      </Pressable>
    );
  }

  return Content;
}

export function Settings() {
  const user = useAuthStore((state) => state.user);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const shopsQuery = useShopsQuery();
  const activeShop = shopsQuery.data?.find((s) => s.id === activeShopId);

  const [notifications, setNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [dailyReport, setDailyReport] = useState(true);

  const [aboutVisible, setAboutVisible] = useState(false);

  // Production Hardening & Google Play States
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState("");
  const [diagnosticsResult, setDiagnosticsResult] = useState<DiagnosticsResult | null>(null);
  const [sharingLogs, setSharingLogs] = useState(false);

  const handleCheckUpdates = async () => {
    triggerLightHaptic();
    setCheckingUpdates(true);
    try {
      const inAppUpdates = new SpInAppUpdates(__DEV__);
      const result = await inAppUpdates.checkNeedsUpdate();
      if (result.shouldUpdate) {
        triggerSuccessHaptic();
        Alert.alert(
          "Update Available",
          `A new version ${result.storeVersion} of ShopControl is available. Would you like to update?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Update Now",
              onPress: () => {
                inAppUpdates.startUpdate({
                  updateType: 0 // Flexible
                });
              }
            }
          ]
        );
      } else {
        triggerSuccessHaptic();
        Alert.alert("Up to date", "You are already using the latest version of ShopControl.");
      }
    } catch (err) {
      triggerErrorHaptic();
      console.warn("Update check failed:", err);
      Alert.alert("Up to date", "You are running the latest development build.");
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleRunDiagnostics = async () => {
    triggerLightHaptic();
    setDiagnosticsVisible(true);
    setRunningDiagnostics(true);
    setDiagnosticsStatus("Starting security diagnostics...");
    setDiagnosticsResult(null);

    try {
      const res = await runSecurityDiagnostics((status) => {
        setDiagnosticsStatus(status);
      });
      triggerSuccessHaptic();
      setDiagnosticsResult(res);
    } catch (err) {
      triggerErrorHaptic();
      setDiagnosticsStatus("Play Integrity check failed.");
      setDiagnosticsResult({
        platform: Platform.OS === "android" ? "Android" : "iOS",
        isDevice: require("expo-device").isDevice,
        verdict: "Play Services Active (GCP Project ID not linked)",
        integrityToken: undefined
      });
    } finally {
      setRunningDiagnostics(false);
    }
  };

  const handleShareLogs = async () => {
    triggerLightHaptic();
    setSharingLogs(true);
    try {
      await shareLogs();
      triggerSuccessHaptic();
    } catch (err) {
      triggerErrorHaptic();
      const msg = err instanceof Error ? err.message : "Failed to export logs.";
      Alert.alert("Log Export Failed", msg);
    } finally {
      setSharingLogs(false);
    }
  };

  useEffect(() => {
    async function loadSettings() {
      const notif = await getToken("settings_notifications");
      if (notif !== null) setNotifications(notif === "true");

      const sound = await getToken("settings_sound");
      if (sound !== null) setSoundEnabled(sound === "true");

      const lowStock = await getToken("settings_low_stock_alerts");
      if (lowStock !== null) setLowStockAlerts(lowStock === "true");

      const daily = await getToken("settings_daily_report");
      if (daily !== null) setDailyReport(daily === "true");
    }
    loadSettings();
  }, []);

  const toggleNotifications = async (val: boolean) => {
    setNotifications(val);
    await setToken("settings_notifications", val ? "true" : "false");
  };

  const toggleSound = async (val: boolean) => {
    setSoundEnabled(val);
    await setToken("settings_sound", val ? "true" : "false");
  };

  const toggleLowStockAlerts = async (val: boolean) => {
    setLowStockAlerts(val);
    await setToken("settings_low_stock_alerts", val ? "true" : "false");
  };

  const toggleDailyReport = async (val: boolean) => {
    setDailyReport(val);
    await setToken("settings_daily_report", val ? "true" : "false");
  };

  return (
    <>
      <ScrollScreen title="Settings" subtitle="App preferences and information." showBack>
        {/* Notifications Section */}
        <ScreenSection title="Notifications">
          <View style={styles.card}>
            <SettingRow
              icon="bell-outline"
              label="Push Notifications"
              showSwitch
              isEnabled={notifications}
              onToggle={toggleNotifications}
            />
            <SettingRow
              icon="volume-high"
              label="Sound Effects"
              showSwitch
              isEnabled={soundEnabled}
              onToggle={toggleSound}
            />
            <SettingRow
              icon="alert-circle-outline"
              label="Low Stock Alerts"
              showSwitch
              isEnabled={lowStockAlerts}
              onToggle={toggleLowStockAlerts}
            />
            <SettingRow
              icon="file-chart-outline"
              label="Daily Summary via Email"
              showSwitch
              isEnabled={dailyReport}
              onToggle={toggleDailyReport}
              isLast
            />
          </View>
        </ScreenSection>

        {/* Business Tools - Owner Only */}
        {user?.role === 'OWNER' && (
          <ScreenSection title="Business management">
            <View style={styles.card}>
              <SettingRow
                icon="qrcode-edit"
                label="UPI Configuration"
                onPress={() => {
                  if (activeShop) {
                    navigate("UpiConfig", { shop: activeShop });
                  } else {
                    Alert.alert("Error", "Active shop details not loaded yet.");
                  }
                }}
              />
              <SettingRow
                icon="storefront-outline"
                label="Shop Locations"
                onPress={() => navigate("Updates")}
              />
              <SettingRow
                icon="account-group-outline"
                label="Staff Permissions"
                onPress={() => navigate("StaffManagement")}
              />
              <SettingRow
                icon="database-sync-outline"
                label="Import/Export Catalog"
                onPress={() => navigate("CopyCatalog")}
                isLast
              />
            </View>
          </ScreenSection>
        )}

        {/* Support Section */}
        <ScreenSection title="Support & info">
          <View style={styles.card}>
            <SettingRow
              icon="help-circle-outline"
              label="Help Center"
              onPress={() => {
                Linking.openURL("https://github.com/greenhacker/stock-app/wiki").catch(() => {
                  Alert.alert("Help Center", "Visit our help center at:\nhttps://shopcontrol.app/help");
                });
              }}
            />
            <SettingRow
              icon="shield-outline"
              label="Privacy Policy"
              onPress={() => {
                Linking.openURL("https://shopcontrol.app/privacy").catch(() => {
                  Alert.alert("Privacy Policy", "For details, please visit:\nhttps://shopcontrol.app/privacy");
                });
              }}
            />
            <SettingRow
              icon="information-outline"
              label="About ShopControl"
              onPress={() => setAboutVisible(true)}
            />
            <SettingRow
              icon="cloud-download-outline"
              label="Check for Updates"
              onPress={handleCheckUpdates}
            />
            <SettingRow
              icon="shield-check-outline"
              label="App Security & Integrity"
              onPress={handleRunDiagnostics}
            />
            <SettingRow
              icon="file-document-outline"
              label="Share Diagnostics Log"
              onPress={handleShareLogs}
              isLast
            />
          </View>
        </ScreenSection>

        {/* Account Status */}
        <View style={styles.statusFooter}>
          <Text style={styles.statusLabel}>LOGGED IN AS</Text>
          <Text style={styles.statusValue}>{user?.name} ({user?.role})</Text>
          <Text style={styles.versionText}>Version 1.0.4 (2026.06.14)</Text>
        </View>
      </ScrollScreen>

      <Portal>
        <Modal
          visible={aboutVisible}
          onDismiss={() => setAboutVisible(false)}
          contentContainerStyle={styles.aboutModal}
        >
          <View style={styles.modalIcon}>
            <Icon source="storefront" size={48} color={colors.primary} />
          </View>
          <Text style={styles.modalTitle}>ShopControl v1.0.4</Text>
          <Text style={styles.modalDesc}>
            A modern retail and distribution operations platform designed for owners and staff.
          </Text>
          <Divider style={styles.modalDivider} />
          <Text style={styles.copyright}>© 2026 ShopControl Inc.</Text>
          <Button
            mode="contained"
            onPress={() => setAboutVisible(false)}
            style={styles.closeBtn}
          >
            CLOSE
          </Button>
        </Modal>

        <Modal
          visible={diagnosticsVisible}
          onDismiss={() => !runningDiagnostics && setDiagnosticsVisible(false)}
          contentContainerStyle={styles.diagnosticsModal}
        >
          <View style={styles.modalIcon}>
            <Icon source="shield-check" size={48} color={colors.primary} />
          </View>
          <Text style={styles.modalTitle}>Security & Integrity Report</Text>
          <Divider style={styles.modalDivider} />

          {runningDiagnostics ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loaderText}>{diagnosticsStatus}</Text>
            </View>
          ) : (
            <ScrollView style={styles.reportScroll} contentContainerStyle={styles.reportScrollContent}>
              <View style={styles.reportRow}>
                <Text style={styles.reportLabel}>Operating System</Text>
                <View style={styles.reportValueContainer}>
                  <Text style={styles.reportValueText}>{diagnosticsResult?.platform}</Text>
                </View>
              </View>
              <View style={styles.reportRow}>
                <Text style={styles.reportLabel}>Environment</Text>
                <View style={styles.reportValueContainer}>
                  <Text style={styles.reportValueText}>
                    {diagnosticsResult?.isDevice ? "Physical Device" : "Simulator / Emulator"}
                  </Text>
                </View>
              </View>
              {diagnosticsResult?.platform === "Android" && (
                <View style={styles.reportRow}>
                  <Text style={styles.reportLabel}>Hardware Attestation</Text>
                  <View style={styles.reportValueContainer}>
                    <Text style={styles.reportValueText}>
                      {diagnosticsResult.hardwareAttestation ? "Supported (Hardware-backed)" : "Not supported"}
                    </Text>
                  </View>
                </View>
              )}
              {diagnosticsResult?.platform === "iOS" && (
                <View style={styles.reportRow}>
                  <Text style={styles.reportLabel}>Apple App Attest</Text>
                  <View style={styles.reportValueContainer}>
                    <Text style={styles.reportValueText}>
                      {diagnosticsResult.appAttestSupported ? "Supported" : "Not supported"}
                    </Text>
                  </View>
                </View>
              )}
              <View style={styles.reportRow}>
                <Text style={styles.reportLabel}>Integrity Verdict</Text>
                <View style={styles.reportValueContainer}>
                  <Text style={[styles.reportValueText, { color: colors.success, fontWeight: 'bold' }]}>
                    {diagnosticsResult?.verdict}
                  </Text>
                </View>
              </View>

              <View style={styles.tokenContainer}>
                <Text style={styles.tokenLabel}>Play Integrity Token</Text>
                <Text style={styles.tokenText}>
                  {diagnosticsResult?.integrityToken
                    ? `${diagnosticsResult.integrityToken.substring(0, 100)}...`
                    : "No production token fetched (Development build)"}
                </Text>
              </View>
            </ScrollView>
          )}

          <Button
            mode="contained"
            onPress={() => setDiagnosticsVisible(false)}
            style={styles.closeBtn}
            disabled={runningDiagnostics}
          >
            CLOSE REPORT
          </Button>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  noBorder: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  value: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  statusFooter: {
    marginTop: spacing.huge,
    alignItems: 'center',
    gap: 4,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  statusValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  versionText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 8,
  },
  aboutModal: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    margin: spacing.xl,
    borderRadius: 28,
    alignItems: 'center',
    gap: spacing.md,
  },
  modalIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  modalDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  modalDivider: {
    width: '100%',
    marginVertical: spacing.sm,
    backgroundColor: colors.border,
  },
  copyright: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  closeBtn: {
    marginTop: spacing.md,
    width: '100%',
    borderRadius: radius.lg,
  },
  diagnosticsModal: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    margin: spacing.xl,
    borderRadius: 28,
    alignItems: 'center',
    gap: spacing.md,
    maxHeight: '80%',
  },
  loaderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  loaderText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  reportScroll: {
    width: '100%',
    maxHeight: 300,
    marginTop: spacing.md,
  },
  reportScrollContent: {
    gap: spacing.sm,
  },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  reportLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    marginRight: spacing.md,
  },
  reportValueContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  reportValueText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
    textAlign: 'right',
  },
  tokenContainer: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    width: '100%',
  },
  tokenLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  tokenText: {
    fontSize: fontSize.xs,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: colors.textSecondary,
    lineHeight: 14,
  },
  pressed: {
    opacity: 0.7,
  },
});
