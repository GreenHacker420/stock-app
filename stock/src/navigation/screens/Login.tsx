import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button, HelperText, Text, TextInput } from "react-native-paper";
import { useAuthStore } from "@/auth/auth-store";
import { Screen } from "@/components/Screen";

export function Login() {
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
      className="flex-1"
      behavior={Platform.select({ ios: "padding", default: undefined })}
    >
      <Screen scroll={false}>
        <View className="flex-1 justify-center gap-6">
          <View className="gap-2">
            <Text variant="headlineLarge" className="text-ink">
              ShopControl
            </Text>
            <Text variant="bodyLarge" className="text-neutral-600">
              Owner command, staff execution, daily control.
            </Text>
          </View>

          <View className="gap-3">
            <TextInput
              mode="outlined"
              label="Mobile or email"
              value={identifier}
              keyboardType="phone-pad"
              autoCapitalize="none"
              onChangeText={setIdentifier}
            />
            <TextInput
              mode="outlined"
              label="Password"
              value={password}
              secureTextEntry={secureText}
              onChangeText={setPassword}
              right={
                <TextInput.Icon
                  icon={secureText ? "eye" : "eye-off"}
                  onPress={() => setSecureText((value) => !value)}
                />
              }
            />
            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>
            <Button mode="contained" icon="login" loading={isSubmitting} onPress={handleSubmit}>
              Sign in
            </Button>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
