import { useEffect, useState } from "react";
import { View, Switch } from "react-native";
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
    <Screen hasTab={true}>
      <AppHeader title="Profile" subtitle="Signed-in user and permissions." role={user?.role} />
      
      {/* Profile Card */}
      <View 
        style={{ 
          shadowColor: "#000", 
          shadowOffset: { width: 0, height: 4 }, 
          shadowOpacity: 0.04, 
          shadowRadius: 12, 
          elevation: 2 
        }} 
        className="bg-white rounded-[24px] p-5 border border-slate-100 flex-row items-center gap-4"
      >
        <View className="h-14 w-14 rounded-2xl bg-blue-600 items-center justify-center shadow-lg shadow-blue-200">
          <Text style={{ color: "white", fontSize: 24, fontWeight: "900" }}>
            {user?.name?.[0]?.toUpperCase() ?? "O"}
          </Text>
        </View>
        <View className="flex-1">
          <Text variant="titleMedium" style={{ color: "#0f172a", fontWeight: "900" }}>{user?.name}</Text>
          <Text variant="bodySmall" style={{ color: "#64748b", fontWeight: "600", marginTop: 2 }}>{user?.mobile}</Text>
        </View>
        <StatusPill label={user?.role ?? "USER"} tone={user?.role === "OWNER" ? "blue" : "amber"} />
      </View>

      {/* Account Info */}
      <Section title="Account details">
        <View className="rounded-[24px] border border-slate-100 bg-white overflow-hidden shadow-sm">
          <View className="p-4 flex-row justify-between items-center border-b border-slate-50">
            <Text style={{ color: "#64748b", fontWeight: "600", fontSize: 13 }}>Email</Text>
            <Text style={{ color: "#0f172a", fontWeight: "700", fontSize: 14 }}>{user?.email || "Not set"}</Text>
          </View>
          <View className="p-4 flex-row justify-between items-center">
            <Text style={{ color: "#64748b", fontWeight: "600", fontSize: 13 }}>Permissions</Text>
            <Text style={{ color: "#0f172a", fontWeight: "700", fontSize: 14 }}>{user?.permissions.length ?? 0} active controls</Text>
          </View>
        </View>
      </Section>

      {/* Security settings */}
      <Section title="Security & quick login">
        <View className="rounded-[24px] border border-slate-100 bg-white p-5 gap-5 shadow-sm">
          {/* Biometrics Toggle */}
          <View className="flex-row justify-between items-center">
            <View className="flex-1 pr-4">
              <Text style={{ color: "#0f172a", fontWeight: "700", fontSize: 14 }}>Biometric Login</Text>
              <Text style={{ color: "#64748b", fontSize: 12, marginTop: 2, lineHeight: 16 }}>Use fingerprint or face recognition for quick access.</Text>
            </View>
            <Switch
              value={biometricEnabled}
              disabled={!biometricAvailable}
              onValueChange={handleBiometricToggle}
              trackColor={{ false: "#e2e8f0", true: "#dbeafe" }}
              thumbColor={biometricEnabled ? "#1e40af" : "#94a3b8"}
            />
          </View>

          <Divider style={{ backgroundColor: "#f1f5f9" }} />

          {/* Quick PIN Setup */}
          <View className="gap-3">
            <Text style={{ color: "#0f172a", fontWeight: "700", fontSize: 14 }}>Quick Login PIN</Text>
            <Text style={{ color: "#64748b", fontSize: 12, lineHeight: 16 }}>Configure a 4-digit PIN for fast sign-in without typing your full password.</Text>
            <View className="flex-row gap-3 mt-2">
              <TextInput
                mode="outlined"
                placeholder="New PIN (4 digits)"
                value={pin}
                onChangeText={setPin}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                style={{ flex: 1, backgroundColor: "white", height: 46 }}
                outlineStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
                activeOutlineColor="#1e40af"
              />
              <TextInput
                mode="outlined"
                placeholder="Confirm PIN"
                value={pinConfirm}
                onChangeText={setPinConfirm}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                style={{ flex: 1, backgroundColor: "white", height: 46 }}
                outlineStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
                activeOutlineColor="#1e40af"
              />
            </View>
            <Button
              mode="contained-tonal"
              onPress={handleSavePin}
              disabled={pin.length !== 4 || pinConfirm.length !== 4}
              style={{ borderRadius: 12, marginTop: 4 }}
              contentStyle={{ height: 44 }}
              labelStyle={{ fontWeight: "800", fontSize: 13 }}
            >
              Update PIN
            </Button>
          </View>
        </View>
      </Section>

      {/* Profile info update */}
      <Section title="Update profile">
        <View className="gap-4 rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
          <TextInput 
            mode="outlined" 
            label="Name" 
            value={name} 
            onChangeText={setName} 
            outlineStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
            activeOutlineColor="#1e40af"
            style={{ backgroundColor: "white" }}
          />
          <TextInput 
            mode="outlined" 
            label="Email" 
            value={email ?? ""} 
            onChangeText={setEmail} 
            outlineStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
            activeOutlineColor="#1e40af"
            style={{ backgroundColor: "white" }}
          />
          <TextInput 
            mode="outlined" 
            label="New password" 
            secureTextEntry 
            value={password} 
            onChangeText={setPassword} 
            outlineStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
            activeOutlineColor="#1e40af"
            style={{ backgroundColor: "white" }}
          />
          <Button 
            mode="contained" 
            loading={mutation.isPending} 
            onPress={() => mutation.mutate()} 
            style={{ borderRadius: 12, backgroundColor: "#1e40af", marginTop: 4 }}
            contentStyle={{ height: 48 }}
            labelStyle={{ fontWeight: "800", fontSize: 14, color: "#ffffff" }}
          >
            Save Profile
          </Button>
        </View>
      </Section>

      {error ? (
        <View className="flex-row items-center gap-2.5 rounded-2xl bg-red-50 p-3.5 mx-1">
          <Icon source="alert-circle" size={18} color="#dc2626" />
          <Text style={{ color: "#b91c1c", fontWeight: "700", fontSize: 13, flex: 1 }}>{error}</Text>
        </View>
      ) : null}

      {/* Owner controls */}
      {user?.role === "OWNER" ? (
        <Section title="Owner tools">
          <View className="gap-3">
            <Button mode="contained-tonal" icon="storefront-outline" onPress={() => setActiveShopId(null)} style={{ borderRadius: 12 }} contentStyle={{ height: 48 }}>Change Active Shop</Button>
            <Button mode="contained-tonal" icon="account-plus" onPress={() => (navigation as any).navigate("AddEditStaff")} style={{ borderRadius: 12 }} contentStyle={{ height: 48 }}>Add Staff Member</Button>
            <Button mode="contained-tonal" icon="account-group-outline" onPress={() => (navigation as any).navigate("StaffManagement")} style={{ borderRadius: 12 }} contentStyle={{ height: 48 }}>Staff Accounts</Button>
            <Button mode="contained-tonal" icon="warehouse" onPress={() => (navigation as any).navigate("ItemList")} style={{ borderRadius: 12 }} contentStyle={{ height: 48 }}>Inventory Catalog</Button>
          </View>
        </Section>
      ) : null}

      <Button 
        mode="outlined" 
        icon="logout" 
        onPress={signOut} 
        contentStyle={{ height: 48 }} 
        style={{ borderRadius: 12, borderColor: "#e2e8f0", marginVertical: 8 }} 
        textColor="#dc2626"
      >
        Sign out
      </Button>

      {/* Reusable success modal */}
      <SuccessModal
        visible={successVisible}
        title={successTitle}
        message={successMessage}
        onClose={() => setSuccessVisible(false)}
      />
    </Screen>
  );
}
