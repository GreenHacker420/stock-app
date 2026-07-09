import React, { useEffect, useState, useRef, useCallback } from "react";
import { 
  KeyboardAvoidingView, 
  Platform, 
  Pressable, 
  ScrollView, 
  View, 
  StyleSheet,
  Animated,
  Modal,
  ActivityIndicator
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Divider, Icon, Text, TextInput as PaperInput } from "react-native-paper";
import { z } from "zod";
import { initializeAsync, verifyUserAsync, TruecallerErrorCodes } from "expo-truecaller";
import TruecallerFullstack from "../../../modules/truecaller-fullstack";

import { getToken } from "../../auth/token-storage";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/ui/Button";
import { FormTextField } from "../../components/forms/FormTextField";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { triggerLightHaptic, triggerMediumHaptic } from "../../utils/haptics";

const LAST_IDENTIFIER_KEY = "shopcontrol_last_identifier";

type LoginMode = "PASSWORD" | "PIN" | "FORGOT";

export function Login() {
  const signIn = useAuthStore((state) => state.signIn);
  const signInWithSavedToken = useAuthStore((state) => state.signInWithSavedToken);
  const signInWithTruecaller = useAuthStore((state) => state.signInWithTruecaller);
  const signInWithTruecallerOtp = useAuthStore((state) => state.signInWithTruecallerOtp);
  
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
  const [savedUserName, setSavedUserName] = useState("");
  const [savedUserPhone, setSavedUserPhone] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTimeLeft, setLockoutTimeLeft] = useState(0);
  const biometricTriggered = useRef(false);
  const [isTruecallerUsable, setIsTruecallerUsable] = useState(false);
  const [isTruecallerLoading, setIsTruecallerLoading] = useState(false);

  useEffect(() => {
    async function initTruecaller() {
      if (Platform.OS !== "android") return;
      try {
        const { isUsable } = await initializeAsync({
          consentMode: "bottomsheet",
          heading: "logInTo",
          theme: "light",
        });
        setIsTruecallerUsable(isUsable);
      } catch (err) {
        console.warn("Failed to initialize Truecaller SDK:", err);
      }
    }
    initTruecaller();
  }, []);

  const handleTruecallerLogin = useCallback(async () => {
    setError(null);
    setInfo(null);
    
    if (isTruecallerUsable) {
      setIsTruecallerLoading(true);
      triggerMediumHaptic();
      try {
        const { authorizationCode, codeVerifier } = await verifyUserAsync();
        await signInWithTruecaller(authorizationCode, codeVerifier);
      } catch (err: any) {
        if (err.code === TruecallerErrorCodes.USER_CANCELLED || err.message?.includes("cancelled")) {
          setInfo("Truecaller login was cancelled.");
        } else {
          console.warn("Truecaller 1-tap failed, falling back to drop-call verification:", err);
          const cleanPhone = identifier.replace(/\D/g, "");
          if (cleanPhone.length === 10) {
            setVerificationStatus("INITIATING");
            setShowOtpModal(true);
            setOtpTtl(60);
            setOtpCode("");
            setFirstName("");
            setLastName("");
            try {
              await TruecallerFullstack.requestVerification(cleanPhone);
            } catch (fallbackErr: any) {
              setError(fallbackErr instanceof Error ? fallbackErr.message : "Failed to initiate verification");
              setVerificationStatus("ERROR");
            }
          } else {
            const msg = err instanceof Error ? err.message : "Truecaller authentication failed.";
            setError(msg + " (Please enter your 10-digit mobile number in the input field above to verify via call instead)");
          }
        }
      } finally {
        setIsTruecallerLoading(false);
      }
    } else {
      const cleanPhone = identifier.replace(/\D/g, "");
      if (cleanPhone.length !== 10) {
        setError("Please enter your 10-digit mobile number in the input field above to verify.");
        return;
      }
      
      setVerificationStatus("INITIATING");
      setShowOtpModal(true);
      setOtpTtl(60);
      setOtpCode("");
      setFirstName("");
      setLastName("");
      try {
        await TruecallerFullstack.requestVerification(cleanPhone);
      } catch (err: any) {
        setError(err instanceof Error ? err.message : "Failed to initiate verification");
        setVerificationStatus("ERROR");
      }
    }
  }, [isTruecallerUsable, identifier, signInWithTruecaller]);

  // Non-Truecaller flow states
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string>("IDLE"); // IDLE, INITIATING, CALL_INITIATED, CALL_RECEIVED, OTP_INITIATED, OTP_RECEIVED, COMPLETE, ERROR
  const [otpTtl, setOtpTtl] = useState<number>(60);
  const [otpCode, setOtpCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const countdownTimer = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const successSub = TruecallerFullstack.addListener("onVerificationSuccess", async (event) => {
      console.log("Truecaller success event:", event);
      
      switch (event.status) {
        case "MISSED_CALL_INITIATED":
          setVerificationStatus("CALL_INITIATED");
          if (event.ttl) {
            setOtpTtl(parseInt(event.ttl, 10));
          }
          break;
        case "MISSED_CALL_RECEIVED":
          setVerificationStatus("CALL_RECEIVED");
          break;
        case "IM_OTP_INITIATED":
          setVerificationStatus("OTP_INITIATED");
          if (event.ttl) {
            setOtpTtl(parseInt(event.ttl, 10));
          }
          break;
        case "IM_OTP_RECEIVED":
          setVerificationStatus("OTP_RECEIVED");
          break;
        case "VERIFICATION_COMPLETE":
        case "PROFILE_VERIFIED_BEFORE":
          setVerificationStatus("COMPLETE");
          if (event.accessToken) {
            try {
              setIsVerifyingOtp(true);
              await signInWithTruecallerOtp(event.accessToken);
              setShowOtpModal(false);
            } catch (err: any) {
              setError(err instanceof Error ? err.message : "Backend validation failed");
              setVerificationStatus("ERROR");
            } finally {
              setIsVerifyingOtp(false);
            }
          }
          break;
      }
    });

    const failureSub = TruecallerFullstack.addListener("onVerificationFailure", (event) => {
      console.error("Truecaller failure event:", event);
      setError(event.errorMessage || `Verification failed (Code ${event.errorCode})`);
      setVerificationStatus("ERROR");
    });

    return () => {
      successSub.remove();
      failureSub.remove();
    };
  }, [signInWithTruecallerOtp]);

  useEffect(() => {
    if (showOtpModal && otpTtl > 0 && (verificationStatus === "CALL_INITIATED" || verificationStatus === "OTP_INITIATED")) {
      countdownTimer.current = setInterval(() => {
        setOtpTtl((prev) => {
          if (prev <= 1) {
            clearInterval(countdownTimer.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownTimer.current) {
        clearInterval(countdownTimer.current);
      }
    };
  }, [showOtpModal, verificationStatus, otpTtl]);

  const handleCompleteMissedCallVerification = useCallback(async () => {
    if (!firstName.trim()) {
      setError("First Name is required.");
      return;
    }
    setIsVerifyingOtp(true);
    setError(null);
    try {
      await TruecallerFullstack.verifyMissedCall(firstName.trim(), lastName.trim());
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setVerificationStatus("ERROR");
    } finally {
      setIsVerifyingOtp(false);
    }
  }, [firstName, lastName]);

  const handleCompleteOtpVerification = useCallback(async () => {
    if (!firstName.trim()) {
      setError("First Name is required.");
      return;
    }
    if (!otpCode.trim()) {
      setError("OTP Code is required.");
      return;
    }
    setIsVerifyingOtp(true);
    setError(null);
    try {
      await TruecallerFullstack.verifyOtp(firstName.trim(), lastName.trim(), otpCode.trim());
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "OTP verification failed");
      setVerificationStatus("ERROR");
    } finally {
      setIsVerifyingOtp(false);
    }
  }, [firstName, lastName, otpCode]);

  const handleBiometricLogin = useCallback(async () => {
    setError(null);
    setInfo(null);
    const hasSaved = await getToken(LAST_IDENTIFIER_KEY);
    if (!hasSaved) return;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock ShopControl",
      fallbackLabel: "Use PIN",
      biometricsSecurityLevel: "strong",
      disableDeviceFallback: true,
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
    } else {
      if (result.error !== "user_cancel" && result.error !== "system_cancel" && result.error !== "app_cancel") {
        setError("Biometric authentication failed.");
      } else {
        setInfo("Biometric unlock cancelled.");
      }
    }
  }, [signInWithSavedToken]);

  useEffect(() => {
    async function loadSavedLogin() {
      const savedIdentifier = await getToken(LAST_IDENTIFIER_KEY);
      const bioEnabledVal = await getToken("shopcontrol_biometric_enabled");
      const pinSetVal = await getToken("shopcontrol_pin_set");
      const savedName = await getToken("shopcontrol_last_user_name");
      const savedPhone = await getToken("shopcontrol_last_user_phone");
      
      const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const isEnrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
      const isBioAvailable = hasHardware && isEnrolled;
      
      setBiometricAvailable(isBioAvailable);
      const bioEnabled = bioEnabledVal === "true";
      setBiometricEnabled(bioEnabled);
      const isPinSet = pinSetVal === "true";
      setPinSet(isPinSet);
      if (savedName) setSavedUserName(savedName);
      if (savedPhone) setSavedUserPhone(savedPhone);

      if (savedIdentifier) {
        setIdentifier(savedIdentifier);
        setHasSavedLogin(true);
        
        const isBioActive = isBioAvailable && bioEnabled;
        if (isPinSet || isBioActive) {
          setMode("PIN");
          if (isBioActive && !biometricTriggered.current) {
            biometricTriggered.current = true;
            handleBiometricLogin();
          }
        } else {
          setMode("PASSWORD");
        }
      }
    }
    loadSavedLogin();
  }, [handleBiometricLogin]);

  // Lockout timer countdown effect
  useEffect(() => {
    if (lockoutTimeLeft <= 0) return;
    const timer = setInterval(() => {
      setLockoutTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutTimeLeft]);

  // Auto-submit PIN once it reaches 4 digits
  useEffect(() => {
    if (mode === "PIN" && pinDigits.length === 4) {
      if (isSubmitting) return;
      const submitPin = async () => {
        setIsSubmitting(true);
        setError(null);
        try {
          await signInWithSavedToken(pinDigits);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Invalid PIN");
          setPinDigits(""); // Clear PIN on failure
          setFailedAttempts(prev => {
            const next = prev + 1;
            if (next >= 3) {
              setError("Too many failed attempts. PIN login locked for 30 seconds.");
              setLockoutTimeLeft(30);
              setMode("PASSWORD");
              return 0;
            }
            return next;
          });
        } finally {
          setIsSubmitting(false);
        }
      };
      submitPin();
    }
  }, [pinDigits, mode, isSubmitting, signInWithSavedToken]);

  const handleSubmit = useCallback(async () => {
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
  }, [mode, identifier, password, signIn]);

  const handleKeyInput = useCallback((digit: string) => {
    if (isSubmitting) return;
    setError(null);
    triggerLightHaptic();
    setPinDigits(prev => {
      if (prev.length < 4) {
        return prev + digit;
      }
      return prev;
    });
  }, [isSubmitting]);

  const handleBackspace = useCallback(() => {
    if (isSubmitting) return;
    triggerLightHaptic();
    setPinDigits(prev => prev.slice(0, -1));
  }, [isSubmitting]);

  const handleSwitchToPin = useCallback(() => {
    if (lockoutTimeLeft > 0) {
      setError(`PIN login is locked. Please try again in ${lockoutTimeLeft} seconds.`);
      return;
    }
    setMode("PIN");
    setPassword("");
    setError(null);
  }, [lockoutTimeLeft]);

  const maskIdentifier = (id: string) => {
    if (!id) return "";
    const clean = id.trim();
    if (clean.includes("@")) {
      const parts = clean.split("@");
      const local = parts[0];
      const domain = parts[1];
      if (local.length > 2) {
        return `${local[0]}***${local[local.length - 1]}@${domain}`;
      }
      return `${local[0]}***@${domain}`;
    }
    if (clean.length >= 4) {
      const last4 = clean.slice(-4);
      return `+91 ******${last4}`;
    }
    return clean;
  };

  const isForgot = mode === "FORGOT";

  const renderKeypadButton = (digit: string) => {
    return (
      <Pressable 
        style={styles.keypadBtn} 
        onPress={() => handleKeyInput(digit)}
        accessibilityRole="button"
        accessibilityLabel={`Digit ${digit}`}
      >
        <Text style={styles.keypadBtnText}>{digit}</Text>
      </Pressable>
    );
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} bg={colors.bg}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
              {mode === "PIN" ? (
                <View style={{ alignItems: 'center', width: '100%', gap: 2 }}>
                  {savedUserName ? (
                    <>
                      <Text style={styles.welcomeText}>Welcome back,</Text>
                      <Text style={styles.userNameText}>{savedUserName}</Text>
                      {savedUserPhone ? (
                        <Text style={styles.userPhoneText}>{maskIdentifier(savedUserPhone)}</Text>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Text style={styles.cardTitle}>Quick Login</Text>
                      {savedUserPhone ? (
                        <Text style={styles.userPhoneText}>{maskIdentifier(savedUserPhone)}</Text>
                      ) : (
                        <Text style={styles.cardSubtitle}>Enter your 4-digit PIN to unlock.</Text>
                      )}
                    </>
                  )}
                </View>
              ) : (
                <>
                  <Text style={styles.cardTitle}>
                    {isForgot ? "Forgot PIN" : "Sign In"}
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    {isForgot ? "Reset is handled by admin." : "Enter your mobile/email and password."}
                  </Text>
                </>
              )}
            </View>

            {!isForgot ? (
              mode === "PIN" ? (
                <View style={styles.passcodeContainer}>
                  {/* Dots Indicator */}
                  <View style={styles.dotsRow}>
                    {[0, 1, 2, 3].map((i) => (
                      <PasscodeDot key={i} filled={pinDigits.length > i} />
                    ))}
                  </View>

                  {/* Grid */}
                  <View style={styles.passcodeKeypad}>
                    <View style={styles.keypadRow}>
                      {renderKeypadButton("1")}
                      {renderKeypadButton("2")}
                      {renderKeypadButton("3")}
                    </View>
                    <View style={styles.keypadRow}>
                      {renderKeypadButton("4")}
                      {renderKeypadButton("5")}
                      {renderKeypadButton("6")}
                    </View>
                    <View style={styles.keypadRow}>
                      {renderKeypadButton("7")}
                      {renderKeypadButton("8")}
                      {renderKeypadButton("9")}
                    </View>
                    <View style={styles.keypadRow}>
                      {biometricAvailable && biometricEnabled ? (
                        <Pressable 
                          style={[styles.keypadBtn, { backgroundColor: 'transparent', elevation: 0 }]} 
                          onPress={handleBiometricLogin}
                          accessibilityRole="button"
                          accessibilityLabel="Unlock with Biometrics"
                        >
                          <Icon source="fingerprint" size={28} color={colors.primary} />
                        </Pressable>
                      ) : (
                        <View style={styles.keypadBtnEmpty} />
                      )}
                      
                      <Pressable 
                        style={styles.keypadBtn} 
                        onPress={() => handleKeyInput("0")}
                        accessibilityRole="button"
                        accessibilityLabel="Digit 0"
                      >
                        <Text style={styles.keypadBtnText}>0</Text>
                      </Pressable>
                      
                      <Pressable 
                        style={[styles.keypadBtn, styles.keypadBackspace]} 
                        onPress={handleBackspace}
                        accessibilityRole="button"
                        accessibilityLabel="Backspace"
                      >
                        <Icon source="backspace-outline" size={24} color={colors.textPrimary} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.passcodeFooter}>
                    <Pressable 
                      onPress={() => { setMode("PASSWORD"); setPassword(""); setError(null); }}
                      style={({ pressed }) => [
                        styles.passcodeLinkBtn, 
                        pressed ? styles.pressed : undefined
                      ].filter(Boolean) as any}
                    >
                      <Text style={styles.passcodeLinkText}>Use Password</Text>
                    </Pressable>
                    <Pressable 
                      onPress={() => { setMode("FORGOT"); setError(null); setInfo(null); }}
                      style={({ pressed }) => [
                        styles.passcodeLinkBtn, 
                        pressed ? styles.pressed : undefined
                      ].filter(Boolean) as any}
                    >
                      <Text style={styles.passcodeLinkText}>Forgot PIN?</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.form}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>MOBILE / EMAIL</Text>
                    <FormTextField
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
                    <FormTextField
                      placeholder="Enter password"
                      value={password}
                      secureTextEntry={secureText}
                      onChangeText={setPassword}
                      left={<PaperInput.Icon icon="lock-outline" color={colors.textMuted} />}
                      right={<PaperInput.Icon
                        icon={secureText ? "eye-off-outline" : "eye-outline"}
                        color={colors.textMuted}
                        onPress={() => setSecureText(!secureText)}
                        accessibilityLabel={secureText ? "Show password" : "Hide password"}
                      />}
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
              <View style={{ gap: spacing.md, width: "100%" }}>
                <Button 
                  label={isForgot ? "BACK TO LOGIN" : "SIGN IN TO CONTROL"} 
                  onPress={isForgot ? () => setMode(hasSavedLogin ? "PIN" : "PASSWORD") : handleSubmit} 
                  loading={isSubmitting} 
                  size="lg"
                  fullWidth
                  style={styles.submitBtn}
                />
                {!isForgot && Platform.OS === "android" && (
                  <Button
                    label="SIGN IN WITH TRUECALLER"
                    onPress={handleTruecallerLogin}
                    loading={isTruecallerLoading || verificationStatus === "INITIATING"}
                    size="lg"
                    fullWidth
                    style={[styles.truecallerBtn, { backgroundColor: '#0087FF' }]}
                    icon="phone"
                  />
                )}
              </View>
            )}

            {!isForgot && mode !== "PIN" && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.extraActions}>
                  {hasSavedLogin && (pinSet || biometricEnabled) && (
                    <Button 
                      variant="ghost" 
                      label="Use quick PIN login" 
                      onPress={handleSwitchToPin}
                      fullWidth
                    />
                  )}
                </View>
              </>
            )}
          </View>

          <Modal
            visible={showOtpModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {
              if (!isVerifyingOtp) setShowOtpModal(false);
            }}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Truecaller Verification</Text>
                
                {verificationStatus === "INITIATING" && (
                  <View style={styles.modalBody}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.modalText}>Contacting Truecaller servers...</Text>
                  </View>
                )}

                {verificationStatus === "CALL_INITIATED" && (
                  <View style={styles.modalBody}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.modalText}>Triggering drop call verification...</Text>
                    <Text style={styles.timerText}>Time remaining: {otpTtl}s</Text>
                  </View>
                )}

                {verificationStatus === "OTP_INITIATED" && (
                  <View style={styles.modalBody}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.modalText}>Triggering SMS verification...</Text>
                    <Text style={styles.timerText}>Time remaining: {otpTtl}s</Text>
                  </View>
                )}

                {verificationStatus === "CALL_RECEIVED" && (
                  <View style={styles.modalBody}>
                    <Text style={styles.modalSubText}>Drop call received successfully! Please enter your name to complete registration:</Text>

                    <FormTextField
                      label="First Name"
                      placeholder="Enter first name"
                      value={firstName}
                      onChangeText={setFirstName}
                      outlineStyle={styles.inputOutline}
                      activeOutlineColor={colors.primary}
                      style={styles.modalInput}
                    />

                    <FormTextField
                      label="Last Name"
                      placeholder="Enter last name (optional)"
                      value={lastName}
                      onChangeText={setLastName}
                      outlineStyle={styles.inputOutline}
                      activeOutlineColor={colors.primary}
                      style={styles.modalInput}
                    />

                    <Button
                      label="COMPLETE VERIFICATION"
                      onPress={handleCompleteMissedCallVerification}
                      loading={isVerifyingOtp}
                      fullWidth
                      size="md"
                    />
                  </View>
                )}

                {(verificationStatus === "OTP_RECEIVED" || verificationStatus === "OTP_INITIATED") && (
                  <View style={styles.modalBody}>
                    <Text style={styles.modalSubText}>Please enter details to verify:</Text>

                    <FormTextField
                      label="First Name"
                      placeholder="Enter first name"
                      value={firstName}
                      onChangeText={setFirstName}
                      outlineStyle={styles.inputOutline}
                      activeOutlineColor={colors.primary}
                      style={styles.modalInput}
                    />

                    <FormTextField
                      label="Last Name"
                      placeholder="Enter last name (optional)"
                      value={lastName}
                      onChangeText={setLastName}
                      outlineStyle={styles.inputOutline}
                      activeOutlineColor={colors.primary}
                      style={styles.modalInput}
                    />

                    <FormTextField
                      label="OTP Code"
                      placeholder="Enter SMS OTP"
                      value={otpCode}
                      keyboardType="number-pad"
                      onChangeText={setOtpCode}
                      outlineStyle={styles.inputOutline}
                      activeOutlineColor={colors.primary}
                      style={styles.modalInput}
                    />

                    <Button
                      label="VERIFY OTP"
                      onPress={handleCompleteOtpVerification}
                      loading={isVerifyingOtp}
                      fullWidth
                      size="md"
                    />
                  </View>
                )}

                {verificationStatus === "COMPLETE" && (
                  <View style={styles.modalBody}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.modalText}>Verification complete! Logging in...</Text>
                  </View>
                )}

                {verificationStatus === "ERROR" && (
                  <View style={styles.modalBody}>
                    <Icon source="alert-circle" size={40} color={colors.danger} />
                    <Text style={[styles.modalText, { color: colors.danger }]}>{error || "Verification failed."}</Text>
                    
                    <Button
                      label="CLOSE"
                      onPress={() => setShowOtpModal(false)}
                      fullWidth
                      size="md"
                      variant="ghost"
                    />
                  </View>
                )}

                {verificationStatus !== "COMPLETE" && verificationStatus !== "INITIATING" && (
                  <Pressable
                    onPress={() => setShowOtpModal(false)}
                    style={styles.modalCloseBtn}
                  >
                    <Text style={styles.modalCloseText}>Cancel</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function PasscodeDot({ filled }: { filled: boolean }) {
  const scaleAnim = useRef(new Animated.Value(filled ? 1.25 : 1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: filled ? 1.25 : 1,
      useNativeDriver: true,
      friction: 4,
      tension: 40,
    }).start();
  }, [filled]);

  return (
    <Animated.View 
      style={[
        styles.dot, 
        filled ? styles.dotFilled : undefined,
        { transform: [{ scale: scaleAnim }] }
      ].filter(Boolean) as any} 
    />
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
  welcomeText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    textAlign: "center",
  },
  userNameText: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    textAlign: "center",
    marginTop: 2,
  },
  userPhoneText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
    textAlign: "center",
    marginTop: 4,
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
  truecallerBtn: {
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
  otpBtn: {
    minHeight: 56,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: "center",
  },
  modalBody: {
    alignItems: "center",
    gap: spacing.md,
    width: "100%",
  },
  modalText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  modalSubText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  timerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.warning,
  },
  modalInput: {
    width: "100%",
    backgroundColor: colors.surface,
  },
  modalCloseBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  modalCloseText: {
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.sm,
  },
});
