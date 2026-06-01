import { db, ordersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { getUncachableStripeClient } from '../stripeClient.js';

type RefundLogger = {
  info?: (payload: unknown, message?: string) => void;
  warn?: (payload: unknown, message?: string) => void;
};

type RefundResult = 'skipped' | 'already_refunded' | 'refunded';

type RefundOrderStripePaymentArgs = {
  orderId: string;
  stripePaymentIntentId: string | null;
  stripePaymentStatus: string | null;
  log?: RefundLogger;
};

async function markOrderRefunded(orderId: string) {
  await db
    .update(ordersTable)
    .set({
      stripePaymentStatus: 'refunded',
      updatedAt: new Date(),
    })
    .where(eq(ordersTable.id, orderId));
}

export async function refundOrderStripePayment({
  orderId,
  stripePaymentIntentId,
  stripePaymentStatus,
  log,
}: RefundOrderStripePaymentArgs): Promise<RefundResult> {
  if (!stripePaymentIntentId) {
    log?.info?.({ orderId }, 'Skipping Stripe refund because order has no payment intent');
    return 'skipped';
  }

  const normalizedStatus = (stripePaymentStatus ?? 'pending').toLowerCase();
  if (normalizedStatus === 'pay_at_pickup' || normalizedStatus === 'free') {
    log?.info?.({ orderId, stripePaymentStatus }, 'Skipping Stripe refund because order was not paid online');
    return 'skipped';
  }

  if (normalizedStatus === 'refunded') {
    return 'already_refunded';
  }

  const stripe = await getUncachableStripeClient();
  const existingRefunds = await stripe.refunds.list({
    payment_intent: stripePaymentIntentId,
    limit: 1,
  });

  if (existingRefunds.data.length > 0) {
    await markOrderRefunded(orderId);
    log?.info?.({ orderId, paymentIntentId: stripePaymentIntentId }, 'Stripe refund already exists for order');
    return 'already_refunded';
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
  if (paymentIntent.status !== 'succeeded') {
    log?.warn?.(
      { orderId, paymentIntentId: stripePaymentIntentId, paymentIntentStatus: paymentIntent.status },
      'Skipping Stripe refund because payment intent is not in a refundable state',
    );
    return 'skipped';
  }

  await stripe.refunds.create({ payment_intent: stripePaymentIntentId });
  await markOrderRefunded(orderId);
  log?.info?.({ orderId, paymentIntentId: stripePaymentIntentId }, 'Stripe refund issued for order');
  return 'refunded';
}

export async function refundStripePaymentIntentAmount({
  paymentIntentId,
  amountCents,
  log,
}: {
  paymentIntentId: string;
  amountCents: number;
  log?: RefundLogger;
}) {
  if (!paymentIntentId || amountCents <= 0) return 'skipped' as const;

  const stripe = await getUncachableStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.status !== 'succeeded') {
    log?.warn?.(
      { paymentIntentId, paymentIntentStatus: paymentIntent.status, amountCents },
      'Skipping partial refund because payment intent is not refundable',
    );
    return 'skipped' as const;
  }

  await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amountCents,
  });
  log?.info?.({ paymentIntentId, amountCents }, 'Issued partial Stripe refund');
  return 'refunded' as const;
}
