import { useEffect, useState, useMemo } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { Button, Text, TextInput, Divider, Icon, Switch } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import { updateMe } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { StatusPill } from "../../components/ui/StatusPill";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { getToken, setToken } from "../../auth/token-storage";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";

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

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
    }
  }, [user]);

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
      if (user?.name) {
        await setToken("shopcontrol_last_user_name", user.name);
      }
      await setToken("shopcontrol_last_user_phone", user.mobile);
      
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
    onSuccess: (updatedUser) => {
      setPassword("");
      useAuthStore.setState({ user: updatedUser });
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex1}
      >
        {/* Profile Card / Header with LinearGradient, now fixed at the top */}
        <LinearGradient
          colors={[colors.primaryDark, colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profileCard}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{displayInitials}</Text>
          </View>
          <View style={styles.flex1}>
            <Text style={styles.userName}>{user?.name}</Text>
            <View style={styles.userMobileContainer}>
              <Icon source="phone" size={16} color="rgba(255, 255, 255, 0.8)" />
              <Text style={styles.userMobile}>{user?.mobile}</Text>
            </View>
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role ?? "USER"}</Text>
          </View>
        </LinearGradient>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          <View style={styles.sectionsContainer}>
            {/* Account Info */}
            <ScreenSection title="Account details">
              <View style={styles.detailsCard}>
                <View style={styles.detailRow}>
                  <View style={styles.detailLeft}>
                    <View style={styles.detailIconBg}>
                      <Icon source="email-outline" size={20} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={styles.detailLabel}>Email Address</Text>
                      <Text style={styles.detailSubLabel}>{user?.email || "Not configured"}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.detailRowNoBorder}>
                  <View style={styles.detailLeft}>
                    <View style={styles.detailIconBg}>
                      <Icon source="shield-check-outline" size={20} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={styles.detailLabel}>Role</Text>
                      <Text style={styles.detailSubLabel}>User access level</Text>
                    </View>
                  </View>
                  <StatusPill label={user?.role ?? "USER"} tone={user?.role === 'OWNER' ? 'green' : 'blue'} />
                </View>
              </View>
            </ScreenSection>

            {/* App Settings */}
            <ScreenSection title="App settings">
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
            </ScreenSection>

            {/* Security & Quick Login */}
            <ScreenSection title="Security & quick login">
              <View style={styles.detailsCard}>
                <View style={styles.settingToggle}>
                  <View style={styles.detailLeft}>
                    <View style={styles.detailIconBg}>
                      <Icon source="fingerprint" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.settingItemTitle}>Biometric Login</Text>
                      <Text style={styles.settingItemSubtitle}>Use FaceID/TouchID to unlock</Text>
                    </View>
                  </View>
                  <Switch
                    value={biometricEnabled}
                    onValueChange={handleBiometricToggle}
                    color={colors.primary}
                  />
                </View>
                
                <Divider style={styles.divider} />
                
                <View style={styles.pinForm}>
                  <View style={styles.detailLeft}>
                    <View style={styles.detailIconBg}>
                      <Icon source="lock-reset" size={20} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={styles.settingItemTitle}>Set Quick Login PIN</Text>
                      <Text style={styles.settingItemSubtitle}>Fast 4-digit passcode access</Text>
                    </View>
                  </View>
                  
                  <View style={styles.pinInputs}>
                    <TextInput
                      mode="outlined"
                      label="New PIN"
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
                    mode="contained" 
                    onPress={handleSavePin}
                    style={styles.savePinBtn}
                    labelStyle={styles.savePinLabel}
                  >
                    UPDATE SECURE PIN
                  </Button>
                </View>
              </View>
            </ScreenSection>

            {/* Edit Profile */}
            <ScreenSection title="Update profile">
              <View style={styles.formCard}>
                <TextInput
                  mode="outlined"
                  label="Full Name"
                  value={name}
                  onChangeText={setName}
                  left={<TextInput.Icon icon="account-outline" color={colors.textSecondary} />}
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
                  left={<TextInput.Icon icon="email-outline" color={colors.textSecondary} />}
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
                  left={<TextInput.Icon icon="lock-outline" color={colors.textSecondary} />}
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
                  icon="content-save-outline"
                  onPress={() => mutation.mutate()}
                  loading={mutation.isPending}
                  style={styles.saveButton}
                  contentStyle={styles.saveButtonContent}
                  labelStyle={styles.saveButtonLabel}
                >
                  SAVE CHANGES
                </Button>
              </View>
            </ScreenSection>

            {/* Sign Out Card */}
            <View style={styles.signOutContainer}>
              <Pressable
                onPress={signOut}
                style={({ pressed }) => [
                  styles.signOutCard,
                  pressed && styles.signOutCardPressed
                ]}
              >
                <Icon source="logout" size={20} color={colors.danger} />
                <Text style={styles.signOutText}>Sign Out from Account</Text>
              </Pressable>
              <Text style={styles.versionText}>v1.0.4 • Build 2026.06.15</Text>
            </View>
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
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    gap: spacing.lg,
    ...shadow.lg,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.4)",
    ...shadow.sm,
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
    marginTop: 4,
  },
  userMobile: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  roleBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  roleText: {
    color: "white",
    fontSize: 10,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  sectionsContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(229, 231, 235, 0.5)",
    overflow: "hidden",
    ...shadow.sm,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
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
    gap: spacing.lg,
    flex: 1,
  },
  detailIconBg: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  detailSubLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: fontWeight.medium,
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
    borderBottomColor: "#f3f4f6",
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
    width: 38,
    height: 38,
    borderRadius: 12,
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
  pinInputs: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  pinInput: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  savePinBtn: {
    borderRadius: radius.md,
    marginTop: 4,
    backgroundColor: colors.primary,
  },
  savePinLabel: {
    fontSize: 11,
    fontWeight: fontWeight.black,
    letterSpacing: 1,
    color: "white",
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(229, 231, 235, 0.5)",
    gap: spacing.md,
    ...shadow.sm,
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
    ...shadow.md,
  },
  saveButtonContent: {
    height: 48,
  },
  saveButtonLabel: {
    fontWeight: fontWeight.bold,
    color: "white",
  },
  signOutContainer: {
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
    alignItems: "center",
    gap: spacing.sm,
    width: "100%",
  },
  signOutCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerLight,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.15)",
    gap: spacing.sm,
    width: "100%",
    ...shadow.sm,
  },
  signOutCardPressed: {
    opacity: 0.8,
    backgroundColor: "rgba(254, 226, 226, 0.8)",
  },
  signOutText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
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
    opacity: 0.72,
  },
});
