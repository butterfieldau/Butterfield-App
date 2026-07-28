/**
 * invoiceEmailSender.ts
 *
 * Assembles the payment-received email (HTML + optional PDF attachment) and
 * delegates to sendEmail.  Extracted from the mark-paid route handler so the
 * logic can be exercised in unit tests without mounting the full Express router.
 */

import { sendEmail, buildWholesalePaymentReceivedEmail } from './emailService.js';
import { generateInvoicePdf, type InvoicePdfData } from './invoicePdf.js';

export interface PaymentReceivedEmailOpts {
  recipientEmail: string;
  invoiceNumber: string;
  companyName: string;
  totalAUD: string;
  paidAt: string;
  paymentReference: string | null;
  invoiceUrl: string | null;
  /** When provided the PDF is generated and attached; pass null to skip. */
  pdfData: InvoicePdfData | null;
}

/**
 * Builds and sends the wholesale "payment received" email.
 *
 * PDF generation is attempted when `opts.pdfData` is not null.
 * A failure there is non-fatal: the email is still sent as HTML-only and
 * the error is logged via the supplied logger.
 *
 * @param opts   Email content and PDF source data.
 * @param logger Optional logger with an `error` method; defaults to console.
 */
export async function sendPaymentReceivedEmail(
  opts: PaymentReceivedEmailOpts,
  logger: { error: (err: unknown, msg: string) => void } = console,
): Promise<void> {
  const {
    recipientEmail, invoiceNumber, companyName, totalAUD,
    paidAt, paymentReference, invoiceUrl, pdfData,
  } = opts;

  const html = buildWholesalePaymentReceivedEmail({
    companyName,
    invoiceNumber,
    totalAUD,
    paidAt,
    paymentReference,
    invoiceUrl,
  });

  let pdfBuffer: Buffer | undefined;
  if (pdfData) {
    try {
      pdfBuffer = await generateInvoicePdf(pdfData);
    } catch (err) {
      logger.error(err, `[invoiceEmailSender] PDF generation failed for ${invoiceNumber} — sending HTML-only email`);
    }
  }

  await sendEmail({
    to: recipientEmail,
    subject: `Payment Received – ${invoiceNumber}`,
    html,
    ...(pdfBuffer
      ? { attachments: [{ filename: `${invoiceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }] }
      : {}),
  });
}
