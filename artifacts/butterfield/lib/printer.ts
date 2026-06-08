import { api, type ApiOrder, type ApiOrderItem } from './api';

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
  surchargeCents?: number;
  loyaltyPointsEarned?: number;
  notes?: string;
  printerBrand?: 'epson' | 'star';
  scheduledFor?: Date | null;
  jobType?: 'receipt' | 'tax_invoice' | 'register_summary';
  paymentMethod?: string;
}

export interface RegisterSummaryPrintJob {
  title: string;
  lines: string[];
  printerBrand?: 'epson' | 'star';
  jobType?: 'register_summary';
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

/**
 * Sends a test receipt directly from the device to the printer via TCP.
 *
 * The cloud API server cannot reach a local-network printer (192.168.0.x is
 * unreachable from the internet). Instead:
 *   1. We ask the server to build the ESC/POS bytes (it knows nothing about TCP).
 *   2. We open the TCP socket ourselves — the device IS on the same LAN.
 *
 * react-native-tcp-socket is a native module that requires a custom development
 * build or production build (EAS Build). It is NOT available in Expo Go.
 * We use a dynamic import so Expo Go does not crash at module-load time — the
 * error is surfaced only when the user actually taps Send Test Print.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BytesFetcher = (job?: any) => Promise<{ data: { bytes: string } }>;

export async function sendTestPrint(printerIp: string, printerPort = 9100, printerBrand: 'epson' | 'star' = 'epson', fetchBytes: BytesFetcher = api.director.printerBytes): Promise<void> {
  return sendPrinterBytes(printerIp, printerPort, await fetchBytes({ printerBrand }));
}

export async function sendReceiptPrint(job: PrintJob, printerIp: string, printerPort = 9100, fetchBytes: BytesFetcher = api.director.printerBytes): Promise<void> {
  return sendPrinterBytes(printerIp, printerPort, await fetchBytes(job));
}

export async function sendTaxInvoicePrint(job: PrintJob, printerIp: string, printerPort = 9100, fetchBytes: BytesFetcher = api.director.printerBytes): Promise<void> {
  return sendPrinterBytes(printerIp, printerPort, await fetchBytes({ ...job, jobType: 'tax_invoice' }));
}

export async function sendRegisterSummaryPrint(job: RegisterSummaryPrintJob, printerIp: string, printerPort = 9100, fetchBytes: BytesFetcher = api.director.printerBytes): Promise<void> {
  return sendPrinterBytes(printerIp, printerPort, await fetchBytes({ ...job, jobType: 'register_summary' }));
}

export async function sendOpenDrawer(printerIp: string, printerPort = 9100, fetchBytes: BytesFetcher = api.director.printerBytes): Promise<void> {
  return sendPrinterBytes(printerIp, printerPort, await fetchBytes({ jobType: 'open_drawer' }));
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sendPrinterBytes(printerIp: string, printerPort: number, result: { data: { bytes: string } }): Promise<void> {
  const port = isNaN(printerPort) || printerPort <= 0 ? 9100 : printerPort;
  const bytes = base64ToUint8Array(result.data.bytes);

  // Dynamic import — deferred until print time, never evaluated at screen load.
  // In Expo Go this will throw (caught below); in EAS / production builds it works.
  let TcpSocket: any;
  try {
    const mod = await import('react-native-tcp-socket');
    TcpSocket = mod?.default ?? mod;
  } catch {
    throw new Error(
      'Direct printer connection requires a custom development build or the production app — ' +
      'Expo Go does not support TCP socket connections to local network printers.',
    );
  }

  if (!TcpSocket?.createConnection || typeof TcpSocket.createConnection !== 'function') {
    throw new Error(
      'Printer connection is unavailable in this build. Please reinstall the latest app build and try again.',
    );
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let socket: any;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      try { socket?.destroy?.(); } catch {}
      if (err) reject(err);
      else resolve();
    };

    socket = TcpSocket.createConnection(
      { host: printerIp, port, connectTimeout: 8000 },
      () => {
        socket.write(bytes, undefined, (writeErr: Error | null) => {
          if (writeErr) { done(writeErr); return; }
          socket.end();
        });
      },
    );

    socket.on('close', () => done());
    socket.on('error', (err: Error) => done(err));
    socket.on('timeout', () =>
      done(new Error(`Printer timeout: could not reach ${printerIp}:${port}`)),
    );
  });
}
