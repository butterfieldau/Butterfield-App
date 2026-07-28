import { Router } from 'express';
import {
  db, wholesaleOrdersTable, wholesaleAccountsTable, usersTable,
} from '@workspace/db';
import { eq } from 'drizzle-orm';
import { buildInvoiceHtml } from '../lib/invoiceTemplate.js';
import { formatInvoiceNumber } from '../lib/formatInvoiceNumber.js';
import { ensureWholesalePaymentSchemaReady } from '../lib/ensureWholesalePaymentSchemaReady.js';
import { notifyRole } from '../lib/notificationService.js';

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

    const invoiceNumber = formatInvoiceNumber(order);

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

    const invoiceNumber = formatInvoiceNumber(order);

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

    const [updatedOrder] = await db
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
      .where(eq(wholesaleOrdersTable.id, orderId))
      .returning();

    req.log?.info({ orderId, sessionId }, 'Wholesale invoice marked paid via Stripe Checkout');

    // Fire-and-forget payment-received email (same as manual mark-paid flow)
    if (updatedOrder) {
      (async () => {
        try {
          const [account] = await db
            .select()
            .from(wholesaleAccountsTable)
            .where(eq(wholesaleAccountsTable.id, updatedOrder.accountId));

          const [user] = account?.userId
            ? await db
                .select({ email: usersTable.email })
                .from(usersTable)
                .where(eq(usersTable.id, account.userId))
            : [null];

          // Notify all directors that the invoice has been paid
          const companyName = account?.companyName ?? 'A customer';
          const totalAUDNotif = ((updatedOrder.totalCents ?? 0) / 100).toLocaleString('en-AU', {
            style: 'currency', currency: 'AUD',
          });
          const invNumNotif = formatInvoiceNumber(updatedOrder);
          notifyRole(
            'director',
            'wholesale_invoice_paid',
            'Invoice Paid',
            `${companyName} paid ${totalAUDNotif} (${invNumNotif})`,
            { orderId, invoiceNumber: invNumNotif },
          ).catch(() => { /* non-fatal */ });

          const recipientEmail =
            account?.accountsEmail?.trim() ||
            (account as any)?.email?.trim() ||
            user?.email?.trim() ||
            null;

          if (recipientEmail) {
            const invNum = formatInvoiceNumber(updatedOrder);
            const totalAUD = ((updatedOrder.totalCents ?? 0) / 100).toLocaleString('en-AU', {
              style: 'currency', currency: 'AUD',
            });
            const paidAtStr = new Date().toLocaleDateString('en-AU', {
              day: '2-digit', month: 'short', year: 'numeric',
            });
            const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ?? req.protocol ?? 'https';
            const host = req.headers.host ?? '';
            const baseUrl = host ? `${proto}://${host}` : '';
            const invoiceViewUrl = baseUrl ? `${baseUrl}/api/invoices/w/${orderId}` : null;

            const { sendEmail, buildWholesalePaymentReceivedEmail } = await import('../lib/emailService.js');
            const html = buildWholesalePaymentReceivedEmail({
              companyName:      account?.companyName ?? '',
              invoiceNumber:    invNum,
              totalAUD,
              paidAt:           paidAtStr,
              paymentReference: session.payment_intent ? String(session.payment_intent) : null,
              invoiceUrl:       invoiceViewUrl,
            });

            // Generate PDF attachment (best-effort)
            let pdfBuffer: Buffer | undefined;
            try {
              const { generateInvoicePdf } = await import('../lib/invoicePdf.js');
              const paymentTermsMap: Record<string, string> = {
                pay_on_order: 'Pay on order', net_7: '7 days from invoice date',
                net_14: '14 days from invoice date', net_30: '30 days from invoice date',
                net_60: '60 days from invoice date',
              };
              const paymentTerms = paymentTermsMap[(account as any)?.paymentTerms ?? ''] ?? (account as any)?.paymentTerms ?? '30 days from invoice date';
              const invoiceDate = updatedOrder.createdAt instanceof Date ? updatedOrder.createdAt : new Date(updatedOrder.createdAt as any);
              const dueDateRaw = (updatedOrder as any).invoiceDueDate ?? (updatedOrder as any).dueDate;
              const dueDate = dueDateRaw ? new Date(dueDateRaw) : invoiceDate;
              const items = Array.isArray(updatedOrder.items)
                ? (updatedOrder.items as any[]).map((i: any) => ({
                    description: i.productName ?? i.name ?? i.description ?? 'Item',
                    qty:         Number(i.quantity ?? i.qty ?? 1),
                    unitCents:   Number(i.unitPriceCents ?? i.unitPrice ?? i.unit_price ?? i.unitCents ?? 0),
                  }))
                : [];
              pdfBuffer = await generateInvoicePdf({
                invoiceNumber:    invNum,
                invoiceDate,
                dueDate,
                status:           'paid',
                companyName:      account?.companyName ?? '',
                abn:              account?.abn ?? null,
                email:            user?.email ?? null,
                address:          (account as any).deliveryAddress ?? null,
                accountRef:       account?.id?.slice(0, 8).toUpperCase() ?? null,
                items,
                totalCents:       updatedOrder.totalCents ?? 0,
                deliveryFeeCents: (updatedOrder as any).deliveryFeeCents ?? 0,
                poReference:      updatedOrder.poReference ?? null,
                notes:            updatedOrder.notes ?? null,
                paymentTerms,
                invoiceUrl:       invoiceViewUrl,
              });
            } catch { /* PDF generation failure is non-fatal */ }

            await sendEmail({
              to:      recipientEmail,
              subject: `Payment Received – ${invNum}`,
              html,
              ...(pdfBuffer
                ? { attachments: [{ filename: `${invNum}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }] }
                : {}),
            });
          }
        } catch {
          // Non-fatal — order is already marked paid; email failure must not affect the redirect
        }
      })();
    }

    return res.redirect(invoiceUrl);
  } catch (err: any) {
    req.log?.error({ err, orderId, sessionId }, 'Failed to verify invoice payment session');
    return res.redirect(invoiceUrl);
  }
});

export default router;
