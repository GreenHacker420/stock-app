import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button, HelperText, Surface, Text, TextInput, useTheme } from "react-native-paper";
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
      className="flex-1 bg-[#eef2ea]"
      behavior={Platform.select({ ios: "padding", default: undefined })}
    >
      <View className="flex-1 items-center justify-center px-5 py-8">
        <View className="w-full max-w-[430px] gap-5">
          <View className="gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-[#246b4b]">
              <Text variant="headlineSmall" style={{ color: "#ffffff", fontWeight: "700" }}>
                SC
              </Text>
            </View>
            <View className="gap-2">
              <Text
                variant="headlineLarge"
                style={{ color: "#17211b", fontWeight: "800", letterSpacing: 0 }}
              >
                ShopControl
              </Text>
              <Text variant="bodyLarge" style={{ color: "#4d584f", lineHeight: 24 }}>
                Daily shop control for orders, stock, payments, and counter cash.
              </Text>
            </View>
          </View>

          <Surface
            mode="flat"
            elevation={0}
            className="gap-4 rounded-lg border border-[#d9dfd2] bg-white p-5"
          >
            <View className="gap-1">
              <Text variant="titleMedium" style={{ color: "#17211b", fontWeight: "700" }}>
                Sign in
              </Text>
              <Text variant="bodyMedium" style={{ color: "#667064" }}>
                Use your owner or staff login.
              </Text>
            </View>

            <View className="gap-3">
              <TextInput
                mode="outlined"
                label="Mobile or email"
                value={identifier}
                keyboardType="phone-pad"
                autoCapitalize="none"
                left={<TextInput.Icon icon="cellphone" />}
                onChangeText={setIdentifier}
                outlineColor="#b9c3b5"
                activeOutlineColor={theme.colors.primary}
                textColor="#17211b"
                style={{ backgroundColor: "#fbfcf8" }}
              />
              <TextInput
                mode="outlined"
                label="Password"
                value={password}
                secureTextEntry={secureText}
                onChangeText={setPassword}
                left={<TextInput.Icon icon="lock-outline" />}
                right={
                  <TextInput.Icon
                    icon={secureText ? "eye" : "eye-off"}
                    onPress={() => setSecureText((value) => !value)}
                  />
                }
                outlineColor="#b9c3b5"
                activeOutlineColor={theme.colors.primary}
                textColor="#17211b"
                style={{ backgroundColor: "#fbfcf8" }}
              />
              <HelperText type="error" visible={!!error}>
                {error}
              </HelperText>
              <Button
                mode="contained"
                icon="login"
                loading={isSubmitting}
                disabled={isSubmitting}
                contentStyle={{ height: 50 }}
                labelStyle={{ fontSize: 16, fontWeight: "700" }}
                onPress={handleSubmit}
              >
                Sign in
              </Button>
            </View>
          </Surface>

          <View className="flex-row gap-2">
            <View className="flex-1 rounded-lg bg-white/70 p-3">
              <Text variant="labelLarge" style={{ color: "#246b4b", fontWeight: "700" }}>
                Owner
              </Text>
              <Text variant="bodySmall" style={{ color: "#667064" }}>
                Dashboard, verification, daily summary.
              </Text>
            </View>
            <View className="flex-1 rounded-lg bg-white/70 p-3">
              <Text variant="labelLarge" style={{ color: "#8a5a12", fontWeight: "700" }}>
                Staff
              </Text>
              <Text variant="bodySmall" style={{ color: "#667064" }}>
                Sales, DM, stock, cash closing.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
