export interface BiometricAuthenticator {
  hasHardwareAsync(): Promise<boolean>;
  isEnrolledAsync(): Promise<boolean>;
  authenticateAsync(options: {
    promptMessage: string;
    cancelLabel?: string;
    fallbackLabel?: string;
    disableDeviceFallback?: boolean;
  }): Promise<{ success: boolean; error?: string }>;
}

export type BiometricAttempt = 'success' | 'cancelled' | 'failed' | 'unavailable';

const CANCELLATION_ERRORS = new Set([
  'app_cancel',
  'system_cancel',
  'user_cancel',
  'user_fallback',
]);

export async function hasUsableBiometrics(
  platform: string,
  authenticator: BiometricAuthenticator | null,
): Promise<boolean> {
  if (platform !== 'ios' || !authenticator) return false;
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      authenticator.hasHardwareAsync(),
      authenticator.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

export async function attemptBiometricAuthentication(
  authenticator: BiometricAuthenticator | null,
  promptMessage: string,
): Promise<BiometricAttempt> {
  if (!authenticator) return 'unavailable';
  try {
    const result = await authenticator.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use password',
      disableDeviceFallback: true,
    });
    if (result.success) return 'success';
    return result.error && !CANCELLATION_ERRORS.has(result.error) ? 'failed' : 'cancelled';
  } catch {
    return 'failed';
  }
}