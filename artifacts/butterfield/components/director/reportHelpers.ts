import type { RegisterSessionReport } from '@/lib/api';

export function toYMD(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
}

export function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtDateShort(iso: string) {
  const d = new Date(iso);
  if (!isNaN(d.getTime())) return d.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short' });
  return iso;
}

export function fmtDisplayDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtHour(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

export function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function fmtPaymentMethod(method: string): string {
  const MAP: Record<string, string> = {
    card:          'Card',
    pay_at_pickup: 'Pay at Pickup',
    cash:          'Cash',
    eftpos:        'EFTPOS',
    split:         'Split',
    unknown:       'Unknown',
  };
  return MAP[method] ?? method.replace(/_/g, ' ');
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Not recorded';
  return d.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildRegisterSummaryPrintLines(report: RegisterSessionReport): string[] {
  const s = report.summary;
  const actualCash = s.actualCountedCashCents === null ? 'Not entered' : fmtAUD(s.actualCountedCashCents);
  const variance = s.varianceCents === null ? 'Not calculated' : fmtAUD(s.varianceCents);
  const notes = [report.closeNote, report.varianceNote].filter(Boolean).join(' | ');
  return [
    `Date\t${report.tradingDate}`,
    `Register\t${report.registerName}`,
    `Location\t${report.registerLocation ?? 'Butterfield Cookies'}`,
    `Opened By\t${report.openedByName ?? 'Not recorded'}`,
    `Closed By\t${report.closedByName ?? (report.autoClosed ? 'Auto close' : 'Not recorded')}`,
    '===',
    `Opening Float\t${fmtAUD(s.startingFloatCents ?? 0)}`,
    `Cash Sales\t${fmtAUD(s.cashSalesCents)}`,
    `Card Sales\t${fmtAUD(s.cardSalesCents)}`,
    `Refunds\t${fmtAUD(s.totalRefundsCents)}`,
    `Discounts\t${fmtAUD(s.discountsCents)}`,
    `Surcharges\t${fmtAUD(s.surchargesCents)}`,
    `Cash Added\t${fmtAUD(s.cashAddedCents)}`,
    `Cash Removed\t${fmtAUD(s.cashRemovedCents)}`,
    `Expected Cash\t${fmtAUD(s.expectedCashCents)}`,
    `Actual Cash\t${actualCash}`,
    `Variance\t${variance}`,
    `Total Sales\t${fmtAUD(s.totalSalesCents)}`,
    `Close Method\t${report.autoClosed ? 'Auto Close' : 'Manual Close'}`,
    '---',
    `Notes\t${notes || 'None'}`,
  ];
}

export function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
