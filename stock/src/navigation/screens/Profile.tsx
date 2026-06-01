import { useEffect, useState } from "react";
import { View, Switch, StyleSheet } from "react-native";
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

  return (
    <Screen>
      <AppHeader title="Profile" subtitle="Signed-in user and permissions." role={user?.role} />
      
      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.[0]?.toUpperCase() ?? "O"}
          </Text>
        </View>
        <View style={styles.flex1}>
          <Text variant="titleMedium" style={styles.userName}>{user?.name}</Text>
          <Text variant="bodySmall" style={styles.userMobile}>{user?.mobile}</Text>
        </View>
        <StatusPill label={user?.role ?? "USER"} tone={user?.role === "OWNER" ? "blue" : "amber"} />
      </View>

      {/* Account Info */}
      <Section title="Account details">
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Email</Text>
            <Text style={styles.detailValue}>{user?.email || "Not set"}</Text>
          </View>
          <View style={styles.detailRowNoBorder}>
            <Text style={styles.detailLabel}>Permissions</Text>
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
          <View style={styles.gap3}>
            <Button mode="contained-tonal" icon="storefront-outline" onPress={() => setActiveShopId(null)} style={styles.ownerButton} contentStyle={styles.buttonContent48}>Change Active Shop</Button>
            <Button mode="contained-tonal" icon="account-plus" onPress={() => (navigation as any).navigate("AddEditStaff")} style={styles.ownerButton} contentStyle={styles.buttonContent48}>Add Staff Member</Button>
            <Button mode="contained-tonal" icon="account-group-outline" onPress={() => (navigation as any).navigate("StaffManagement")} style={styles.ownerButton} contentStyle={styles.buttonContent48}>Staff Accounts</Button>
            <Button mode="contained-tonal" icon="warehouse" onPress={() => (navigation as any).navigate("ItemList")} style={styles.ownerButton} contentStyle={styles.buttonContent48}>Inventory Catalog</Button>
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
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: '#f1f5f9', // slate-100
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    ...shadow.sm,
  },
  avatar: {
    height: 56,
    width: 56,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryMid,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.md,
  },
  avatarText: {
    color: "white",
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
  },
  flex1: {
    flex: 1,
  },
  userName: {
    color: "#0f172a", // slate-900
    fontWeight: fontWeight.black,
  },
  userMobile: {
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    marginTop: 2,
  },
  detailsCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
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
    borderBottomColor: '#f8fafc', // slate-50
  },
  detailRowNoBorder: {
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    fontSize: 13,
  },
  detailValue: {
    color: "#0f172a",
    fontWeight: fontWeight.bold,
    fontSize: 14,
  },
  securityCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
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
    color: "#0f172a",
    fontWeight: fontWeight.bold,
    fontSize: 14,
  },
  securitySubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  divider: {
    backgroundColor: '#f1f5f9',
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
    height: 46,
  },
  inputOutline: {
    borderRadius: radius.lg,
    borderColor: '#e2e8f0', // slate-200
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
    fontSize: 13,
  },
  updateCard: {
    gap: spacing.lg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
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
    fontSize: 14,
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
    color: "#b91c1c",
    fontWeight: fontWeight.bold,
    fontSize: 13,
    flex: 1,
  },
  ownerButton: {
    borderRadius: radius.lg,
  },
  signOutButton: {
    borderRadius: radius.lg,
    borderColor: '#e2e8f0',
    marginVertical: spacing.sm,
  },
});
