import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  db, wholesaleOrdersTable, wholesaleAccountsTable, productsTable, pricingTiersTable,
  wholesaleCardsTable, quantityPriceBreaksTable, customerPricingTable,
  usersTable,
} from '@workspace/db';
import {
  getOrCreateWholesaleDeliverySettings,
  DEFAULT_DELIVERY_SLOTS,
} from '../lib/wholesaleCutoffReminder.js';
import { eq, desc, asc, and, ne, sum, sql } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { sendNotification } from '../lib/notificationService.js';
import { ensureWholesalePaymentSchemaReady } from '../lib/ensureWholesalePaymentSchemaReady.js';
import {
  createStripeInvoiceForWholesaleOrder,
  markStripeInvoicePaidOutOfBand,
  syncWholesaleInvoiceStatuses,
} from '../lib/stripeWholesaleInvoices.js';
import { buildInvoiceHtml } from '../lib/invoiceTemplate.js';
import { generateWholesaleOrderNumber } from '../lib/orderNumber.js';
import {
  calculateWholesalePrice,
  canCustomerAccessProduct,
  loadPriceContextForAccount,
  priceAndValidateOrder,
} from '../lib/wholesalePricing.js';
import { calculateCardProcessingFeeCents } from '../lib/stripeFees.js';
import { sendEmail, buildPaymentReceiptEmail } from '../lib/emailService.js';

const router = Router();
router.use(requireRole('wholesale'));

async function getOrCreateStripeCustomer(userId: string, email: string, name: string) {
  const [user] = await db
    .select({
      id: usersTable.id,
      stripeCustomerId: usersTable.stripeCustomerId,
      email: usersTable.email,
      name: usersTable.name,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) throw new Error('User not found');
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const { getUncachableStripeClient } = await import('../stripeClient.js');
  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { userId },
  });

  await db
    .update(usersTable)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  return customer.id;
}

function getWholesaleBillingEmail(account: { accountsEmail?: string | null; email?: string | null }, fallbackEmail: string) {
  return account.accountsEmail?.trim() || account.email?.trim() || fallbackEmail;
}

function getPublicBaseUrl(): string {
  const domain = (process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? '')
    .split(',')
    .map((d) => d.trim())
    .find(Boolean);
  return domain ? `https://${domain}` : '';
}

function absolutizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = getPublicBaseUrl();
  if (/^https?:\/\//i.test(url)) {
    const storageMatch = url.match(/(\/api\/storage\/objects\/.+)/);
    if (storageMatch) return base ? `${base}${storageMatch[1]}` : storageMatch[1];
    return url;
  }
  if (!base) return url;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

