import { describe, expect, it, vi } from 'vitest';

import {
  attemptBiometricAuthentication,
  hasUsableBiometrics,
  type BiometricAuthenticator,
} from '../biometricAuth';

function authenticator(overrides: Partial<BiometricAuthenticator> = {}): BiometricAuthenticator {
  return {
    hasHardwareAsync: vi.fn().mockResolvedValue(true),
    isEnrolledAsync: vi.fn().mockResolvedValue(true),
    authenticateAsync: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe('hasUsableBiometrics', () => {
  it('accepts enrolled iOS biometric hardware', async () => {
    await expect(hasUsableBiometrics('ios', authenticator())).resolves.toBe(true);
  });

  it('stays unavailable on web, absent hardware, or unenrolled devices', async () => {
    await expect(hasUsableBiometrics('web', authenticator())).resolves.toBe(false);
    await expect(hasUsableBiometrics('ios', authenticator({
      hasHardwareAsync: vi.fn().mockResolvedValue(false),
    }))).resolves.toBe(false);
    await expect(hasUsableBiometrics('ios', authenticator({
      isEnrolledAsync: vi.fn().mockResolvedValue(false),
    }))).resolves.toBe(false);
  });
});

describe('attemptBiometricAuthentication', () => {
  it('reports a successful native biometric check', async () => {
    await expect(attemptBiometricAuthentication(authenticator(), 'Sign in')).resolves.toBe('success');
  });

  it('keeps cancellation on the normal-login fallback path', async () => {
    await expect(attemptBiometricAuthentication(authenticator({
      authenticateAsync: vi.fn().mockResolvedValue({ success: false, error: 'user_cancel' }),
    }), 'Sign in')).resolves.toBe('cancelled');
  });

  it('reports failed and unavailable checks without throwing', async () => {
    await expect(attemptBiometricAuthentication(authenticator({
      authenticateAsync: vi.fn().mockResolvedValue({ success: false, error: 'lockout' }),
    }), 'Sign in')).resolves.toBe('failed');
    await expect(attemptBiometricAuthentication(null, 'Sign in')).resolves.toBe('unavailable');
  });
});