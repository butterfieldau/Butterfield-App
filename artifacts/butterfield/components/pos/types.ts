// ── Palette ──────────────────────────────────────────────────────────────────
export const BG       = '#F0F3F8';
export const WHITE    = '#FFFFFF';
export const BLUE     = '#1493FF';
export const CHERRY   = '#D20001';
export const DARK     = '#0F172A';
export const MID      = '#475569';
export const MUTED    = '#94A3B8';
export const BORDER   = '#E2E8F0';
export const TICKET   = '#FAFBFF';

export const CATEGORY_COLORS: Record<string, string> = {
  cookies:    '#F59E0B',
  coffee:     '#92400E',
  desserts:   '#EC4899',
  cakes:      '#F43F5E',
  sandwiches: '#10B981',
  drinks:     '#06B6D4',
  bundles:    '#8B5CF6',
  merch:      '#F97316',
  specials:   '#EF4444',
};

export const PRESET_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981',
  '#06B6D4', '#1493FF', '#8B5CF6', '#EC4899',
  '#92400E', '#0F766E', '#4F46E5', '#64748B',
];

export const CAT_COLORS_KEY           = 'pos_category_colors';
export const CAT_ORDER_KEY            = 'pos_category_order';
export const DISCOUNT_PRESETS_KEY     = 'pos_discount_presets';
export const HELD_TICKETS_KEY         = 'pos_held_tickets';
export const VOID_PIN_THRESHOLD_CENTS = 5_000;
export const STAMP_GOAL = 6;

export const AUD_DENOMS = [
  { label: '$100', cents: 10000 },
  { label: '$50',  cents: 5000  },
  { label: '$20',  cents: 2000  },
  { label: '$10',  cents: 1000  },
  { label: '$5',   cents: 500   },
  { label: '$2',   cents: 200   },
  { label: '$1',   cents: 100   },
  { label: '50¢',  cents: 50    },
  { label: '20¢',  cents: 20    },
  { label: '10¢',  cents: 10    },
  { label: '5¢',   cents: 5     },
];

export function getDefaultCatColor(cat: string, apiColor?: string | null): string {
  if (apiColor) return apiColor;
  const slug = cat.toLowerCase();
  if (CATEGORY_COLORS[slug]) return CATEGORY_COLORS[slug]!;
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash + slug.charCodeAt(i)) % PRESET_COLORS.length;
  return PRESET_COLORS[hash]!;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SelectedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjustmentCents: number;
}

export interface TicketItem {
  localId: string;
  productId: string;
  productName: string;
  category: string;
  variantId?: string | null;
  variantName?: string | null;
  variantPriceCents?: number;
  selectedOptions: SelectedOption[];
  quantity: number;
  unitPriceCents: number;
  notes: string;
  priceOverrideCents?: number;
}

export interface AttachedCustomerClaimedReward {
  id: string;
  rewardType: string;
  rewardName: string;
  voucherValueCents: number | null;
}

export interface AttachedCustomer {
  userId: string;
  name: string;
  email?: string;
  loyaltyPoints: number;
  stampCount: number;
  loyaltyTier: string;
  freeCoffeeRewards: number;
  birthday?: string | null;
  availableClaimedRewards: AttachedCustomerClaimedReward[];
}

export interface AppliedDiscount {
  type: 'code' | 'pct' | 'free_coffee' | 'claimed_reward';
  code?: string;
  codeId?: string;
  pct?: number;
  claimedRewardId?: string;
  amountCents: number;
  label: string;
}

export type OrderType = 'dine_in' | 'takeaway' | 'counter';

export interface Ticket {
  id: string;
  idempotencyKey: string;
  items: TicketItem[];
  customer: AttachedCustomer | null;
  orderType: OrderType;
  notes: string;
  appliedDiscount: AppliedDiscount | null;
  priceOverrideSupervisorPin?: string;
}

