import { Router } from 'express';
import {
  db, wholesaleOrdersTable, wholesaleAccountsTable, usersTable,
} from '@workspace/db';
import { eq } from 'drizzle-orm';
import { buildInvoiceHtml } from '../lib/invoiceTemplate.js';
import { ensureWholesalePaymentSchemaReady } from '../lib/ensureWholesalePaymentSchemaReady.js';

const router = Router();

// Public HTML invoice endpoint — authenticated by unguessable UUID (same pattern as Stripe hosted invoices)
// GET /api/invoices/w/:orderId
router.get('/w/:orderId', async (req, res) => {
  try {
    await ensureWholesalePaymentSchemaReady();

    const { orderId } = req.params;
    const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, orderId));
    if (!order) return res.status(404).send('<h2>Invoice not found</h2>');

    const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.id, order.accountId));
    const [user] = account
      ? await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, account.userId))
      : [null];

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

    const invoiceNumber = (order as any).invoiceNumber
      ? `INV-${(order as any).invoiceNumber}`
      : `INV-${order.id.slice(0, 8).toUpperCase()}`;

    const html = buildInvoiceHtml({
      invoiceNumber,
      invoiceDate:  order.createdAt,
      dueDate:      (order as any).dueDate ?? order.createdAt,
      status:       (order as any).invoiceStatus ?? order.status,
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
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(html);
  } catch (err) {
    req.log?.error({ err }, 'Failed to render invoice');
    return res.status(500).send('<h2>Error generating invoice</h2>');
  }
});

export default router;
