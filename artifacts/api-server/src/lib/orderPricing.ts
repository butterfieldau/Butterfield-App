import { db, productsTable, productVariantsTable, productOptionsTable } from '@workspace/db';
import { inArray } from 'drizzle-orm';

export const DELIVERY_FEE_CENTS = 1200;
export const STRIPE_CARD_RATE = 0.017;
export const STRIPE_CARD_FIXED_FEE_CENTS = 30;
export const STRIPE_WALLET_RATE = 0.017;
export const STRIPE_WALLET_FIXED_FEE_CENTS = 30;

export interface OrderItemInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  selectedOptions?: { optionId?: string; groupId?: string; priceAdjustmentCents?: number }[];
  /** When true, this item is a free reward — skip catalog price lookup and use 0. */
  isFreeReward?: boolean;
  unitPriceCents?: number;
}

export interface ComputedOrderTotal {
  subtotalCents: number;
  deliveryFeeCents: number;
  stripeFeeCents: number;
  discountCents: number;
  totalCents: number;
  itemizedCents: {
    productId: string;
    variantId?: string | null;
    unitCents: number;
    quantity: number;
    lineCents: number;
  }[];
}

export type PaymentMethod = 'card' | 'pay_at_pickup';

export function estimateStripeFeeCents(amountCents: number): number {
  if (amountCents <= 0) return 0;
  return Math.max(0, Math.round(amountCents * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS);
}

/**
 * Compute an order's authoritative total from server-side product pricing.
 * Always use this instead of trusting any client-supplied totalCents.
 */
export async function computeOrderTotal(
  items: OrderItemInput[],
  orderType: 'pickup' | 'delivery',
  discountCents = 0,
  paymentMethod: PaymentMethod = 'card',
): Promise<ComputedOrderTotal> {
  if (!items?.length) throw new Error('No items provided');

  const productIds = [...new Set(items.map(i => i.productId))];
  const variantIds = [...new Set(items.flatMap(i => (i.variantId ? [i.variantId] : [])))];
  const optionIds  = [...new Set(
    items.flatMap(i => (i.selectedOptions ?? []).map(o => o.optionId).filter(Boolean) as string[]),
  )];

  const [products, variants, options] = await Promise.all([
    productIds.length
      ? db.select().from(productsTable).where(inArray(productsTable.id, productIds))
      : Promise.resolve([]),
    variantIds.length
      ? db.select().from(productVariantsTable).where(inArray(productVariantsTable.id, variantIds))
      : Promise.resolve([]),
    optionIds.length
      ? db.select().from(productOptionsTable).where(inArray(productOptionsTable.id, optionIds))
      : Promise.resolve([]),
  ]);

  const productMap = new Map(products.map(p => [p.id, p]));
  const variantMap = new Map(variants.map(v => [v.id, v]));
  const optionMap  = new Map(options.map(o => [o.id, o]));

  let subtotalCents = 0;
  const itemizedCents: ComputedOrderTotal['itemizedCents'] = [];

  for (const item of items) {
    // Free reward items bypass catalog pricing entirely
    if (item.isFreeReward) {
      const qty = Math.max(1, Math.floor(item.quantity));
      itemizedCents.push({ productId: item.productId, variantId: item.variantId, unitCents: 0, quantity: qty, lineCents: 0 });
      continue;
    }

    const product = productMap.get(item.productId);
    if (!product || !product.isActive) {
      throw new Error(`Product not found or unavailable: ${item.productId}`);
    }

    let unitCents: number;
    if (item.variantId) {
      const variant = variantMap.get(item.variantId);
      if (!variant || variant.productId !== item.productId) {
        throw new Error(`Variant not found or mismatched: ${item.variantId}`);
      }
      unitCents = variant.priceCents;
    } else {
      unitCents = product.salePriceCents ?? product.priceCents;
    }

    for (const sel of (item.selectedOptions ?? [])) {
      if (sel.optionId) {
        const opt = optionMap.get(sel.optionId);
        if (opt) unitCents += opt.priceAdjustmentCents;
      }
    }

    const qty = Math.max(1, Math.floor(item.quantity));
    const lineCents = unitCents * qty;
    subtotalCents += lineCents;
    itemizedCents.push({ productId: item.productId, variantId: item.variantId, unitCents, quantity: qty, lineCents });
  }

  const deliveryFeeCents = orderType === 'delivery' ? DELIVERY_FEE_CENTS : 0;
  const base = subtotalCents + deliveryFeeCents;
  const stripeFeeCents = paymentMethod === 'pay_at_pickup' ? 0 : estimateStripeFeeCents(base);
  const totalBeforeDiscount = base + stripeFeeCents;
  const clampedDiscount = Math.min(Math.max(0, discountCents), totalBeforeDiscount);
  const totalCents = Math.max(0, totalBeforeDiscount - clampedDiscount);

  return { subtotalCents, deliveryFeeCents, stripeFeeCents, discountCents: clampedDiscount, totalCents, itemizedCents };
}
