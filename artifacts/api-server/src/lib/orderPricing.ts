import { db, productsTable, productVariantsTable, productOptionsTable } from '@workspace/db';
import { inArray } from 'drizzle-orm';

export const DELIVERY_FEE_CENTS = 1200;
export const SURCHARGE_RATE = 0.02;

export interface OrderItemInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  selectedOptions?: { optionId?: string; groupId?: string; priceAdjustmentCents?: number }[];
}

export interface ComputedOrderTotal {
  subtotalCents: number;
  deliveryFeeCents: number;
  surchargeCents: number;
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

/**
 * Compute an order's authoritative total from server-side product pricing.
 * Always use this instead of trusting any client-supplied totalCents.
 */
export async function computeOrderTotal(
  items: OrderItemInput[],
  orderType: 'pickup' | 'delivery',
  discountCents = 0,
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
  const surchargeCents = Math.round(base * SURCHARGE_RATE);
  const totalBeforeDiscount = base + surchargeCents;
  const clampedDiscount = Math.min(Math.max(0, discountCents), totalBeforeDiscount);
  const totalCents = Math.max(0, totalBeforeDiscount - clampedDiscount);

  return { subtotalCents, deliveryFeeCents, surchargeCents, discountCents: clampedDiscount, totalCents, itemizedCents };
}
