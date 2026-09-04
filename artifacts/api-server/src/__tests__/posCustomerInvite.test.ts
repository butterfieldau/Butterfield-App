import { describe, expect, it } from 'vitest';
import { buildPosAppSignupInviteEmail, BUTTERFIELD_APP_STORE_URL } from '../lib/emailService.js';
import { buildReceiptBytes } from '../lib/printer.js';
import { normalizePosInviteContact, shouldSendPosSignupInvite } from '../lib/posCustomerInvite.js';

describe('POS walk-in signup contact', () => {
  it('normalizes bounded names and email with explicit consent', () => {
    expect(normalizePosInviteContact({
      firstName: '  Ada  ', lastName: '  Lovelace ', email: ' ADA@EXAMPLE.COM ', inviteConsent: true,
    })).toMatchObject({ valid: true, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', contactName: 'Ada Lovelace', inviteConsent: true });
  });

  it('rejects malformed email and non-boolean consent', () => {
    expect(normalizePosInviteContact({ email: 'not-an-email' })).toMatchObject({ valid: false });
    expect(normalizePosInviteContact({ inviteConsent: 'yes' })).toMatchObject({ valid: false });
  });

  it('does not infer consent and enforces contact limits', () => {
    expect(normalizePosInviteContact({ firstName: 'Guest', lastName: 'Customer', email: 'guest@example.com' })).toMatchObject({ valid: true, inviteConsent: false });
    expect(normalizePosInviteContact({ firstName: 'x'.repeat(101) })).toMatchObject({ valid: false });
    expect(normalizePosInviteContact({ firstName: 'Guest' })).toMatchObject({ valid: false });
    expect(normalizePosInviteContact({ firstName: 'Guest', lastName: 'Customer', inviteConsent: true })).toMatchObject({ valid: false });
  });

  it('renders a branded invite with the canonical App Store CTA and escapes names', () => {
    const html = buildPosAppSignupInviteEmail({ firstName: '<Ada>' });
    expect(html).toContain(BUTTERFIELD_APP_STORE_URL);
    expect(html).toContain('Download on the App Store');
    expect(html).toContain('&lt;Ada&gt;');
  });

  it('only permits one invite decision for a newly-created, idempotent order', () => {
    const eligible = {
      orderWasCreated: true, idempotencyKey: 'ticket-123', inviteConsent: true,
      email: 'guest@example.com', hasExistingCustomerAccount: false,
    };
    expect(shouldSendPosSignupInvite(eligible)).toBe(true);
    // Duplicate retries return the already-created order and never requeue mail.
    expect(shouldSendPosSignupInvite({ ...eligible, orderWasCreated: false })).toBe(false);
    expect(shouldSendPosSignupInvite({ ...eligible, idempotencyKey: '' })).toBe(false);
    expect(shouldSendPosSignupInvite({ ...eligible, hasExistingCustomerAccount: true })).toBe(false);
  });

  it('keeps customer email out of the normal printed receipt', () => {
    const receipt = buildReceiptBytes({
      orderId: 'order-1', customerName: 'Ada Lovelace', customerEmail: 'ada@example.com',
      type: 'pickup', items: [{ name: 'Cookie', quantity: 1, unitPriceCents: 500 }], totalCents: 500,
    }).toString('utf8');
    expect(receipt).toContain('Customer: Ada Lovelace');
    expect(receipt).not.toContain('ada@example.com');
  });
});