import * as Print from 'expo-print';
import type { ApiOrder, ApiOrderItem } from './api';

export interface PrintJob {
  orderId: string;
  customerName: string;
  type: 'pickup' | 'delivery';
  items: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    variantName?: string;
    options?: string[];
  }>;
  totalCents: number;
  discountCents?: number;
  loyaltyPointsEarned?: number;
  notes?: string;
  printerBrand?: 'epson' | 'star';
  scheduledFor?: Date | null;
}

type PrintableOrder = Partial<ApiOrder> & {
  customerName?: string | null;
  contactName?: string | null;
  email?: string | null;
  deliveryType?: string | null;
};

function toPrintableItem(item: ApiOrderItem): PrintJob['items'][number] {
  const quantity = Number(item.quantity ?? 1) || 1;
  const unitPriceCents = Number(item.unitPriceCents ?? item.totalPriceCents ?? 0) || 0;
  const name = item.productName ?? 'Item';
  const variantName = item.variantName ?? undefined;
  const options = (item.selectedOptions ?? [])
    .map(o => o.optionName ?? o.textValue ?? '')
    .filter(Boolean) as string[];
  return { name, quantity, unitPriceCents, variantName, options: options.length > 0 ? options : undefined };
}

export function orderToPrintJob(order: PrintableOrder, printerBrand?: 'epson' | 'star'): PrintJob {
  const items = Array.isArray(order?.items) ? order.items : [];
  return {
    orderId: order?.id ?? 'unknown-order',
    customerName: order?.customerName ?? order?.contactName ?? order?.email ?? 'Customer',
    type: (order?.type === 'delivery' || order?.deliveryType === 'delivery') ? 'delivery' : 'pickup',
    items: items.map(toPrintableItem),
    totalCents: Number(order?.totalCents ?? 0) || 0,
    discountCents: Number(order?.discountCents ?? 0) || 0,
    loyaltyPointsEarned: Number(order?.loyaltyPointsEarned ?? 0) || 0,
    notes: order?.notes ?? '',
    scheduledFor: order?.scheduledFor ? new Date(order.scheduledFor) : null,
    printerBrand: printerBrand ?? 'epson',
  };
}

function buildReceiptHtml(job: PrintJob): string {
  const now = new Date().toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Australia/Sydney',
  });

  const itemRows = job.items.map(item => {
    const price = `$${((item.unitPriceCents * item.quantity) / 100).toFixed(2)}`;
    const sub = [item.variantName, ...(item.options ?? [])].filter(Boolean).join(', ');
    return `
      <tr>
        <td style="padding:4px 0;vertical-align:top;">
          <strong>${item.quantity}×</strong> ${item.name}
          ${sub ? `<br><span style="color:#666;font-size:11px;">${sub}</span>` : ''}
        </td>
        <td style="padding:4px 0;text-align:right;vertical-align:top;white-space:nowrap;">${price}</td>
      </tr>`;
  }).join('');

  const total = `$${(job.totalCents / 100).toFixed(2)}`;
  const discount = job.discountCents && job.discountCents > 0
    ? `<tr><td style="color:#16a34a;">Discount</td><td style="text-align:right;color:#16a34a;">-$${(job.discountCents / 100).toFixed(2)}</td></tr>`
    : '';

  const scheduledStr = job.scheduledFor
    ? `<br><small>For ${job.scheduledFor.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })}</small>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 4mm; size: 80mm auto; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 13px; color: #000; margin: 0; padding: 8px; width: 72mm; }
  h1 { font-size: 17px; font-weight: 900; margin: 0 0 2px; text-align: center; letter-spacing: 0.5px; }
  .sub { text-align: center; font-size: 11px; color: #555; margin-bottom: 10px; }
  .divider { border: none; border-top: 1px dashed #999; margin: 8px 0; }
  .order-id { font-size: 15px; font-weight: 700; }
  .customer { font-size: 12px; color: #333; margin-top: 2px; }
  .type-badge { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase;
    padding: 2px 8px; border-radius: 4px; margin-top: 3px;
    background: ${job.type === 'delivery' ? '#dbeafe' : '#dcfce7'};
    color: ${job.type === 'delivery' ? '#1d4ed8' : '#166534'}; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  td { font-size: 13px; }
  .total-row td { font-size: 16px; font-weight: 900; border-top: 1px solid #000; padding-top: 6px; }
  .notes { font-size: 12px; color: #333; background: #f9f9f9; padding: 5px 8px; border-radius: 4px; margin-top: 4px; }
  .footer { text-align: center; font-size: 11px; color: #777; margin-top: 10px; }
  .loyalty { text-align: center; font-size: 11px; color: #1493ff; font-weight: 700; margin-top: 4px; }
</style>
</head>
<body>
<h1>Butterfield Cookies</h1>
<div class="sub">${now}</div>
<hr class="divider">
<div class="order-id">Order #${job.orderId.slice(0, 6).toUpperCase()}</div>
<div class="customer">${job.customerName}</div>
<div><span class="type-badge">${job.type === 'delivery' ? 'Delivery' : 'Pickup'}${scheduledStr}</span></div>
<hr class="divider">
<table>
  <tbody>
    ${itemRows}
    ${discount}
  </tbody>
  <tfoot>
    <tr class="total-row">
      <td>TOTAL</td>
      <td style="text-align:right;">${total}</td>
    </tr>
  </tfoot>
</table>
${job.notes ? `<div class="notes"><strong>Note:</strong> ${job.notes}</div>` : ''}
${job.loyaltyPointsEarned ? `<div class="loyalty">+${job.loyaltyPointsEarned} loyalty points earned</div>` : ''}
<hr class="divider">
<div class="footer">Thank you — butterfield.com.au</div>
</body>
</html>`;
}

function buildTestHtml(): string {
  const now = new Date().toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page { margin: 4mm; size: 80mm auto; }
  body { font-family: 'Courier New', monospace; font-size: 13px; color: #000; margin: 0; padding: 8px; width: 72mm; text-align: center; }
  h1 { font-size: 18px; font-weight: 900; margin: 0 0 4px; }
  .ok { font-size: 40px; margin: 10px 0; }
  hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
</style></head>
<body>
<h1>Butterfield Cookies</h1>
<hr>
<div class="ok">✓</div>
<div style="font-size:15px;font-weight:700;">Printer Test OK</div>
<div style="font-size:11px;color:#555;margin-top:4px;">${now}</div>
<hr>
<div style="font-size:11px;color:#888;">butterfield.com.au</div>
</body></html>`;
}

/**
 * Sends a receipt to a store printer using iOS AirPrint/IPP.
 *
 * Most modern thermal printers (Epson TM-series, Star mC-Print) support AirPrint.
 * The printer must be on the same local network as the device.
 *
 * The IPP URL format: ipp://PRINTER_IP:PORT/ipp/print
 * Typical ports: 631 (standard IPP/AirPrint), 9100 (raw, may not work for IPP).
 */
export async function sendReceiptPrint(job: PrintJob, printerIp: string, printerPort = 9100): Promise<void> {
  const html = buildReceiptHtml(job);
  const printerUrl = `ipp://${printerIp}:${printerPort}/ipp/print`;
  await Print.printAsync({ html, printerUrl });
}

/**
 * Sends a test page to the printer to verify connectivity.
 */
export async function sendTestPrint(printerIp: string, printerPort = 9100): Promise<void> {
  const html = buildTestHtml();
  const printerUrl = `ipp://${printerIp}:${printerPort}/ipp/print`;
  await Print.printAsync({ html, printerUrl });
}
