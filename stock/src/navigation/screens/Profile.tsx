import { useEffect, useState, useMemo } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { Button, Text, TextInput, Divider, Icon, Switch } from "react-native-paper";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import { updateMe } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { getToken, setToken } from "../../auth/token-storage";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate, goBack } from "../navigation-ref";

async function hashQuickPin(mobile: string, pin: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${mobile.trim()}:${pin}`);
}

type SettingItemProps = {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  isLast?: boolean;
};

function SettingItem({ icon, title, subtitle, onPress, isLast }: SettingItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        isLast ? styles.settingItemLast : styles.settingItem,
        pressed && styles.pressed
      ]}
    >
      <View style={styles.settingItemLeft}>
        <View style={styles.settingItemIconBg}>
          <Icon source={icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.settingItemTitle}>{title}</Text>
          <Text style={styles.settingItemSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Icon source="chevron-right" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

export function Profile() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const signOut = useAuthStore((state) => state.signOut);
  const setActiveShopId = useShopStore((state) => state.setActiveShopId);

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");

  // Biometrics & PIN state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Success Modal state
  const [successVisible, setSuccessVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const showSuccess = (title: string, message: string) => {
    setSuccessTitle(title);
    setSuccessMessage(message);
    setSuccessVisible(true);
  };

  useEffect(() => {
    async function checkSecuritySettings() {
      const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const isEnrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
      setBiometricAvailable(hasHardware && isEnrolled);
      
      const enabled = await getToken("shopcontrol_biometric_enabled");
      setBiometricEnabled(enabled === "true");
    }
    checkSecuritySettings();
  }, []);

  const handleBiometricToggle = async (value: boolean) => {
    setError(null);
    if (value) {
      if (!biometricAvailable) {
        setError("Biometric authentication is not set up on this device.");
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirm identity to enable Biometric Login",
      });
      if (result.success) {
        await setToken("shopcontrol_biometric_enabled", "true");
        setBiometricEnabled(true);
        const activeToken = await getToken("shopcontrol_token");
        if (activeToken) {
          await setToken("shopcontrol_quick_token", activeToken);
        }
        showSuccess("Biometrics Enabled", "Biometric login is now enabled for quick access.");
      } else {
        setBiometricEnabled(false);
      }
    } else {
      await setToken("shopcontrol_biometric_enabled", "false");
      setBiometricEnabled(false);
      showSuccess("Biometrics Disabled", "Biometric login has been deactivated.");
    }
  };

  const handleSavePin = async () => {
    setError(null);
    if (!/^\d{4}$/.test(pin)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }
    if (pin !== pinConfirm) {
      setError("PIN codes do not match.");
      return;
    }
    if (user?.mobile) {
      const hash = await hashQuickPin(user.mobile, pin);
      await setToken("shopcontrol_quick_pin_hash", hash);
      await setToken("shopcontrol_last_identifier", user.mobile);
      await setToken("shopcontrol_pin_set", "true");
      
      const activeToken = await getToken("shopcontrol_token");
      if (activeToken) {
        await setToken("shopcontrol_quick_token", activeToken);
      }
      setPin("");
      setPinConfirm("");
      showSuccess("PIN Set Successfully", "Your quick login PIN has been updated.");
    }
  };

  const mutation = useMutation({
    mutationFn: () => updateMe(token ?? "", { name, email: email || null, password: password || undefined }),
    onSuccess: () => {
      setPassword("");
      showSuccess("Profile Saved", "Your profile changes have been saved.");
    },
    onError: (err: any) => {
      setError(err instanceof Error ? err.message : "Failed to update profile.");
    }
  });

  const displayInitials = useMemo(() => {
    if (user?.name) {
      return user.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    }
    return "SC";
  }, [user?.name]);

  return (
    <Screen>
      <AppHeader title="Profile" subtitle="Signed-in user and permissions." hideAvatar={true} />
      
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex1}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Card */}
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayInitials}</Text>
            </View>
            <View style={styles.flex1}>
              <Text style={styles.userName}>{user?.name}</Text>
              <View style={styles.userMobileContainer}>
                <Icon source="phone-outline" size={16} color="rgba(255, 255, 255, 0.7)" />
                <Text style={styles.userMobile}>{user?.mobile}</Text>
              </View>
            </View>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user?.role ?? "USER"}</Text>
            </View>
          </View>

          {/* Account Info */}
          <Section title="Account details">
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Icon source="email-outline" size={20} color={colors.textSecondary} />
                  <Text style={styles.detailLabel}>Email</Text>
                </View>
                <Text style={styles.detailValue}>{user?.email || "Not set"}</Text>
              </View>
              <View style={styles.detailRowNoBorder}>
                <View style={styles.detailLeft}>
                  <Icon source="shield-check-outline" size={20} color={colors.textSecondary} />
                  <Text style={styles.detailLabel}>Role</Text>
                </View>
                <StatusPill label={user?.role ?? "USER"} tone={user?.role === 'OWNER' ? 'green' : 'blue'} />
              </View>
            </View>
          </Section>

          {/* App Settings */}
          <Section title="App settings">
            <View style={styles.detailsCard}>
              {user?.role === 'OWNER' && (
                <SettingItem 
                  icon="store-edit-outline" 
                  title="Manage Shops" 
                  subtitle="View and edit shop locations"
                  onPress={() => navigate("Updates")}
                />
              )}
              <SettingItem 
                icon="cog-outline" 
                title="Preferences" 
                subtitle="Notifications and display"
                onPress={() => navigate("Settings")}
                isLast={user?.role !== 'OWNER'}
              />
              {user?.role === 'OWNER' && (
                <SettingItem 
                  icon="account-tie-outline" 
                  title="Staff Management" 
                  subtitle="Assign permissions and PINs"
                  onPress={() => navigate("StaffManagement")}
                  isLast={true}
                />
              )}
            </View>
          </Section>

          {/* Security & Quick Login */}
          <Section title="Security & quick login">
            <View style={styles.detailsCard}>
              <View style={styles.settingToggle}>
                <View style={styles.flex1}>
                  <Text style={styles.settingItemTitle}>Biometric Login</Text>
                  <Text style={styles.settingItemSubtitle}>Use FaceID/TouchID to unlock</Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleBiometricToggle}
                  color={colors.primary}
                />
              </View>
              
              <Divider style={styles.divider} />
              
              <View style={styles.pinForm}>
                <Text style={styles.pinFormTitle}>Set Quick Login PIN</Text>
                <View style={styles.pinInputs}>
                  <TextInput
                    mode="outlined"
                    label="New 4-digit PIN"
                    value={pin}
                    onChangeText={setPin}
                    secureTextEntry
                    keyboardType="number-pad"
                    maxLength={4}
                    style={styles.pinInput}
                    outlineStyle={styles.inputOutline}
                    activeOutlineColor={colors.primary}
                  />
                  <TextInput
                    mode="outlined"
                    label="Confirm PIN"
                    value={pinConfirm}
                    onChangeText={setPinConfirm}
                    secureTextEntry
                    keyboardType="number-pad"
                    maxLength={4}
                    style={styles.pinInput}
                    outlineStyle={styles.inputOutline}
                    activeOutlineColor={colors.primary}
                  />
                </View>
                <Button 
                  mode="outlined" 
                  onPress={handleSavePin}
                  style={styles.savePinBtn}
                  labelStyle={styles.savePinLabel}
                >
                  UPDATE PIN
                </Button>
              </View>
            </View>
          </Section>

          {/* Edit Profile */}
          <Section title="Update profile">
            <View style={styles.formCard}>
              <TextInput
                mode="outlined"
                label="Full Name"
                value={name}
                onChangeText={setName}
                style={styles.input}
                outlineStyle={styles.inputOutline}
                activeOutlineColor={colors.primary}
              />
              <TextInput
                mode="outlined"
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                outlineStyle={styles.inputOutline}
                activeOutlineColor={colors.primary}
              />
              <TextInput
                mode="outlined"
                label="New Password (Optional)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
                outlineStyle={styles.inputOutline}
                activeOutlineColor={colors.primary}
              />
              
              {error && (
                <View style={styles.errorBox}>
                  <Icon source="alert-circle" size={18} color={colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Button
                mode="contained"
                onPress={() => mutation.mutate()}
                loading={mutation.isPending}
                style={styles.saveButton}
                labelStyle={styles.saveButtonLabel}
              >
                SAVE CHANGES
              </Button>
            </View>
          </Section>

          {/* Sign Out */}
          <View style={styles.signOutContainer}>
            <Button
              mode="text"
              onPress={signOut}
              textColor={colors.danger}
              icon="logout"
              labelStyle={styles.signOutLabel}
            >
              SIGN OUT FROM ACCOUNT
            </Button>
            <Text style={styles.versionText}>v1.0.4 • Build 2026.06.14</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <SuccessModal
        visible={successVisible}
        title={successTitle}
        message={successMessage}
        onClose={() => setSuccessVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 160,
  },
  profileCard: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.xl,
    paddingTop: spacing.md,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    gap: spacing.lg,
    ...shadow.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  avatarText: {
    color: "white",
    fontSize: 22,
    fontWeight: fontWeight.black,
  },
  userName: {
    color: "white",
    fontSize: 20,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.5,
  },
  userMobileContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  userMobile: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  roleBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  roleText: {
    color: "white",
    fontSize: 10,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  detailRowNoBorder: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
  },
  detailLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  detailValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  settingItemLast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
  },
  settingItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    flex: 1,
  },
  settingItemIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  settingItemTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  settingItemSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  settingToggle: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
  },
  pinForm: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  pinFormTitle: {
    fontSize: 11,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  pinInputs: {
    flexDirection: "row",
    gap: spacing.md,
  },
  pinInput: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  savePinBtn: {
    borderRadius: radius.md,
    marginTop: 4,
    borderColor: colors.borderStrong,
  },
  savePinLabel: {
    fontSize: 11,
    fontWeight: fontWeight.black,
    letterSpacing: 1,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  saveButton: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  saveButtonLabel: {
    fontWeight: fontWeight.bold,
    paddingVertical: 4,
  },
  signOutContainer: {
    marginTop: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
  },
  signOutLabel: {
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  versionText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  divider: {
    backgroundColor: colors.surfaceOffset,
  },
  pressed: {
    opacity: 0.7,
  },
});
