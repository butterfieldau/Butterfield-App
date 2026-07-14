import type { RegisterSessionReport } from '@/lib/api';

export function toYMD(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

export function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtDateShort(iso: string) {
  const d = new Date(iso);
  if (!isNaN(d.getTime())) return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return iso;
}

export function fmtDisplayDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
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
  return d.toLocaleString([], {
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

function escHtml(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildZReportHtml(report: RegisterSessionReport): string {
  const s = report.summary;

  const fmtAudHtml = (cents: number) =>
    `$${(Math.abs(cents) / 100).toFixed(2)}`;

  const fmtDateTimeHtml = (iso: string | null | undefined) => {
    if (!iso) return 'Not recorded';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Not recorded';
    return d.toLocaleString([], {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const fmtTradingDate = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  };

  const vc = s.varianceCents;
  const varianceColor = vc === null ? '#64748B' : vc === 0 ? '#16A34A' : '#D20001';
  const varianceStr =
    vc === null ? 'N/A' : vc === 0 ? '$0.00' : (vc > 0 ? '+' : '−') + fmtAudHtml(vc);

  const row = (label: string, value: string, bold = false, valueColor = '#0F172A', indent = false) => `
    <tr>
      <td style="padding:5px 0;color:${indent ? '#64748B' : '#475569'};font-size:13px;font-weight:${bold ? '700' : '500'};padding-left:${indent ? '16px' : '0'}">${escHtml(label)}</td>
      <td style="padding:5px 0;text-align:right;color:${valueColor};font-size:13px;font-weight:${bold ? '700' : '600'}">${escHtml(value)}</td>
    </tr>`;

  const divider = `<tr><td colspan="2"><hr style="border:none;border-top:1px solid #E2E8F0;margin:6px 0"/></td></tr>`;

  const closeNote = report.closeNote ? `
    <div style="margin-top:6px">
      <div style="font-size:10px;font-weight:800;color:#64748B;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Close Note</div>
      <div style="font-size:13px;color:#0F172A;line-height:1.5">${escHtml(report.closeNote)}</div>
    </div>` : '';

  const varianceNote = report.varianceNote ? `
    <div style="margin-top:10px">
      <div style="font-size:10px;font-weight:800;color:#64748B;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Variance Note</div>
      <div style="font-size:13px;color:#0F172A;line-height:1.5">${escHtml(report.varianceNote)}</div>
    </div>` : '';

  const notesContent = closeNote || varianceNote
    ? closeNote + varianceNote
    : '<div style="font-size:13px;color:#94A3B8;font-style:italic">No notes recorded</div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Z-Report — ${escHtml(report.registerName)} — ${escHtml(report.tradingDate)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; background: #F8FAFC; color: #0F172A; }
    .page { max-width: 680px; margin: 0 auto; padding: 32px 24px 48px; }
    .brand-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
    .brand-name { font-size: 20px; font-weight: 800; color: #1A2B4A; letter-spacing: -0.5px; }
    .report-label { font-size: 11px; font-weight: 700; color: #64748B; letter-spacing: 1.5px; text-transform: uppercase; }
    .hero { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 14px; padding: 20px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .hero-label { font-size: 10px; font-weight: 800; color: #1493FF; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 6px; }
    .hero-value { font-size: 36px; font-weight: 800; color: #1493FF; }
    .hero-breakdown { text-align: right; }
    .hero-breakdown-item { font-size: 14px; font-weight: 700; color: #0F172A; margin-bottom: 4px; }
    .hero-breakdown-dim { font-weight: 500; color: #64748B; }
    .section { margin-bottom: 18px; }
    .section-label { display: flex; align-items: center; gap: 5px; margin-bottom: 8px; }
    .section-label-text { font-size: 10px; font-weight: 800; color: #94A3B8; letter-spacing: 1.4px; text-transform: uppercase; }
    .card { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 16px; }
    .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
    .metric-box { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px; }
    .metric-box-label { font-size: 10px; font-weight: 700; color: #94A3B8; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px; }
    .metric-box-value { font-size: 17px; font-weight: 800; color: #0F172A; }
    .variance-row { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding: 12px; border-radius: 10px; background: ${varianceColor}18; }
    .variance-label { font-size: 13px; font-weight: 700; color: ${varianceColor}; }
    .variance-value { font-size: 20px; font-weight: 800; color: ${varianceColor}; }
    .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .pill-manual { background: #ECFDF5; border: 1px solid #BBF7D0; color: #15803D; }
    .pill-auto { background: #EFF6FF; border: 1px solid #BFDBFE; color: #1493FF; }
    .identity-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .register-name { font-size: 16px; font-weight: 800; color: #0F172A; }
    .register-sub { font-size: 12px; color: #64748B; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #94A3B8; text-align: center; }
    @media print { body { background: white; } .page { max-width: 100%; padding: 16px; } }
  </style>
</head>
<body>
  <div class="page">

    <div class="brand-header">
      <div class="brand-name">Butterfield Cookies</div>
      <div class="report-label">Daily Z-Report</div>
    </div>

    <div class="hero">
      <div>
        <div class="hero-label">Total Sales</div>
        <div class="hero-value">${fmtAudHtml(s.totalSalesCents)}</div>
      </div>
      <div class="hero-breakdown">
        <div class="hero-breakdown-item"><span class="hero-breakdown-dim">Card  </span>${fmtAudHtml(s.cardSalesCents)}</div>
        ${s.cashSalesCents > 0 ? `<div class="hero-breakdown-item"><span class="hero-breakdown-dim">Cash  </span>${fmtAudHtml(s.cashSalesCents)}</div>` : ''}
      </div>
    </div>

    <div class="section">
      <div class="section-label"><div class="section-label-text">SESSION</div></div>
      <div class="card">
        <div class="identity-row">
          <div>
            <div class="register-name">${escHtml(report.registerName)}</div>
            ${report.registerLocation ? `<div class="register-sub">${escHtml(report.registerLocation)}</div>` : ''}
          </div>
          <span class="pill ${report.autoClosed ? 'pill-auto' : 'pill-manual'}">${report.autoClosed ? 'Auto Close' : 'Manual'}</span>
        </div>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin-bottom:10px"/>
        <table>
          ${row('Trading Date', fmtTradingDate(report.tradingDate))}
          ${row('Opened By', report.openedByName ?? 'Not recorded')}
          ${row('Opened At', fmtDateTimeHtml(report.openedAt))}
          ${row('Closed By', report.closedByName ?? (report.autoClosed ? 'Auto close' : 'Not recorded'))}
          ${row('Closed At', fmtDateTimeHtml(report.closedAt))}
        </table>
      </div>
    </div>

    <div class="section">
      <div class="section-label"><div class="section-label-text">SALES</div></div>
      <div class="card">
        <div class="metric-grid">
          <div class="metric-box">
            <div class="metric-box-label">Cash Sales</div>
            <div class="metric-box-value">${fmtAudHtml(s.cashSalesCents)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-box-label">Card Sales</div>
            <div class="metric-box-value">${fmtAudHtml(s.cardSalesCents)}</div>
          </div>
        </div>
        <table>
          ${row('Refunds', fmtAudHtml(s.totalRefundsCents))}
          ${row('Discounts', fmtAudHtml(s.discountsCents))}
          ${row('Surcharges', fmtAudHtml(s.surchargesCents))}
          ${divider}
          ${row('Total Sales', fmtAudHtml(s.totalSalesCents), true, '#1493FF')}
        </table>
      </div>
    </div>

    <div class="section">
      <div class="section-label"><div class="section-label-text">CASH RECONCILIATION</div></div>
      <div class="card">
        <table>
          ${row('Opening Float', fmtAudHtml(s.startingFloatCents ?? 0))}
          ${row('+ Cash Sales', fmtAudHtml(s.cashSalesCents), false, '#0F172A', true)}
          ${row('− Cash Refunds', fmtAudHtml(s.cashRefundsCents), false, '#0F172A', true)}
          ${row('+ Cash Added', fmtAudHtml(s.cashAddedCents), false, '#0F172A', true)}
          ${row('− Cash Removed', fmtAudHtml(s.cashRemovedCents), false, '#0F172A', true)}
          ${divider}
          ${row('Expected Cash', fmtAudHtml(s.expectedCashCents), true)}
          ${row('Actual Counted', s.actualCountedCashCents === null ? 'Not entered' : fmtAudHtml(s.actualCountedCashCents), true)}
        </table>
        <div class="variance-row">
          <div class="variance-label">Variance</div>
          <div class="variance-value">${varianceStr}</div>
        </div>
      </div>
    </div>

    ${(report.closeNote || report.varianceNote) ? `
    <div class="section">
      <div class="section-label"><div class="section-label-text">NOTES</div></div>
      <div class="card">${notesContent}</div>
    </div>` : ''}

    <div class="footer">
      Butterfield Cookies &bull; Generated ${new Date().toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </div>
  </div>
</body>
</html>`;
}
