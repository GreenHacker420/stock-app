import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Button, Divider, Icon, Surface, Text, TextInput } from "react-native-paper";
import { getToken } from "../../auth/token-storage";
import { useAuthStore } from "../../auth/auth-store";

const LAST_IDENTIFIER_KEY = "shopcontrol_last_identifier";

type LoginMode = "PASSWORD" | "PIN" | "FORGOT";

export function Login() {
  const signIn = useAuthStore((state) => state.signIn);
  const signInWithSavedToken = useAuthStore((state) => state.signInWithSavedToken);
  const [mode, setMode] = useState<LoginMode>("PASSWORD");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [secureText, setSecureText] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSavedLogin, setHasSavedLogin] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    async function loadSavedLogin() {
      const savedIdentifier = await getToken(LAST_IDENTIFIER_KEY);
      const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const isEnrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
      setBiometricAvailable(hasHardware && isEnrolled);
      if (savedIdentifier) {
        setIdentifier(savedIdentifier);
        setHasSavedLogin(true);
        setMode("PIN");
      }
    }
    loadSavedLogin();
  }, []);

  async function handleSubmit() {
    setError(null);
    setInfo(null);

    if (mode === "FORGOT") {
      setInfo("Ask the owner/admin to reset your PIN from Staff Management. Owner can update their password from Profile after login.");
      return;
    }

    const mobile = identifier.trim();
    if (!/^\d{10}$/.test(mobile)) {
      setError("Enter a valid 10 digit mobile number.");
      return;
    }
    if (password.length < 4) {
      setError(mode === "PIN" ? "Enter your 4+ digit PIN." : "Password must be at least 4 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "PIN" && hasSavedLogin) {
        await signInWithSavedToken(password);
      } else {
        await signIn(mobile, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message || "Invalid login credentials" : "Invalid login credentials");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBiometricLogin() {
    setError(null);
    setInfo(null);
    if (!hasSavedLogin) {
      setError("Sign in once with mobile and PIN before using biometric login.");
      return;
    }
    if (!biometricAvailable) {
      setError("Biometric login is not available on this device.");
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock ShopControl",
      fallbackLabel: "Use PIN",
      disableDeviceFallback: false,
    });
    if (!result.success) {
      setError("Biometric authentication cancelled.");
      return;
    }

    setIsSubmitting(true);
    try {
      await signInWithSavedToken();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saved login expired. Sign in again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isForgot = mode === "FORGOT";

  return (
    <KeyboardAvoidingView className="flex-1 bg-[#f8fafc]" behavior={Platform.select({ ios: "padding", default: undefined })}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View className="flex-1 items-center justify-center px-6 py-12">
          <View className="w-full max-w-[400px] gap-8">
            {/* Brand Header */}
            <View className="items-center gap-5">
              <View 
                style={{ 
                  shadowColor: "#1e40af", 
                  shadowOffset: { width: 0, height: 12 }, 
                  shadowOpacity: 0.15, 
                  shadowRadius: 20,
                  elevation: 6,
                }} 
                className="h-20 w-20 items-center justify-center rounded-[24px] bg-[#1e40af]"
              >
                <Text variant="displaySmall" style={{ color: "#ffffff", fontWeight: "900", letterSpacing: -1 }}>SC</Text>
              </View>
              <View className="items-center gap-1.5">
                <Text variant="headlineMedium" style={{ color: "#0f172a", fontWeight: "900", letterSpacing: -0.5 }}>ShopControl</Text>
                <Text variant="bodyMedium" style={{ color: "#64748b", textAlign: "center", maxWidth: 280, lineHeight: 20, fontWeight: "500" }}>
                  Empowering your retail operations with executive oversight.
                </Text>
              </View>
            </View>

            {/* Login Card */}
            <View 
              style={{
                shadowColor: "#0f172a",
                shadowOffset: { width: 0, height: 16 },
                shadowOpacity: 0.06,
                shadowRadius: 24,
                elevation: 4,
              }}
              className="gap-6 rounded-[28px] border border-slate-100 bg-white p-6"
            >
              <View className="gap-1.5">
                <Text variant="titleLarge" style={{ color: "#0f172a", fontWeight: "800" }}>
                  {isForgot ? "Forgot PIN" : mode === "PIN" ? "Quick Login" : "Sign In"}
                </Text>
                <Text variant="bodyMedium" style={{ color: "#64748b", fontWeight: "500" }}>
                  {isForgot ? "PIN reset is handled by an owner/admin." : mode === "PIN" ? "Use your saved mobile and PIN." : "Enter your mobile and password."}
                </Text>
              </View>

              {!isForgot ? (
                <>
                  <View>
                    <Text style={{ color: "#475569", marginBottom: 8, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 }}>MOBILE</Text>
                    <TextInput
                      mode="outlined"
                      placeholder="10 digit mobile number"
                      value={identifier}
                      keyboardType="phone-pad"
                      autoCapitalize="none"
                      left={<TextInput.Icon icon="account-outline" color="#94a3b8" />}
                      onChangeText={setIdentifier}
                      disabled={mode === "PIN" && hasSavedLogin}
                      outlineStyle={{ borderRadius: 16, borderColor: "#e2e8f0", borderWidth: 1.5 }}
                      activeOutlineColor="#1e40af"
                      style={{ backgroundColor: "white", height: 50 }}
                    />
                  </View>

                  <View>
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text style={{ color: "#475569", fontSize: 11, fontWeight: "700", letterSpacing: 0.8 }}>{mode === "PIN" ? "PIN" : "PASSWORD / PIN"}</Text>
                      <Pressable onPress={() => { setMode("FORGOT"); setError(null); setInfo(null); }}>
                        <Text style={{ color: "#1e40af", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 }}>FORGOT?</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      mode="outlined"
                      placeholder="••••"
                      value={password}
                      secureTextEntry={secureText}
                      keyboardType={mode === "PIN" ? "number-pad" : "default"}
                      onChangeText={setPassword}
                      left={<TextInput.Icon icon="lock-outline" color="#94a3b8" />}
                      right={<TextInput.Icon icon={secureText ? "eye-off-outline" : "eye-outline"} color="#94a3b8" onPress={() => setSecureText((value) => !value)} />}
                      outlineStyle={{ borderRadius: 16, borderColor: "#e2e8f0", borderWidth: 1.5 }}
                      activeOutlineColor="#1e40af"
                      style={{ backgroundColor: "white", height: 50 }}
                    />
                  </View>
                </>
              ) : (
                <View className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                  <Text style={{ color: "#78350f", lineHeight: 20, fontSize: 13, fontWeight: "500" }}>
                    Staff PIN reset must be done by the owner from Staff Management. If you are the owner, sign in with your password or ask the system administrator to reset it.
                  </Text>
                </View>
              )}

              {error ? (
                <View className="flex-row items-center gap-2.5 rounded-2xl bg-red-50 p-3.5">
                  <Icon source="alert-circle" size={18} color="#dc2626" />
                  <Text style={{ color: "#b91c1c", fontWeight: "700", fontSize: 13, flex: 1 }}>{error}</Text>
                </View>
              ) : null}
              {info ? (
                <View className="rounded-2xl bg-blue-50 p-3.5">
                  <Text style={{ color: "#1e3a8a", fontWeight: "700", fontSize: 13 }}>{info}</Text>
                </View>
              ) : null}

              <Button 
                mode="contained" 
                loading={isSubmitting} 
                disabled={isSubmitting} 
                onPress={handleSubmit} 
                style={{ borderRadius: 16, backgroundColor: "#1e40af", marginTop: 4 }} 
                contentStyle={{ height: 52 }} 
                labelStyle={{ fontSize: 15, fontWeight: "800", color: "#ffffff" }}
              >
                {isForgot ? "Show Reset Instructions" : "Sign In to Control"}
              </Button>

              <Divider style={{ marginVertical: 4, backgroundColor: "#f1f5f9" }} />

              <View className="gap-3">
                {hasSavedLogin ? (
                  <Button 
                    mode="text" 
                    icon={mode === "PIN" ? "account-outline" : "key-variant"} 
                    onPress={() => { setMode(mode === "PIN" ? "PASSWORD" : "PIN"); setPassword(""); setError(null); }}
                    textColor="#4b5563"
                    labelStyle={{ fontWeight: "700", fontSize: 13 }}
                  >
                    {mode === "PIN" ? "Use different mobile/password" : "Use saved mobile PIN"}
                  </Button>
                ) : null}
                
                {biometricAvailable && hasSavedLogin && (
                  <Button 
                    mode="outlined" 
                    icon="fingerprint" 
                    disabled={isSubmitting} 
                    onPress={handleBiometricLogin}
                    style={{ borderRadius: 16, borderColor: "#e2e8f0" }}
                    textColor="#475569"
                    contentStyle={{ height: 48 }}
                    labelStyle={{ fontWeight: "700", fontSize: 13 }}
                  >
                    Biometric Login
                  </Button>
                )}

                {isForgot ? (
                  <Button 
                    mode="text" 
                    onPress={() => setMode(hasSavedLogin ? "PIN" : "PASSWORD")}
                    textColor="#4b5563"
                    labelStyle={{ fontWeight: "700", fontSize: 13 }}
                  >
                    Back to Login
                  </Button>
                ) : null}
              </View>
            </View>

            <View className="items-center gap-3">
              <Text style={{ color: "#94a3b8", fontWeight: "600", fontSize: 13 }}>New to ShopControl?</Text>
              <Pressable className="rounded-full border border-slate-200 bg-white px-6 py-2.5 shadow-sm active:bg-slate-50">
                <Text style={{ color: "#1e40af", fontWeight: "800", fontSize: 13 }}>Contact Administration</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
