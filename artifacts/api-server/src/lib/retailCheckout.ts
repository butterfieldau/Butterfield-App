import { db, claimedRewardsTable, customerProfilesTable, loyaltyRewardsTable, productsTable, productVariantsTable, productOptionsTable } from '@workspace/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { computeOrderTotal, type OrderItemInput, type PaymentMethod } from './orderPricing.js';
import { validateDiscountCode } from './discountUtils.js';
import { LOYALTY_POINT_VALUE_CENTS } from './loyaltyIdentity.js';
import { getRetailDeliverySettings } from './retailDelivery.js';

export type RetailCheckoutItem = OrderItemInput & {
  name?: string;
  productName?: string;
};

export interface RetailCheckoutPreparationInput {
  userId: string;
  userRole: string;
  rawItems: unknown;
  orderType?: unknown;
  paymentMethod?: unknown;
  discountCode?: unknown;
  claimedRewardId?: unknown;
  loyaltyPointsUsed?: unknown;
  markClaimAppliedToCart?: boolean;
  useFreeCoffeeReward?: boolean;
}

export interface PreparedClaimedReward {
  id: string;
  rewardType: string;
  rewardName: string;
  linkedProductId: string | null;
  voucherValueCents: number | null;
}

export interface RetailCheckoutPreparationResult {
  items: RetailCheckoutItem[];
  resolvedOrderType: 'pickup' | 'delivery';
  resolvedPaymentMethod: PaymentMethod;
  claimedLoyaltyPoints: number;
  discountCodeAmountCents: number;
  claimedRewardDiscountCents: number;
  loyaltyDiscountCents: number;
  totalDiscountCents: number;
  validatedDiscountCodeId: string | null;
  validatedDiscountCode: string | null;
  claimedRewardData: PreparedClaimedReward | null;
  authorativeTotalCents: number;
  authorativeDiscountCents: number;
  computed: Awaited<ReturnType<typeof computeOrderTotal>>;
  freeCoffeeRewardUsed: boolean;
  freeCoffeeDiscountCents: number;
  birthdayCookieDiscountCents: number;
}

export function stripClientRewardFlags(rawItems: unknown): RetailCheckoutItem[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((item) => {
    if (!item || typeof item !== 'object') return item as unknown as RetailCheckoutItem;
    const { isFreeReward: _a, freeCoffeeItem: _b, ...rest } = item as Record<string, unknown>;
    return rest as unknown as RetailCheckoutItem;
  });
}

