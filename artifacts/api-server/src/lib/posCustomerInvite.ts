export const POS_CONTACT_LIMITS = {
  firstName: 100,
  lastName: 100,
  email: 254,
} as const;

export type PosInviteContact =
  | { valid: true; firstName: string; lastName: string; email: string; contactName: string; inviteConsent: boolean }
  | { valid: false; error: string };

/** A single successful insert for a client idempotency key is the invite boundary. */
export function shouldSendPosSignupInvite(input: {
  orderWasCreated: boolean;
  idempotencyKey?: unknown;
  inviteConsent: boolean;
  email: string;
  hasExistingCustomerAccount: boolean;
}): boolean {
  return input.orderWasCreated
    && input.inviteConsent
    && !!input.email
    && typeof input.idempotencyKey === 'string'
    && input.idempotencyKey.trim().length > 0
    && !input.hasExistingCustomerAccount;
}

function normalizeText(value: unknown, limit: number): string | null {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length <= limit ? normalized : null;
}

/**
 * Normalizes the optional walk-in contact details collected by POS.
 * An email is only required/validated when a customer supplies one; an invite
 * can only be requested with explicit boolean consent.
 */
export function normalizePosInviteContact(input: {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  inviteConsent?: unknown;
}): PosInviteContact {
  const firstName = normalizeText(input.firstName, POS_CONTACT_LIMITS.firstName);
  const lastName = normalizeText(input.lastName, POS_CONTACT_LIMITS.lastName);
  const rawEmail = normalizeText(input.email, POS_CONTACT_LIMITS.email);

  if (firstName === null || lastName === null || rawEmail === null) {
    return { valid: false, error: 'Customer contact details exceed the maximum length.' };
  }

  const email = rawEmail.toLowerCase();
  // This deliberately conservative check prevents malformed values from being
  // persisted or handed to the email provider; account signup performs any
  // more specialised address handling.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: 'A valid customer email address is required.' };
  }
  if (input.inviteConsent !== undefined && typeof input.inviteConsent !== 'boolean') {
    return { valid: false, error: 'Invite consent must be explicitly accepted or declined.' };
  }
  if ((firstName || lastName || email) && (!firstName || !lastName)) {
    return { valid: false, error: 'Enter both customer first and last name, or clear the customer details.' };
  }
  if (input.inviteConsent === true && !email) {
    return { valid: false, error: 'An email address is required before sending a signup invitation.' };
  }

  return {
    valid: true,
    firstName,
    lastName,
    email,
    contactName: [firstName, lastName].filter(Boolean).join(' '),
    inviteConsent: input.inviteConsent === true,
  };
}