import { describe, expect, it } from 'vitest';
import {
  blankTicket,
  buildPosOrderPayload,
  normalizeHeldTicket,
  ticketCustomerName,
  validateTicketCustomerDetails,
} from '@/components/pos/types';

describe('POS walk-in customer details', () => {
  it('requires a complete name only after staff starts entering details', () => {
    expect(validateTicketCustomerDetails()).toBeNull();
    expect(validateTicketCustomerDetails({ firstName: 'Ada' })).toContain('first and last');
    expect(validateTicketCustomerDetails({ firstName: 'Ada', lastName: 'Lovelace', email: 'invalid' })).toContain('valid');
    expect(validateTicketCustomerDetails({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', inviteConsent: true })).toBeNull();
  });

  it('sends structured details and preserves their name for receipts', () => {
    const ticket = {
      ...blankTicket(),
      customerDetails: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', inviteConsent: true },
    };
    const payload = buildPosOrderPayload(ticket, 'order-key', { paymentMethod: 'cash' });

    expect(ticketCustomerName(ticket)).toBe('Ada Lovelace');
    expect(payload.customerDetails).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      inviteConsent: true,
    });
  });

  it('uses the manually entered full name ahead of an attached loyalty name', () => {
    const ticket = {
      ...blankTicket(),
      customer: { userId: 'customer-1', name: 'Loyalty Name', loyaltyPoints: 0, stampCount: 0, loyaltyTier: 'standard', freeCoffeeRewards: 0, availableClaimedRewards: [] },
      customerDetails: { firstName: 'Receipt', lastName: 'Name', email: '', inviteConsent: false },
    };

    expect(ticketCustomerName(ticket)).toBe('Receipt Name');
  });

  it('opens legacy held tickets without requiring customer-details fields', () => {
    const legacy = normalizeHeldTicket({
      id: 'held-1',
      idempotencyKey: 'held-key',
      items: [],
      customer: null,
      orderType: 'counter',
      notes: 'Old ticket',
      appliedDiscount: null,
    });

    expect(legacy.customerDetails).toBeUndefined();
    expect(legacy.notes).toBe('Old ticket');
    expect(ticketCustomerName(legacy)).toBe('Walk-in');
  });
});