export async function prepareRetailCheckout(input: RetailCheckoutPreparationInput): Promise<RetailCheckoutPreparationResult> {
  const items = stripClientRewardFlags(input.rawItems);
  let claimedLoyaltyPoints = Math.max(0, Math.floor(Number(input.loyaltyPointsUsed ?? 0)));

  // Fetch authoritative delivery fee once — this governs all pricing, not the client-supplied value.
  const deliveryConfig = await getRetailDeliverySettings();
  const configuredDeliveryFeeCents = deliveryConfig.feeCents;
  let claimedRewardDiscountCents = 0;
  let claimedRewardData: PreparedClaimedReward | null = null;
  let birthdayCookieDiscountCents = 0;

  if (claimedLoyaltyPoints > 0) {
    const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, input.userId));
    if (!profile || profile.loyaltyPoints < claimedLoyaltyPoints) {
      throw new Error('Insufficient loyalty points');
    }
  }

  if (input.claimedRewardId && typeof input.claimedRewardId === 'string') {
    const [claimedRow] = await db
      .select({
        id: claimedRewardsTable.id,
        userId: claimedRewardsTable.userId,
        status: claimedRewardsTable.status,
        voucherValueCents: claimedRewardsTable.voucherValueCents,
        rewardId: claimedRewardsTable.rewardId,
        expiresAt: claimedRewardsTable.expiresAt,
      })
      .from(claimedRewardsTable)
      .where(and(
        eq(claimedRewardsTable.id, input.claimedRewardId),
        eq(claimedRewardsTable.userId, input.userId),
        inArray(claimedRewardsTable.status, ['available', 'applied_to_cart']),
      ));

    if (!claimedRow) {
      throw new Error('Claimed reward not found or already used');
    }

    if (claimedRow.expiresAt && claimedRow.expiresAt < new Date()) {
      await db.execute(
        sql`UPDATE claimed_rewards SET status='expired' WHERE id=${claimedRow.id} AND user_id=${input.userId} AND status IN ('available','applied_to_cart')`,
      );
      throw new Error('This reward has expired');
    }

    const [rewardRow] = await db
      .select({
        rewardType: loyaltyRewardsTable.rewardType,
        linkedProductId: loyaltyRewardsTable.linkedProductId,
        name: loyaltyRewardsTable.name,
        tierRestriction: loyaltyRewardsTable.tierRestriction,
        minOrderValueCents: loyaltyRewardsTable.minOrderValueCents,
      })
      .from(loyaltyRewardsTable)
      .where(eq(loyaltyRewardsTable.id, claimedRow.rewardId));

    // Enforce tier restriction at checkout (double-check in addition to claim-time check)
    if (rewardRow?.tierRestriction) {
      try {
        const allowedTiers: string[] = JSON.parse(rewardRow.tierRestriction);
        if (allowedTiers.length > 0) {
          const [customerProfile] = await db
            .select({ loyaltyTier: customerProfilesTable.loyaltyTier })
            .from(customerProfilesTable)
            .where(eq(customerProfilesTable.userId, input.userId));
          const customerTier = customerProfile?.loyaltyTier ?? 'blue';
          if (!allowedTiers.includes(customerTier)) {
            throw new Error(`This reward is only available for ${allowedTiers.join(' / ')} tier members`);
          }
        }
      } catch (e) {
        if ((e as Error).message.startsWith('This reward')) throw e;
      }
    }

    // Enforce minimum order value — compute item subtotal server-side
    if (rewardRow?.minOrderValueCents && rewardRow.minOrderValueCents > 0) {
      const resolvedType: 'pickup' | 'delivery' = input.orderType === 'delivery' ? 'delivery' : 'pickup';
      const baseComputed = await computeOrderTotal(items, resolvedType, 0, 'card', configuredDeliveryFeeCents);
      if (baseComputed.subtotalCents < rewardRow.minOrderValueCents) {
        throw new Error(
          `This reward requires a minimum order of $${(rewardRow.minOrderValueCents / 100).toFixed(2)}. ` +
          `Your cart is $${(baseComputed.subtotalCents / 100).toFixed(2)}.`,
        );
      }
    }

    const rewardType = rewardRow?.rewardType ?? 'item_reward';
    const linkedProductId = rewardRow?.linkedProductId ?? null;
    const rewardName = rewardRow?.name ?? 'Free Reward';

    if (rewardType === 'money_voucher') {
      claimedRewardDiscountCents = claimedRow.voucherValueCents ?? 0;
    } else if (rewardType === 'birthday_cookie' || rewardType === 'cookie_any') {
      // Apply 100% off the cheapest cookie in the cart (server-side pricing only)
      const productIds = [...new Set(items.map((i) => i.productId))];
      const products = productIds.length > 0
        ? await db.select({
            id: productsTable.id,
            category: productsTable.category,
            priceCents: productsTable.priceCents,
            salePriceCents: productsTable.salePriceCents,
          }).from(productsTable).where(inArray(productsTable.id, productIds))
        : [];

      const cookieCategories = new Set(['cookies', 'cookie-frappes']);
      const cookieProductMap = new Map(
        products
          .filter((p) => cookieCategories.has(String(p.category ?? '').toLowerCase()))
          .map((p) => [p.id, p]),
      );

      if (cookieProductMap.size === 0) {
        throw new Error('No cookie items in your order to apply the Birthday Cookie reward');
      }

      {
        const cookieItems = items.filter((i) => cookieProductMap.has(i.productId) && !i.isFreeReward);
        const cookieVariantIds = [...new Set(cookieItems.flatMap((i) => i.variantId ? [i.variantId] : []))];
        const cookieOptionIds  = [...new Set(
          cookieItems.flatMap((i) => (i.selectedOptions ?? []).map((o) => o.optionId).filter(Boolean) as string[]),
        )];

        const [cookieVariants, cookieOptions] = await Promise.all([
          cookieVariantIds.length
            ? db.select().from(productVariantsTable).where(inArray(productVariantsTable.id, cookieVariantIds))
            : Promise.resolve([]),
          cookieOptionIds.length
            ? db.select().from(productOptionsTable).where(inArray(productOptionsTable.id, cookieOptionIds))
            : Promise.resolve([]),
        ]);
        const variantMap = new Map(cookieVariants.map((v) => [v.id, v]));
        const optionMap  = new Map(cookieOptions.map((o) => [o.id, o]));

        let cheapestIdx = -1;
        let cheapestPrice = Infinity;
        for (let i = 0; i < items.length; i++) {
          const item = items[i]!;
          const cp = cookieProductMap.get(item.productId);
          if (!cp || item.isFreeReward) continue;
          let unitCents: number;
          if (item.variantId) {
            const variant = variantMap.get(item.variantId);
            unitCents = variant ? variant.priceCents : (cp.salePriceCents ?? cp.priceCents ?? 0);
          } else {
            unitCents = cp.salePriceCents ?? cp.priceCents ?? 0;
          }
          for (const sel of (item.selectedOptions ?? [])) {
            if (sel.optionId) {
              const opt = optionMap.get(sel.optionId);
              if (opt) unitCents += opt.priceAdjustmentCents;
            }
          }
          if (unitCents < cheapestPrice) {
            cheapestPrice = unitCents;
            cheapestIdx = i;
          }
        }

        if (cheapestIdx < 0) {
          throw new Error('No cookie items in your order to apply the Birthday Cookie reward');
        }

        birthdayCookieDiscountCents = cheapestPrice;
        const target = items[cheapestIdx]!;
        const targetQty = Math.max(1, Math.floor(Number(target.quantity ?? 1)));
        if (targetQty === 1) {
          items[cheapestIdx] = { ...target, isFreeReward: true };
        } else {
          items[cheapestIdx] = { ...target, quantity: targetQty - 1 };
          items.push({ ...target, quantity: 1, isFreeReward: true });
        }
      }
    } else if (rewardType === 'item_reward') {
      if (linkedProductId) {
        const existingIdx = items.findIndex((item) => item.productId === linkedProductId && !item.isFreeReward);
        if (existingIdx >= 0) {
          const existingQty = Math.max(1, Math.floor(Number(items[existingIdx]?.quantity ?? 1)));
          if (existingQty === 1) {
            items[existingIdx] = { ...items[existingIdx], name: items[existingIdx]?.name ?? rewardName, isFreeReward: true };
          } else {
            items[existingIdx] = { ...items[existingIdx], quantity: existingQty - 1 };
            items.push({ productId: linkedProductId, name: rewardName, quantity: 1, isFreeReward: true, selectedOptions: [] });
          }
        } else {
          items.push({ productId: linkedProductId, name: rewardName, quantity: 1, isFreeReward: true, selectedOptions: [] });
        }
      } else {
        items.push({ productId: `reward:${claimedRow.id}`, name: rewardName, quantity: 1, isFreeReward: true, selectedOptions: [] });
      }
    }

    if (input.markClaimAppliedToCart && claimedRow.status === 'available') {
      await db.execute(
        sql`UPDATE claimed_rewards SET status='applied_to_cart' WHERE id=${claimedRow.id} AND user_id=${input.userId} AND status='available'`,
      );
    }

    claimedRewardData = {
      id: claimedRow.id,
      rewardType,
      rewardName,
      linkedProductId,
      voucherValueCents: claimedRow.voucherValueCents,
    };
  }

  if (!items.length) {
    throw new Error('Items are required');
  }

  let freeCoffeeRewardUsed = false;
  let freeCoffeeDiscountCents = 0;

  if (input.useFreeCoffeeReward === true) {
    const [profile] = await db.select({
      freeCoffeeRewards: customerProfilesTable.freeCoffeeRewards,
    }).from(customerProfilesTable).where(eq(customerProfilesTable.userId, input.userId));

    if (!profile || (profile.freeCoffeeRewards ?? 0) < 1) {
      throw new Error('No free coffee rewards available');
    }

    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = productIds.length > 0
      ? await db.select({
          id: productsTable.id,
          category: productsTable.category,
          priceCents: productsTable.priceCents,
          salePriceCents: productsTable.salePriceCents,
        }).from(productsTable).where(inArray(productsTable.id, productIds))
      : [];

    const coffeeProductMap = new Map(
      products
        .filter((p) => String(p.category ?? '').toLowerCase() === 'coffee')
        .map((p) => [p.id, p]),
    );

    if (coffeeProductMap.size === 0) {
      throw new Error('No coffee items in your order to apply the free coffee reward');
    }

    // Compute authoritative unit prices for coffee items from server data only —
    // never trust client-supplied unitPriceCents for reward-selection decisions.
    const coffeeItems = items.filter((i) => coffeeProductMap.has(i.productId) && !i.isFreeReward);
    const coffeeVariantIds = [...new Set(coffeeItems.flatMap((i) => i.variantId ? [i.variantId] : []))];
    const coffeeOptionIds  = [...new Set(
      coffeeItems.flatMap((i) => (i.selectedOptions ?? []).map((o) => o.optionId).filter(Boolean) as string[]),
    )];

    const [coffeeVariants, coffeeOptions] = await Promise.all([
      coffeeVariantIds.length
        ? db.select().from(productVariantsTable).where(inArray(productVariantsTable.id, coffeeVariantIds))
        : Promise.resolve([]),
      coffeeOptionIds.length
        ? db.select().from(productOptionsTable).where(inArray(productOptionsTable.id, coffeeOptionIds))
        : Promise.resolve([]),
    ]);
    const variantMap = new Map(coffeeVariants.map((v) => [v.id, v]));
    const optionMap  = new Map(coffeeOptions.map((o) => [o.id, o]));

    let cheapestIdx = -1;
    let cheapestPrice = Infinity;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const cp = coffeeProductMap.get(item.productId);
      if (!cp || item.isFreeReward) continue;
      // Authoritative base price: variant price if variant present, else product price.
      let unitCents: number;
      if (item.variantId) {
        const variant = variantMap.get(item.variantId);
        unitCents = variant ? variant.priceCents : (cp.salePriceCents ?? cp.priceCents ?? 0);
      } else {
        unitCents = cp.salePriceCents ?? cp.priceCents ?? 0;
      }
      // Add option price adjustments from server-side data only.
      for (const sel of (item.selectedOptions ?? [])) {
        if (sel.optionId) {
          const opt = optionMap.get(sel.optionId);
          if (opt) unitCents += opt.priceAdjustmentCents;
        }
      }
      if (unitCents < cheapestPrice) {
        cheapestPrice = unitCents;
        cheapestIdx = i;
      }
    }

    if (cheapestIdx < 0) {
      throw new Error('No coffee items in your order to apply the free coffee reward');
    }

    freeCoffeeDiscountCents = cheapestPrice;
    freeCoffeeRewardUsed = true;

    const target = items[cheapestIdx]!;
    const targetQty = Math.max(1, Math.floor(Number(target.quantity ?? 1)));
    if (targetQty === 1) {
      items[cheapestIdx] = { ...target, isFreeReward: true, freeCoffeeItem: true } as RetailCheckoutItem & { freeCoffeeItem: boolean };
    } else {
      // Reduce the original line by one unit, then push a full clone for the free unit.
      // Cloning preserves variantId, selectedOptions, variantName, etc. so kitchen prep is unchanged.
      items[cheapestIdx] = { ...target, quantity: targetQty - 1 };
      items.push({ ...target, quantity: 1, isFreeReward: true, freeCoffeeItem: true } as RetailCheckoutItem & { freeCoffeeItem: boolean });
    }
  }

  let discountCodeAmountCents = 0;
  let validatedDiscountCodeId: string | null = null;
  let validatedDiscountCode: string | null = null;

  const resolvedOrderType: 'pickup' | 'delivery' = input.orderType === 'delivery' ? 'delivery' : 'pickup';
  const resolvedPaymentMethod: PaymentMethod = input.paymentMethod === 'pay_at_pickup' ? 'pay_at_pickup' : 'card';

  if (input.discountCode && typeof input.discountCode === 'string') {
    const base = await computeOrderTotal(items, resolvedOrderType, 0, 'card', configuredDeliveryFeeCents);
    const validated = await validateDiscountCode(
      input.discountCode,
      input.userId,
      input.userRole,
      base.subtotalCents,
      resolvedOrderType,
      configuredDeliveryFeeCents,
    );
    discountCodeAmountCents = validated.discountAmountCents;
    validatedDiscountCodeId = validated.id;
    validatedDiscountCode = validated.code;
  }

  const baseDiscountCents = discountCodeAmountCents + claimedRewardDiscountCents;
  const previewWithoutPoints = await computeOrderTotal(
    items,
    resolvedOrderType,
    baseDiscountCents,
    resolvedPaymentMethod,
    configuredDeliveryFeeCents,
  );

  claimedLoyaltyPoints = Math.min(
    claimedLoyaltyPoints,
    Math.floor(previewWithoutPoints.totalCents / LOYALTY_POINT_VALUE_CENTS),
  );

  const loyaltyDiscountCents = claimedLoyaltyPoints * LOYALTY_POINT_VALUE_CENTS;
  const totalDiscountCents = loyaltyDiscountCents + baseDiscountCents;
  const computed = await computeOrderTotal(
    items,
    resolvedOrderType,
    totalDiscountCents,
    resolvedPaymentMethod,
    configuredDeliveryFeeCents,
  );

  return {
    items,
    resolvedOrderType,
    resolvedPaymentMethod,
    claimedLoyaltyPoints,
    discountCodeAmountCents,
    claimedRewardDiscountCents,
    loyaltyDiscountCents,
    totalDiscountCents,
    validatedDiscountCodeId,
    validatedDiscountCode,
    claimedRewardData,
    authorativeTotalCents: computed.totalCents,
    authorativeDiscountCents: computed.discountCents,
    computed,
    freeCoffeeRewardUsed,
    freeCoffeeDiscountCents,
    birthdayCookieDiscountCents,
  };
}
