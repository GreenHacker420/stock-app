import { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { Text, Icon, Divider, Portal, Modal, Button, Switch } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { useAuthStore } from "../../auth/auth-store";
import { getToken, setToken } from "../../auth/token-storage";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate, goBack } from "../navigation-ref";

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
  
  const [notifications, setNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [dailyReport, setDailyReport] = useState(true);
  
  const [aboutVisible, setAboutVisible] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const notif = await getToken("settings_notifications");
      if (notif !== null) setNotifications(notif === "true");
      
      const sound = await getToken("settings_sound");
      if (sound !== null) setSoundEnabled(sound === "true");
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

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Settings" subtitle="App preferences and information." showBack={true} />

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Notifications Section */}
        <Section title="Notifications">
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
              onToggle={setLowStockAlerts}
            />
            <SettingRow
              icon="file-chart-outline"
              label="Daily Summary via Email"
              showSwitch
              isEnabled={dailyReport}
              onToggle={setDailyReport}
              isLast
            />
          </View>
        </Section>

        {/* Business Tools - Owner Only */}
        {user?.role === 'OWNER' && (
          <Section title="Business management">
            <View style={styles.card}>
              <SettingRow
                icon="qrcode-edit"
                label="UPI Configuration"
                onPress={() => navigate("UpiConfig")}
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
          </Section>
        )}

        {/* Support Section */}
        <Section title="Support & info">
          <View style={styles.card}>
            <SettingRow
              icon="help-circle-outline"
              label="Help Center"
              onPress={() => {}}
            />
            <SettingRow
              icon="shield-outline"
              label="Privacy Policy"
              onPress={() => {}}
            />
            <SettingRow
              icon="information-outline"
              label="About ShopControl"
              onPress={() => setAboutVisible(true)}
              isLast
            />
          </View>
        </Section>

        {/* Account Status */}
        <View style={styles.statusFooter}>
          <Text style={styles.statusLabel}>LOGGED IN AS</Text>
          <Text style={styles.statusValue}>{user?.name} ({user?.role})</Text>
          <Text style={styles.versionText}>Version 1.0.4 (2026.06.14)</Text>
        </View>
      </ScrollView>

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
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.huge,
  },
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
  pressed: {
    opacity: 0.7,
  },
});
