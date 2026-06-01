import React, { useEffect, useState } from "react";
import { 
  KeyboardAvoidingView, 
  Platform, 
  Pressable, 
  ScrollView, 
  View, 
  StyleSheet 
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Divider, Icon, Text, TextInput as PaperInput } from "react-native-paper";
import { z } from "zod";

import { getToken } from "../../auth/token-storage";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

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
      setInfo("Ask the owner/admin to reset your PIN from Staff Management.");
      return;
    }

    const trimmedIdentifier = identifier.trim();
    const identifierSchema = z.union([
      z.email(),
      z.string().regex(/^\d{10}$/)
    ]);

    const idResult = identifierSchema.safeParse(trimmedIdentifier);
    if (!idResult.success) {
      setError("Enter a valid mobile or email.");
      return;
    }

    const passwordSchema = z.string().min(4);
    const passResult = passwordSchema.safeParse(password);
    if (!passResult.success) {
      setError(mode === "PIN" ? "Enter your 4+ digit PIN." : "Password too short.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "PIN" && hasSavedLogin) {
        await signInWithSavedToken(password);
      } else {
        await signIn(trimmedIdentifier, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBiometricLogin() {
    setError(null);
    setInfo(null);
    if (!hasSavedLogin || !biometricAvailable) return;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock ShopControl",
      fallbackLabel: "Use PIN",
    });
    
    if (result.success) {
      setIsSubmitting(true);
      try {
        await signInWithSavedToken();
      } catch (err) {
        setError("Saved login expired. Sign in again.");
      } finally {
        setIsSubmitting(false);
      }
    }
  }

  const isForgot = mode === "FORGOT";

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} bg={colors.bg}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          keyboardShouldPersistTaps="handled" 
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>SC</Text>
            </View>
            <View style={styles.titleBox}>
              <Text style={styles.appName}>ShopControl</Text>
              <Text style={styles.tagline}>Executive retail operations</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {isForgot ? "Forgot PIN" : mode === "PIN" ? "Quick Login" : "Sign In"}
              </Text>
              <Text style={styles.cardSubtitle}>
                {isForgot ? "Reset is handled by admin." : mode === "PIN" ? "Use your saved mobile and PIN." : "Enter your mobile/email and password."}
              </Text>
            </View>

            {!isForgot ? (
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>MOBILE / EMAIL</Text>
                  <PaperInput
                    mode="outlined"
                    placeholder="Enter mobile or email"
                    value={identifier}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    left={<PaperInput.Icon icon="account-outline" color={colors.textMuted} />}
                    onChangeText={setIdentifier}
                    disabled={mode === "PIN" && hasSavedLogin}
                    outlineStyle={styles.inputOutline}
                    activeOutlineColor={colors.primary}
                    style={styles.input}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>{mode === "PIN" ? "PIN" : "PASSWORD"}</Text>
                    <Pressable onPress={() => { setMode("FORGOT"); setError(null); setInfo(null); }}>
                      <Text style={styles.forgotBtn}>FORGOT?</Text>
                    </Pressable>
                  </View>
                  <PaperInput
                    mode="outlined"
                    placeholder={mode === "PIN" ? "••••" : "Enter password"}
                    value={password}
                    secureTextEntry={secureText}
                    keyboardType={mode === "PIN" ? "number-pad" : "default"}
                    onChangeText={setPassword}
                    left={<PaperInput.Icon icon="lock-outline" color={colors.textMuted} />}
                    right={<PaperInput.Icon icon={secureText ? "eye-off-outline" : "eye-outline"} color={colors.textMuted} onPress={() => setSecureText(!secureText)} />}
                    outlineStyle={styles.inputOutline}
                    activeOutlineColor={colors.primary}
                    style={styles.input}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  Staff PIN reset must be done by the owner. Owners can update their password from Profile.
                </Text>
              </View>
            )}

            {error && (
              <View style={styles.errorBox}>
                <Icon source="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            
            {info && (
              <View style={styles.blueInfoBox}>
                <Text style={styles.blueInfoText}>{info}</Text>
              </View>
            )}

            <Button 
              label={isForgot ? "BACK TO LOGIN" : "SIGN IN TO CONTROL"} 
              onPress={isForgot ? () => setMode(hasSavedLogin ? "PIN" : "PASSWORD") : handleSubmit} 
              loading={isSubmitting} 
              size="lg"
              fullWidth
              style={styles.submitBtn}
            />

            {!isForgot && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.extraActions}>
                  {hasSavedLogin && (
                    <Button 
                      variant="ghost" 
                      label={mode === "PIN" ? "Use password instead" : "Use quick PIN login"} 
                      onPress={() => { setMode(mode === "PIN" ? "PASSWORD" : "PIN"); setPassword(""); setError(null); }}
                      fullWidth
                    />
                  )}
                  
                  {biometricAvailable && hasSavedLogin && (
                    <Button 
                      variant="secondary" 
                      icon={<Icon source="fingerprint" size={20} color={colors.primary} />} 
                      label="Biometric Login" 
                      onPress={handleBiometricLogin}
                      fullWidth
                    />
                  )}
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.huge,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  logoBox: {
    width: 80,
    height: 80,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
  },
  logoText: {
    color: colors.textInverse,
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.black,
  },
  titleBox: {
    alignItems: 'center',
    gap: 4,
  },
  appName: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  tagline: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xl,
    ...shadow.md,
  },
  cardHeader: {
    gap: 4,
  },
  cardTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  form: {
    gap: spacing.lg,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.surface,
    height: 56,
    fontSize: fontSize.lg,
  },
  inputOutline: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  forgotBtn: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: fontWeight.black,
  },
  infoBox: {
    backgroundColor: colors.warningLight,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.1)',
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    fontWeight: fontWeight.semibold,
    lineHeight: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  blueInfoBox: {
    backgroundColor: colors.infoLight,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  blueInfoText: {
    color: colors.info,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  submitBtn: {
    minHeight: 56,
  },
  divider: {
    backgroundColor: colors.surfaceOffset,
  },
  extraActions: {
    gap: spacing.md,
  }
});
