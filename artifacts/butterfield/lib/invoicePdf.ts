export interface InvoiceLine {
  description: string;
  qty: number;
  unitPrice: number;
  discount?: number;
}

export interface InvoicePdfData {
  number: string;
  date: string;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
  companyName: string;
  abn?: string;
  contactEmail?: string;
  deliveryAddress?: string;
  accountNumber?: string;
  lines: InvoiceLine[];
}

function fmt(n: number) {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateInvoiceHtml(inv: InvoicePdfData): string {
  const subtotalExGst = inv.lines.reduce((s, l) => {
    const lineTotal = l.qty * l.unitPrice * (1 - (l.discount ?? 0));
    return s + lineTotal / 1.1; // back-calculate excl GST
  }, 0);
  const gst = inv.lines.reduce((s, l) => {
    const lineTotal = l.qty * l.unitPrice * (1 - (l.discount ?? 0));
    return s + lineTotal - lineTotal / 1.1;
  }, 0);
  const total = subtotalExGst + gst;

  const statusLabel =
    inv.status === 'paid' ? 'PAID' : inv.status === 'overdue' ? 'OVERDUE' : 'PAYMENT DUE';
  const statusColor =
    inv.status === 'paid' ? '#16A34A' : inv.status === 'overdue' ? '#DC2626' : '#D97706';

  const rows = inv.lines
    .map((l) => {
      const lineTotal = l.qty * l.unitPrice * (1 - (l.discount ?? 0));
      return `
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#374151;border-bottom:1px solid #F0F0F0;">
          ${l.description}
          ${l.discount && l.discount > 0 ? `<span style="display:inline-block;background:#DCFCE7;color:#15803D;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:6px;">−${Math.round(l.discount * 100)}%</span>` : ''}
        </td>
        <td style="padding:12px 16px;font-size:13px;color:#374151;text-align:center;border-bottom:1px solid #F0F0F0;">${l.qty}</td>
        <td style="padding:12px 16px;font-size:13px;color:#374151;text-align:center;border-bottom:1px solid #F0F0F0;">$${fmt(l.unitPrice)}</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#1C1C1E;text-align:right;border-bottom:1px solid #F0F0F0;">$${fmt(lineTotal)}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Invoice ${inv.number}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color:#1C1C1E; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { padding:40px; max-width:800px; margin:0 auto; }
  
  /* ── Header ── */
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; }
  .brand-name { font-size:30px; font-weight:800; color:#1C1C1E; letter-spacing:-0.5px; line-height:1; }
  .brand-blue { color:#40C0F2; }
  .brand-sub  { font-size:12px; color:#8E8E93; margin-top:5px; }
  .invoice-box { background:#E0F5FE; border:1.5px solid #40C0F2; border-radius:10px; padding:12px 20px; text-align:right; }
  .invoice-label  { font-size:10px; font-weight:700; color:#40C0F2; letter-spacing:2px; text-transform:uppercase; }
  .invoice-number { font-size:20px; font-weight:800; color:#1C1C1E; margin-top:3px; }

  /* ── Rule ── */
  .rule { height:2px; background:linear-gradient(90deg,#40C0F2 0%,#E5E7EB 60%); border-radius:2px; margin:0 0 28px; }

  /* ── Addresses ── */
  .addresses { display:flex; gap:40px; margin-bottom:28px; }
  .addr { flex:1; }
  .addr-label   { font-size:10px; font-weight:700; color:#8E8E93; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:8px; }
  .addr-company { font-size:15px; font-weight:700; color:#1C1C1E; margin-bottom:4px; }
  .addr-line    { font-size:12px; color:#6B7280; line-height:1.7; }

  /* ── Meta grid ── */
  .meta { display:flex; gap:0; background:#F5F6FA; border-radius:12px; padding:18px 20px; margin-bottom:28px; }
  .meta-item { flex:1; }
  .meta-item + .meta-item { border-left:1px solid #E5E7EB; padding-left:20px; }
  .meta-label { font-size:10px; color:#8E8E93; font-weight:600; letter-spacing:1px; text-transform:uppercase; }
  .meta-value { font-size:14px; font-weight:700; color:#1C1C1E; margin-top:3px; }

  /* ── Status pill ── */
  .status-pill { display:inline-block; font-size:11px; font-weight:700; padding:4px 12px; border-radius:20px; letter-spacing:0.5px; }

  /* ── Table ── */
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  thead th { background:#1C1C1E; color:#fff; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; padding:13px 16px; text-align:left; }
  thead th:nth-child(2), thead th:nth-child(3) { text-align:center; }
  thead th:nth-child(4) { text-align:right; }
  thead th:first-child { border-radius:8px 0 0 8px; }
  thead th:last-child  { border-radius:0 8px 8px 0; }
  tbody tr:nth-child(even) { background:#FAFAFA; }

  /* ── Totals ── */
  .totals-wrap { display:flex; justify-content:flex-end; margin-bottom:28px; }
  .totals-box  { width:280px; }
  .t-row  { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #F0F0F0; font-size:13px; }
  .t-row .lbl { color:#6B7280; }
  .t-row .val { font-weight:600; color:#1C1C1E; }
  .t-total { display:flex; justify-content:space-between; align-items:center; padding:15px 18px; background:#1C1C1E; border-radius:10px; margin-top:10px; }
  .t-total .lbl { color:rgba(255,255,255,0.7); font-size:14px; font-weight:600; }
  .t-total .val { color:#40C0F2; font-size:22px; font-weight:800; }

  /* ── Payment box ── */
  .pay-box   { background:#E0F5FE; border-radius:12px; padding:20px; margin-bottom:32px; border:1.5px solid rgba(64,192,242,0.3); }
  .pay-title { font-size:11px; font-weight:700; color:#40C0F2; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:14px; }
  .pay-grid  { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .pay-lbl   { font-size:10px; color:#2AA8DC; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; }
  .pay-val   { font-size:13px; font-weight:700; color:#1C1C1E; margin-top:2px; }

  /* ── Footer ── */
  .footer { display:flex; justify-content:space-between; align-items:flex-end; padding-top:20px; border-top:1px solid #E5E7EB; }
  .footer-brand  { font-size:22px; font-weight:800; color:#40C0F2; }
  .footer-note   { font-size:11px; color:#8E8E93; line-height:1.8; margin-top:4px; }
  .footer-right  { font-size:11px; color:#8E8E93; line-height:1.9; text-align:right; }

  @media print { .page { padding:20px; } }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand-name">Butterfield <span class="brand-blue">Cookies</span></div>
      <div class="brand-sub">Mason &amp; Main · Merrylands NSW 2160</div>
    </div>
    <div class="invoice-box">
      <div class="invoice-label">Tax Invoice</div>
      <div class="invoice-number">${inv.number}</div>
    </div>
  </div>

  <div class="rule"></div>

  <!-- Addresses -->
  <div class="addresses">
    <div class="addr">
      <div class="addr-label">From</div>
      <div class="addr-company">Butterfield Cookies Pty Ltd</div>
      <div class="addr-line">
        Shop 3, Mason &amp; Main<br/>
        Merrylands NSW 2160<br/>
        ABN: 12 345 678 901<br/>
        wholesale@butterfield.com.au<br/>
        (02) 9000 1234
      </div>
    </div>
    <div class="addr">
      <div class="addr-label">Bill To</div>
      <div class="addr-company">${inv.companyName}</div>
      <div class="addr-line">
        ${inv.abn ? `ABN: ${inv.abn}<br/>` : ''}
        ${inv.contactEmail ? `${inv.contactEmail}<br/>` : ''}
        ${inv.deliveryAddress ? inv.deliveryAddress.replace(/\n/g, '<br/>') : ''}
        ${inv.accountNumber ? `<br/>Account: ${inv.accountNumber}` : ''}
      </div>
    </div>
  </div>

  <!-- Meta -->
  <div class="meta">
    <div class="meta-item">
      <div class="meta-label">Invoice Date</div>
      <div class="meta-value">${inv.date}</div>
    </div>
    <div class="meta-item" style="padding-left:20px;">
      <div class="meta-label">Due Date</div>
      <div class="meta-value" style="color:${inv.status === 'overdue' ? '#DC2626' : '#1C1C1E'};">${inv.dueDate}</div>
    </div>
    <div class="meta-item" style="padding-left:20px;">
      <div class="meta-label">Status</div>
      <div class="meta-value" style="margin-top:4px;">
        <span class="status-pill" style="background:${statusColor}20;color:${statusColor};border:1.5px solid ${statusColor};">
          ${statusLabel}
        </span>
      </div>
    </div>
  </div>

  <!-- Table -->
  <table>
    <thead>
      <tr>
        <th>Item Description</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>Amount (incl. GST)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals-wrap">
    <div class="totals-box">
      <div class="t-row"><span class="lbl">Subtotal (excl. GST)</span><span class="val">$${fmt(subtotalExGst)}</span></div>
      <div class="t-row"><span class="lbl">GST (10%)</span><span class="val">$${fmt(gst)}</span></div>
      <div class="t-total"><span class="lbl">Total Due (AUD)</span><span class="val">$${fmt(total)}</span></div>
    </div>
  </div>

  <!-- Payment Details -->
  <div class="pay-box">
    <div class="pay-title">Bank Transfer Details</div>
    <div class="pay-grid">
      <div><div class="pay-lbl">Bank</div><div class="pay-val">Commonwealth Bank</div></div>
      <div><div class="pay-lbl">Account Name</div><div class="pay-val">Butterfield Cookies Pty Ltd</div></div>
      <div><div class="pay-lbl">BSB</div><div class="pay-val">062-000</div></div>
      <div><div class="pay-lbl">Account Number</div><div class="pay-val">1234 5678</div></div>
      <div><div class="pay-lbl">Reference</div><div class="pay-val">${inv.number}</div></div>
      <div><div class="pay-lbl">Payment Terms</div><div class="pay-val">30 days from invoice date</div></div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div>
      <div class="footer-brand">Butterfield</div>
      <div class="footer-note">
        Thank you for your continued partnership.<br/>
        Queries: wholesale@butterfield.com.au
      </div>
    </div>
    <div class="footer-right">
      ABN: 12 345 678 901<br/>
      butterfield.com.au<br/>
      (02) 9000 1234
    </div>
  </div>

</div>
</body>
</html>`;
}
