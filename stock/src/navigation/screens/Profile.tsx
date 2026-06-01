import { useEffect, useState, useMemo } from "react";
import { View, Switch, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Button, Text, TextInput, Divider, Icon } from "react-native-paper";
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
  const navigation = useNavigation();

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
    onError: (err) => {
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
                  <Text style={styles.detailLabel}>Permissions</Text>
                </View>
                <Text style={styles.detailValue}>{user?.permissions.length ?? 0} active controls</Text>
              </View>
            </View>
          </Section>

          {/* Security settings */}
          <Section title="Security & quick login">
            <View style={styles.securityCard}>
              {/* Biometrics Toggle */}
              <View style={styles.toggleRow}>
                <View style={styles.flex1Pr4}>
                  <Text style={styles.securityTitle}>Biometric Login</Text>
                  <Text style={styles.securitySubtitle}>Use fingerprint or face recognition for quick access.</Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  disabled={!biometricAvailable}
                  onValueChange={handleBiometricToggle}
                  trackColor={{ false: "#e2e8f0", true: "#dbeafe" }}
                  thumbColor={biometricEnabled ? colors.primary : "#94a3b8"}
                />
              </View>

              <Divider style={styles.divider} />

              {/* Quick PIN Setup */}
              <View style={styles.gap3}>
                <Text style={styles.securityTitle}>Quick Login PIN</Text>
                <Text style={styles.securitySubtitle}>Configure a 4-digit PIN for fast sign-in without typing your full password.</Text>
                <View style={styles.pinInputs}>
                  <TextInput
                    mode="outlined"
                    placeholder="New PIN (4 digits)"
                    value={pin}
                    onChangeText={setPin}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                    style={styles.pinInput}
                    outlineStyle={styles.inputOutline}
                    activeOutlineColor={colors.primary}
                  />
                  <TextInput
                    mode="outlined"
                    placeholder="Confirm PIN"
                    value={pinConfirm}
                    onChangeText={setPinConfirm}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                    style={styles.pinInput}
                    outlineStyle={styles.inputOutline}
                    activeOutlineColor={colors.primary}
                  />
                </View>
                <Button
                  mode="contained-tonal"
                  onPress={handleSavePin}
                  disabled={pin.length !== 4 || pinConfirm.length !== 4}
                  style={styles.pinButton}
                  contentStyle={styles.buttonContent44}
                  labelStyle={styles.pinButtonLabel}
                >
                  Update PIN
                </Button>
              </View>
            </View>
          </Section>

          {/* Profile info update */}
          <Section title="Update profile">
            <View style={styles.updateCard}>
              <TextInput 
                mode="outlined" 
                label="Name" 
                value={name} 
                onChangeText={setName} 
                outlineStyle={styles.inputOutline}
                activeOutlineColor={colors.primary}
                style={styles.inputBackground}
              />
              <TextInput 
                mode="outlined" 
                label="Email" 
                value={email ?? ""} 
                onChangeText={setEmail} 
                outlineStyle={styles.inputOutline}
                activeOutlineColor={colors.primary}
                style={styles.inputBackground}
              />
              <TextInput 
                mode="outlined" 
                label="New password" 
                secureTextEntry 
                value={password} 
                onChangeText={setPassword} 
                outlineStyle={styles.inputOutline}
                activeOutlineColor={colors.primary}
                style={styles.inputBackground}
              />
              <Button 
                mode="contained" 
                loading={mutation.isPending} 
                onPress={() => mutation.mutate()} 
                style={styles.saveProfileButton}
                contentStyle={styles.buttonContent48}
                labelStyle={styles.saveProfileLabel}
              >
                Save Profile
              </Button>
            </View>
          </Section>

          {error ? (
            <View style={styles.errorContainer}>
              <Icon source="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Owner controls */}
          {user?.role === "OWNER" ? (
            <Section title="Owner tools">
              <View style={styles.settingCard}>
                <SettingItem
                  icon="storefront-outline"
                  title="Change Active Shop"
                  subtitle="Switch or select a different retail outlet"
                  onPress={() => setActiveShopId(null)}
                />
                <SettingItem
                  icon="account-plus-outline"
                  title="Add Staff Member"
                  subtitle="Create a new operator account with permissions"
                  onPress={() => (navigation as any).navigate("AddEditStaff")}
                />
                <SettingItem
                  icon="account-group-outline"
                  title="Staff Accounts"
                  subtitle="Manage access and roles for existing staff"
                  onPress={() => (navigation as any).navigate("StaffManagement")}
                />
                <SettingItem
                  icon="warehouse"
                  title="Inventory Catalog"
                  subtitle="Add, edit, or adjust items and prices"
                  onPress={() => (navigation as any).navigate("ItemList")}
                  isLast={true}
                />
              </View>
            </Section>
          ) : null}

          <Button 
            mode="outlined" 
            icon="logout" 
            onPress={signOut} 
            contentStyle={styles.buttonContent48} 
            style={styles.signOutButton} 
            textColor={colors.danger}
          >
            Sign out
          </Button>
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
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 120,
    gap: spacing.xl,
  },
  profileCard: {
    backgroundColor: colors.primary,
    borderRadius: 28,
    padding: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    ...shadow.md,
  },
  avatar: {
    height: 64,
    width: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  avatarText: {
    color: "white",
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
  },
  userName: {
    color: "white",
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.lg,
  },
  userMobileContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  userMobile: {
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.sm,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  roleText: {
    color: "white",
    fontWeight: fontWeight.black,
    fontSize: fontSize.xs,
    letterSpacing: 0.5,
  },
  detailsCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...shadow.sm,
  },
  detailRow: {
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  detailRowNoBorder: {
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.sm,
  },
  detailValue: {
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  securityCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.xl,
    ...shadow.sm,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  flex1Pr4: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  securityTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  securitySubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  divider: {
    backgroundColor: colors.border,
  },
  gap3: {
    gap: spacing.md,
  },
  pinInputs: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  pinInput: {
    flex: 1,
    backgroundColor: colors.surface,
    height: 48,
  },
  inputOutline: {
    borderRadius: radius.lg,
    borderColor: colors.border,
  },
  pinButton: {
    borderRadius: radius.lg,
    marginTop: 4,
  },
  buttonContent44: {
    height: 44,
  },
  pinButtonLabel: {
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.sm,
  },
  updateCard: {
    gap: spacing.lg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    ...shadow.sm,
  },
  inputBackground: {
    backgroundColor: colors.surface,
  },
  saveProfileButton: {
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  buttonContent48: {
    height: 48,
  },
  saveProfileLabel: {
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.md,
    color: colors.surface,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.xl,
    backgroundColor: colors.dangerLight,
    padding: 14,
    marginHorizontal: 4,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
    flex: 1,
  },
  settingCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...shadow.sm,
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  settingItemLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
  },
  settingItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    flex: 1,
  },
  settingItemIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  settingItemTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  settingItemSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  signOutButton: {
    borderRadius: radius.lg,
    borderColor: colors.border,
    marginVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: colors.surfaceOffset,
  },
  flex1: {
    flex: 1,
  },
});
