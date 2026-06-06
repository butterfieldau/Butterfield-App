import * as net from 'net';

// ── ESC/POS command constants ─────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

const CMD_INIT        = Buffer.from([ESC, 0x40]);
const CMD_ALIGN_LEFT  = Buffer.from([ESC, 0x61, 0x00]);
const CMD_ALIGN_CTR   = Buffer.from([ESC, 0x61, 0x01]);
const CMD_BOLD_ON     = Buffer.from([ESC, 0x45, 0x01]);
const CMD_BOLD_OFF    = Buffer.from([ESC, 0x45, 0x00]);
const CMD_DBL_SIZE    = Buffer.from([ESC, 0x21, 0x30]);
const CMD_NORMAL_SIZE = Buffer.from([ESC, 0x21, 0x00]);
const CMD_FEED_5MM    = Buffer.from([ESC, 0x4A, 0x28]); // 40 dots ≈ 5mm on 203dpi printers
// Epson / ESC-POS: GS V 0 — full cut
const CMD_EPSON_CUT   = Buffer.from([GS,  0x56, 0x00]);
// Star mC-Print3 / MCP30 in ESC/POS mode: ESC d 3 (feed 3 lines) then GS V 0 (full cut)
// ESC m (0x1B 0x6D) is StarPRNT-only and does NOT cut in ESC/POS mode.
// GS V 0 (0x1D 0x56 0x00) is the standard ESC/POS full-cut command — confirmed working on MCP30.
const CMD_STAR_FEED   = Buffer.from([ESC, 0x64, 0x03]);
const CMD_STAR_CUT    = Buffer.from([GS,  0x56, 0x00]);

const COL = 42; // chars per line on 80mm paper

// ── Helpers ──────────────────────────────────────────────────────────────────
function lf(n = 1): Buffer {
  return Buffer.from(new Array(n).fill(LF));
}

function row(text: string): Buffer {
  return Buffer.from(text.slice(0, COL) + '\n', 'utf-8');
}

function centred(text: string): Buffer {
  const pad = Math.max(0, Math.floor((COL - text.length) / 2));
  return Buffer.from(' '.repeat(pad) + text + '\n', 'utf-8');
}

function divider(char = '-'): Buffer {
  return Buffer.from(char.repeat(COL) + '\n', 'utf-8');
}

function twoCol(left: string, right: string): Buffer {
  const gap   = Math.max(1, COL - left.length - right.length);
  const line  = left + ' '.repeat(gap) + right;
  return Buffer.from(line.slice(0, COL) + '\n', 'utf-8');
}

