import { db, claimedRewardsTable, customerProfilesTable, loyaltyRewardsTable, productsTable } from '@workspace/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { computeOrderTotal, type OrderItemInput, type PaymentMethod } from './orderPricing.js';
import { validateDiscountCode } from './discountUtils.js';
import { LOYALTY_POINT_VALUE_CENTS } from './loyaltyIdentity.js';

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
  let claimedRewardDiscountCents = 0;
  let claimedRewardData: PreparedClaimedReward | null = null;

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
      })
      .from(loyaltyRewardsTable)
      .where(eq(loyaltyRewardsTable.id, claimedRow.rewardId));

    const rewardType = rewardRow?.rewardType ?? 'item_reward';
    const linkedProductId = rewardRow?.linkedProductId ?? null;
    const rewardName = rewardRow?.name ?? 'Free Reward';

    if (rewardType === 'money_voucher') {
      claimedRewardDiscountCents = claimedRow.voucherValueCents ?? 0;
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

    let cheapestIdx = -1;
    let cheapestPrice = Infinity;
    for (let i = 0; i < items.length; i++) {
      const cp = coffeeProductMap.get(items[i]!.productId);
      if (!cp || items[i]!.isFreeReward) continue;
      const price = cp.salePriceCents ?? cp.priceCents;
      if (price < cheapestPrice) {
        cheapestPrice = price;
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
      items[cheapestIdx] = { ...target, quantity: targetQty - 1 };
      items.push({ productId: target.productId, quantity: 1, isFreeReward: true, freeCoffeeItem: true, selectedOptions: [] } as RetailCheckoutItem & { freeCoffeeItem: boolean });
    }
  }

  let discountCodeAmountCents = 0;
  let validatedDiscountCodeId: string | null = null;
  let validatedDiscountCode: string | null = null;

  const resolvedOrderType: 'pickup' | 'delivery' = input.orderType === 'delivery' ? 'delivery' : 'pickup';
  const resolvedPaymentMethod: PaymentMethod = input.paymentMethod === 'pay_at_pickup' ? 'pay_at_pickup' : 'card';

  if (input.discountCode && typeof input.discountCode === 'string') {
    const base = await computeOrderTotal(items, resolvedOrderType, 0, 'card');
    const validated = await validateDiscountCode(
      input.discountCode,
      input.userId,
      input.userRole,
      base.subtotalCents,
      resolvedOrderType,
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
  };
}
