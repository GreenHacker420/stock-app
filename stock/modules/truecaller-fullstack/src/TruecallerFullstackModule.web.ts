import { registerWebModule, NativeModule } from 'expo';

class TruecallerFullstackModule extends NativeModule<any> {
  isUsable(): boolean {
    return false;
  }
  async requestVerification(phoneNumber: string): Promise<void> {
    throw new Error('Truecaller is not supported on Web');
  }
  async verifyMissedCall(firstName: string, lastName: string): Promise<void> {
    throw new Error('Truecaller is not supported on Web');
  }
  async verifyOtp(firstName: string, lastName: string, otp: string): Promise<void> {
    throw new Error('Truecaller is not supported on Web');
  }
}

export default registerWebModule(TruecallerFullstackModule, 'TruecallerFullstack');
