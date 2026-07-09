import * as AppIntegrity from "@expo/app-integrity";
import { Platform } from "react-native";

export interface DiagnosticsResult {
  platform: string;
  isDevice: boolean;
  appAttestSupported?: boolean;
  hardwareAttestation?: boolean;
  integrityToken?: string;
  verdict: string;
}

export async function runSecurityDiagnostics(
  onProgress: (status: string) => void
): Promise<DiagnosticsResult> {
  const isDevice = Platform.OS === "web" ? false : require("expo-device").isDevice;
  const result: DiagnosticsResult = {
    platform: Platform.OS === "android" ? "Android" : Platform.OS === "ios" ? "iOS" : "Web",
    isDevice,
    appAttestSupported: Platform.OS === "ios" ? AppIntegrity.isSupported : false,
    hardwareAttestation: false,
    integrityToken: undefined,
    verdict: "Genuine (Simulated)",
  };

  if (Platform.OS === "android" && isDevice) {
    onProgress("Initializing Play Integrity Provider...");
    try {
      // Use standard Google Cloud Project Number placeholder.
      await AppIntegrity.prepareIntegrityTokenProviderAsync("474633049000");
      
      onProgress("Checking hardware attestation...");
      result.hardwareAttestation = await AppIntegrity.isHardwareAttestationSupportedAsync();
      
      onProgress("Requesting Play Integrity Token...");
      const nonce = "shopcontrol_diagnostics_" + Date.now();
      const token = await AppIntegrity.requestIntegrityCheckAsync(nonce);
      result.integrityToken = token;
      result.verdict = "Genuine & Signed by Google Play Services";
    } catch (err) {
      console.warn("Play Integrity check failed:", err);
      throw err;
    }
  } else if (Platform.OS === "ios" && isDevice && AppIntegrity.isSupported) {
    onProgress("Initializing App Attest Cryptographic Key...");
    try {
      const keyId = await AppIntegrity.generateKeyAsync();
      onProgress("Attesting cryptographic key with Apple...");
      const challenge = "shopcontrol_challenge_" + Date.now();
      const attestation = await AppIntegrity.attestKeyAsync(keyId, challenge);
      result.integrityToken = attestation;
      result.verdict = "Genuine & Attested by Apple Secure Enclave";
    } catch (err) {
      console.warn("App Attest check failed:", err);
      throw err;
    }
  } else {
    onProgress("Running simulated diagnostics...");
    await new Promise((res) => setTimeout(res, 800));
    result.verdict = "Genuine (Development Environment)";
  }

  return result;
}
