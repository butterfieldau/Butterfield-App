/**
 * mark-paid PDF attachment — unit tests
 *
 * Covers the sendPaymentReceivedEmail helper that is called by the
 * PATCH /director/wholesale/invoices/:orderId/mark-paid endpoint.
 *
 * Test matrix:
 *  1. Happy path — PDF generation succeeds → sendEmail receives a
 *     `attachments` array with a single entry whose filename matches
 *     the invoice number (`INV-XXXXXX.pdf`).
 *  2. PDF failure path — generateInvoicePdf throws → sendEmail is still
 *     called (HTML-only, no attachments), and the supplied logger records
 *     the error.
 *  3. Attachment filename matches the invoice number exactly.
 *  4. Content-type of the attachment is application/pdf.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted spy references ────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  buildWholesalePaymentReceivedEmail: vi.fn().mockReturnValue('<html>receipt</html>'),
  generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from('PDF-BYTES')),
}));

// Dynamic imports inside the module-under-test resolve through these mocks.
vi.mock('../lib/emailService.js', () => ({
  sendEmail: mocks.sendEmail,
  buildWholesalePaymentReceivedEmail: mocks.buildWholesalePaymentReceivedEmail,
}));

vi.mock('../lib/invoicePdf.js', () => ({
  generateInvoicePdf: mocks.generateInvoicePdf,
}));

// ── Import the unit under test AFTER the mock registrations ──────────────────
import { sendPaymentReceivedEmail, type PaymentReceivedEmailOpts } from '../lib/invoiceEmailSender.js';

// ── Shared fixture ────────────────────────────────────────────────────────────

const INVOICE_NUMBER = 'INV-ABC123';

function makeOpts(overrides: Partial<PaymentReceivedEmailOpts> = {}): PaymentReceivedEmailOpts {
  return {
    recipientEmail:   'buyer@example.com',
    invoiceNumber:    INVOICE_NUMBER,
    companyName:      'Acme Wholesale',
    totalAUD:         '$1,200.00',
    paidAt:           '01 Jan 2025',
    paymentReference: 'BANK-REF-001',
    invoiceUrl:       'https://example.com/invoices/abc',
    pdfData: {
      invoiceNumber:  INVOICE_NUMBER,
      invoiceDate:    new Date('2025-01-01'),
      dueDate:        new Date('2025-01-31'),
      status:         'paid',
      companyName:    'Acme Wholesale',
      abn:            '12 345 678 901',
      email:          'buyer@example.com',
      address:        '1 Baker St, Sydney NSW 2000',
      accountRef:     'ACME0001',
      items: [{ description: 'Chocolate Chip Cookies x12', qty: 10, unitCents: 500 }],
      totalCents:     5000,
      deliveryFeeCents: 0,
      poReference:    null,
      notes:          null,
      paymentTerms:   'Net 30 days',
      invoiceUrl:     'https://example.com/invoices/abc',
    },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sendPaymentReceivedEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendEmail.mockResolvedValue({ success: true });
    mocks.buildWholesalePaymentReceivedEmail.mockReturnValue('<html>receipt</html>');
    mocks.generateInvoicePdf.mockResolvedValue(Buffer.from('PDF-BYTES'));
  });

  // ── 1. Happy path: PDF succeeds → attachment included ──────────────────────

  it('sends the email with a PDF attachment when PDF generation succeeds', async () => {
    await sendPaymentReceivedEmail(makeOpts());

    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    const callArg = mocks.sendEmail.mock.calls[0][0] as Record<string, unknown>;

    expect(callArg.to).toBe('buyer@example.com');
    expect(Array.isArray(callArg.attachments)).toBe(true);
    const attachments = callArg.attachments as Array<Record<string, unknown>>;
    expect(attachments).toHaveLength(1);
  });

  // ── 2. Attachment filename matches invoice number ──────────────────────────

  it('names the attachment <invoiceNumber>.pdf', async () => {
    await sendPaymentReceivedEmail(makeOpts());

    const callArg = mocks.sendEmail.mock.calls[0][0] as Record<string, unknown>;
    const attachments = callArg.attachments as Array<Record<string, unknown>>;

    expect(attachments[0].filename).toBe(`${INVOICE_NUMBER}.pdf`);
  });

  // ── 3. Attachment content-type is application/pdf ─────────────────────────

  it('sets content-type to application/pdf on the attachment', async () => {
    await sendPaymentReceivedEmail(makeOpts());

    const callArg = mocks.sendEmail.mock.calls[0][0] as Record<string, unknown>;
    const attachments = callArg.attachments as Array<Record<string, unknown>>;

    expect(attachments[0].contentType).toBe('application/pdf');
  });

  // ── 4. PDF failure: email still sends (HTML-only), error is logged ─────────

  it('sends HTML-only email and logs the error when PDF generation throws', async () => {
    const pdfError = new Error('pdfkit internal failure');
    mocks.generateInvoicePdf.mockRejectedValueOnce(pdfError);

    const logger = { error: vi.fn() };
    await sendPaymentReceivedEmail(makeOpts(), logger);

    // Email must still be sent
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    const callArg = mocks.sendEmail.mock.calls[0][0] as Record<string, unknown>;

    // No attachment when PDF failed
    expect(callArg.attachments).toBeUndefined();

    // HTML body is still present
    expect(typeof callArg.html).toBe('string');
    expect((callArg.html as string).length).toBeGreaterThan(0);

    // Error must be logged
    expect(logger.error).toHaveBeenCalledOnce();
    const [loggedErr, loggedMsg] = logger.error.mock.calls[0] as [unknown, string];
    expect(loggedErr).toBe(pdfError);
    expect(loggedMsg).toMatch(/PDF generation failed/i);
  });

  // ── 5. pdfData: null skips PDF generation entirely ────────────────────────

  it('sends HTML-only email without attempting PDF generation when pdfData is null', async () => {
    await sendPaymentReceivedEmail(makeOpts({ pdfData: null }));

    expect(mocks.generateInvoicePdf).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledOnce();

    const callArg = mocks.sendEmail.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.attachments).toBeUndefined();
  });

  // ── 6. Subject line contains the invoice number ───────────────────────────

  it('uses the invoice number in the email subject', async () => {
    await sendPaymentReceivedEmail(makeOpts());

    const callArg = mocks.sendEmail.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.subject).toContain(INVOICE_NUMBER);
  });
});
