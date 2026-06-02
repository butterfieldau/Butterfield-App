import fs from 'fs';
import path from 'path';

function loadLogoBase64(name: 'blue' | 'white'): string {
  // Assets live at <project-root>/assets/ — accessible via process.cwd() at runtime
  // regardless of whether this code is bundled by esbuild.
  const candidates = [
    path.join(process.cwd(), 'assets', `logo-${name}.png`),
    path.join(process.cwd(), 'src', 'assets', `logo-${name}.png`),
  ];
  for (const p of candidates) {
    try {
      return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
    } catch {
      // try next
    }
  }
  return '';
}

const LOGO_BLUE  = loadLogoBase64('blue');
const LOGO_WHITE = loadLogoBase64('white');

function fmt(cents: number | null | undefined): string {
  const n = Number(cents ?? 0) / 100;
  return `$${n.toFixed(2)}`;
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusBadge(status: string | null | undefined): string {
  const s = (status ?? 'draft').toLowerCase();
  const config: Record<string, { bg: string; color: string; label: string }> = {
    paid:         { bg: '#D1FAE5', color: '#065F46', label: 'PAID' },
    sent:         { bg: '#DBEAFE', color: '#1E40AF', label: 'SENT' },
    overdue:      { bg: '#FEE2E2', color: '#991B1B', label: 'OVERDUE' },
    draft:        { bg: '#F3F4F6', color: '#6B7280', label: 'DRAFT' },
    void:         { bg: '#F3F4F6', color: '#6B7280', label: 'VOID' },
    voided:       { bg: '#F3F4F6', color: '#6B7280', label: 'VOID' },
    failed:       { bg: '#FEE2E2', color: '#991B1B', label: 'FAILED' },
    processing:   { bg: '#FEF3C7', color: '#92400E', label: 'PROCESSING' },
    pending:      { bg: '#FEF3C7', color: '#92400E', label: 'PENDING' },
  };
  const c = config[s] ?? config.draft;
  return `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.8px;background:${c.bg};color:${c.color};">${c.label}</span>`;
}

export interface InvoiceData {
  invoiceNumber: string | null | undefined;
  invoiceDate:   string | Date | null | undefined;
  dueDate:       string | Date | null | undefined;
  status:        string | null | undefined;

  companyName:   string;
  abn:           string | null | undefined;
  email:         string | null | undefined;
  address:       string | null | undefined;
  accountRef:    string | null | undefined;

  items: Array<{
    description: string;
    qty:         number;
    unitCents:   number;
  }>;
  totalCents:    number;
  poReference:   string | null | undefined;
  notes:         string | null | undefined;
  paymentTerms:  string | null | undefined;
}

export function buildInvoiceHtml(data: InvoiceData): string {
  const subtotalCents = data.items.reduce((s, i) => s + i.qty * i.unitCents, 0);
  const gstCents      = Math.round(subtotalCents / 11);
  const exclGstCents  = subtotalCents - gstCents;
  const totalCents    = data.totalCents || subtotalCents;

  const invNum = data.invoiceNumber ?? 'DRAFT';
  const logoImg  = LOGO_BLUE  ? `<img src="${LOGO_BLUE}"  alt="Butterfield Cookies" style="height:44px;display:block;">` : `<span style="font-size:22px;font-weight:800;color:#1A2B4A;letter-spacing:-0.5px;">Butterfield Cookies</span>`;
  const logoImgW = LOGO_WHITE ? `<img src="${LOGO_WHITE}" alt="Butterfield Cookies" style="height:34px;display:block;">` : `<span style="font-size:18px;font-weight:800;color:#fff;">Butterfield Cookies</span>`;

  const lineRows = data.items.map(item => `
    <tr>
      <td style="padding:14px 16px;color:#1C1C1E;font-size:14px;border-bottom:1px solid #F3F4F6;">${item.description}</td>
      <td style="padding:14px 16px;color:#6B7280;font-size:14px;text-align:center;border-bottom:1px solid #F3F4F6;">${item.qty}</td>
      <td style="padding:14px 16px;color:#6B7280;font-size:14px;text-align:right;border-bottom:1px solid #F3F4F6;">${fmt(item.unitCents)}</td>
      <td style="padding:14px 16px;color:#1C1C1E;font-size:14px;text-align:right;font-weight:600;border-bottom:1px solid #F3F4F6;">${fmt(item.qty * item.unitCents)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Tax Invoice ${invNum}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #F0F4F8; font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1C1C1E; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { max-width: 780px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 32px rgba(0,0,0,0.10); }
    @media print { body { background: #fff; } .page { margin: 0; border-radius: 0; box-shadow: none; } }
    @media (max-width: 600px) { .page { margin: 0; border-radius: 0; } }
  </style>
</head>
<body>
<div class="page">

  <!-- ── HEADER ── -->
  <div style="background:linear-gradient(135deg,#1A2B4A 0%,#0F1D33 100%);padding:32px 40px 28px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
      <div>
        ${logoImgW}
        <div style="color:rgba(255,255,255,0.5);font-size:11px;letter-spacing:1.5px;margin-top:6px;text-transform:uppercase;">Cookies · Coffee · Desserts</div>
      </div>
      <div style="text-align:right;">
        <div style="color:rgba(255,255,255,0.55);font-size:11px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px;">Tax Invoice</div>
        <div style="color:#fff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">${invNum}</div>
        <div style="margin-top:8px;">${statusBadge(data.status)}</div>
      </div>
    </div>
  </div>

  <!-- ── FROM / BILL TO ── -->
  <div style="display:flex;gap:0;border-bottom:1px solid #E5E7EB;flex-wrap:wrap;">
    <div style="flex:1;min-width:220px;padding:28px 40px;border-right:1px solid #E5E7EB;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#9CA3AF;text-transform:uppercase;margin-bottom:12px;">From</div>
      <div style="font-size:15px;font-weight:700;color:#1A2B4A;margin-bottom:4px;">Butterfield Cookies PTY LTD</div>
      <div style="font-size:13px;color:#6B7280;line-height:1.7;">
        2 Main Lane, Merrylands NSW 2160<br>
        ABN: 24 680 761 166<br>
        accounts@butterfieldcookies.com.au<br>
        0480 769 995
      </div>
    </div>
    <div style="flex:1;min-width:220px;padding:28px 40px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#9CA3AF;text-transform:uppercase;margin-bottom:12px;">Bill To</div>
      <div style="font-size:15px;font-weight:700;color:#1A2B4A;margin-bottom:4px;">${data.companyName}</div>
      <div style="font-size:13px;color:#6B7280;line-height:1.7;">
        ${data.abn ? `ABN: ${data.abn}<br>` : ''}
        ${data.email ? `${data.email}<br>` : ''}
        ${data.address ? `${data.address}<br>` : ''}
        ${data.accountRef ? `<span style="color:#9CA3AF;">Account:</span> ${data.accountRef}` : ''}
      </div>
    </div>
  </div>

  <!-- ── DATES ROW ── -->
  <div style="display:flex;gap:0;background:#FAFAFA;border-bottom:1px solid #E5E7EB;flex-wrap:wrap;">
    <div style="flex:1;min-width:160px;padding:18px 40px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px;">Invoice Date</div>
      <div style="font-size:14px;font-weight:600;color:#1C1C1E;">${fmtDate(data.invoiceDate)}</div>
    </div>
    <div style="flex:1;min-width:160px;padding:18px 40px;border-left:1px solid #E5E7EB;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px;">Due Date</div>
      <div style="font-size:14px;font-weight:600;color:#1C1C1E;">${fmtDate(data.dueDate)}</div>
    </div>
    ${data.poReference ? `
    <div style="flex:1;min-width:160px;padding:18px 40px;border-left:1px solid #E5E7EB;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px;">PO Reference</div>
      <div style="font-size:14px;font-weight:600;color:#1C1C1E;">${data.poReference}</div>
    </div>` : ''}
    <div style="flex:1;min-width:160px;padding:18px 40px;border-left:1px solid #E5E7EB;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px;">Payment Terms</div>
      <div style="font-size:14px;font-weight:600;color:#1C1C1E;">${data.paymentTerms ?? '30 days from invoice date'}</div>
    </div>
  </div>

  <!-- ── LINE ITEMS ── -->
  <div style="padding:32px 40px 0;">
    <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:linear-gradient(135deg,#1A2B4A,#0F1D33);">
          <th style="padding:13px 16px;text-align:left;color:rgba(255,255,255,0.7);font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Item Description</th>
          <th style="padding:13px 16px;text-align:center;color:rgba(255,255,255,0.7);font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;width:70px;">Qty</th>
          <th style="padding:13px 16px;text-align:right;color:rgba(255,255,255,0.7);font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;width:120px;">Unit Price</th>
          <th style="padding:13px 16px;text-align:right;color:rgba(255,255,255,0.7);font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;width:140px;">Amount (incl. GST)</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>
  </div>

  <!-- ── TOTALS ── -->
  <div style="padding:20px 40px 32px;display:flex;justify-content:flex-end;">
    <div style="width:300px;">
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F3F4F6;">
        <span style="color:#6B7280;font-size:13px;">Subtotal (excl. GST)</span>
        <span style="color:#1C1C1E;font-size:13px;font-weight:600;">${fmt(exclGstCents)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F3F4F6;">
        <span style="color:#6B7280;font-size:13px;">GST (10%)</span>
        <span style="color:#1C1C1E;font-size:13px;font-weight:600;">${fmt(gstCents)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;margin-top:8px;background:linear-gradient(135deg,#1A2B4A,#0F1D33);border-radius:10px;">
        <span style="color:rgba(255,255,255,0.75);font-size:13px;font-weight:600;">Total Due (AUD)</span>
        <span style="color:#fff;font-size:22px;font-weight:800;">${fmt(totalCents)}</span>
      </div>
    </div>
  </div>

  ${data.notes ? `
  <!-- ── NOTES ── -->
  <div style="margin:0 40px 28px;padding:16px 20px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;">
    <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#92400E;text-transform:uppercase;margin-bottom:6px;">Notes</div>
    <div style="font-size:13px;color:#78350F;line-height:1.6;">${data.notes}</div>
  </div>
  ` : ''}

  <!-- ── BANK TRANSFER ── -->
  <div style="margin:0 40px 32px;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
    <div style="background:#F8FAFC;padding:14px 20px;border-bottom:1px solid #E5E7EB;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6B7280;text-transform:uppercase;">Bank Transfer Details</div>
    </div>
    <div style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div>
        <div style="font-size:10px;font-weight:600;letter-spacing:1px;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px;">Account Name</div>
        <div style="font-size:13px;font-weight:700;color:#1A2B4A;">Butterfield Cookies PTY LTD</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:600;letter-spacing:1px;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px;">ABN</div>
        <div style="font-size:13px;font-weight:700;color:#1A2B4A;">24 680 761 166</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:600;letter-spacing:1px;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px;">BSB</div>
        <div style="font-size:13px;font-weight:700;color:#1A2B4A;">067 873</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:600;letter-spacing:1px;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px;">Account Number</div>
        <div style="font-size:13px;font-weight:700;color:#1A2B4A;">1465 8181</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:600;letter-spacing:1px;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px;">Reference</div>
        <div style="font-size:13px;font-weight:700;color:#1493FF;">${invNum}</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:600;letter-spacing:1px;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px;">Payment Terms</div>
        <div style="font-size:13px;font-weight:700;color:#1A2B4A;">${data.paymentTerms ?? '30 days from invoice date'}</div>
      </div>
    </div>
  </div>

  <!-- ── FOOTER ── -->
  <div style="background:linear-gradient(135deg,#1A2B4A 0%,#0F1D33 100%);padding:24px 40px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
    <div>
      ${logoImgW}
      <div style="color:rgba(255,255,255,0.45);font-size:12px;margin-top:6px;">Thank you for your continued partnership.</div>
      <div style="color:rgba(255,255,255,0.45);font-size:12px;margin-top:2px;">Queries: accounts@butterfieldcookies.com.au · 0480 769 995</div>
    </div>
    <div style="text-align:right;">
      <div style="color:rgba(255,255,255,0.45);font-size:11px;line-height:1.7;">
        Butterfield Cookies PTY LTD<br>
        ABN: 24 680 761 166<br>
        2 Main Lane, Merrylands NSW 2160
      </div>
    </div>
  </div>

</div>
</body>
</html>`;
}
