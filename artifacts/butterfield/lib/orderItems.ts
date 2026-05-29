type RawOrderItemOption = {
  optionName?: string | null;
  name?: string | null;
  textValue?: string | null;
};

type RawOrderItem = {
  productName?: string | null;
  productNameSnapshot?: string | null;
  name?: string | null;
  variantName?: string | null;
  variantNameSnapshot?: string | null;
  quantity?: number | null;
  qty?: number | null;
  unitPriceCents?: number | null;
  finalItemPriceCents?: number | null;
  priceCents?: number | null;
  totalCents?: number | null;
  totalPriceCents?: number | null;
  selectedOptions?: RawOrderItemOption[] | null;
  selectedOptionsSnapshot?: RawOrderItemOption[] | null;
  isFreeReward?: boolean | null;
};

export type NormalizedOrderItem = {
  name: string;
  variantName?: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  notableOptions: string[];
  baristaNote?: string;
  isFreeReward: boolean;
};

const HIDEABLE_OPTION_NAMES = new Set([
  'No Sugar',
  'No Honey',
  'No Syrup',
  'Regular Coffee',
  'Regular',
  'Normal',
  'Full Cream',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toRawOrderItem(value: unknown): RawOrderItem | null {
  return isRecord(value) ? (value as RawOrderItem) : null;
}

export function normalizeOrderItems(value: unknown): NormalizedOrderItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const item = toRawOrderItem(entry);
      if (!item) return null;

      const quantity = item.quantity ?? item.qty ?? 1;
      const unitPriceCents = item.unitPriceCents ?? item.finalItemPriceCents ?? item.priceCents ?? 0;
      const lineTotalCents = item.totalCents ?? item.totalPriceCents ?? (unitPriceCents * quantity);
      const optionSource = item.selectedOptionsSnapshot ?? item.selectedOptions ?? [];
      const options = Array.isArray(optionSource) ? optionSource : [];
      const notableOptions = options
        .map((option) => option.optionName ?? option.name ?? '')
        .filter((name): name is string => Boolean(name) && !HIDEABLE_OPTION_NAMES.has(name));
      const baristaNote = options.find((option) => option.textValue)?.textValue ?? undefined;

      return {
        name: item.productName ?? item.productNameSnapshot ?? item.name ?? 'Item',
        variantName: item.variantNameSnapshot ?? item.variantName ?? undefined,
        quantity,
        unitPriceCents,
        lineTotalCents,
        notableOptions,
        baristaNote,
        isFreeReward: Boolean(item.isFreeReward),
      } satisfies NormalizedOrderItem;
    })
    .filter((item): item is NormalizedOrderItem => item !== null);
}

export function summarizeOrderItems(items: NormalizedOrderItem[], limit = 3): string {
  const visible = items.slice(0, limit).map((item) => `${item.quantity}× ${item.name}`);
  const extra = items.length - visible.length;
  return visible.join(' · ') + (extra > 0 ? ` +${extra} more` : '');
}
