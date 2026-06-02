import {
  db,
  usersTable,
  wholesaleAccountsTable,
  wholesaleOrdersTable,
  type WholesaleAccount,
  type WholesaleOrder,
} from '@workspace/db';
import { eq } from 'drizzle-orm';
import { getUncachableStripeClient } from '../stripeClient.js';
import { ensureWholesalePaymentSchemaReady } from './ensureWholesalePaymentSchemaReady.js';
import { calculateCardProcessingFeeCents } from './stripeFees.js';

function parseNetDays(paymentTerms: string | null | undefined) {
  if (!paymentTerms || paymentTerms === 'pay_on_order') return 0;
  const match = paymentTerms.match(/(\d+)/);
  return match ? Number(match[1]) || 0 : 0;
}

function formatInvoiceDate(timestampSeconds: number | null | undefined) {
  if (!timestampSeconds) return null;
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10);
}

function normalizeInvoiceStatus(invoice: {
  status?: string | null;
  due_date?: number | null;
}) {
  const raw = String(invoice.status ?? '').toLowerCase();
  if (raw === 'paid') return 'paid';
  if (raw === 'draft') return 'draft';
  if (raw === 'void' || raw === 'voided') return 'voided';
  if (raw === 'uncollectible') return 'failed';
  if (raw === 'open') {
    const dueAt = invoice.due_date ? new Date(invoice.due_date * 1000) : null;
    if (dueAt && dueAt.getTime() < Date.now()) return 'overdue';
    return 'sent';
  }
  return raw || 'draft';
}

async function getOrderWithRelations(orderId: string) {
  const [order] = await db
    .select()
    .from(wholesaleOrdersTable)
    .where(eq(wholesaleOrdersTable.id, orderId));
  if (!order) throw new Error('Wholesale order not found.');

  const [account] = await db
    .select()
    .from(wholesaleAccountsTable)
    .where(eq(wholesaleAccountsTable.id, order.accountId));
  if (!account) throw new Error('Wholesale account not found.');

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      stripeCustomerId: usersTable.stripeCustomerId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, order.userId));
  if (!user) throw new Error('Wholesale customer user not found.');

  return { order, account, user };
}

async function getOrCreateStripeCustomer(user: { id: string; email: string; name: string; stripeCustomerId?: string | null }, account: WholesaleAccount) {
  const stripe = await getUncachableStripeClient();
  const billingEmail = account.accountsEmail?.trim() || account.email?.trim() || user.email;
  if (user.stripeCustomerId) {
    await stripe.customers.update(user.stripeCustomerId, {
      email: billingEmail,
      name: account.companyName || user.name,
      phone: account.phone ?? undefined,
      address: account.deliveryAddress ? { line1: account.deliveryAddress } : undefined,
      metadata: {
        userId: user.id,
        wholesaleAccountId: account.id,
        companyName: account.companyName,
      },
    });
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: billingEmail,
    name: account.companyName || user.name,
    phone: account.phone ?? undefined,
    address: account.deliveryAddress ? { line1: account.deliveryAddress } : undefined,
    metadata: {
      userId: user.id,
      wholesaleAccountId: account.id,
      companyName: account.companyName,
    },
  });

  await db
    .update(usersTable)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  return customer.id;
}

