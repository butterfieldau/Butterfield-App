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
    return s + lineTotal / 1.1;
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
        <td style="padding:9px 12px;font-size:12px;color:#374151;border-bottom:1px solid #F0F0F0;">
          ${l.description}
          ${l.discount && l.discount > 0 ? `<span style="display:inline-block;background:#DCFCE7;color:#15803D;font-size:10px;font-weight:700;padding:2px 5px;border-radius:4px;margin-left:5px;">−${Math.round(l.discount * 100)}%</span>` : ''}
        </td>
        <td style="padding:9px 12px;font-size:12px;color:#374151;text-align:center;border-bottom:1px solid #F0F0F0;">${l.qty}</td>
        <td style="padding:9px 12px;font-size:12px;color:#374151;text-align:center;border-bottom:1px solid #F0F0F0;">$${fmt(l.unitPrice)}</td>
        <td style="padding:9px 12px;font-size:12px;font-weight:600;color:#1C1C1E;text-align:right;border-bottom:1px solid #F0F0F0;">$${fmt(lineTotal)}</td>
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
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color:#1C1C1E; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; font-size:12px; }
  @page { size: A4; margin: 12mm; }
  .page { padding:28px 32px; max-width:780px; margin:0 auto; }

  /* ── Logo / Header ── */
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; }
  .logo-wrap { display:flex; flex-direction:column; gap:1px; }
  .logo-top  { display:flex; align-items:baseline; gap:0; }
  .logo-b    { font-size:26px; font-weight:900; color:#1C1C1E; letter-spacing:-1px; line-height:1; }
  .logo-c    { font-size:26px; font-weight:900; color:#40C0F2; letter-spacing:-1px; line-height:1; margin-left:6px; }
  .logo-dot  { width:7px; height:7px; border-radius:50%; background:#D20001; display:inline-block; margin-left:3px; vertical-align:middle; position:relative; top:-4px; }
  .logo-sub  { font-size:9px; color:#8E8E93; letter-spacing:2px; text-transform:uppercase; margin-top:3px; font-weight:500; }
  .logo-addr { font-size:10px; color:#6B7280; line-height:1.6; margin-top:4px; }
  .invoice-box { background:#E0F5FE; border:1.5px solid #40C0F2; border-radius:8px; padding:10px 16px; text-align:right; }
  .invoice-label  { font-size:9px; font-weight:700; color:#40C0F2; letter-spacing:2px; text-transform:uppercase; }
  .invoice-number { font-size:18px; font-weight:800; color:#1C1C1E; margin-top:2px; }

  /* ── Rule ── */
  .rule { height:2px; background:linear-gradient(90deg,#40C0F2 0%,#E5E7EB 60%); border-radius:2px; margin:0 0 16px; }

  /* ── Addresses ── */
  .addresses { display:flex; gap:32px; margin-bottom:14px; }
  .addr { flex:1; }
  .addr-label   { font-size:9px; font-weight:700; color:#8E8E93; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:5px; }
  .addr-company { font-size:13px; font-weight:700; color:#1C1C1E; margin-bottom:3px; }
  .addr-line    { font-size:11px; color:#6B7280; line-height:1.6; }

  /* ── Meta grid ── */
  .meta { display:flex; gap:0; background:#F5F6FA; border-radius:10px; padding:12px 16px; margin-bottom:16px; }
  .meta-item { flex:1; }
  .meta-item + .meta-item { border-left:1px solid #E5E7EB; padding-left:16px; }
  .meta-label { font-size:9px; color:#8E8E93; font-weight:600; letter-spacing:1px; text-transform:uppercase; }
  .meta-value { font-size:13px; font-weight:700; color:#1C1C1E; margin-top:2px; }
  .status-pill { display:inline-block; font-size:10px; font-weight:700; padding:3px 10px; border-radius:20px; letter-spacing:0.5px; }

  /* ── Table ── */
  table { width:100%; border-collapse:collapse; margin-bottom:14px; }
  thead th { background:#1C1C1E; color:#fff; font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; padding:10px 12px; text-align:left; }
  thead th:nth-child(2), thead th:nth-child(3) { text-align:center; }
  thead th:nth-child(4) { text-align:right; }
  thead th:first-child { border-radius:6px 0 0 6px; }
  thead th:last-child  { border-radius:0 6px 6px 0; }
  tbody tr:nth-child(even) { background:#FAFAFA; }

  /* ── Totals ── */
  .totals-wrap { display:flex; justify-content:flex-end; margin-bottom:16px; }
  .totals-box  { width:260px; }
  .t-row  { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #F0F0F0; font-size:12px; }
  .t-row .lbl { color:#6B7280; }
  .t-row .val { font-weight:600; color:#1C1C1E; }
  .t-total { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#1C1C1E; border-radius:8px; margin-top:8px; }
  .t-total .lbl { color:rgba(255,255,255,0.7); font-size:13px; font-weight:600; }
  .t-total .val { color:#40C0F2; font-size:20px; font-weight:800; }

  /* ── Payment box ── */
  .pay-box   { background:#E0F5FE; border-radius:10px; padding:14px 16px; margin-bottom:18px; border:1.5px solid rgba(64,192,242,0.3); }
  .pay-title { font-size:10px; font-weight:700; color:#40C0F2; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:10px; }
  .pay-grid  { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .pay-lbl   { font-size:9px; color:#2AA8DC; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; }
  .pay-val   { font-size:12px; font-weight:700; color:#1C1C1E; margin-top:1px; }

  /* ── Footer ── */
  .footer { display:flex; justify-content:space-between; align-items:flex-end; padding-top:14px; border-top:1px solid #E5E7EB; }
  .footer-logo  { font-size:18px; font-weight:900; color:#40C0F2; letter-spacing:-0.5px; }
  .footer-note  { font-size:10px; color:#8E8E93; line-height:1.7; margin-top:3px; }
  .footer-right { font-size:10px; color:#8E8E93; line-height:1.8; text-align:right; }

  @media print { .page { padding:0; } }
</style>
</head>
<body>
<div class="page">

  <!-- Header / Logo -->
  <div class="header">
    <div class="logo-wrap">
      <div class="logo-top">
        <span class="logo-b">Butterfield</span>
        <span class="logo-c">Cookies</span>
        <span class="logo-dot"></span>
      </div>
      <div class="logo-sub">PTY LTD &nbsp;·&nbsp; ABN 12 345 678 901</div>
      <div class="logo-addr">
        2 Main Lane, Merrylands NSW 2160<br/>
        0480 769 995 &nbsp;·&nbsp; accounts@butterfieldcookies.com.au
      </div>
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
      <div class="addr-company">Butterfield Cookies PTY LTD</div>
      <div class="addr-line">
        2 Main Lane, Merrylands NSW 2160<br/>
        ABN: 12 345 678 901<br/>
        accounts@butterfieldcookies.com.au<br/>
        0480 769 995
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
    <div class="meta-item" style="padding-left:16px;">
      <div class="meta-label">Due Date</div>
      <div class="meta-value" style="color:${inv.status === 'overdue' ? '#DC2626' : '#1C1C1E'};">${inv.dueDate}</div>
    </div>
    <div class="meta-item" style="padding-left:16px;">
      <div class="meta-label">Status</div>
      <div class="meta-value" style="margin-top:3px;">
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
      <div class="footer-logo">Butterfield<span style="color:#1C1C1E;"> Cookies</span></div>
      <div class="footer-note">
        Thank you for your continued partnership.<br/>
        Queries: accounts@butterfieldcookies.com.au · 0480 769 995
      </div>
    </div>
    <div class="footer-right">
      Butterfield Cookies PTY LTD<br/>
      ABN: 12 345 678 901<br/>
      2 Main Lane, Merrylands NSW 2160
    </div>
  </div>

</div>
</body>
</html>`;
}
