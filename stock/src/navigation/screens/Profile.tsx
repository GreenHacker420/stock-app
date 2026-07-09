import { useEffect, useState, useMemo, useRef } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable, Alert, Keyboard } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Text, TextInput, Divider, Icon, Switch } from "react-native-paper";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import { updateMe, fetchShopStorageStats } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { StatusPill } from "../../components/ui/StatusPill";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { getToken, setToken } from "../../auth/token-storage";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { triggerLightHaptic, triggerSuccessHaptic, triggerWarningHaptic, triggerErrorHaptic } from "../../utils/haptics";
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
  const [showPassword, setShowPassword] = useState(false);

  // Biometrics & PIN state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [pin, setPin] = useState("");
  const [pinStage, setPinStage] = useState<"enter" | "confirm">("enter");
  const [tempPin, setTempPin] = useState("");
  const [isPinInputFocused, setIsPinInputFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"personal" | "system">("system");
  const hiddenPinInputRef = useRef<any>(null);

  const activeShopId = useShopStore((state) => state.activeShopId);

  const { data: storageStats, isLoading: storageLoading } = useQuery({
    queryKey: ["shopStorageStats", activeShopId],
    queryFn: () => {
      if (!token || !activeShopId) throw new Error("No active shop or token");
      return fetchShopStorageStats(token, activeShopId);
    },
    enabled: !!token && !!activeShopId && user?.role === "OWNER",
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

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

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidHide", () => {
      hiddenPinInputRef.current?.blur();
    });
    return () => sub.remove();
  }, []);

  const isDirty = useMemo(() => {
    return name !== (user?.name ?? "") || email !== (user?.email ?? "") || password !== "";
  }, [name, email, password, user]);

  const handleBiometricToggle = async (value: boolean) => {
    setError(null);
    triggerLightHaptic();
    if (value) {
      if (!biometricAvailable) {
        triggerErrorHaptic();
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
        triggerSuccessHaptic();
        showSuccess("Biometrics Enabled", "Biometric login is now enabled for quick access.");
      } else {
        setBiometricEnabled(false);
      }
    } else {
      await setToken("shopcontrol_biometric_enabled", "false");
      setBiometricEnabled(false);
      triggerSuccessHaptic();
      showSuccess("Biometrics Disabled", "Biometric login has been deactivated.");
    }
  };

  const handlePasscodePress = () => {
    triggerLightHaptic();
    if (isPinInputFocused) {
      Keyboard.dismiss();
      hiddenPinInputRef.current?.blur();
    } else {
      hiddenPinInputRef.current?.focus();
    }
  };

  const resetPinSetup = () => {
    setPin("");
    setTempPin("");
    setPinStage("enter");
  };

  const handlePinChange = async (val: string) => {
    if (!/^\d*$/.test(val)) return;
    setPin(val);

    if (val.length === 4) {
      if (pinStage === "enter") {
        triggerSuccessHaptic();
        setTempPin(val);
        setPin("");
        setPinStage("confirm");
      } else {
        // Confirm stage
        if (val === tempPin) {
          triggerSuccessHaptic();
          setError(null);
          if (user?.mobile) {
            try {
              const hash = await hashQuickPin(user.mobile, val);
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
              resetPinSetup();
              triggerSuccessHaptic();
              Keyboard.dismiss();
              showSuccess("PIN Set Successfully", "Your quick login PIN has been updated.");
            } catch (e) {
              triggerErrorHaptic();
              setError("Failed to save PIN.");
            }
          }
        } else {
          triggerErrorHaptic();
          Alert.alert(
            "PINs Do Not Match",
            "The confirmation passcode you entered does not match. Please try again.",
            [{ text: "Try Again", onPress: resetPinSetup }]
          );
        }
      }
    }
  };

  const mutation = useMutation({
    mutationFn: () => updateMe(token ?? "", { name, email: email || null, password: password || undefined }),
    onSuccess: (updatedUser) => {
      setPassword("");
      useAuthStore.setState({ user: updatedUser });
      triggerSuccessHaptic();
      showSuccess("Profile Saved", "Your profile changes have been saved.");
    },
    onError: (err: any) => {
      triggerErrorHaptic();
      setError(err instanceof Error ? err.message : "Failed to update profile.");
    }
  });

  const handleSignOut = () => {
    triggerWarningHaptic();
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out from your account?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: signOut }
      ]
    );
  };

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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        style={styles.flex1}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Centralized Airy Profile Header */}
          <View style={styles.headerSection}>
            <View style={styles.avatarOuterRing}>
              <View style={styles.avatarInnerRing}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{displayInitials}</Text>
                </View>
              </View>
            </View>
            
            <Text style={styles.userName}>{user?.name}</Text>
            
            <View style={styles.userMetaRow}>
              <View style={[styles.roleBadge, user?.role === 'OWNER' ? styles.badgeOwner : styles.badgeStaff]}>
                <Text style={[styles.roleText, user?.role === 'OWNER' ? styles.roleTextOwner : styles.roleTextStaff]}>
                  {user?.role ?? "USER"}
                </Text>
              </View>
              <View style={styles.metaDivider} />
              <View style={styles.phoneMeta}>
                <Icon source="phone-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.userMobile}>{user?.mobile}</Text>
              </View>
            </View>
          </View>

          {/* Segmented Tab Switcher */}
          <View style={styles.tabContainer}>
            <Pressable
              onPress={() => {
                triggerLightHaptic();
                setActiveTab("personal");
              }}
              style={[styles.tabButton, activeTab === "personal" && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, activeTab === "personal" && styles.tabTextActive]}>
                Personal & Security
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                triggerLightHaptic();
                setActiveTab("system");
              }}
              style={[styles.tabButton, activeTab === "system" && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, activeTab === "system" && styles.tabTextActive]}>
                System & Storage
              </Text>
            </Pressable>
          </View>

          <View style={styles.sectionsContainer}>
            {activeTab === "personal" ? (
              <>
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
                          <Text style={styles.settingItemTitle}>
                            {pinStage === "enter" ? "Create Quick Login PIN" : "Confirm Quick Login PIN"}
                          </Text>
                          <Text style={styles.settingItemSubtitle}>
                            {pinStage === "enter"
                              ? "Choose a 4-digit passcode for fast access"
                              : "Re-enter your passcode to verify"}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={styles.pinInputsContainer}>
                        <View style={styles.passcodeRowCentered}>
                          {[0, 1, 2, 3].map((index) => {
                            const char = pin[index] || "";
                            const isFocused = isPinInputFocused && pin.length === index;
                            return (
                              <Pressable
                                key={index}
                                onPress={handlePasscodePress}
                                style={[
                                  styles.passcodeBoxBig,
                                  isFocused && styles.passcodeBoxBigFocused,
                                  char ? styles.passcodeBoxBigFilled : null,
                                ]}
                              >
                                <Text style={styles.passcodeTextBig}>{char ? "•" : ""}</Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        {/* Hidden Native TextInput */}
                        <TextInput
                          ref={hiddenPinInputRef}
                          value={pin}
                          onChangeText={handlePinChange}
                          keyboardType="number-pad"
                          maxLength={4}
                          style={styles.hiddenInput}
                          secureTextEntry
                          onFocus={() => setIsPinInputFocused(true)}
                          onBlur={() => setIsPinInputFocused(false)}
                        />
                      </View>

                      {pinStage === "confirm" && (
                        <Button 
                          mode="text" 
                          onPress={resetPinSetup}
                          textColor={colors.danger}
                          style={styles.cancelPinBtn}
                          labelStyle={styles.cancelPinLabel}
                        >
                          Cancel & Reset
                        </Button>
                      )}
                    </View>
                  </View>
                </ScreenSection>

                {/* Redesigned iOS-Style Update Profile Card */}
                <ScreenSection title="Update profile">
                  <View style={styles.formCard}>
                    <View style={styles.formInputRow}>
                      <View style={styles.formIconBg}>
                        <Icon source="account-outline" size={20} color={colors.primary} />
                      </View>
                      <TextInput
                        mode="flat"
                        label="Full Name"
                        value={name}
                        onChangeText={setName}
                        style={styles.flatInput}
                        underlineColor="transparent"
                        activeUnderlineColor="transparent"
                        textColor={colors.textPrimary}
                      />
                    </View>
                    <Divider style={styles.formDivider} />

                    <View style={styles.formInputRow}>
                      <View style={styles.formIconBg}>
                        <Icon source="email-outline" size={20} color={colors.primary} />
                      </View>
                      <TextInput
                        mode="flat"
                        label="Email Address"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        style={styles.flatInput}
                        underlineColor="transparent"
                        activeUnderlineColor="transparent"
                        textColor={colors.textPrimary}
                      />
                    </View>
                    <Divider style={styles.formDivider} />

                    <View style={styles.formInputRow}>
                      <View style={styles.formIconBg}>
                        <Icon source="lock-outline" size={20} color={colors.primary} />
                      </View>
                      <TextInput
                        mode="flat"
                        label="New Password (Optional)"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        style={styles.flatInput}
                        underlineColor="transparent"
                        activeUnderlineColor="transparent"
                        textColor={colors.textPrimary}
                        right={
                          <TextInput.Icon
                            icon={showPassword ? "eye-off" : "eye"}
                            onPress={() => setShowPassword(!showPassword)}
                            color={colors.textSecondary}
                          />
                        }
                      />
                    </View>
                  </View>
                  
                  {error && (
                    <View style={styles.errorBox}>
                      <Icon source="alert-circle" size={18} color={colors.danger} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  <Button
                    mode="contained"
                    icon="content-save-outline"
                    onPress={() => {
                      triggerLightHaptic();
                      Keyboard.dismiss();
                      mutation.mutate();
                    }}
                    loading={mutation.isPending}
                    disabled={!isDirty || mutation.isPending}
                    style={[
                      styles.saveButton,
                      !isDirty ? styles.saveButtonDisabled : null
                    ]}
                    contentStyle={styles.saveButtonContent}
                    labelStyle={styles.saveButtonLabel}
                  >
                    SAVE CHANGES
                  </Button>
                </ScreenSection>
              </>
            ) : (
              <>
                {/* Account Details */}
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

                {user?.role === "OWNER" && (
                  <ScreenSection title="Shop Storage">
                    <Pressable onPress={() => navigate("StorageManagement")}>
                      <View style={styles.detailsCard}>
                        {storageLoading ? (
                          <Text style={styles.loadingText}>Loading storage metrics...</Text>
                        ) : storageStats ? (
                          <View style={styles.storageContainer}>
                            <View style={styles.storageInfoRow}>
                              <Icon source="database" size={24} color={colors.primary} />
                              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                                <Text style={styles.storageLabel}>S3 Storage Used</Text>
                                <Text style={styles.storageValue}>
                                  {formatBytes(storageStats.totalBytes)} ({storageStats.totalCount} files)
                                </Text>
                              </View>
                              <Icon source="chevron-right" size={20} color={colors.textSecondary} />
                            </View>
                            {storageStats.breakdown && storageStats.breakdown.length > 0 && (
                              <View style={styles.breakdownList}>
                                {storageStats.breakdown.map((b) => (
                                  <View key={b.kind} style={styles.breakdownRow}>
                                    <Text style={styles.breakdownKind}>
                                      {b.kind === "IMAGE" ? "Product Images" : b.kind}
                                    </Text>
                                    <Text style={styles.breakdownValue}>
                                      {formatBytes(b.sizeBytes)} ({b.count})
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        ) : (
                          <Text style={styles.errorText}>Could not load storage metrics.</Text>
                        )}
                      </View>
                    </Pressable>
                  </ScreenSection>
                )}

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

                {/* Outlined Sign Out card */}
                <View style={styles.signOutContainer}>
                  <Pressable
                    onPress={handleSignOut}
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
              </>
            )}
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
  tabContainer: {
    flexDirection: "row",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.lg,
    padding: 4,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  tabText: {
    fontSize: fontSize.xs + 1,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.extrabold,
  },
  headerSection: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingTop: spacing.xxl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(229, 231, 235, 0.5)",
    marginBottom: spacing.sm,
  },
  avatarOuterRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.15)",
    ...shadow.sm,
  },
  avatarInnerRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.1)",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "white",
    fontSize: 24,
    fontWeight: fontWeight.black,
  },
  userName: {
    fontSize: fontSize.lg + 2,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  userMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  metaDivider: {
    width: 1,
    height: 12,
    backgroundColor: colors.border,
  },
  phoneMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  userMobile: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  badgeOwner: {
    backgroundColor: colors.successLight,
  },
  badgeStaff: {
    backgroundColor: colors.primaryLight,
  },
  roleText: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  roleTextOwner: {
    color: colors.success,
  },
  roleTextStaff: {
    color: colors.primary,
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
  pinInputsContainer: {
    marginVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  passcodeRowCentered: {
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    alignItems: "center",
  },
  passcodeBoxBig: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  passcodeBoxBigFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  passcodeBoxBigFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  passcodeTextBig: {
    fontSize: 28,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
  },
  hiddenInput: {
    position: "absolute",
    width: 0,
    height: 0,
    opacity: 0,
  },
  cancelPinBtn: {
    alignSelf: "center",
    marginTop: spacing.xs,
  },
  cancelPinLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
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
    borderWidth: 1,
    borderColor: "rgba(229, 231, 235, 0.5)",
    overflow: "hidden",
    ...shadow.sm,
  },
  formInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  formIconBg: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceOffset,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  flatInput: {
    flex: 1,
    backgroundColor: "transparent",
    height: 56,
  },
  formDivider: {
    backgroundColor: "rgba(229, 231, 235, 0.5)",
    marginLeft: 66,
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
  saveButtonDisabled: {
    backgroundColor: "#e5e7eb",
    opacity: 0.6,
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
    backgroundColor: "transparent",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.3)",
    gap: spacing.sm,
    width: "100%",
  },
  signOutCardPressed: {
    opacity: 0.8,
    backgroundColor: colors.dangerLight,
    borderColor: colors.danger,
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
    marginTop: spacing.sm,
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
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    padding: spacing.md,
    textAlign: "center",
  },
  storageContainer: {
    padding: spacing.md,
  },
  storageInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  storageLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  storageValue: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  breakdownList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  breakdownKind: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  breakdownValue: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
});