import { useState } from "react";
import { KeyboardAvoidingView, Platform, View, Pressable, ScrollView } from "react-native";
import { Button, HelperText, Surface, Text, TextInput, useTheme, Icon } from "react-native-paper";
import { useAuthStore } from "../../auth/auth-store";

export function Login() {
  const theme = useTheme();
  const signIn = useAuthStore((state) => state.signIn);
  const [identifier, setIdentifier] = useState("9999999999");
  const [password, setPassword] = useState("owner123");
  const [secureText, setSecureText] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(identifier.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.select({ ios: "padding", default: undefined })}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 items-center justify-center px-6 py-12">
          <View className="w-full max-w-[400px] gap-8">
            
            {/* Branding Section */}
            <View className="items-center gap-4">
              <View className="h-20 w-20 items-center justify-center rounded-[24px] bg-[#1e40af] shadow-2xl shadow-blue-500/40">
                <Text variant="displaySmall" style={{ color: "#ffffff", fontWeight: "900" }}>SC</Text>
              </View>
              <View className="items-center gap-1">
                <Text variant="headlineLarge" style={{ color: "#111827", fontWeight: "900", letterSpacing: -0.5 }}>ShopControl</Text>
                <Text variant="bodyMedium" style={{ color: "#64748b", textAlign: "center", maxWidth: 280, lineHeight: 22 }}>
                  Empowering your retail operations with executive oversight.
                </Text>
              </View>
            </View>

            {/* Login Card */}
            <Surface
              elevation={2}
              className="gap-6 rounded-[20px] bg-white p-6 shadow-xl"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.08,
                shadowRadius: 20,
              }}
            >
              <View className="gap-2">
                <Text variant="titleLarge" style={{ color: "#111827", fontWeight: "800" }}>Sign In</Text>
                <Text variant="bodySmall" style={{ color: "#64748b" }}>Please enter your credentials to continue.</Text>
              </View>

              <View className="gap-4">
                <View>
                  <Text variant="labelMedium" style={{ color: "#475569", marginBottom: 6, fontWeight: "700" }}>MOBILE OR EMAIL</Text>
                  <TextInput
                    mode="outlined"
                    placeholder="e.g. 9988776655"
                    value={identifier}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    left={<TextInput.Icon icon="account-outline" color="#94a3b8" />}
                    onChangeText={setIdentifier}
                    outlineStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
                    activeOutlineColor="#1e40af"
                    textColor="#111827"
                    style={{ backgroundColor: "white" }}
                  />
                </View>

                <View>
                  <View className="flex-row justify-between items-center mb-1.5">
                    <Text variant="labelMedium" style={{ color: "#475569", fontWeight: "700" }}>PASSWORD / PIN</Text>
                    <Pressable>
                       <Text variant="labelSmall" style={{ color: "#1e40af", fontWeight: "800" }}>FORGOT?</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    mode="outlined"
                    placeholder="••••••••"
                    value={password}
                    secureTextEntry={secureText}
                    onChangeText={setPassword}
                    left={<TextInput.Icon icon="lock-outline" color="#94a3b8" />}
                    right={
                      <TextInput.Icon
                        icon={secureText ? "eye-outline" : "eye-off-outline"}
                        color="#94a3b8"
                        onPress={() => setSecureText((value) => !value)}
                      />
                    }
                    outlineStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
                    activeOutlineColor="#1e40af"
                    textColor="#111827"
                    style={{ backgroundColor: "white" }}
                  />
                </View>

                {error ? (
                  <View className="bg-red-50 p-3 rounded-lg flex-row items-center gap-2">
                    <Icon source="alert-circle" size={16} color="#ef4444" />
                    <Text variant="bodySmall" style={{ color: "#b91c1c", fontWeight: "600" }}>{error}</Text>
                  </View>
                ) : null}

                <Button
                  mode="contained"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                  style={{ borderRadius: 12, marginTop: 4, backgroundColor: "#1e40af" }}
                  contentStyle={{ height: 54 }}
                  labelStyle={{ fontSize: 16, fontWeight: "800", letterSpacing: 0.5 }}
                  onPress={handleSubmit}
                >
                  Sign In to Control
                </Button>
              </View>

              <Divider className="my-2" />

              <Pressable className="flex-row items-center justify-center gap-2 py-2">
                <Icon source="fingerprint" size={20} color="#64748b" />
                <Text style={{ color: "#64748b", fontWeight: "600" }}>Enable Biometric Login</Text>
              </Pressable>
            </Surface>

            {/* Support Footer */}
            <View className="items-center gap-2">
               <Text variant="bodySmall" style={{ color: "#94a3b8" }}>New to ShopControl?</Text>
               <Pressable className="bg-white px-4 py-2 rounded-full border border-gray-200">
                  <Text style={{ color: "#1e40af", fontWeight: "800", fontSize: 12 }}>Contact Administration</Text>
               </Pressable>
            </View>

          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