router.get('/account', async (req, res) => {
  await ensureWholesalePaymentSchemaReady();
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Wholesale account not found' });

  // Calculate live outstanding balance: sum of (totalCents - refundedCents) for
  // all unpaid, non-cancelled orders. This replaces the stale currentBalanceCents
  // DB column which was never updated automatically.
  const [balanceRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${wholesaleOrdersTable.totalCents} - COALESCE(${wholesaleOrdersTable.refundedCents}, 0)), 0)` })
    .from(wholesaleOrdersTable)
    .where(and(
      eq(wholesaleOrdersTable.accountId, account.id),
      eq(wholesaleOrdersTable.isPaid, false),
      ne(wholesaleOrdersTable.status, 'cancelled'),
    ));
  const liveBalanceCents = Number(balanceRow?.total ?? 0);

  let tier: any = null;
  if (account.tierId) {
    const [t] = await db.select().from(pricingTiersTable).where(eq(pricingTiersTable.id, account.tierId));
    tier = t ?? null;
  }
  return res.json({ data: { ...account, currentBalanceCents: liveBalanceCents, tier } });
});

// Alias kept for client compatibility
router.get('/profile', (_req, res) => res.redirect(307, '/api/wholesale/account'));

// Wholesale customer updates their own business hours
router.patch('/account/business-hours', async (req, res) => {
  const { businessHours } = req.body;
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Wholesale account not found.' });
  const [updated] = await db.update(wholesaleAccountsTable)
    .set({ businessHours: businessHours ? String(businessHours).trim() : null, updatedAt: new Date() })
    .where(eq(wholesaleAccountsTable.id, account.id))
    .returning();
  return res.json({ data: updated });
});

// Wholesale customer updates their own accounts team email (for invoice delivery)
router.patch('/account/accounts-email', async (req, res) => {
  const { accountsEmail } = req.body;
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Wholesale account not found.' });
  const [updated] = await db.update(wholesaleAccountsTable)
    .set({ accountsEmail: accountsEmail ? String(accountsEmail).trim() : null, updatedAt: new Date() })
    .where(eq(wholesaleAccountsTable.id, account.id))
    .returning();
  return res.json({ data: updated });
});

// Tier-aware catalog: returns only products this customer can access,
// with the secure unit price computed for qty=1.
router.get('/catalog', async (req, res) => {
  const ctx = await loadPriceContextForAccount(req.user!.id);
  if (!ctx) return res.status(404).json({ error: 'Account not found' });
  if (ctx.isSuspended) return res.status(403).json({ error: 'Your account is suspended.' });
  if (ctx.status !== 'approved') return res.status(403).json({ error: 'Your account is pending approval. You will be notified once it is approved.' });

  const products = await db.select().from(productsTable)
    .where(and(eq(productsTable.isActive, true), eq(productsTable.isPosOnly, false)))
    .orderBy(asc(productsTable.sortOrder), asc(productsTable.name));

  const out: any[] = [];
  for (const p of products) {
    const access = await canCustomerAccessProduct(p, { customerId: req.user!.id, tierId: ctx.tierId });
    if (!access.ok) continue;
    let unitPriceCents: number | null = null;
    let priceSource: string | null = null;
    let priceLabel: string | null = null;
    try {
      const price = await calculateWholesalePrice({
        productId: p.id, qty: Math.max(p.minOrderQty ?? 1, 1),
        customerId: req.user!.id,
        accountId: ctx.accountId,
        tierId: ctx.tierId,
      });
      unitPriceCents = price.unitCents;
      priceSource = price.source;
      priceLabel = price.sourceLabel;
    } catch {
      // skip products with no valid wholesale price
      continue;
    }
    out.push({
      id: p.id,
      name: p.name,
      description: p.description,
      shortDescription: p.shortDescription,
      category: p.category,
      imageUrl: absolutizeUrl(p.imageUrl),
      images: p.imageUrl ? [absolutizeUrl(p.imageUrl)].filter((v): v is string => !!v) : [],
      unitPriceCents,
      basePriceCents: p.wholesalePriceCents ?? p.priceCents,
      priceSource,
      priceLabel,
      gstIncluded: p.gstIncluded,
      minOrderQty: p.minOrderQty,
      maxOrderQty: p.maxOrderQty,
      isSoldOut: p.isSoldOut,
      isComingSoon: p.isComingSoon,
      requiresApproval: p.wholesaleRequiresApproval,
      orderByRequest: p.wholesaleOrderByRequest,
      tags: p.tags ? safeParseJson(p.tags) : [],
      allergens: p.allergens ? safeParseJson(p.allergens) : [],
      dietaryTags: p.dietaryTags ? safeParseJson(p.dietaryTags) : [],
      // legacy compat fields
      prices: [{ id: p.stripePriceId ?? p.id, unit_amount: unitPriceCents, currency: 'aud' }],
      active: true,
    });
  }
  return res.json({ data: out });
});

// Legacy alias
router.get('/products', (req, res) => res.redirect(307, '/api/wholesale/catalog'));

router.get('/orders', async (req, res) => {
  await ensureWholesalePaymentSchemaReady();
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const orders = await db.select().from(wholesaleOrdersTable)
    .where(eq(wholesaleOrdersTable.accountId, account.id))
    .orderBy(desc(wholesaleOrdersTable.createdAt));
  const synced = await syncWholesaleInvoiceStatuses(orders.map((order) => order.id)).catch(() => ({})) as Record<string, any>;
  const data = orders.map((order) => synced[order.id] ?? order);
  return res.json({ data });
});

router.get('/orders/:id', async (req, res) => {
  await ensureWholesalePaymentSchemaReady();
  const [rawOrder] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, req.params.id));
  if (!rawOrder) return res.status(404).json({ error: 'Order not found' });
  // Customers can only see their own orders
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account || rawOrder.accountId !== account.id) return res.status(403).json({ error: 'Forbidden' });
  const synced = await syncWholesaleInvoiceStatuses([req.params.id]).catch(() => ({})) as Record<string, any>;
  const order = synced[req.params.id] ?? rawOrder;
  return res.json({ data: order });
});

router.get('/invoices', async (req, res) => {
  await ensureWholesalePaymentSchemaReady();
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const orders = await db.select().from(wholesaleOrdersTable)
    .where(eq(wholesaleOrdersTable.accountId, account.id))
    .orderBy(desc(wholesaleOrdersTable.createdAt));
  const synced = await syncWholesaleInvoiceStatuses(orders.map((order) => order.id)).catch(() => ({})) as Record<string, any>;
  const data = orders.map((order) => synced[order.id] ?? order);
  return res.json({ data });
});

// ── Custom HTML invoice (wholesale customer can view their own order invoice) ──
router.get('/orders/:id/invoice', async (req, res) => {
  await ensureWholesalePaymentSchemaReady();
  const { id } = req.params;

  const [rawOrder] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, id));
  if (!rawOrder) return res.status(404).send('Invoice not found');

  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account || rawOrder.accountId !== account.id) return res.status(403).send('Forbidden');

  const [user] = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, req.user!.id));

  const items = Array.isArray(rawOrder.items) ? (rawOrder.items as any[]).map((i: any) => ({
    description: i.productName ?? i.name ?? i.description ?? 'Item',
    qty:         Number(i.quantity ?? i.qty ?? 1),
    unitCents:   Number(i.unitPriceCents ?? i.unitPrice ?? i.unit_price ?? i.unitCents ?? 0),
  })) : [];

  const paymentTermsMap: Record<string, string> = {
    pay_on_order: 'Pay on order',
    net_7:  '7 days from invoice date',
    net_14: '14 days from invoice date',
    net_30: '30 days from invoice date',
    net_60: '60 days from invoice date',
  };
  const paymentTerms = paymentTermsMap[(account as any).paymentTerms ?? ''] ?? (account as any).paymentTerms ?? '30 days from invoice date';

  const invoiceNumber = (rawOrder as any).invoiceNumber
    ? `INV-${(rawOrder as any).invoiceNumber}`
    : (rawOrder as any).orderNumber
      ? `INV-${(rawOrder as any).orderNumber}`
      : `INV-${rawOrder.id.slice(0, 8).toUpperCase()}`;

  const html = buildInvoiceHtml({
    invoiceNumber,
    invoiceDate:  rawOrder.createdAt,
    dueDate:      (rawOrder as any).dueDate ?? rawOrder.createdAt,
    status:       (rawOrder as any).invoiceStatus ?? rawOrder.status,
    companyName:  account.companyName ?? user?.name ?? 'Customer',
    abn:          account.abn ?? null,
    email:        user?.email ?? null,
    address:      (account as any).deliveryAddress ?? null,
    accountRef:   account.id?.slice(0, 8).toUpperCase() ?? null,
    items,
    totalCents:       rawOrder.totalCents ?? 0,
    deliveryFeeCents: (rawOrder as any).deliveryFeeCents ?? 0,
    poReference:  rawOrder.poReference ?? null,
    notes:        rawOrder.notes ?? null,
    paymentTerms,
    payUrl:       null,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
});

// SECURE order placement — server prices everything from scratch, ignores client totals.
router.post('/orders', async (req, res) => {
  await ensureWholesalePaymentSchemaReady();
  const { items, poReference, notes, deliveryType, scheduledDate, stripePaymentIntentId, paymentMethodType } = req.body ?? {};
  try {
    // Prices ENTIRELY computed on server — never trust client totals.
    const priced = await priceAndValidateOrder(req.user!.id, items, { allowOverrides: false });
    const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const isNetAccount = Boolean(account.creditEnabled) && (account.paymentTerms ?? 'pay_on_order') !== 'pay_on_order';

    const itemsWithNames = await Promise.all(priced.lines.map(async (l) => {
      const [product] = await db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, l.productId));
      return {
        productId: l.productId,
        productName: product?.name ?? 'Unknown Product',
        qty: l.qty,
        unitPriceCents: l.unitCents,
        totalCents: l.totalCents,
        priceSource: l.source,
        priceLabel: l.sourceLabel,
      };
    }));

    // Add the account's delivery fee if this is a delivery order
    const deliveryFeeCents = (deliveryType === 'delivery') ? (account.deliveryFeeCents ?? 0) : 0;
    const originalTotalCents = priced.totalCents + deliveryFeeCents;
    const stripeFeeCents = isNetAccount ? 0 : calculateCardProcessingFeeCents(originalTotalCents);
    const finalTotalCents  = originalTotalCents + stripeFeeCents;

    let stripePaymentStatus: 'pending' | 'paid' = isNetAccount ? 'pending' : 'paid';
    let isPaid = isNetAccount ? false : true;
    if (!isNetAccount) {
      if (!stripePaymentIntentId) {
        return res.status(400).json({ error: 'Payment is required for this wholesale order.' });
      }
      const { getUncachableStripeClient } = await import('../stripeClient.js');
      const stripe = await getUncachableStripeClient();
      const pi = await stripe.paymentIntents.retrieve(String(stripePaymentIntentId));
      const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
      if (pi.customer !== customerId) {
        return res.status(403).json({ error: 'Payment intent does not belong to this wholesale account.' });
      }
      if (pi.status !== 'succeeded') {
        return res.status(400).json({ error: `Payment has not been completed (status: ${pi.status})` });
      }
      if (pi.currency !== 'aud') {
        return res.status(400).json({ error: 'Payment currency is not AUD.' });
      }
      if (Math.abs(pi.amount - finalTotalCents) > 2) {
        return res.status(400).json({ error: 'Payment amount does not match the wholesale order total.' });
      }
      stripePaymentStatus = 'paid';
      isPaid = true;
    }

    let order;
    const wsOrderNumber = await generateWholesaleOrderNumber();
    try {
      [order] = await db.insert(wholesaleOrdersTable).values({
        id: randomUUID(),
        orderNumber: wsOrderNumber,
        accountId: account.id,
        userId: req.user!.id,
        status: 'pending',
        poReference: poReference ?? null,
        items: itemsWithNames as any,
        notes: notes ?? null,
        totalCents: finalTotalCents,
        originalTotalCents,
        deliveryFeeCents,
        deliveryType: deliveryType ?? 'pickup',
        scheduledDate: scheduledDate ?? null,
        isPaid,
        paidAt: isPaid ? new Date() : null,
        stripePaymentIntentId: stripePaymentIntentId ?? null,
        stripePaymentStatus,
        paymentMethodType: paymentMethodType ?? (isNetAccount ? 'net_terms' : 'credit_card'),
      }).returning();
    } catch (insertError: any) {
      if (!isNetAccount && isPaid && stripePaymentIntentId) {
        try {
          const { getUncachableStripeClient } = await import('../stripeClient.js');
          const stripe = await getUncachableStripeClient();
          await stripe.refunds.create({
            payment_intent: String(stripePaymentIntentId),
            reason: 'requested_by_customer',
            metadata: {
              orderSource: 'wholesale',
              rollback: 'order_insert_failed',
              accountId: account.id,
              userId: req.user!.id,
            },
          });
          req.log.error(
            { err: insertError, stripePaymentIntentId, accountId: account.id, userId: req.user!.id },
            'Wholesale order insert failed after payment success; payment was automatically refunded',
          );
          return res.status(500).json({
            error: 'The payment was received but the order could not be saved. We automatically refunded it, so please try again.',
          });
        } catch (refundError) {
          req.log.error(
            { err: insertError, refundError, stripePaymentIntentId, accountId: account.id, userId: req.user!.id },
            'Wholesale order insert failed after payment success; automatic refund also failed',
          );
          return res.status(500).json({
            error: 'The payment was received but the order could not be saved. Please contact Butterfield support before retrying.',
          });
        }
      }
      throw insertError;
    }

    const itemCount = Array.isArray(itemsWithNames) ? itemsWithNames.reduce((sum, item) => sum + Math.max(1, Number(item.qty ?? 1) || 1), 0) : 1;
    void sendNotification({
      roles: ['manager', 'director', 'master'],
      type: 'new_wholesale_order',
      title: 'New Wholesale Order',
      body: `${account.companyName} · ${itemCount} item${itemCount !== 1 ? 's' : ''} · $${(finalTotalCents / 100).toFixed(2)}`,
      data: { orderId: order.id, screen: '/(wholesale)/orders' },
    }).catch(() => {});

    void createStripeInvoiceForWholesaleOrder(order.id).catch((invoiceError) => {
      req.log.error({ err: invoiceError, orderId: order.id }, 'Wholesale order was created but Stripe invoice creation failed');
    });

    return res.status(201).json({ data: { ...order, pricing: { ...priced, deliveryFeeCents, stripeFeeCents, finalTotalCents } } });
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Order validation failed' });
  }
});

router.post('/payment-intent', async (req, res) => {
  await ensureWholesalePaymentSchemaReady();
  const { items, deliveryType, savePaymentMethod } = req.body ?? {};
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const isNetAccount = Boolean(account.creditEnabled) && (account.paymentTerms ?? 'pay_on_order') !== 'pay_on_order';
  if (isNetAccount) {
    return res.json({ paymentRequired: false, clientSecret: null, paymentIntentId: null, amountCents: 0 });
  }

  try {
    const priced = await priceAndValidateOrder(req.user!.id, items, { allowOverrides: false });
    const deliveryFeeCents = deliveryType === 'delivery' ? (account.deliveryFeeCents ?? 0) : 0;
    const baseAmountCents = priced.totalCents + deliveryFeeCents;
    const stripeFeeCents = calculateCardProcessingFeeCents(baseAmountCents);
    const totalCents = baseAmountCents + stripeFeeCents;
    if (totalCents < 50) return res.status(400).json({ error: 'Amount must be at least 50 cents.' });

    const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    const billingEmail = getWholesaleBillingEmail(account, req.user!.email);
    await stripe.customers.update(customerId, {
      email: billingEmail,
      name: account.companyName || req.user!.name,
      phone: account.phone ?? undefined,
    });
    const intent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'aud',
      customer: customerId,
      receipt_email: billingEmail,
      payment_method_types: ['card'],
      setup_future_usage: savePaymentMethod ? 'off_session' : undefined,
      metadata: {
        userId: req.user!.id,
        accountId: account.id,
        orderSource: 'wholesale',
        computedAmountCents: String(totalCents),
      },
    });
    return res.json({
      paymentRequired: true,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      baseAmountCents,
      stripeFeeCents,
      amountCents: totalCents,
    });
  } catch (err: any) {
    req.log.error({ err }, 'Wholesale payment intent creation failed');
    return res.status(400).json({ error: err?.message ?? 'Could not prepare wholesale payment' });
  }
});

router.post('/confirm-saved-method', async (req, res) => {
  await ensureWholesalePaymentSchemaReady();
  const { items, deliveryType, paymentMethodId } = req.body ?? {};
  if (!paymentMethodId) return res.status(400).json({ error: 'paymentMethodId is required.' });

  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const isNetAccount = Boolean(account.creditEnabled) && (account.paymentTerms ?? 'pay_on_order') !== 'pay_on_order';
  if (isNetAccount) {
    return res.json({ paymentRequired: false, paymentIntentId: null, clientSecret: null, amountCents: 0 });
  }

  try {
    const priced = await priceAndValidateOrder(req.user!.id, items, { allowOverrides: false });
    const deliveryFeeCents = deliveryType === 'delivery' ? (account.deliveryFeeCents ?? 0) : 0;
    const baseAmountCents = priced.totalCents + deliveryFeeCents;
    const stripeFeeCents = calculateCardProcessingFeeCents(baseAmountCents);
    const totalCents = baseAmountCents + stripeFeeCents;
    const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    const billingEmail = getWholesaleBillingEmail(account, req.user!.email);
    await stripe.customers.update(customerId, {
      email: billingEmail,
      name: account.companyName || req.user!.name,
      phone: account.phone ?? undefined,
    });
    const intent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'aud',
      customer: customerId,
      receipt_email: billingEmail,
      payment_method: paymentMethodId,
      payment_method_types: ['card'],
      confirmation_method: 'manual',
      confirm: true,
      metadata: {
        userId: req.user!.id,
        accountId: account.id,
        orderSource: 'wholesale',
        computedAmountCents: String(totalCents),
      },
    });
    return res.json({
      paymentRequired: true,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      baseAmountCents,
      stripeFeeCents,
      amountCents: totalCents,
      requiresAction: intent.status === 'requires_action',
      success: intent.status === 'succeeded',
    });
  } catch (err: any) {
    req.log.error({ err }, 'Wholesale saved-card confirmation failed');
    return res.status(400).json({ error: err?.message ?? 'Could not charge saved wholesale card' });
  }
});

router.post('/confirm-intent', async (req, res) => {
  const { paymentIntentId } = req.body ?? {};
  if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId is required.' });
  try {
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    let intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status === 'requires_confirmation') {
      intent = await stripe.paymentIntents.confirm(paymentIntentId);
    }
    return res.json({
      success: intent.status === 'succeeded',
      requiresAction: intent.status === 'requires_action',
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
    });
  } catch (err: any) {
    req.log.error({ err }, 'Wholesale final payment confirmation failed');
    return res.status(400).json({ error: err?.message ?? 'Could not finalize wholesale payment' });
  }
});

// Returns this customer's tier, qty breaks, and custom prices in one call.
// The client uses this to compute correct prices as quantity changes, without
// hitting the server on every keypress. The server re-validates at checkout.
router.get('/pricing-context', async (req, res) => {
  const ctx = await loadPriceContextForAccount(req.user!.id);
  if (!ctx) return res.status(404).json({ error: 'Account not found' });
  if (ctx.isSuspended) return res.status(403).json({ error: 'Your account is suspended.' });

  let tierName: string | null = null;
  let tierStatus: string | null = null;
  let tierQtyBreaks: any[] = [];

  if (ctx.tierId) {
    const [tier] = await db.select().from(pricingTiersTable).where(eq(pricingTiersTable.id, ctx.tierId));
    if (tier && tier.status === 'active') {
      tierName = tier.name;
      tierStatus = tier.status;
      tierQtyBreaks = await db.select().from(quantityPriceBreaksTable).where(
        and(
          eq(quantityPriceBreaksTable.scope, 'tier'),
          eq(quantityPriceBreaksTable.tierId, ctx.tierId),
          eq(quantityPriceBreaksTable.isActive, true),
        )
      ).orderBy(asc(quantityPriceBreaksTable.minQty));
    }
  }

  const customerQtyBreaks = await db.select().from(quantityPriceBreaksTable).where(
    and(
      eq(quantityPriceBreaksTable.scope, 'customer'),
      eq(quantityPriceBreaksTable.customerId, req.user!.id),
      eq(quantityPriceBreaksTable.isActive, true),
    )
  ).orderBy(asc(quantityPriceBreaksTable.minQty));

  const customPrices = await db.select().from(customerPricingTable).where(
    and(
      eq(customerPricingTable.customerId, req.user!.id),
      eq(customerPricingTable.isActive, true),
    )
  );

  return res.json({
    data: {
      tierId: ctx.tierId,
      tierName,
      tierStatus,
      // All active qty breaks for this customer's tier + customer-specific breaks
      qtyBreaks: [...tierQtyBreaks, ...customerQtyBreaks],
      // Custom per-product prices for this customer
      customPrices,
      minOrderCents: ctx.minOrderCents,
    },
  });
});

function safeParseJson(s: string): any[] {
  try { const r = JSON.parse(s); return Array.isArray(r) ? r : []; } catch { return []; }
}

// ── Wholesale Cards on File ───────────────────────────────────────────────────
async function getAccountForUser(userId: string) {
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, userId));
  return account ?? null;
}

router.get('/cards', async (req, res) => {
  await ensureWholesalePaymentSchemaReady();
  const account = await getAccountForUser(req.user!.id);
  if (!account) return res.status(404).json({ error: 'Wholesale account not found' });
  const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
  const { getUncachableStripeClient } = await import('../stripeClient.js');
  const stripe = await getUncachableStripeClient();
  const [customer, methods, records] = await Promise.all([
    stripe.customers.retrieve(customerId),
    stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
    db.select().from(wholesaleCardsTable).where(eq(wholesaleCardsTable.accountId, account.id)),
  ]);
  const defaultPaymentMethodId =
    !('deleted' in customer) && typeof customer.invoice_settings.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : null;
  const recordMap = new Map(records.map((record) => [record.stripePaymentMethodId ?? record.id, record]));

  const data = methods.data.map((method) => {
    const record = recordMap.get(method.id);
    return {
      id: method.id,
      stripePaymentMethodId: method.id,
      nameOnCard: record?.nameOnCard ?? req.user!.name,
      cardBrand: method.card?.brand ?? 'card',
      brand: method.card?.brand ?? 'card',
      last4: method.card?.last4 ?? '0000',
      expiry: `${String(method.card?.exp_month ?? '').padStart(2, '0')}/${String(method.card?.exp_year ?? '').slice(-2)}`,
      expMonth: method.card?.exp_month ?? null,
      expYear: method.card?.exp_year ?? null,
      isDefault: method.id === defaultPaymentMethodId,
      createdAt: record?.createdAt,
      updatedAt: record?.updatedAt ?? record?.createdAt,
    };
  });

  return res.json({ data });
});

router.post('/cards', async (req, res) => {
  await ensureWholesalePaymentSchemaReady();
  const account = await getAccountForUser(req.user!.id);
  if (!account) return res.status(404).json({ error: 'Wholesale account not found' });
  const { paymentMethodId, nameOnCard, cardBrand, last4, expiry, isDefault } = req.body ?? {};
  if (paymentMethodId) {
    const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    const attached = await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    const existing = await db.select().from(wholesaleCardsTable).where(eq(wholesaleCardsTable.accountId, account.id));
    const makeDefault = Boolean(isDefault) || existing.length === 0;
    if (makeDefault) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
      await db.update(wholesaleCardsTable).set({ isDefault: false, updatedAt: new Date() }).where(eq(wholesaleCardsTable.accountId, account.id));
    }
    const [card] = await db.insert(wholesaleCardsTable).values({
      id: paymentMethodId,
      accountId: account.id,
      stripePaymentMethodId: paymentMethodId,
      nameOnCard: nameOnCard?.trim() || req.user!.name,
      cardBrand: attached.card?.brand ?? 'card',
      last4: attached.card?.last4 ?? '0000',
      expiry: `${String(attached.card?.exp_month ?? '').padStart(2, '0')}/${String(attached.card?.exp_year ?? '').slice(-2)}`,
      expMonth: attached.card?.exp_month ?? null,
      expYear: attached.card?.exp_year ?? null,
      isDefault: makeDefault,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: wholesaleCardsTable.id,
      set: {
        stripePaymentMethodId: paymentMethodId,
        nameOnCard: nameOnCard?.trim() || req.user!.name,
        cardBrand: attached.card?.brand ?? 'card',
        last4: attached.card?.last4 ?? '0000',
        expiry: `${String(attached.card?.exp_month ?? '').padStart(2, '0')}/${String(attached.card?.exp_year ?? '').slice(-2)}`,
        expMonth: attached.card?.exp_month ?? null,
        expYear: attached.card?.exp_year ?? null,
        isDefault: makeDefault,
        updatedAt: new Date(),
      },
    }).returning();
    return res.status(201).json({
      data: {
        id: card.id,
        stripePaymentMethodId: paymentMethodId,
        nameOnCard: card.nameOnCard,
        cardBrand: card.cardBrand,
        brand: card.cardBrand,
        last4: card.last4,
        expiry: card.expiry,
        expMonth: card.expMonth,
        expYear: card.expYear,
        isDefault: card.isDefault,
      },
    });
  }

  if (!nameOnCard || !last4 || !expiry) return res.status(400).json({ error: 'paymentMethodId is required for secure card saving.' });
  const [card] = await db.insert(wholesaleCardsTable).values({
    id: randomUUID(),
    accountId: account.id,
    nameOnCard,
    cardBrand: cardBrand ?? 'Visa',
    last4,
    expiry,
    isDefault: Boolean(isDefault),
    updatedAt: new Date(),
  }).returning();
  return res.status(201).json({ data: card });
});

router.patch('/cards/:id', async (req, res) => {
  await ensureWholesalePaymentSchemaReady();
  const account = await getAccountForUser(req.user!.id);
  if (!account) return res.status(404).json({ error: 'Wholesale account not found' });
  const { nameOnCard, isDefault } = req.body ?? {};
  const paymentMethodId = req.params.id;
  const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
  const { getUncachableStripeClient } = await import('../stripeClient.js');
  const stripe = await getUncachableStripeClient();
  const updates: Record<string, any> = {};
  if (nameOnCard !== undefined) updates.nameOnCard = nameOnCard;
  if (isDefault) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    await db.update(wholesaleCardsTable).set({ isDefault: false, updatedAt: new Date() }).where(eq(wholesaleCardsTable.accountId, account.id));
    updates.isDefault = true;
  }
  updates.updatedAt = new Date();
  const [updated] = await db.update(wholesaleCardsTable).set(updates)
    .where(and(eq(wholesaleCardsTable.id, paymentMethodId), eq(wholesaleCardsTable.accountId, account.id)))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Card not found' });
  return res.json({ data: updated });
});

router.delete('/cards/:id', async (req, res) => {
  await ensureWholesalePaymentSchemaReady();
  const account = await getAccountForUser(req.user!.id);
  if (!account) return res.status(404).json({ error: 'Wholesale account not found' });
  const paymentMethodId = req.params.id;
  const { getUncachableStripeClient } = await import('../stripeClient.js');
  const stripe = await getUncachableStripeClient();
  try {
    await stripe.paymentMethods.detach(paymentMethodId);
  } catch {}
  const [deleted] = await db.delete(wholesaleCardsTable)
    .where(and(eq(wholesaleCardsTable.id, paymentMethodId), eq(wholesaleCardsTable.accountId, account.id)))
    .returning();
  if (!deleted) return res.status(404).json({ error: 'Card not found' });
  const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
  if (deleted.isDefault) {
    const [remaining] = await db.select().from(wholesaleCardsTable)
      .where(eq(wholesaleCardsTable.accountId, account.id)).orderBy(desc(wholesaleCardsTable.createdAt)).limit(1);
    if (remaining) {
      await db.update(wholesaleCardsTable).set({ isDefault: true, updatedAt: new Date() }).where(eq(wholesaleCardsTable.id, remaining.id));
      if (remaining.stripePaymentMethodId) {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: remaining.stripePaymentMethodId },
        });
      }
    } else {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: null as any },
      });
    }
  }
  return res.json({ success: true });
});

// ── Wholesale delivery schedule (for display in the mobile app) ───────────────
router.get('/delivery-schedule', async (_req, res) => {
  const settings = await getOrCreateWholesaleDeliverySettings();
  const slots = JSON.parse(settings.slotsJson || '[]');
  return res.json({
    data: {
      slots: slots.length ? slots : DEFAULT_DELIVERY_SLOTS,
    },
  });
});

// ── Invoice Pay Now ───────────────────────────────────────────────────────────

router.post('/invoices/:orderId/payment-intent', async (req, res) => {
  const { orderId } = req.params;
  const { paymentMethodId } = req.body ?? {};
  if (!paymentMethodId) return res.status(400).json({ error: 'paymentMethodId is required.' });

  const account = await getAccountForUser(req.user!.id);
  if (!account) return res.status(404).json({ error: 'Wholesale account not found.' });

  const [order] = await db.select().from(wholesaleOrdersTable).where(
    and(eq(wholesaleOrdersTable.id, orderId), eq(wholesaleOrdersTable.accountId, account.id)),
  );
  if (!order) return res.status(404).json({ error: 'Invoice not found.' });

  const alreadyPaid =
    order.isPaid ||
    String(order.stripePaymentStatus ?? '').toLowerCase() === 'paid' ||
    String((order as any).invoiceStatus ?? '').toLowerCase() === 'paid';
  if (alreadyPaid) return res.status(400).json({ error: 'This invoice has already been paid.' });

  // Terminal non-payable states
  const invStatus = String((order as any).invoiceStatus ?? '').toLowerCase();
  if (order.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot pay a cancelled order.' });
  }
  if (invStatus === 'voided' || invStatus === 'failed') {
    return res.status(400).json({ error: 'Cannot pay a voided or failed invoice.' });
  }
  if ((order as any).refundedCents > 0) {
    return res.status(400).json({ error: 'Cannot pay a refunded order.' });
  }

  const invoiceAmountCents = order.totalCents ?? 0;
  if (invoiceAmountCents <= 0) return res.status(400).json({ error: 'Invoice amount is invalid.' });

  const processingFeeCents = calculateCardProcessingFeeCents(invoiceAmountCents);
  const totalWithFeeCents  = invoiceAmountCents + processingFeeCents;

  try {
    const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();

    const intent = await stripe.paymentIntents.create({
      amount:               totalWithFeeCents,
      currency:             'aud',
      customer:             customerId,
      receipt_email:        req.user!.email,
      payment_method:       paymentMethodId,
      payment_method_types: ['card'],
      confirmation_method:  'manual',
      confirm:              true,
      metadata: {
        userId:               req.user!.id,
        accountId:            account.id,
        orderId,
        orderSource:          'wholesale_invoice',
        invoiceAmountCents:   String(invoiceAmountCents),
        processingFeeCents:   String(processingFeeCents),
      },
    });

    return res.json({
      clientSecret:        intent.client_secret,
      paymentIntentId:     intent.id,
      invoiceAmountCents,
      processingFeeCents,
      totalWithFeeCents,
      requiresAction:      intent.status === 'requires_action',
      success:             intent.status === 'succeeded',
    });
  } catch (err: any) {
    req.log.error({ err }, 'Invoice payment intent creation failed');
    return res.status(400).json({ error: err?.message ?? 'Could not create payment intent.' });
  }
});

router.post('/invoices/:orderId/confirm-payment', async (req, res) => {
  const { orderId } = req.params;
  const { paymentIntentId } = req.body ?? {};
  if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId is required.' });

  const account = await getAccountForUser(req.user!.id);
  if (!account) return res.status(404).json({ error: 'Wholesale account not found.' });

  const [order] = await db.select().from(wholesaleOrdersTable).where(
    and(eq(wholesaleOrdersTable.id, orderId), eq(wholesaleOrdersTable.accountId, account.id)),
  );
  if (!order) return res.status(404).json({ error: 'Invoice not found.' });

  // Idempotency: already marked paid via this intent → return success
  if (order.stripePaymentIntentId === paymentIntentId && order.isPaid) {
    return res.json({ success: true });
  }

  // Reject if already paid by any means
  const alreadyPaid =
    order.isPaid ||
    String(order.stripePaymentStatus ?? '').toLowerCase() === 'paid' ||
    String((order as any).invoiceStatus ?? '').toLowerCase() === 'paid';
  if (alreadyPaid) return res.status(400).json({ error: 'This invoice has already been paid.' });

  // Terminal non-payable states
  const confirmInvStatus = String((order as any).invoiceStatus ?? '').toLowerCase();
  if (order.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot pay a cancelled order.' });
  }
  if (confirmInvStatus === 'voided' || confirmInvStatus === 'failed') {
    return res.status(400).json({ error: 'Cannot pay a voided or failed invoice.' });
  }
  if ((order as any).refundedCents > 0) {
    return res.status(400).json({ error: 'Cannot pay a refunded order.' });
  }

  try {
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Must be succeeded
    if (intent.status !== 'succeeded') {
      return res.status(400).json({ error: `Payment did not succeed (status: ${intent.status}).` });
    }

    // Strict metadata binding: all three must match
    const meta = intent.metadata ?? {};
    if (meta.orderId !== orderId) {
      req.log.warn({ paymentIntentId, orderId, metaOrderId: meta.orderId }, 'Intent orderId mismatch');
      return res.status(400).json({ error: 'Payment intent does not match this invoice.' });
    }
    if (meta.accountId !== account.id) {
      req.log.warn({ paymentIntentId, accountId: account.id, metaAccountId: meta.accountId }, 'Intent accountId mismatch');
      return res.status(400).json({ error: 'Payment intent does not match this account.' });
    }
    if (meta.userId !== req.user!.id) {
      req.log.warn({ paymentIntentId, userId: req.user!.id, metaUserId: meta.userId }, 'Intent userId mismatch');
      return res.status(400).json({ error: 'Payment intent does not match this user.' });
    }

    // Amount verification: intent amount must exactly equal invoice + fee
    const invoiceAmountCents = order.totalCents ?? 0;
    const processingFeeCents = calculateCardProcessingFeeCents(invoiceAmountCents);
    const expectedTotal      = invoiceAmountCents + processingFeeCents;
    if (intent.amount !== expectedTotal) {
      req.log.warn({ paymentIntentId, intentAmount: intent.amount, expectedTotal }, 'Intent amount mismatch');
      return res.status(400).json({ error: 'Payment amount does not match invoice total.' });
    }

    // Customer linkage: intent customer must belong to this user
    const expectedCustomerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
    if (intent.customer !== expectedCustomerId) {
      req.log.warn({ paymentIntentId, intentCustomer: intent.customer, expectedCustomerId }, 'Intent customer mismatch');
      return res.status(400).json({ error: 'Payment intent customer does not match.' });
    }

    // Mark invoice paid in DB
    await db.update(wholesaleOrdersTable).set({
      isPaid:                true,
      paidAt:                new Date(),
      status:                'paid',
      invoiceStatus:         'paid',
      stripePaymentStatus:   'paid',
      stripePaymentIntentId: paymentIntentId,
      updatedAt:             new Date(),
    } as any).where(eq(wholesaleOrdersTable.id, orderId));

    // Reconcile Stripe invoice if one exists
    const stripeInvoiceId = (order as any).stripeInvoiceId ?? null;
    if (stripeInvoiceId) {
      markStripeInvoicePaidOutOfBand(stripeInvoiceId).catch((err: any) => {
        req.log.warn({ err, stripeInvoiceId }, 'markStripeInvoicePaidOutOfBand failed (non-fatal)');
      });
    }

    // Send payment receipt email (non-fatal) — record timestamp on success
    try {
      const recipientEmail = getWholesaleBillingEmail(account, req.user!.email);
      const invoiceLabel = (order as any).invoiceNumber ?? (order as any).orderNumber ?? orderId;
      const html = buildPaymentReceiptEmail({
        invoiceNumber:      invoiceLabel,
        companyName:        account.companyName,
        invoiceAmountCents: invoiceAmountCents,
        processingFeeCents: processingFeeCents,
        totalPaidCents:     expectedTotal,
        paymentDate:        new Date(),
        recipientEmail,
      });
      sendEmail({
        to:      recipientEmail,
        subject: `Payment received – ${invoiceLabel}`,
        html,
      }).then(({ success }) => {
        if (success) {
          db.update(wholesaleOrdersTable).set({ receiptEmailSentAt: new Date() } as any)
            .where(eq(wholesaleOrdersTable.id, orderId))
            .catch((dbErr: any) => req.log.warn({ dbErr, orderId }, 'receiptEmailSentAt DB update failed (non-fatal)'));
        } else {
          req.log.warn({ orderId, recipientEmail }, 'Payment receipt email failed to send');
        }
      }).catch((err: any) => {
        req.log.warn({ err, orderId }, 'Payment receipt email threw (non-fatal)');
      });
    } catch (emailErr: any) {
      req.log.warn({ emailErr, orderId }, 'Could not build payment receipt email (non-fatal)');
    }

    return res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, 'Invoice payment confirmation failed');
    return res.status(400).json({ error: err?.message ?? 'Could not confirm payment.' });
  }
});

export default router;
