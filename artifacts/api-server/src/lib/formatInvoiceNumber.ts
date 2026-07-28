/**
 * Returns the display-safe invoice number for a wholesale order.
 *
 * Priority:
 *   1. order.invoiceNumber  — stored as-is from Stripe (e.g. "INV-0045"); returned verbatim.
 *   2. order.poReference    — customer's own PO number used as a fallback label.
 *   3. INV-<first-8-of-UUID> — synthetic fallback when neither field is set.
 *
 * Never prepend "INV-" again — invoiceNumber already contains the full string from Stripe.
 */
export function formatInvoiceNumber(order: {
  invoiceNumber?: string | null;
  poReference?: string | null;
  id: string;
}): string {
  if (order.invoiceNumber) return order.invoiceNumber;
  if (order.poReference) return order.poReference;
  return `INV-${order.id.slice(0, 8).toUpperCase()}`;
}
