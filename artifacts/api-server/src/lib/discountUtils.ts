import { db } from '@workspace/db';
import { discountCodesTable, discountCodeUsagesTable, ordersTable } from '@workspace/db';
import { eq, and, count } from 'drizzle-orm';
import { DELIVERY_FEE_CENTS } from './orderPricing.js';

export interface ValidatedDiscount {
  id: string;
  code: string;
  discountAmountCents: number;
  discountType: 'percentage' | 'fixed_amount' | 'free_delivery';
  description: string | null;
}

export async function validateDiscountCode(
  code: string,
  userId: string,
  userRole: string,
  subtotalCents: number,
  orderType: 'pickup' | 'delivery',
): Promise<ValidatedDiscount> {
  const [dc] = await db
    .select()
    .from(discountCodesTable)
    .where(eq(discountCodesTable.code, code.toUpperCase().trim()));

  if (!dc) throw new Error('Invalid discount code.');
  if (!dc.isActive) throw new Error('This discount code is not active.');

  const now = new Date();
  if (dc.startDate && dc.startDate > now) throw new Error('This discount code is not yet valid.');
  if (dc.expiresAt && dc.expiresAt < now) throw new Error('This discount code has expired.');

  if (dc.usageLimitTotal !== null && dc.usageCount >= dc.usageLimitTotal) {
    throw new Error('This discount code has reached its usage limit.');
  }

  const [usageRow] = await db
    .select({ total: count() })
    .from(discountCodeUsagesTable)
    .where(and(
      eq(discountCodeUsagesTable.discountCodeId, dc.id),
      eq(discountCodeUsagesTable.userId, userId),
    ));
  if (usageRow && Number(usageRow.total) >= dc.usageLimitPerCustomer) {
    throw new Error('You have already used this discount code the maximum number of times.');
  }

  if (subtotalCents < dc.minOrderCents) {
    const minStr = (dc.minOrderCents / 100).toFixed(2);
    throw new Error(`Minimum order of AUD ${minStr} required for this code.`);
  }

  if (dc.orderTypeEligibility !== 'both' && dc.orderTypeEligibility !== orderType) {
    throw new Error(`This code is only valid for ${dc.orderTypeEligibility} orders.`);
  }

  if (dc.customerEligibility === 'first_order') {
    const [existingOrder] = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(eq(ordersTable.userId, userId));
    if (existingOrder) throw new Error('This code is only valid for first-time orders.');
  }

  if (userRole === 'wholesale' && !dc.wholesaleEligible) {
    throw new Error('This code is not available for wholesale accounts.');
  }

  let discountAmountCents: number;
  if (dc.discountType === 'percentage') {
    discountAmountCents = Math.round(subtotalCents * (dc.discountValue / 100));
    if (dc.maxDiscountCents) {
      discountAmountCents = Math.min(discountAmountCents, dc.maxDiscountCents);
    }
  } else if (dc.discountType === 'fixed_amount') {
    discountAmountCents = dc.discountValue;
  } else if (dc.discountType === 'free_delivery') {
    if (orderType !== 'delivery') throw new Error('This code is only valid for delivery orders.');
    discountAmountCents = DELIVERY_FEE_CENTS;
  } else {
    discountAmountCents = 0;
  }

  discountAmountCents = Math.min(discountAmountCents, subtotalCents);

  return {
    id: dc.id,
    code: dc.code,
    discountAmountCents,
    discountType: dc.discountType as 'percentage' | 'fixed_amount' | 'free_delivery',
    description: dc.description,
  };
}
