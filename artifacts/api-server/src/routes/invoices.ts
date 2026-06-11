import { Router } from 'express';
import {
  db, wholesaleOrdersTable, wholesaleAccountsTable, usersTable,
} from '@workspace/db';
import { eq } from 'drizzle-orm';
import { buildInvoiceHtml } from '../lib/invoiceTemplate.js';
import { ensureWholesalePaymentSchemaReady } from '../lib/ensureWholesalePaymentSchemaReady.js';

const router = Router();

const UNPAYABLE_STATUSES = new Set(['paid', 'void', 'voided', 'cancelled', 'refunded']);

function getBaseUrl(req: { protocol: string; headers: { host?: string; 'x-forwarded-proto'?: string } }): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ?? req.protocol ?? 'https';
  const host = req.headers.host ?? 'localhost';
  return `${proto}://${host}`;
}

function isOrderPayable(order: { isPaid: boolean; invoiceStatus: string | null; status: string; totalCents: number }): boolean {
  if (order.isPaid) return false;
  if (order.totalCents < 50) return false;
  const effectiveStatus = (order.invoiceStatus ?? order.status ?? '').toLowerCase();
  return !UNPAYABLE_STATUSES.has(effectiveStatus);
}

async function fetchInvoiceData(orderId: string) {
  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, orderId));
  if (!order) return null;

  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.id, order.accountId));
  const [user] = account
    ? await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, account.userId))
    : [null];

  return { order, account, user };
}

// Public HTML invoice endpoint — authenticated by unguessable UUID (same pattern as Stripe hosted invoices)
// GET /api/invoices/w/:orderId
router.get('/w/:orderId', async (req, res) => {
  try {
    await ensureWholesalePaymentSchemaReady();

    const { orderId } = req.params;
    const result = await fetchInvoiceData(orderId);
    if (!result) return res.status(404).send('<h2>Invoice not found</h2>');

    const { order, account, user } = result;

    const items = Array.isArray(order.items)
      ? (order.items as any[]).map((i: any) => ({
          description: i.productName ?? i.name ?? i.description ?? 'Item',
          qty:         Number(i.quantity ?? i.qty ?? 1),
          unitCents:   Number(i.unitPriceCents ?? i.unitPrice ?? i.unit_price ?? i.unitCents ?? 0),
        }))
      : [];

    const paymentTermsMap: Record<string, string> = {
      pay_on_order: 'Pay on order',
      net_7:        '7 days from invoice date',
      net_14:       '14 days from invoice date',
      net_30:       '30 days from invoice date',
      net_60:       '60 days from invoice date',
    };
    const rawTerms = (account as any)?.paymentTerms ?? '';
    const paymentTerms = paymentTermsMap[rawTerms] ?? (rawTerms || '30 days from invoice date');

    const invoiceNumber = order.invoiceNumber
      ? `INV-${order.invoiceNumber}`
      : `INV-${order.id.slice(0, 8).toUpperCase()}`;

    const effectiveStatus = order.invoiceStatus ?? order.status;
    const payable = isOrderPayable(order);
    const payUrl = payable
      ? `${getBaseUrl(req)}/api/invoices/w/${orderId}/checkout`
      : null;

    const html = buildInvoiceHtml({
      invoiceNumber,
      invoiceDate:  order.createdAt,
      dueDate:      order.invoiceDueDate ?? order.createdAt,
      status:       effectiveStatus,
      companyName:  account?.companyName ?? user?.name ?? 'Customer',
      abn:          account?.abn ?? null,
      email:        user?.email ?? null,
      address:      (account as any)?.deliveryAddress ?? null,
      accountRef:   account?.id?.slice(0, 8).toUpperCase() ?? null,
      items,
      totalCents:   order.totalCents ?? 0,
      poReference:  order.poReference ?? null,
      notes:        order.notes ?? null,
      paymentTerms,
      payUrl,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(html);
  } catch (err) {
    req.log?.error({ err }, 'Failed to render invoice');
    return res.status(500).send('<h2>Error generating invoice</h2>');
  }
});

// GET /api/invoices/w/:orderId/checkout
// Creates a Stripe Checkout Session for the invoice and redirects the customer to it.
// Authenticated only by the unguessable UUID orderId (same trust model as the invoice view).
router.get('/w/:orderId/checkout', async (req, res) => {
  try {
    await ensureWholesalePaymentSchemaReady();

    const { orderId } = req.params;
    const result = await fetchInvoiceData(orderId);
    if (!result) return res.status(404).send('<h2>Invoice not found</h2>');

    const { order, account } = result;

    // Guard: already paid or unpayable status — redirect to invoice view
    if (!isOrderPayable(order)) {
      return res.redirect(`/api/invoices/w/${orderId}`);
    }

    const totalCents = order.totalCents;

    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();

    const baseUrl = getBaseUrl(req);

    const invoiceNumber = order.invoiceNumber
      ? `INV-${order.invoiceNumber}`
      : `INV-${order.id.slice(0, 8).toUpperCase()}`;

    // Use totalCents as the single authoritative amount to avoid any mismatch
    // between line-item subtotals and the real invoice total (which can include
    // delivery fees, adjustments, or card processing fees).
    const lineItems = [{
      price_data: {
        currency: 'aud',
        product_data: {
          name: `${account?.companyName ? `${account.companyName} — ` : ''}Invoice ${invoiceNumber}`,
        },
        unit_amount: totalCents,
      },
      quantity: 1,
    }];

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_email: (result.user as any)?.email ?? undefined,
      payment_method_types: ['card'],
      success_url: `${baseUrl}/api/invoices/w/${orderId}/paid?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/api/invoices/w/${orderId}`,
      metadata: {
        orderId,
        invoiceNumber,
        companyName:    account?.companyName ?? '',
        expectedCents:  String(totalCents),
      },
    });

    return res.redirect(302, session.url!);
  } catch (err: any) {
    req.log?.error({ err }, 'Failed to create checkout session for invoice');
    return res.status(500).send(
      `<h2 style="font-family:sans-serif;color:#1A2B4A;padding:40px;">Online payment is temporarily unavailable. Please pay by bank transfer or contact accounts@butterfieldcookies.com.au</h2>`,
    );
  }
});

