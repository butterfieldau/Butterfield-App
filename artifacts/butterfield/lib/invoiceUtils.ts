/**
 * Single source of truth for whether a wholesale order/invoice can accept payment.
 * Must stay in sync with backend eligibility rules in wholesale.ts.
 */
export function isInvoicePayable(order: any): boolean {
  if (!order) return false;

  // Already paid by any mechanism
  if (order.isPaid) return false;
  if (String(order.stripePaymentStatus ?? '').toLowerCase() === 'paid') return false;
  if (String(order.invoiceStatus ?? '').toLowerCase() === 'paid') return false;

  // Terminal non-payable order states
  if (order.status === 'cancelled') return false;

  // Terminal non-payable invoice states
  const invStatus = String(order.invoiceStatus ?? '').toLowerCase();
  if (invStatus === 'voided' || invStatus === 'failed') return false;

  // Refunded orders cannot be re-paid
  if ((order.refundedCents ?? 0) > 0) return false;

  return true;
}
