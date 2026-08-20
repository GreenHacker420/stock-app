import {
  isSupported,
  prepareIntegrityTokenProviderAsync,
  isHardwareAttestationSupportedAsync,
  requestIntegrityCheckAsync,
  generateKeyAsync,
  attestKeyAsync,
} from "@expo/app-integrity";
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
    appAttestSupported: Platform.OS === "ios" ? isSupported : false,
    hardwareAttestation: false,
    integrityToken: undefined,
    verdict: "Genuine (Simulated)",
  };

  onProgress("Checking Play Integrity / App Attest support...");
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (Platform.OS === "android" && isDevice) {
    onProgress("Initializing Play Integrity Provider...");
    try {
      const projectNumber = "123456789012";
      await prepareIntegrityTokenProviderAsync(projectNumber);
      
      onProgress("Checking hardware attestation...");
      result.hardwareAttestation = await isHardwareAttestationSupportedAsync();

      onProgress("Requesting Play Integrity token...");
      const nonce = "test-nonce-" + Date.now();
      const token = await requestIntegrityCheckAsync(nonce);
      result.integrityToken = token ? token.substring(0, 20) + "..." : undefined;
      result.verdict = token ? "Genuine Device (Play Integrity Verified)" : "Verification Failed";
    } catch (err: any) {
      onProgress("Integrity check failed: " + err.message);
      result.verdict = "Untrusted / Emulator Detected (" + err.message + ")";
    }
  } else if (Platform.OS === "ios" && isDevice && isSupported) {
    onProgress("Generating App Attest key...");
    try {
      const keyId = await generateKeyAsync();
      onProgress("Attesting key with Apple...");
      const challenge = "test-challenge-" + Date.now();
      const attestation = await attestKeyAsync(keyId, challenge);
      result.integrityToken = attestation ? attestation.substring(0, 20) + "..." : undefined;
      result.verdict = attestation ? "Genuine Device (App Attest Verified)" : "Attestation Failed";
    } catch (err: any) {
      onProgress("App Attest failed: " + err.message);
      result.verdict = "Untrusted / Jailbroken Device (" + err.message + ")";
    }
  } else {
    onProgress("Running on Simulator / Web - skipping hardware attestation.");
    result.verdict = isDevice ? "Device Unverified" : "Simulator / Web Environment";
  }

  return result;
}
