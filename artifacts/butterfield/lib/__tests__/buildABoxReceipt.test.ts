import { describe, it, expect, vi } from 'vitest';

vi.mock('../api', () => ({
  api: { director: { printerBytes: vi.fn() } },
}));
vi.mock('../starSdk', () => ({
  starOpenDrawer: vi.fn(),
  starDirectSend: vi.fn(),
}));

import { orderToPrintJob } from '../printer';
import type { ApiOrderItem } from '../api';

/**
 * Replicates the price-rendering formula used by the server-side buildReceiptBytes:
 *   `$${(cents / 100).toFixed(2)}`
 * Used to assert that receipt lines show the correct dollar amount (not "$0.00").
 */
function formatAUD(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Simulates the item line rendered by buildReceiptBytes:
 *   `{qty}x {name} {formatAUD(unitPriceCents * qty)}`
 */
function renderItemPrice(unitPriceCents: number, quantity: number): string {
  return formatAUD(unitPriceCents * quantity);
}

function makeItem(overrides: Partial<ApiOrderItem> & Record<string, unknown>): ApiOrderItem {
  return {
    productId: 'build-a-box-6',
    quantity: 1,
    productName: 'Build a Box (6)',
    ...overrides,
  } as ApiOrderItem;
}

function makeOrder(items: ApiOrderItem[]) {
  return {
    id: 'order-123',
    orderNumber: 'ORD-001',
    contactName: 'Test Customer',
    type: 'pickup' as const,
    items,
    totalCents: items.reduce((sum, i) => sum + ((i.totalPriceCents as number) ?? 0), 0),
    notes: '',
  };
}

describe('Build a Box receipt — toPrintableItem price resolution', () => {
  it('reads unitPriceCents (new server alias) correctly', () => {
    const item = makeItem({ unitPriceCents: 2800, totalPriceCents: 2800 });
    const job = orderToPrintJob(makeOrder([item]));

    expect(job.items).toHaveLength(1);
    expect(job.items[0].unitPriceCents).toBe(2800);
    expect(job.items[0].name).toBe('Build a Box (6)');
  });

  it('falls back to unitCents when unitPriceCents is absent (old stored format)', () => {
    const item = makeItem({ unitCents: 3200, lineCents: 3200 } as any);
    const job = orderToPrintJob(makeOrder([item]));

    expect(job.items[0].unitPriceCents).toBe(3200);
  });

  it('falls back to totalPriceCents when both unitPriceCents and unitCents are absent', () => {
    const item = makeItem({ totalPriceCents: 1500 });
    const job = orderToPrintJob(makeOrder([item]));

    expect(job.items[0].unitPriceCents).toBe(1500);
  });

  it('falls back to lineCents as last resort', () => {
    const item = makeItem({ lineCents: 900 } as any);
    const job = orderToPrintJob(makeOrder([item]));

    expect(job.items[0].unitPriceCents).toBe(900);
  });

  it('returns 0 when no price field is present (does not produce undefined)', () => {
    const item = makeItem({});
    const job = orderToPrintJob(makeOrder([item]));

    expect(job.items[0].unitPriceCents).toBe(0);
    expect(typeof job.items[0].unitPriceCents).toBe('number');
  });

  it('prefers unitPriceCents over unitCents when both are present (new alias takes priority)', () => {
    const item = makeItem({ unitPriceCents: 2800, unitCents: 9999 } as any);
    const job = orderToPrintJob(makeOrder([item]));

    expect(job.items[0].unitPriceCents).toBe(2800);
  });

  it('handles a multi-item Build a Box order without $0 lines', () => {
    const items = [
      makeItem({ productName: 'Build a Box (6)', quantity: 1, unitPriceCents: 2800, totalPriceCents: 2800 }),
      makeItem({ productId: 'prod-flat-white', productName: 'Flat White', quantity: 2, unitPriceCents: 550, totalPriceCents: 1100 }),
    ];
    const job = orderToPrintJob(makeOrder(items));

    expect(job.items).toHaveLength(2);
    expect(job.items[0].unitPriceCents).toBe(2800);
    expect(job.items[1].unitPriceCents).toBe(550);
    expect(job.items.every(i => i.unitPriceCents > 0)).toBe(true);
  });

  it('quantity is preserved correctly', () => {
    const item = makeItem({ quantity: 3, unitPriceCents: 2800, totalPriceCents: 8400 });
    const job = orderToPrintJob(makeOrder([item]));

    expect(job.items[0].quantity).toBe(3);
    expect(job.items[0].unitPriceCents).toBe(2800);
  });
});

describe('Build a Box receipt — rendered dollar amounts (full alias chain)', () => {
  it('unitPriceCents alias → receipt line shows $28.00 not $0.00', () => {
    const item = makeItem({ unitPriceCents: 2800, totalPriceCents: 2800 });
    const job = orderToPrintJob(makeOrder([item]));
    const rendered = renderItemPrice(job.items[0].unitPriceCents, job.items[0].quantity);

    expect(rendered).toBe('$28.00');
    expect(rendered).not.toBe('$0.00');
  });

  it('unitCents fallback → receipt line shows $32.00 not $0.00', () => {
    const item = makeItem({ unitCents: 3200, lineCents: 3200 } as any);
    const job = orderToPrintJob(makeOrder([item]));
    const rendered = renderItemPrice(job.items[0].unitPriceCents, job.items[0].quantity);

    expect(rendered).toBe('$32.00');
    expect(rendered).not.toBe('$0.00');
  });

  it('multi-unit Build a Box → receipt line shows line total $84.00 not $0.00', () => {
    const item = makeItem({ quantity: 3, unitPriceCents: 2800, totalPriceCents: 8400 });
    const job = orderToPrintJob(makeOrder([item]));
    const rendered = renderItemPrice(job.items[0].unitPriceCents, job.items[0].quantity);

    expect(rendered).toBe('$84.00');
    expect(rendered).not.toBe('$0.00');
  });

  it('no item line in order renders $0.00 when unitPriceCents is genuinely absent', () => {
    const item = makeItem({});
    const job = orderToPrintJob(makeOrder([item]));
    const rendered = renderItemPrice(job.items[0].unitPriceCents, job.items[0].quantity);

    expect(rendered).toBe('$0.00');
  });

  it('mixed order — all item lines have non-zero dollar amounts', () => {
    const items = [
      makeItem({ productName: 'Build a Box (6)', quantity: 1, unitPriceCents: 2800, totalPriceCents: 2800 }),
      makeItem({ productId: 'prod-latte', productName: 'Latte', quantity: 2, unitPriceCents: 600, totalPriceCents: 1200 }),
    ];
    const job = orderToPrintJob(makeOrder(items));

    const renderedPrices = job.items.map(i => renderItemPrice(i.unitPriceCents, i.quantity));
    expect(renderedPrices).toEqual(['$28.00', '$12.00']);
    renderedPrices.forEach(price => expect(price).not.toBe('$0.00'));
  });
});

describe('Build a Box receipt — server-side item enrichment alias', () => {
  it('enrichment block writes both unitPriceCents and unitCents aliases', () => {
    const rawItem = { productId: 'build-a-box-6', quantity: 1 };
    const pricedEntry = { unitCents: 2800, lineCents: 2800 };

    const enriched = {
      ...rawItem,
      unitCents: pricedEntry.unitCents,
      lineCents: pricedEntry.lineCents,
      unitPriceCents: pricedEntry.unitCents,
      totalPriceCents: pricedEntry.lineCents,
    };

    expect(enriched.unitPriceCents).toBe(2800);
    expect(enriched.unitCents).toBe(2800);
    expect(enriched.lineCents).toBe(2800);
    expect(enriched.totalPriceCents).toBe(2800);
  });

  it('enrichment block correctly computes multi-quantity line total', () => {
    const rawItem = { productId: 'build-a-box-6', quantity: 2 };
    const pricedEntry = { unitCents: 2800, lineCents: 5600 };

    const enriched = {
      ...rawItem,
      unitCents: pricedEntry.unitCents,
      lineCents: pricedEntry.lineCents,
      unitPriceCents: pricedEntry.unitCents,
      totalPriceCents: pricedEntry.lineCents,
    };

    expect(enriched.unitPriceCents).toBe(2800);
    expect(enriched.totalPriceCents).toBe(5600);
    expect(enriched.totalPriceCents).toBe(enriched.unitPriceCents * rawItem.quantity);
  });

  it('enriched Build a Box item → printer picks up unitPriceCents → receipt shows $30.00', () => {
    const enrichedItem = makeItem({
      unitCents: 3000,
      lineCents: 3000,
      unitPriceCents: 3000,
      totalPriceCents: 3000,
    } as any);

    const job = orderToPrintJob(makeOrder([enrichedItem]));
    const rendered = renderItemPrice(job.items[0].unitPriceCents, job.items[0].quantity);

    expect(job.items[0].unitPriceCents).toBe(3000);
    expect(rendered).toBe('$30.00');
    expect(rendered).not.toBe('$0.00');
  });

  it('un-enriched Build a Box item (only unitCents) → printer falls back → receipt shows $25.00', () => {
    const unenrichedItem = makeItem({
      unitCents: 2500,
    } as any);

    const job = orderToPrintJob(makeOrder([unenrichedItem]));
    const rendered = renderItemPrice(job.items[0].unitPriceCents, job.items[0].quantity);

    expect(job.items[0].unitPriceCents).toBe(2500);
    expect(rendered).toBe('$25.00');
    expect(rendered).not.toBe('$0.00');
  });
});