// GET /api/invoices/w/:orderId/paid?session_id=...
// Verifies the Stripe Checkout Session and marks the order as paid, then redirects to the invoice.
router.get('/w/:orderId/paid', async (req, res) => {
  const { orderId } = req.params;
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : null;

  const invoiceUrl = `/api/invoices/w/${orderId}`;

  if (!sessionId) {
    return res.redirect(invoiceUrl);
  }

  try {
    await ensureWholesalePaymentSchemaReady();

    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify both payment status and that the session belongs to this specific order
    if (
      session.payment_status !== 'paid' ||
      session.metadata?.orderId !== orderId
    ) {
      req.log?.warn({ sessionId, orderId, paymentStatus: session.payment_status }, 'Invoice payment session mismatch or unpaid');
      return res.redirect(invoiceUrl);
    }

    // Fetch the order so we can also update the Stripe invoice if one exists
    const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, orderId));

    // If a Stripe invoice was previously created for this order, mark it paid
    // out-of-band so that future syncWholesaleInvoiceStatuses calls don't
    // revert invoiceStatus back to 'sent' / 'overdue'.
    if (order?.stripeInvoiceId) {
      try {
        await stripe.invoices.pay(order.stripeInvoiceId, { paid_out_of_band: true });
      } catch (syncErr: any) {
        // Invoice may already be paid or voided — that's fine
        req.log?.warn({ syncErr: syncErr?.message, stripeInvoiceId: order.stripeInvoiceId }, 'Could not mark Stripe invoice paid out-of-band');
      }
    }

    await db
      .update(wholesaleOrdersTable)
      .set({
        status:               'paid',
        invoiceStatus:        'paid',
        stripePaymentStatus:  'paid',
        isPaid:               true,
        paidAt:               new Date(),
        updatedAt:            new Date(),
        ...(session.payment_intent
          ? { stripePaymentIntentId: String(session.payment_intent) }
          : {}),
      })
      .where(eq(wholesaleOrdersTable.id, orderId));

    req.log?.info({ orderId, sessionId }, 'Wholesale invoice marked paid via Stripe Checkout');

    return res.redirect(invoiceUrl);
  } catch (err: any) {
    req.log?.error({ err, orderId, sessionId }, 'Failed to verify invoice payment session');
    return res.redirect(invoiceUrl);
  }
});

export default router;
