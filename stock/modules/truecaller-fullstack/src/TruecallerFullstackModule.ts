import { NativeModule, requireNativeModule } from 'expo';

export interface TruecallerFullstackModuleEvents {
  onVerificationSuccess: (event: {
    callbackType: number;
    status: string;
    ttl?: string;
    requestNonce?: string;
    accessToken?: string;
  }) => void;
  onVerificationFailure: (event: {
    requestCode: number;
    errorCode: number;
    errorMessage: string;
  }) => void;
  [key: string]: any;
}

declare class TruecallerFullstackModule extends NativeModule<TruecallerFullstackModuleEvents> {
  isUsable(): boolean;
  requestVerification(phoneNumber: string): Promise<void>;
  verifyMissedCall(firstName: string, lastName: string): Promise<void>;
  verifyOtp(firstName: string, lastName: string, otp: string): Promise<void>;
}

let moduleInstance: any = null;
try {
  moduleInstance = requireNativeModule<any>('TruecallerFullstack');
} catch (e) {
  console.warn("TruecallerFullstack native module not found. Falling back to dummy module.");
  moduleInstance = {
    isUsable() {
      return false;
    },
    async requestVerification(phoneNumber: string) {
      throw new Error("TruecallerFullstack native module is not available in this build.");
    },
    async verifyMissedCall(firstName: string, lastName: string) {
      throw new Error("TruecallerFullstack native module is not available in this build.");
    },
    async verifyOtp(firstName: string, lastName: string, otp: string) {
      throw new Error("TruecallerFullstack native module is not available in this build.");
    },
    addListener() {
      return { remove: () => {} };
    },
    removeAllListeners() {}
  };
}

export default moduleInstance as TruecallerFullstackModule;
