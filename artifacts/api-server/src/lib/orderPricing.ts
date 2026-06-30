import { db, productsTable, productVariantsTable, productOptionsTable, storeSettingsTable } from '@workspace/db';
import { inArray, eq } from 'drizzle-orm';

const BUILD_A_BOX_SIZES_KEY = 'build_a_box_sizes';

type BuildABoxSizeConfig = { size: number; label: string; priceCents: number };

// ---------------------------------------------------------------------------
// Short-lived module-level cache for build-a-box config.
// The sizes setting and product surcharges are quasi-static; caching them for
// 15 s eliminates redundant DB round-trips when computeOrderTotal is called
// multiple times within a single checkout flow (prepareRetailCheckout calls it
// 2-3× per payment intent creation).
// ---------------------------------------------------------------------------
let _babSizesCache: { data: BuildABoxSizeConfig[]; expiresAt: number } | null = null;
let _babSurchargeCache: { data: Map<string, number>; expiresAt: number } | null = null;
const BAB_CACHE_TTL_MS = 15_000;

async function getBuildABoxSizes(): Promise<BuildABoxSizeConfig[]> {
  const now = Date.now();
  if (_babSizesCache && _babSizesCache.expiresAt > now) return _babSizesCache.data;
  const [row] = await db.select().from(storeSettingsTable).where(eq(storeSettingsTable.key, BUILD_A_BOX_SIZES_KEY));
  const data: BuildABoxSizeConfig[] = row ? JSON.parse(row.value) : [];
  _babSizesCache = { data, expiresAt: now + BAB_CACHE_TTL_MS };
  return data;
}

async function getBuildABoxSurchargeMap(cookieIds: string[]): Promise<Map<string, number>> {
  const now = Date.now();
  // Return the cached full surcharge map if still warm; the map covers all products.
  if (_babSurchargeCache && _babSurchargeCache.expiresAt > now) return _babSurchargeCache.data;
  // Fetch ALL products that have a surcharge (small table scan, avoids per-cart queries).
  const rows = await db.select({ id: productsTable.id, surchargeCents: productsTable.buildABoxSurchargeCents })
    .from(productsTable);
  const data = new Map(rows.map(p => [p.id, p.surchargeCents ?? 0]));
  _babSurchargeCache = { data, expiresAt: now + BAB_CACHE_TTL_MS };
  return data;
}

/** Call this to invalidate the cache after director updates build-a-box config or surcharges. */
export function invalidateBuildABoxCache(): void {
  _babSizesCache = null;
  _babSurchargeCache = null;
}

/**
 * Synchronous price computation for a single build-a-box item.
 * All DB data is pre-fetched once per computeOrderTotal call and passed in.
 */
function computeBuildABoxPriceSync(
  size: number,
  selectedOptions: { optionId?: string; groupId?: string; priceAdjustmentCents?: number }[],
  sizes: BuildABoxSizeConfig[],
  cookieSurchargeMap: Map<string, number>,
): number {
  const sizeConfig = sizes.find(s => s.size === size);
  if (!sizeConfig) throw new Error(`Build a Box size "${size}" is not configured`);

  let surchargeCents = 0;
  for (const opt of selectedOptions) {
    if (opt.groupId !== 'box-contents' || !opt.optionId) continue;
    const dbSurcharge = cookieSurchargeMap.get(opt.optionId) ?? 0;
    const clientAdj = opt.priceAdjustmentCents ?? 0;
    const qty = dbSurcharge > 0 ? Math.round(clientAdj / dbSurcharge) : 0;
    surchargeCents += qty * dbSurcharge;
  }

  return sizeConfig.priceCents + surchargeCents;
}

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
 * Pass deliveryFeeCents from getRetailDeliverySettings() so the configured fee governs all charges.
 */
export async function computeOrderTotal(
  items: OrderItemInput[],
  orderType: 'pickup' | 'delivery',
  discountCents = 0,
  paymentMethod: PaymentMethod = 'card',
  deliveryFeeCents = DELIVERY_FEE_CENTS,
): Promise<ComputedOrderTotal> {
  if (!items?.length) throw new Error('No items provided');

  const productIds = [...new Set(items.map(i => i.productId))];
  const variantIds = [...new Set(items.flatMap(i => (i.variantId ? [i.variantId] : [])))];
  const optionIds  = [...new Set(
    items.flatMap(i => (i.selectedOptions ?? []).map(o => o.optionId).filter(Boolean) as string[]),
  )];

  // Detect build-a-box items upfront so we can fetch their config in parallel.
  const hasBuildABox = items.some(i => !i.isFreeReward && /^build-a-box-\d+$/.test(i.productId));

  // Collect all cookie product IDs referenced by build-a-box selectedOptions.
  const allCookieIds = hasBuildABox
    ? [...new Set(
        items
          .filter(i => !i.isFreeReward && /^build-a-box-\d+$/.test(i.productId))
          .flatMap(i => (i.selectedOptions ?? [])
            .filter(o => o.groupId === 'box-contents' && o.optionId)
            .map(o => o.optionId as string)),
      )]
    : [];

  // All DB fetches run in parallel; build-a-box config uses a 15s module cache
  // so repeated calls within the same checkout flow (prepareRetailCheckout calls
  // computeOrderTotal 2-3×) hit the cache instead of the DB every time.
  const [products, variants, options, buildABoxSizes, cookieSurchargeMap] = await Promise.all([
    productIds.length
      ? db.select().from(productsTable).where(inArray(productsTable.id, productIds))
      : Promise.resolve([]),
    variantIds.length
      ? db.select().from(productVariantsTable).where(inArray(productVariantsTable.id, variantIds))
      : Promise.resolve([]),
    optionIds.length
      ? db.select().from(productOptionsTable).where(inArray(productOptionsTable.id, optionIds))
      : Promise.resolve([]),
    hasBuildABox ? getBuildABoxSizes() : Promise.resolve<BuildABoxSizeConfig[]>([]),
    hasBuildABox ? getBuildABoxSurchargeMap(allCookieIds) : Promise.resolve(new Map<string, number>()),
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

    // Build-a-box virtual products (productId = "build-a-box-N") bypass the catalog.
    // Uses pre-fetched sizes + surcharge map — no additional DB queries here.
    const boxSizeMatch = /^build-a-box-(\d+)$/.exec(item.productId);
    if (boxSizeMatch) {
      const size = parseInt(boxSizeMatch[1], 10);
      const unitCents = computeBuildABoxPriceSync(size, item.selectedOptions ?? [], buildABoxSizes, cookieSurchargeMap);
      const qty = Math.max(1, Math.floor(item.quantity));
      const lineCents = unitCents * qty;
      subtotalCents += lineCents;
      itemizedCents.push({ productId: item.productId, variantId: null, unitCents, quantity: qty, lineCents });
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

  const deliveryFee = orderType === 'delivery' ? deliveryFeeCents : 0;
  const base = subtotalCents + deliveryFee;
  const stripeFeeCents = paymentMethod === 'pay_at_pickup' ? 0 : estimateStripeFeeCents(base);
  const totalBeforeDiscount = base + stripeFeeCents;
  const clampedDiscount = Math.min(Math.max(0, discountCents), totalBeforeDiscount);
  const totalCents = Math.max(0, totalBeforeDiscount - clampedDiscount);

  return { subtotalCents, deliveryFeeCents: deliveryFee, stripeFeeCents, discountCents: clampedDiscount, totalCents, itemizedCents };
}