export interface ProductDetail {
  id: string;
  name: string;
  description?: string;
  priceCents?: number | null;
  salePriceCents?: number | null;
  category?: string;
  images?: string[];
  variants: { id: string; name: string; priceCents: number; sortOrder: number }[];
  optionGroups: {
    id: string; name: string; description?: string;
    selectionType: 'single' | 'multi';
    isRequired: boolean;
    options: { id: string; name: string; priceAdjustmentCents: number; isDefault: boolean }[];
  }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;

export function fmtTradingDate(yyyymmdd: string): string {
  if (!yyyymmdd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return yyyymmdd;
  const [y, m, d] = yyyymmdd.split('-');
  return `${d}/${m}/${y}`;
}
export const uuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
export const blankTicket = (): Ticket => ({ id: uuid(), idempotencyKey: uuid(), items: [], customer: null, orderType: 'counter', notes: '', appliedDiscount: null });

export function isBirthdayMonth(birthday?: string | null): boolean {
  if (!birthday) return false;
  const parts = birthday.split('-');
  if (parts.length < 2) return false;
  return parseInt(parts[1]!, 10) - 1 === new Date().getMonth();
}

export function ticketSubtotal(t: Ticket): number {
  return t.items.reduce((s, i) => s + (i.priceOverrideCents ?? i.unitPriceCents) * i.quantity, 0);
}

export function ticketTotal(t: Ticket): number {
  const sub = ticketSubtotal(t);
  const disc = t.appliedDiscount?.amountCents ?? 0;
  return Math.max(0, sub - disc);
}

import type { RegisterSessionReport } from '@/lib/api';

export function buildRegisterSummaryPrintLines(report: RegisterSessionReport): string[] {
  const s = report.summary;
  const closeMethod = report.closeMethod === 'auto' ? 'Auto Close' : 'Manual Close';
  const staffLine = report.closedByName ?? report.openedByName ?? 'Not recorded';
  const actualCash = s.actualCountedCashCents === null ? 'Not entered' : fmtCents(s.actualCountedCashCents);
  const variance = s.varianceCents === null ? 'Not calculated' : fmtCents(s.varianceCents);
  const notes = [report.closeNote, report.varianceNote].filter(Boolean).join(' | ');
  return [
    'Date\t' + fmtTradingDate(report.tradingDate),
    'Register\t' + report.registerName,
    'Location\t' + (report.registerLocation ?? 'Butterfield'),
    'Staff\t' + staffLine,
    '===',
    'Opening Float\t' + fmtCents(s.startingFloatCents ?? 0),
    'Cash Sales\t' + fmtCents(s.cashSalesCents),
    'Card Sales\t' + fmtCents(s.cardSalesCents),
    'Refunds\t' + fmtCents(s.totalRefundsCents),
    'Discounts\t' + fmtCents(s.discountsCents),
    'Surcharges\t' + fmtCents(s.surchargesCents),
    'Cash Added\t' + fmtCents(s.cashAddedCents),
    'Cash Removed\t' + fmtCents(s.cashRemovedCents),
    'Expected Cash\t' + fmtCents(s.expectedCashCents),
    'Actual Cash\t' + actualCash,
    'Variance\t' + variance,
    'Total Sales\t' + fmtCents(s.totalSalesCents),
    'Close Method\t' + closeMethod,
    '---',
    'Notes\t' + (notes || 'None'),
  ];
}

import type { PosOrderItem, PosLoyaltyResult } from '@/lib/api';

export interface PosCompletedOrder {
  id: string; orderNumber: string; totalCents: number;
  paymentMethod: 'cash' | 'eftpos' | 'split';
  amountTenderedCents?: number; surchargeCents: number;
  splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[];
  loyaltyResult: PosLoyaltyResult | null;
  customerName: string; customerEmail?: string;
  ticketItems: Array<{ name: string; quantity: number; unitPriceCents: number; variantName?: string; options: string[]; notes?: string }>;
  discountAmountCents: number; discountLabel: string;
}

export interface PosDiscountPinGate {
  paymentMethod: 'cash' | 'eftpos' | 'split';
  amountTenderedCents?: number; surchargeCents?: number;
  splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[];
}

export interface PosRegisterApprovalPrompt {
  mode: 'movement' | 'close'; title: string; subtitle: string; payload: any;
}

export interface PosOrderVars {
  paymentMethod: 'cash' | 'eftpos' | 'split';
  amountTenderedCents?: number; surchargeCents?: number;
  splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[];
  linklySessionId?: string; supervisorPin?: string;
}

export function buildPosOrderPayload(ticket: Ticket, idempotencyKey: string, vars: PosOrderVars) {
  return {
    items: buildPosItems(ticket.items),
    coffeeItemCount: ticket.items.filter(i => i.category.toLowerCase() === 'coffee').reduce((sum, i) => sum + (i.quantity ?? 1), 0),
    orderType: ticket.orderType,
    paymentMethod: (vars.paymentMethod === 'split' ? 'eftpos' : vars.paymentMethod) as 'cash' | 'eftpos',
    amountTenderedCents: vars.amountTenderedCents, surchargeCents: vars.surchargeCents, splitPayments: vars.splitPayments, linklySessionId: vars.linklySessionId,
    customerId: ticket.customer?.userId, notes: ticket.notes || undefined,
    discountCode: ticket.appliedDiscount?.type === 'code' ? ticket.appliedDiscount.code : undefined,
    discountCodeId: ticket.appliedDiscount?.type === 'code' ? ticket.appliedDiscount.codeId : undefined,
    manualDiscountPct: ticket.appliedDiscount?.type === 'pct' ? ticket.appliedDiscount.pct : undefined,
    redeemFreeCoffee: ticket.appliedDiscount?.type === 'free_coffee' ? true : undefined,
    claimedRewardId: ticket.appliedDiscount?.type === 'claimed_reward' ? ticket.appliedDiscount.claimedRewardId : undefined,
    birthdayBonus: ticket.customer ? isBirthdayMonth(ticket.customer.birthday) : undefined,
    idempotencyKey,
    supervisorPin: vars.supervisorPin ?? ticket.priceOverrideSupervisorPin,
    hasPriceOverride: ticket.items.some(i => i.priceOverrideCents !== undefined),
  };
}

export function buildPosItems(items: TicketItem[]): PosOrderItem[] {
  return items.map(i => ({
    productId: i.productId,
    productName: i.productName,
    variantId: i.variantId ?? null,
    variantName: i.variantName ?? null,
    variantPriceCents: i.variantPriceCents,
    selectedOptions: i.selectedOptions,
    category: i.category,
    quantity: i.quantity,
    unitPriceCents: i.unitPriceCents,
    notes: i.notes || undefined,
    ...(i.priceOverrideCents !== undefined && {
      priceOverrideCents: i.priceOverrideCents,
      originalPriceCents: i.unitPriceCents,
    }),
  }));
}
