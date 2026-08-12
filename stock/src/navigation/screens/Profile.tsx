import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Divider, Icon, Switch, Text, TextInput } from "react-native-paper";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { updateMe, fetchShopStorageStats } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { getToken, setToken } from "../../auth/token-storage";
import { Screen } from "../../components/Screen";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { AppSegmentedControl } from "../../components/ui/AppSegmentedControl";
import { NotificationToast } from "../../components/ui/NotificationToast";
import { StatusPill } from "../../components/ui/StatusPill";
import { colors, fontSize, fontWeight, radius, shadow, spacing } from "../../theme";
import {
  triggerErrorHaptic,
  triggerLightHaptic,
  triggerSuccessHaptic,
  triggerWarningHaptic,
} from "../../utils/haptics";
import { navigate } from "../navigation-ref";

async function hashQuickPin(mobile: string, pin: string) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${mobile.trim()}:${pin}`,
  );
}

type ProfileTab = "personal" | "system";
type ToastType = "success" | "warning" | "error" | "info";

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
        styles.settingItem,
        isLast && styles.settingItemLast,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
    >
      <View style={styles.settingItemLeft}>
        <View style={styles.iconTile}>
          <Icon source={icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
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
  const activeShopId = useShopStore((state) => state.activeShopId);
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<ProfileTab>("system");
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricPending, setBiometricPending] = useState(false);
  const [biometricTypeLabel, setBiometricTypeLabel] = useState("Biometric Login");

  const [pin, setPin] = useState("");
  const [pinStage, setPinStage] = useState<"enter" | "confirm">("enter");
  const [tempPin, setTempPin] = useState("");
  const [pinFocused, setPinFocused] = useState(false);
  const pinInputRef = useRef<any>(null);

  const nameInputRef = useRef<any>(null);
  const emailInputRef = useRef<any>(null);
  const passwordInputRef = useRef<any>(null);

  const [profileError, setProfileError] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: ToastType;
  }>({ visible: false, title: "", message: "", type: "success" });

  const tabOptions = useMemo(
    () => [
      { value: "personal", label: "Personal", icon: "account-circle-outline" },
      { value: "system", label: "System", icon: "cog-outline" },
    ] as const,
    [],
  );

  const storageQuery = useQuery({
    queryKey: ["shopStorageStats", activeShopId],
    queryFn: () => {
      if (!token || !activeShopId) {
        throw new Error("No active shop or session");
      }
      return fetchShopStorageStats(token, activeShopId);
    },
    enabled: Boolean(token && activeShopId && user?.role === "OWNER"),
    retry: 1,
  });

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setEmail(user.email ?? "");
  }, [user]);

  useEffect(() => {
    let mounted = true;

    const loadSecurityState = async () => {
      try {
        const [hasHardware, isEnrolled, types, savedValue] = await Promise.all([
          LocalAuthentication.hasHardwareAsync().catch(() => false),
          LocalAuthentication.isEnrolledAsync().catch(() => false),
          LocalAuthentication.supportedAuthenticationTypesAsync().catch(
            () => [] as LocalAuthentication.AuthenticationType[],
          ),
          getToken("shopcontrol_biometric_enabled").catch(() => null),
        ]);

        if (!mounted) return;

        const available = hasHardware && isEnrolled;
        setBiometricAvailable(available);

        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricTypeLabel("Face Unlock");
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricTypeLabel("Fingerprint");
        }

        if (!available && savedValue === "true") {
          await setToken("shopcontrol_biometric_enabled", "false").catch(() => undefined);
          if (mounted) setBiometricEnabled(false);
        } else {
          setBiometricEnabled(savedValue === "true");
        }
      } catch {
        if (mounted) {
          setBiometricAvailable(false);
          setBiometricEnabled(false);
        }
      }
    };

    void loadSecurityState();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidHide", () => {
      pinInputRef.current?.blur?.();
    });
    return () => sub.remove();
  }, []);

  const showToast = (title: string, message: string, type: ToastType = "success") => {
    setToast({ visible: true, title, message, type });
  };

  const isDirty = useMemo(
    () =>
      name !== (user?.name ?? "") ||
      email !== (user?.email ?? "") ||
      password.length > 0,
    [email, name, password, user?.email, user?.name],
  );

  const displayInitials = useMemo(() => {
    const source = user?.name?.trim();
    if (!source) return "SC";
    return source
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user?.name]);

  const profileMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Your session has expired. Please sign in again.");
      return updateMe(token, {
        name: name.trim(),
        email: email.trim() || null,
        password: password || undefined,
      });
    },
    onSuccess: (updatedUser) => {
      setPassword("");
      setProfileError(null);
      useAuthStore.setState({ user: updatedUser });
      triggerSuccessHaptic();
      showToast("Profile saved", "Your account details have been updated.", "success");
    },
    onError: (error: unknown) => {
      triggerErrorHaptic();
      setProfileError(error instanceof Error ? error.message : "Failed to update profile.");
    },
  });

  const handleBiometricToggle = async (value: boolean) => {
    if (biometricPending) return;

    setSecurityError(null);
    setBiometricPending(true);
    triggerLightHaptic();

    try {
      if (!value) {
        await setToken("shopcontrol_biometric_enabled", "false");
        setBiometricEnabled(false);
        showToast("Biometrics disabled", "Quick biometric login is turned off.", "info");
        return;
      }

      if (!biometricAvailable) {
        throw new Error("Biometric authentication is not enrolled on this device.");
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Confirm identity to enable ${biometricTypeLabel}`,
        cancelLabel: "Cancel",
      });

      if (!result.success) return;

      await setToken("shopcontrol_biometric_enabled", "true");
      const activeToken = await getToken("shopcontrol_token");
      if (activeToken) await setToken("shopcontrol_quick_token", activeToken);

      setBiometricEnabled(true);
      triggerSuccessHaptic();
      showToast("Biometrics enabled", `${biometricTypeLabel} can now unlock the app.`, "success");
    } catch (error) {
      setBiometricEnabled(false);
      triggerErrorHaptic();
      setSecurityError(
        error instanceof Error ? error.message : "Could not update biometric login.",
      );
    } finally {
      setBiometricPending(false);
    }
  };

  const resetPin = () => {
    setPin("");
    setTempPin("");
    setPinStage("enter");
    setSecurityError(null);
  };

  const handlePinChange = async (value: string) => {
    if (!/^\d*$/.test(value)) return;
    setSecurityError(null);
    setPin(value);

    if (value.length !== 4) return;

    if (pinStage === "enter") {
      setTempPin(value);
      setPin("");
      setPinStage("confirm");
      triggerLightHaptic();
      return;
    }

    if (value !== tempPin) {
      triggerErrorHaptic();
      resetPin();
      Alert.alert("PINs do not match", "Enter the same 4-digit PIN twice.");
      return;
    }

    if (!user?.mobile) {
      resetPin();
      setSecurityError("A mobile number is required before a quick-login PIN can be saved.");
      return;
    }

    try {
      const hash = await hashQuickPin(user.mobile, value);
      await Promise.all([
        setToken("shopcontrol_quick_pin_hash", hash),
        setToken("shopcontrol_last_identifier", user.mobile),
        setToken("shopcontrol_pin_set", "true"),
        setToken("shopcontrol_last_user_phone", user.mobile),
        user.name ? setToken("shopcontrol_last_user_name", user.name) : Promise.resolve(),
      ]);

      const activeToken = await getToken("shopcontrol_token");
      if (activeToken) await setToken("shopcontrol_quick_token", activeToken);

      resetPin();
      Keyboard.dismiss();
      triggerSuccessHaptic();
      showToast("PIN saved", "Your 4-digit quick-login PIN has been updated.", "success");
    } catch {
      resetPin();
      triggerErrorHaptic();
      setSecurityError("Could not save the quick-login PIN.");
    }
  };

  const handleSignOut = () => {
    triggerLightHaptic();
    Alert.alert("Sign out", "Sign out from this account on this device?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          triggerWarningHaptic();
          signOut();
        },
      },
    ]);
  };

  const formatBytes = (value: number | null | undefined) => {
    const bytes = Number(value ?? 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 Bytes";
    const units = ["Bytes", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const amount = bytes / Math.pow(1024, index);
    return `${amount.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
  };

  const contentBottomPadding = Math.max(insets.bottom, spacing.md) + 104;

  return (
    <Screen edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerSection}>
            <View style={styles.avatarOuterRing}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{displayInitials}</Text>
              </View>
            </View>
            <Text style={styles.userName}>{user?.name?.trim() || "Your account"}</Text>
            <View style={styles.userMetaRow}>
              <View style={[styles.roleBadge, user?.role === "OWNER" ? styles.badgeOwner : styles.badgeStaff]}>
                <Text style={[styles.roleText, user?.role === "OWNER" ? styles.roleOwner : styles.roleStaff]}>
                  {user?.role ?? "USER"}
                </Text>
              </View>
              {user?.mobile ? (
                <>
                  <View style={styles.metaDivider} />
                  <View style={styles.phoneMeta}>
                    <Icon source="phone-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.userMobile}>{user.mobile}</Text>
                  </View>
                </>
              ) : null}
            </View>
          </View>

          <AppSegmentedControl
            options={tabOptions}
            value={activeTab}
            onChange={(value) => {
              triggerLightHaptic();
              setActiveTab(value);
            }}
            style={styles.segmentedControl}
          />

          <View style={styles.sectionsContainer}>
            {activeTab === "personal" ? (
              <>
                <ScreenSection title="Security & quick login">
                  <View style={styles.card}>
                    <View style={styles.settingToggle}>
                      <View style={styles.settingItemLeft}>
                        <View style={styles.iconTile}>
                          <Icon source="fingerprint" size={21} color={colors.primary} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.settingTitle}>{biometricTypeLabel}</Text>
                          <Text style={styles.settingSubtitle}>
                            {biometricAvailable
                              ? "Use device biometrics for quick access"
                              : "Set up biometrics in device settings first"}
                          </Text>
                        </View>
                      </View>
                      <Switch
                        value={biometricEnabled}
                        onValueChange={handleBiometricToggle}
                        disabled={biometricPending || (!biometricAvailable && !biometricEnabled)}
                        color={colors.primary}
                      />
                    </View>

                    <Divider />

                    <View style={styles.pinSection}>
                      <View style={styles.settingItemLeft}>
                        <View style={styles.iconTile}>
                          <Icon source="lock-reset" size={21} color={colors.primary} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.settingTitle}>
                            {pinStage === "enter" ? "Quick-login PIN" : "Confirm PIN"}
                          </Text>
                          <Text style={styles.settingSubtitle}>
                            {pinStage === "enter"
                              ? "Choose a 4-digit PIN for fast access"
                              : "Enter the same PIN once more"}
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={() => pinInputRef.current?.focus?.()}
                        style={styles.pinRow}
                        accessibilityRole="button"
                        accessibilityLabel={pinStage === "enter" ? "Set quick login PIN" : "Confirm quick login PIN"}
                      >
                        {[0, 1, 2, 3].map((index) => {
                          const filled = Boolean(pin[index]);
                          const focused = pinFocused && pin.length === index;
                          return (
                            <View
                              key={index}
                              style={[
                                styles.pinBox,
                                filled && styles.pinBoxFilled,
                                focused && styles.pinBoxFocused,
                              ]}
                            >
                              <Text style={styles.pinDot}>{filled ? "•" : ""}</Text>
                            </View>
                          );
                        })}
                        <TextInput
                          ref={pinInputRef}
                          value={pin}
                          onChangeText={handlePinChange}
                          keyboardType="number-pad"
                          maxLength={4}
                          secureTextEntry
                          onFocus={() => setPinFocused(true)}
                          onBlur={() => setPinFocused(false)}
                          style={styles.hiddenPinInput}
                          accessible={false}
                        />
                      </Pressable>

                      {pinStage === "confirm" ? (
                        <Button mode="text" onPress={resetPin} textColor={colors.danger} compact>
                          Cancel PIN setup
                        </Button>
                      ) : null}
                    </View>
                  </View>

                  {securityError ? (
                    <View style={styles.errorBox}>
                      <Icon source="alert-circle-outline" size={18} color={colors.danger} />
                      <Text style={styles.errorText}>{securityError}</Text>
                    </View>
                  ) : null}
                </ScreenSection>

                <ScreenSection title="Update profile">
                  <View style={styles.formCard}>
                    <View style={styles.formRow}>
                      <View style={styles.formIcon}>
                        <Icon source="account-outline" size={20} color={colors.primary} />
                      </View>
                      <TextInput
                        ref={nameInputRef}
                        mode="flat"
                        label="Full name"
                        value={name}
                        onChangeText={(value) => {
                          setProfileError(null);
                          setName(value);
                        }}
                        autoComplete="name"
                        textContentType="name"
                        returnKeyType="next"
                        onSubmitEditing={() => emailInputRef.current?.focus?.()}
                        style={styles.flatInput}
                        underlineColor="transparent"
                        activeUnderlineColor="transparent"
                      />
                    </View>
                    <Divider style={styles.formDivider} />
                    <View style={styles.formRow}>
                      <View style={styles.formIcon}>
                        <Icon source="email-outline" size={20} color={colors.primary} />
                      </View>
                      <TextInput
                        ref={emailInputRef}
                        mode="flat"
                        label="Email address"
                        value={email}
                        onChangeText={(value) => {
                          setProfileError(null);
                          setEmail(value);
                        }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        textContentType="emailAddress"
                        returnKeyType="next"
                        onSubmitEditing={() => passwordInputRef.current?.focus?.()}
                        style={styles.flatInput}
                        underlineColor="transparent"
                        activeUnderlineColor="transparent"
                      />
                    </View>
                    <Divider style={styles.formDivider} />
                    <View style={styles.formRow}>
                      <View style={styles.formIcon}>
                        <Icon source="lock-outline" size={20} color={colors.primary} />
                      </View>
                      <TextInput
                        ref={passwordInputRef}
                        mode="flat"
                        label="New password (optional)"
                        value={password}
                        onChangeText={(value) => {
                          setProfileError(null);
                          setPassword(value);
                        }}
                        secureTextEntry={!showPassword}
                        autoComplete="password-new"
                        textContentType="newPassword"
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          Keyboard.dismiss();
                          if (isDirty && !profileMutation.isPending) profileMutation.mutate();
                        }}
                        right={
                          <TextInput.Icon
                            icon={showPassword ? "eye-off-outline" : "eye-outline"}
                            onPress={() => setShowPassword((current) => !current)}
                          />
                        }
                        style={styles.flatInput}
                        underlineColor="transparent"
                        activeUnderlineColor="transparent"
                      />
                    </View>
                  </View>

                  {profileError ? (
                    <View style={styles.errorBox}>
                      <Icon source="alert-circle-outline" size={18} color={colors.danger} />
                      <Text style={styles.errorText}>{profileError}</Text>
                    </View>
                  ) : null}

                  <Button
                    mode="contained"
                    icon="content-save-outline"
                    onPress={() => {
                      Keyboard.dismiss();
                      triggerLightHaptic();
                      profileMutation.mutate();
                    }}
                    loading={profileMutation.isPending}
                    disabled={!isDirty || profileMutation.isPending || !name.trim()}
                    style={styles.saveButton}
                    contentStyle={styles.saveButtonContent}
                  >
                    Save changes
                  </Button>
                </ScreenSection>
              </>
            ) : (
              <>
                <ScreenSection title="Account details">
                  <View style={styles.card}>
                    <View style={styles.detailRow}>
                      <View style={styles.settingItemLeft}>
                        <View style={styles.iconTile}>
                          <Icon source="email-outline" size={20} color={colors.primary} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.detailLabel}>Email address</Text>
                          <Text style={styles.detailValue} numberOfLines={1}>
                            {user?.email || "Not configured"}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Divider />
                    <View style={styles.detailRow}>
                      <View style={styles.settingItemLeft}>
                        <View style={styles.iconTile}>
                          <Icon source="shield-check-outline" size={20} color={colors.primary} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.detailLabel}>Access level</Text>
                          <Text style={styles.detailValue}>Account permissions</Text>
                        </View>
                      </View>
                      <StatusPill
                        label={user?.role ?? "USER"}
                        tone={user?.role === "OWNER" ? "green" : "blue"}
                      />
                    </View>
                  </View>
                </ScreenSection>

                {user?.role === "OWNER" ? (
                  <ScreenSection title="Shop storage">
                    <Pressable
                      onPress={() => navigate("StorageManagement")}
                      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel="Manage shop storage"
                    >
                      <View style={styles.storageHeader}>
                        <View style={styles.iconTile}>
                          <Icon source="database-outline" size={21} color={colors.primary} />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.detailLabel}>Storage used</Text>
                          {storageQuery.isLoading ? (
                            <Text style={styles.detailValue}>Loading storage usage…</Text>
                          ) : storageQuery.data ? (
                            <Text style={styles.detailValue}>
                              {formatBytes(storageQuery.data.totalBytes)} · {storageQuery.data.totalCount} files
                            </Text>
                          ) : (
                            <Text style={styles.errorText}>Storage metrics unavailable</Text>
                          )}
                        </View>
                        <Icon source="chevron-right" size={20} color={colors.textSecondary} />
                      </View>

                      {storageQuery.data?.breakdown?.length ? (
                        <View style={styles.breakdownList}>
                          {storageQuery.data.breakdown.slice(0, 4).map((item) => (
                            <View key={item.kind} style={styles.breakdownRow}>
                              <Text style={styles.breakdownLabel} numberOfLines={1}>
                                {item.kind === "IMAGE" ? "Product images" : item.kind}
                              </Text>
                              <Text style={styles.breakdownValue}>
                                {formatBytes(item.sizeBytes)} · {item.count}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </Pressable>
                  </ScreenSection>
                ) : null}

                <ScreenSection title="App settings">
                  <View style={styles.card}>
                    {user?.role === "OWNER" ? (
                      <SettingItem
                        icon="store-edit-outline"
                        title="Manage shops"
                        subtitle="View and edit shop locations"
                        onPress={() => navigate("Updates")}
                      />
                    ) : null}
                    <SettingItem
                      icon="cog-outline"
                      title="Preferences"
                      subtitle="Notifications and display settings"
                      onPress={() => navigate("Settings")}
                      isLast={user?.role !== "OWNER"}
                    />
                    {user?.role === "OWNER" ? (
                      <SettingItem
                        icon="account-tie-outline"
                        title="Staff management"
                        subtitle="Manage staff access and accounts"
                        onPress={() => navigate("StaffManagement")}
                        isLast
                      />
                    ) : null}
                  </View>
                </ScreenSection>

                <View style={styles.signOutSection}>
                  <Pressable
                    onPress={handleSignOut}
                    style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Sign out"
                  >
                    <Icon source="logout" size={20} color={colors.danger} />
                    <Text style={styles.signOutText}>Sign out from account</Text>
                  </Pressable>
                  <Text style={styles.versionText}>
                    v{Constants.expoConfig?.version ?? "1.0.0"} · Build {Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? "1"}
                  </Text>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <NotificationToast
        visible={toast.visible}
        title={toast.title}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast((current) => ({ ...current, visible: false }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  headerSection: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  avatarOuterRing: {
    alignItems: "center",
    justifyContent: "center",
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: "rgba(22, 163, 74, 0.18)",
    marginBottom: spacing.sm,
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primary,
    ...shadow.sm,
  },
  avatarText: {
    color: colors.textInverse,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
  },
  userName: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    marginBottom: spacing.xs,
  },
  userMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  roleBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeOwner: { backgroundColor: colors.successLight },
  badgeStaff: { backgroundColor: colors.primaryLight },
  roleText: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  roleOwner: { color: colors.success },
  roleStaff: { color: colors.primary },
  metaDivider: { width: 1, height: 14, backgroundColor: colors.borderStrong },
  phoneMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  userMobile: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  segmentedControl: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionsContainer: {
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.sm,
  },
  settingItem: {
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingItemLast: { borderBottomWidth: 0 },
  settingItemLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  settingTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  settingSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  settingToggle: {
    minHeight: 76,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  pinSection: { padding: spacing.lg, gap: spacing.md },
  pinRow: {
    position: "relative",
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  pinBox: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceOffset,
    alignItems: "center",
    justifyContent: "center",
  },
  pinBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  pinBoxFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  pinDot: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: fontWeight.extrabold,
  },
  hiddenPinInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    bottom: 0,
    left: "50%",
  },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.sm,
  },
  formRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  formIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceOffset,
    marginRight: spacing.md,
  },
  flatInput: { flex: 1, backgroundColor: "transparent" },
  formDivider: { marginLeft: 68 },
  saveButton: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  saveButtonContent: { height: 48 },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: fontSize.xs,
    lineHeight: 17,
  },
  detailRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  detailLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  detailValue: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  storageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  breakdownList: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  breakdownRow: {
    minHeight: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  breakdownLabel: { flex: 1, color: colors.textSecondary, fontSize: fontSize.xs },
  breakdownValue: {
    color: colors.textPrimary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  signOutSection: {
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  signOutButton: {
    width: "100%",
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.28)",
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  signOutPressed: { backgroundColor: colors.dangerLight },
  signOutText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  versionText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: fontWeight.medium,
  },
  pressed: { opacity: 0.72 },
});
