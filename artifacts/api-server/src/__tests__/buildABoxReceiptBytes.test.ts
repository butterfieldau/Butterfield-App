import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/sydneyTime.js', () => ({
  getSydneyNow: () => new Date('2025-07-01T10:00:00.000Z'),
  getSydneyStartOfDay: () => new Date('2025-07-01T00:00:00.000Z'),
  getSydneyEndOfDay: () => new Date('2025-07-01T23:59:59.999Z'),
  toSydneyDate: (d: Date) => d,
  sydneyDateParts: () => ({ year: 2025, month: 7, day: 1, hour: 20, minute: 0, dayOfWeek: 2 }),
}));

import { buildReceiptBytes, buildTaxInvoiceBytes } from '../lib/printer.js';
import type { PrintJob } from '../lib/printer.js';

function formatAUD(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function receiptText(job: PrintJob): string {
  return buildReceiptBytes(job).toString('utf-8');
}

function makeBuildABoxJob(overrides: Partial<PrintJob['items'][number]> = {}): PrintJob {
  return {
    orderId: 'order-abc123',
    orderNumber: 'ORD-001',
    customerName: 'Test Customer',
    type: 'pickup',
    items: [
      {
        name: 'Build a Box (6)',
        quantity: 1,
        unitPriceCents: 2800,
        ...overrides,
      },
    ],
    totalCents: overrides.unitPriceCents ?? 2800,
    printerBrand: 'epson',
  };
}

describe('buildReceiptBytes — Build a Box price rendering', () => {
  it('renders the correct dollar amount for a Build a Box item ($28.00)', () => {
    const job = makeBuildABoxJob({ unitPriceCents: 2800 });
    const text = receiptText(job);

    expect(text).toContain('$28.00');
    expect(text).not.toMatch(/1x.+\$0\.00/);
  });

  it('renders $0.00 ONLY when unitPriceCents is explicitly zero (regression control)', () => {
    const job = makeBuildABoxJob({ unitPriceCents: 0 });
    const text = receiptText(job);

    expect(text).toMatch(/1x.+\$0\.00/);
    expect(text).not.toContain('$28.00');
  });

  it('uses unitPriceCents * quantity for multi-unit line total', () => {
    const job = makeBuildABoxJob({ unitPriceCents: 2800, quantity: 2 });
    job.totalCents = 5600;
    const text = receiptText(job);

    expect(text).toContain('$56.00');
    expect(text).not.toMatch(/2x.+\$0\.00/);
  });

  it('item with unitPriceCents from server enrichment alias shows correct price', () => {
    const enrichedItem: PrintJob['items'][number] = {
      name: 'Build a Box (6)',
      quantity: 1,
      unitPriceCents: 3200,
    };
    const job: PrintJob = {
      orderId: 'order-xyz',
      orderNumber: 'ORD-002',
      customerName: 'Wholesale Customer',
      type: 'pickup',
      items: [enrichedItem],
      totalCents: 3200,
      printerBrand: 'epson',
    };

    const text = receiptText(job);
    expect(text).toContain('$32.00');
    expect(text).not.toMatch(/1x.+\$0\.00/);
  });

  it('mixed Build a Box + regular items — no $0.00 item lines', () => {
    const job: PrintJob = {
      orderId: 'order-mix',
      orderNumber: 'ORD-003',
      customerName: 'Mixed Customer',
      type: 'pickup',
      items: [
        { name: 'Build a Box (6)', quantity: 1, unitPriceCents: 2800 },
        { name: 'Flat White', quantity: 2, unitPriceCents: 550 },
      ],
      totalCents: 2800 + 1100,
      printerBrand: 'epson',
    };

    const text = receiptText(job);
    expect(text).toContain('$28.00');
    expect(text).toContain('$11.00');
    const itemLines = text.split('\n').filter(l => /^\d+x /.test(l));
    expect(itemLines).toHaveLength(2);
    itemLines.forEach(line => {
      expect(line).not.toMatch(/\$0\.00/);
    });
  });

  it('TOTAL line matches expected order total', () => {
    const job = makeBuildABoxJob({ unitPriceCents: 2800 });
    const text = receiptText(job);

    const totalLine = text.split('\n').find(l => l.includes('TOTAL'));
    expect(totalLine).toBeDefined();
    expect(totalLine).toContain('$28.00');
  });

  it('item options (box contents) are printed below the item line', () => {
    const job: PrintJob = {
      orderId: 'order-opts',
      orderNumber: 'ORD-004',
      customerName: 'Options Customer',
      type: 'pickup',
      items: [
        {
          name: 'Build a Box (6)',
          quantity: 1,
          unitPriceCents: 2800,
          options: ['3× Choc Chip', '3× Peanut Butter'],
        },
      ],
      totalCents: 2800,
      printerBrand: 'epson',
    };

    const text = receiptText(job);
    expect(text).toContain('$28.00');
    expect(text).toContain('3× Choc Chip');
    expect(text).toContain('3× Peanut Butter');
    expect(text).not.toMatch(/1x.+\$0\.00/);
  });
});

describe('buildReceiptBytes — alias chain: unitCents fallback simulation', () => {
  it('demonstrates that unitPriceCents=0 (missing alias) produces $0.00 bug', () => {
    const buggyItem: PrintJob['items'][number] = {
      name: 'Build a Box (6)',
      quantity: 1,
      unitPriceCents: 0,
    };
    const text = buildReceiptBytes({
      orderId: 'order-bug',
      customerName: 'Customer',
      type: 'pickup',
      items: [buggyItem],
      totalCents: 0,
    }).toString('utf-8');

    expect(text).toMatch(/1x.+\$0\.00/);
  });

  it('demonstrates that unitPriceCents=2800 (correct alias) produces $28.00 — bug is fixed', () => {
    const fixedItem: PrintJob['items'][number] = {
      name: 'Build a Box (6)',
      quantity: 1,
      unitPriceCents: 2800,
    };
    const text = buildReceiptBytes({
      orderId: 'order-fixed',
      customerName: 'Customer',
      type: 'pickup',
      items: [fixedItem],
      totalCents: 2800,
    }).toString('utf-8');

    expect(text).toContain('$28.00');
    expect(text).not.toMatch(/1x.+\$0\.00/);
  });
});

describe('buildTaxInvoiceBytes — Build a Box price rendering', () => {
  it('renders correct dollar amount in tax invoice item line', () => {
    const job: PrintJob = {
      orderId: 'inv-abc123',
      customerName: 'Tax Customer',
      type: 'pickup',
      items: [{ name: 'Build a Box (6)', quantity: 1, unitPriceCents: 2800 }],
      totalCents: 2800,
      printerBrand: 'epson',
    };

    const text = buildTaxInvoiceBytes(job).toString('utf-8');
    expect(text).toContain('$28.00');
    expect(text).not.toMatch(/1x.+\$0\.00/);
  });
});
