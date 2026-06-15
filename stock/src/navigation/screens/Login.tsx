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
  const [pinSet, setPinSet] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [pinDigits, setPinDigits] = useState("");

  useEffect(() => {
    async function loadSavedLogin() {
      const savedIdentifier = await getToken(LAST_IDENTIFIER_KEY);
      const bioEnabledVal = await getToken("shopcontrol_biometric_enabled");
      const pinSetVal = await getToken("shopcontrol_pin_set");
      
      const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const isEnrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
      const isBioAvailable = hasHardware && isEnrolled;
      
      setBiometricAvailable(isBioAvailable);
      const bioEnabled = bioEnabledVal === "true";
      setBiometricEnabled(bioEnabled);
      const isPinSet = pinSetVal === "true";
      setPinSet(isPinSet);

      if (savedIdentifier) {
        setIdentifier(savedIdentifier);
        setHasSavedLogin(true);
        
        const isBioActive = isBioAvailable && bioEnabled;
        if (isPinSet || isBioActive) {
          setMode("PIN");
          if (isBioActive) {
            // Auto-trigger biometric check
            setTimeout(() => {
              handleBiometricLogin();
            }, 300);
          }
        } else {
          setMode("PASSWORD");
        }
      }
    }
    loadSavedLogin();
  }, []);

  // Auto-submit PIN once it reaches 4 digits
  useEffect(() => {
    if (mode === "PIN" && pinDigits.length === 4) {
      const submitPin = async () => {
        setIsSubmitting(true);
        setError(null);
        try {
          await signInWithSavedToken(pinDigits);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Invalid PIN");
          setPinDigits(""); // Clear PIN on failure
        } finally {
          setIsSubmitting(false);
        }
      };
      submitPin();
    }
  }, [pinDigits, mode]);

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
      setError("Password too short.");
      return;
    }

    setIsSubmitting(true);
    try {
      await signIn(trimmedIdentifier, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBiometricLogin() {
    setError(null);
    setInfo(null);
    const hasSaved = await getToken(LAST_IDENTIFIER_KEY);
    if (!hasSaved) return;

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

  const handleKeyInput = (digit: string) => {
    setError(null);
    if (pinDigits.length < 4) {
      setPinDigits(prev => prev + digit);
    }
  };

  const handleBackspace = () => {
    setPinDigits(prev => prev.slice(0, -1));
  };

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
                {isForgot ? "Reset is handled by admin." : mode === "PIN" ? "Enter your 4-digit PIN to unlock." : "Enter your mobile/email and password."}
              </Text>
            </View>

            {!isForgot ? (
              mode === "PIN" ? (
                <View style={styles.passcodeContainer}>
                  {/* Dots Indicator */}
                  <View style={styles.dotsRow}>
                    {[0, 1, 2, 3].map((i) => (
                      <View 
                        key={i} 
                        style={[
                          styles.dot, 
                          pinDigits.length > i && styles.dotFilled
                        ]} 
                      />
                    ))}
                  </View>

                  {/* Grid */}
                  <View style={styles.passcodeKeypad}>
                    <View style={styles.keypadRow}>
                      <Pressable style={styles.keypadBtn} onPress={() => handleKeyInput("1")}><Text style={styles.keypadBtnText}>1</Text></Pressable>
                      <Pressable style={styles.keypadBtn} onPress={() => handleKeyInput("2")}><Text style={styles.keypadBtnText}>2</Text></Pressable>
                      <Pressable style={styles.keypadBtn} onPress={() => handleKeyInput("3")}><Text style={styles.keypadBtnText}>3</Text></Pressable>
                    </View>
                    <View style={styles.keypadRow}>
                      <Pressable style={styles.keypadBtn} onPress={() => handleKeyInput("4")}><Text style={styles.keypadBtnText}>4</Text></Pressable>
                      <Pressable style={styles.keypadBtn} onPress={() => handleKeyInput("5")}><Text style={styles.keypadBtnText}>5</Text></Pressable>
                      <Pressable style={styles.keypadBtn} onPress={() => handleKeyInput("6")}><Text style={styles.keypadBtnText}>6</Text></Pressable>
                    </View>
                    <View style={styles.keypadRow}>
                      <Pressable style={styles.keypadBtn} onPress={() => handleKeyInput("7")}><Text style={styles.keypadBtnText}>7</Text></Pressable>
                      <Pressable style={styles.keypadBtn} onPress={() => handleKeyInput("8")}><Text style={styles.keypadBtnText}>8</Text></Pressable>
                      <Pressable style={styles.keypadBtn} onPress={() => handleKeyInput("9")}><Text style={styles.keypadBtnText}>9</Text></Pressable>
                    </View>
                    <View style={styles.keypadRow}>
                      {biometricAvailable && biometricEnabled ? (
                        <Pressable 
                          style={[styles.keypadBtn, { backgroundColor: 'transparent', elevation: 0 }]} 
                          onPress={handleBiometricLogin}
                        >
                          <Icon source="fingerprint" size={28} color={colors.primary} />
                        </Pressable>
                      ) : (
                        <View style={styles.keypadBtnEmpty} />
                      )}
                      
                      <Pressable style={styles.keypadBtn} onPress={() => handleKeyInput("0")}><Text style={styles.keypadBtnText}>0</Text></Pressable>
                      
                      <Pressable style={[styles.keypadBtn, styles.keypadBackspace]} onPress={handleBackspace}>
                        <Icon source="backspace-outline" size={24} color={colors.textPrimary} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.passcodeFooter}>
                    <Pressable 
                      onPress={() => { setMode("PASSWORD"); setPassword(""); setError(null); }}
                      style={({ pressed }) => [styles.passcodeLinkBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.passcodeLinkText}>Use Password</Text>
                    </Pressable>
                    <Pressable 
                      onPress={() => { setMode("FORGOT"); setError(null); setInfo(null); }}
                      style={({ pressed }) => [styles.passcodeLinkBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.passcodeLinkText}>Forgot PIN?</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
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
                      outlineStyle={styles.inputOutline}
                      activeOutlineColor={colors.primary}
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <View style={styles.labelRow}>
                      <Text style={styles.label}>PASSWORD</Text>
                    </View>
                    <PaperInput
                      mode="outlined"
                      placeholder="Enter password"
                      value={password}
                      secureTextEntry={secureText}
                      onChangeText={setPassword}
                      left={<PaperInput.Icon icon="lock-outline" color={colors.textMuted} />}
                      right={<PaperInput.Icon icon={secureText ? "eye-off-outline" : "eye-outline"} color={colors.textMuted} onPress={() => setSecureText(!secureText)} />}
                      outlineStyle={styles.inputOutline}
                      activeOutlineColor={colors.primary}
                      style={styles.input}
                    />
                  </View>
                </View>
              )
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

            {mode !== "PIN" && (
              <Button 
                label={isForgot ? "BACK TO LOGIN" : "SIGN IN TO CONTROL"} 
                onPress={isForgot ? () => setMode(hasSavedLogin ? "PIN" : "PASSWORD") : handleSubmit} 
                loading={isSubmitting} 
                size="lg"
                fullWidth
                style={styles.submitBtn}
              />
            )}

            {!isForgot && mode !== "PIN" && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.extraActions}>
                  {hasSavedLogin && (pinSet || biometricEnabled) && (
                    <Button 
                      variant="ghost" 
                      label="Use quick PIN login" 
                      onPress={() => { setMode("PIN"); setPassword(""); setError(null); }}
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
  },
  passcodeContainer: {
    alignItems: "center",
    gap: spacing.xl,
    paddingVertical: spacing.md,
    width: "100%",
  },
  dotsRow: {
    flexDirection: "row",
    gap: spacing.xl,
    justifyContent: "center",
    marginVertical: spacing.lg,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2.5,
    borderColor: colors.borderStrong,
    backgroundColor: "transparent",
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  passcodeKeypad: {
    width: "100%",
    gap: spacing.md,
  },
  keypadRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  keypadBtn: {
    flex: 1,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.surfaceOffset,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  keypadBtnText: {
    fontSize: 22,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  keypadBtnEmpty: {
    flex: 1,
    height: 64,
    backgroundColor: "transparent",
  },
  keypadBackspace: {
    backgroundColor: "transparent",
    elevation: 0,
    shadowOpacity: 0,
  },
  passcodeFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  passcodeLinkBtn: {
    paddingVertical: spacing.sm,
  },
  passcodeLinkText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.black,
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