async function persistInvoiceFields(orderId: string, invoice: {
  id: string;
  number?: string | null;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  due_date?: number | null;
  status?: string | null;
}) {
  const [updated] = await db
    .update(wholesaleOrdersTable)
    .set({
      stripeInvoiceId: invoice.id,
      invoiceNumber: invoice.number ?? null,
      invoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      invoiceDueDate: formatInvoiceDate(invoice.due_date),
      invoiceStatus: normalizeInvoiceStatus(invoice),
      invoiceUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(wholesaleOrdersTable.id, orderId))
    .returning();

  return updated ?? null;
}

function getLineItems(order: WholesaleOrder) {
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const lines = rawItems
    .map((item: any) => {
      const qty = Math.max(1, Number(item.qty ?? item.quantity ?? 1) || 1);
      const unitPriceCents = Number(item.unitPriceCents ?? 0) || 0;
      const description = String(item.productName ?? item.name ?? 'Wholesale item').trim();
      return {
        quantity: qty,
        unitPriceCents,
        description,
      };
    })
    .filter((item) => item.unitPriceCents > 0);

  const lineSubtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
  const originalTotalCents = order.originalTotalCents ?? order.totalCents ?? 0;
  const baseRemainder = Math.max(0, originalTotalCents - lineSubtotal);
  const cardFeeCents = (order.paymentMethodType === 'credit_card' || order.paymentMethodType === 'saved_card')
    ? Math.max(0, (order.totalCents ?? 0) - originalTotalCents)
    : 0;

  if (baseRemainder > 0) {
    lines.push({
      quantity: 1,
      unitPriceCents: baseRemainder,
      description: order.deliveryType === 'delivery' ? 'Delivery fee' : 'Order adjustment',
    });
  }

  if (cardFeeCents > 0) {
    lines.push({
      quantity: 1,
      unitPriceCents: cardFeeCents,
      description: 'Card processing fee',
    });
  }

  if (lines.length === 0) {
    const fallbackFeeCents = (order.paymentMethodType === 'credit_card' || order.paymentMethodType === 'saved_card')
      ? calculateCardProcessingFeeCents(Math.max(0, order.totalCents ?? 0))
      : 0;
    const fallbackBaseTotal = Math.max(0, (order.totalCents ?? 0) - fallbackFeeCents);
    lines.push({
      quantity: 1,
      unitPriceCents: fallbackBaseTotal,
      description: 'Wholesale order',
    });
    if (fallbackFeeCents > 0) {
      lines.push({
        quantity: 1,
        unitPriceCents: fallbackFeeCents,
        description: 'Card processing fee',
      });
    }
  }

  return lines;
}

export async function createStripeInvoiceForWholesaleOrder(orderId: string) {
  await ensureWholesalePaymentSchemaReady();
  const { order, account, user } = await getOrderWithRelations(orderId);

  if (order.stripeInvoiceId) {
    const synced = await syncWholesaleInvoiceStatus(orderId);
    return synced ?? order;
  }

  const stripe = await getUncachableStripeClient();
  const customerId = await getOrCreateStripeCustomer(user, account);
  const netDays = parseNetDays(account.paymentTerms);
  const isNetAccount = Boolean(account.creditEnabled) && netDays > 0;

  for (const line of getLineItems(order)) {
    await stripe.invoiceItems.create({
      customer: customerId,
      currency: 'aud',
      quantity: line.quantity,
      unit_amount: line.unitPriceCents,
      description: line.description,
      metadata: {
        orderId: order.id,
        wholesaleAccountId: account.id,
        orderSource: 'wholesale',
      },
    });
  }

  const invoice = await stripe.invoices.create({
    customer: customerId,
    auto_advance: false,
    collection_method: 'send_invoice',
    pending_invoice_items_behavior: 'include',
    ...(isNetAccount ? { days_until_due: netDays } : { due_date: Math.floor(Date.now() / 1000) }),
    description: `Wholesale order ${order.poReference ?? order.id.slice(0, 8).toUpperCase()}`,
    metadata: {
      orderId: order.id,
      wholesaleAccountId: account.id,
      orderSource: 'wholesale',
    },
  });

  let finalized = await stripe.invoices.finalizeInvoice(invoice.id);

  if (isNetAccount) {
    finalized = await stripe.invoices.sendInvoice(finalized.id);
  } else if (order.isPaid || order.stripePaymentStatus === 'paid') {
    finalized = await stripe.invoices.pay(finalized.id, { paid_out_of_band: true });
  }

  const refreshed = await stripe.invoices.retrieve(finalized.id);
  return persistInvoiceFields(order.id, refreshed);
}

export async function syncWholesaleInvoiceStatus(orderId: string) {
  await ensureWholesalePaymentSchemaReady();
  const [order] = await db
    .select()
    .from(wholesaleOrdersTable)
    .where(eq(wholesaleOrdersTable.id, orderId));
  if (!order?.stripeInvoiceId) return order ?? null;

  const stripe = await getUncachableStripeClient();
  const invoice = await stripe.invoices.retrieve(order.stripeInvoiceId);
  return persistInvoiceFields(order.id, invoice);
}

export async function syncWholesaleInvoiceStatuses(orderIds: string[]) {
  const updates: Record<string, WholesaleOrder> = {};
  const uniqueIds = [...new Set(orderIds.filter(Boolean))];
  for (const orderId of uniqueIds) {
    try {
      const updated = await syncWholesaleInvoiceStatus(orderId);
      if (updated) updates[orderId] = updated;
    } catch {
      // Keep the live order visible even if Stripe sync has a hiccup.
    }
  }
  return updates;
}