function formatAUD(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Receipt builder ───────────────────────────────────────────────────────────
export interface PrintItem {
  name:          string;
  quantity:      number;
  unitPriceCents: number;
  variantName?:  string;
  options?:      string[];
}

export interface PrintJob {
  orderId:             string;
  customerName:        string;
  type:                'pickup' | 'delivery';
  items:               PrintItem[];
  totalCents:          number;
  discountCents?:      number;
  loyaltyPointsEarned?: number;
  notes?:              string;
  scheduledFor?:       Date | null;
  printerBrand?:       'epson' | 'star';
}

export function buildReceiptBytes(job: PrintJob): Buffer {
  // Resolve brand early — needed both at the top (init) and at the bottom (cut).
  const isStar = job.printerBrand === 'star';

  const sydney = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const dateStr = sydney.toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
  const timeStr = sydney.toLocaleTimeString('en-AU', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney',
  });
  const shortId = job.orderId.slice(0, 8).toUpperCase();

  const parts: Buffer[] = [
    // Star MCP30: skip ESC @ (0x1B 0x40) — printer does not recognise the init
    // command in ESC/POS mode and prints the 0x40 byte literally as "@".
    ...(isStar ? [] : [CMD_INIT]),
    lf(1),

    // ── Header ───────────────────────────────────────────────────────────────
    CMD_ALIGN_CTR,
    CMD_BOLD_ON,
    Buffer.from('BUTTERFIELD COOKIES\n', 'utf-8'),
    CMD_BOLD_OFF,
    Buffer.from('Merrylands, NSW\n', 'utf-8'),
    divider('='),

    // ── Order type banner ─────────────────────────────────────────────────────
    CMD_BOLD_ON,
    centred(`*** ${job.type === 'delivery' ? 'DELIVERY' : 'PICKUP'} ***`),
    CMD_BOLD_OFF,
    lf(1),

    // ── Order meta ────────────────────────────────────────────────────────────
    CMD_ALIGN_LEFT,
    row(`Order:    #${shortId}`),
    row(`Date:     ${dateStr}`),
    row(`Time:     ${timeStr}`),
    row(`Customer: ${job.customerName}`),
  ];

  if (job.scheduledFor) {
    const sch = new Date(job.scheduledFor).toLocaleString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'Australia/Sydney',
    });
    parts.push(row(`Ready:    ${sch}`));
  }

  if (job.notes?.trim()) {
    parts.push(row(`Notes:    ${job.notes.trim()}`));
  }

  parts.push(divider());

  // ── Items ─────────────────────────────────────────────────────────────────
  for (const item of job.items) {
    const qty       = `${item.quantity}x `;
    const price     = formatAUD(item.unitPriceCents * item.quantity);
    const maxName   = COL - qty.length - price.length - 1;
    const itemName  = item.variantName
      ? `${item.name} (${item.variantName})`
      : item.name;
    const safeName  = itemName.slice(0, maxName).padEnd(maxName, ' ');
    parts.push(Buffer.from(`${qty}${safeName} ${price}\n`, 'utf-8'));
    // Print each selected option indented below the item line
    if (item.options && item.options.length > 0) {
      for (const opt of item.options) {
        parts.push(Buffer.from(`   + ${opt.slice(0, COL - 5)}\n`, 'utf-8'));
      }
    }
  }

  parts.push(divider());

  // ── Totals ────────────────────────────────────────────────────────────────
  if (job.discountCents && job.discountCents > 0) {
    const subtotal = job.totalCents + job.discountCents;
    parts.push(twoCol('Subtotal', formatAUD(subtotal)));
    parts.push(twoCol('Discount', `-${formatAUD(job.discountCents)}`));
    parts.push(divider());
  }

  parts.push(
    CMD_BOLD_ON,
    twoCol('TOTAL', formatAUD(job.totalCents)),
    CMD_BOLD_OFF,
  );

  if (job.loyaltyPointsEarned && job.loyaltyPointsEarned > 0) {
    parts.push(
      lf(1),
      twoCol('Points earned', `+${job.loyaltyPointsEarned} pts`),
    );
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  parts.push(
    lf(1),
    CMD_ALIGN_CTR,
    divider('='),
    CMD_BOLD_ON,
    Buffer.from('Thank you for your order!\n', 'utf-8'),
    CMD_BOLD_OFF,
    Buffer.from('butterfieldcookies.com.au\n', 'utf-8'),
    divider('='),
    lf(3),
    // Star MCP30 (ESC/POS mode): ESC d 3 feeds 3 lines then GS V 0 cuts.
    // The CMD_STAR_FEED already handles paper advance, so CMD_FEED_5MM is skipped.
    // Epson: CMD_FEED_5MM gives a clean 5mm gap then GS V 0 cuts.
    ...(isStar
      ? [CMD_STAR_FEED, CMD_STAR_CUT]
      : [CMD_FEED_5MM, CMD_EPSON_CUT]
    ),
  );

  return Buffer.concat(parts);
}

// ── TCP send ─────────────────────────────────────────────────────────────────
export function printReceipt(
  job:         PrintJob,
  printerIp:   string,
  printerPort  = 9100,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!printerIp?.trim()) {
      reject(new Error('No printer IP configured'));
      return;
    }

    const receipt = buildReceiptBytes(job);
    const socket  = new net.Socket();
    let done      = false;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      // Destroy only if not already closed — do NOT call destroy() before the
      // socket has fully flushed, or the cut command bytes at the end of the
      // receipt buffer will be dropped mid-stream.
      try { socket.destroy(); } catch {}
      if (err) reject(err); else resolve();
    };

    const timer = setTimeout(
      () => finish(new Error(`Printer timeout: could not reach ${printerIp}:${printerPort}`)),
      8000,
    );

    socket.connect(printerPort, printerIp, () => {
      socket.write(receipt, (writeErr) => {
        clearTimeout(timer);
        if (writeErr) { finish(writeErr); return; }
        // Graceful half-close: signals end-of-data to the printer and waits
        // for the OS to flush the send buffer before tearing down the socket.
        // This is critical — destroy() here would abort before the cut command
        // bytes are transmitted.
        socket.end();
      });
    });

    // Resolve once the printer closes its end (receipt fully processed).
    socket.on('close', () => finish());

    socket.on('error', (err) => {
      clearTimeout(timer);
      finish(err);
    });
  });
}
