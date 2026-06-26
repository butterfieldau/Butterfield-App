import PDFDocument from 'pdfkit';

export interface InvoicePdfData {
  invoiceNumber: string;
  invoiceDate:   Date;
  dueDate:       Date;
  status:        string;
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
  totalCents:       number;
  deliveryFeeCents?: number;
  poReference:   string | null | undefined;
  notes:         string | null | undefined;
  paymentTerms:  string | null | undefined;
  invoiceUrl:    string | null | undefined;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, compress: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W = 595 - 80;
    const navy   = '#1A2B4A';
    const grey   = '#6B7280';
    const light  = '#F8FAFC';
    const border = '#E5E7EB';

    // ── Header ──────────────────────────────────────────────────────────────
    doc.rect(0, 0, 595, 80).fill(navy);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
       .text('Butterfield Cookies', 40, 22);
    doc.fillColor('rgba(255,255,255,0.6)').fontSize(8).font('Helvetica')
       .text('COOKIES · COFFEE · DESSERTS', 40, 47);

    doc.fillColor('rgba(255,255,255,0.5)').fontSize(7).font('Helvetica')
       .text('TAX INVOICE', 40, 60, { align: 'right', width: PAGE_W });
    doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold')
       .text(data.invoiceNumber, 40, 60, { align: 'right', width: PAGE_W });

    // ── From / Bill To / Dates ───────────────────────────────────────────────
    const topY = 95;
    const colW = PAGE_W / 3;

    doc.fillColor(grey).fontSize(7).font('Helvetica-Bold')
       .text('FROM', 40, topY, { width: colW });
    doc.fillColor(navy).fontSize(10).font('Helvetica-Bold')
       .text('Butterfield Cookies PTY LTD', 40, topY + 10, { width: colW });
    doc.fillColor(grey).fontSize(8).font('Helvetica')
       .text('2 Main Lane, Merrylands NSW 2160', 40, topY + 22, { width: colW })
       .text('ABN: 24 680 761 166', 40, topY + 32, { width: colW })
       .text('accounts@butterfieldcookies.com.au', 40, topY + 42, { width: colW });

    const col2 = 40 + colW + 10;
    doc.fillColor(grey).fontSize(7).font('Helvetica-Bold')
       .text('BILL TO', col2, topY, { width: colW });
    doc.fillColor(navy).fontSize(10).font('Helvetica-Bold')
       .text(data.companyName, col2, topY + 10, { width: colW });
    doc.fillColor(grey).fontSize(8).font('Helvetica');
    let billY = topY + 22;
    if (data.abn) { doc.text(`ABN: ${data.abn}`, col2, billY, { width: colW }); billY += 10; }
    if (data.email) { doc.text(data.email, col2, billY, { width: colW }); billY += 10; }
    if (data.address) { doc.text(data.address, col2, billY, { width: colW }); billY += 10; }
    if (data.accountRef) { doc.text(`Ref: ${data.accountRef}`, col2, billY, { width: colW }); }

    const col3 = col2 + colW + 10;
    doc.fillColor(grey).fontSize(7).font('Helvetica-Bold')
       .text('INVOICE DETAILS', col3, topY, { width: colW });

    const detailRows: [string, string][] = [
      ['Date',  fmtDate(data.invoiceDate)],
      ['Due',   fmtDate(data.dueDate)],
      ['Terms', data.paymentTerms ?? 'Net 30 days'],
      ...(data.poReference ? [['PO Ref', data.poReference] as [string, string]] : []),
    ];
    let detY = topY + 10;
    for (const [label, value] of detailRows) {
      doc.fillColor(grey).fontSize(8).font('Helvetica').text(label, col3, detY, { width: colW / 2 });
      doc.fillColor(navy).fontSize(8).font('Helvetica-Bold').text(value, col3 + colW / 2, detY, { width: colW / 2, align: 'right' });
      detY += 12;
    }

    // ── Line items table ─────────────────────────────────────────────────────
    const tableY = topY + 72;
    const headerH = 20;

    doc.rect(40, tableY, PAGE_W, headerH).fill(navy);
    doc.fillColor('rgba(255,255,255,0.7)').fontSize(7).font('Helvetica-Bold');
    doc.text('DESCRIPTION', 50, tableY + 6, { width: PAGE_W - 200 });
    doc.text('QTY', 50 + PAGE_W - 190, tableY + 6, { width: 50, align: 'right' });
    doc.text('UNIT', 50 + PAGE_W - 130, tableY + 6, { width: 60, align: 'right' });
    doc.text('AMOUNT', 50 + PAGE_W - 60, tableY + 6, { width: 50, align: 'right' });

    const deliveryFeeCents = data.deliveryFeeCents ?? 0;
    const allLines = [
      ...data.items.map(i => ({ desc: i.description, qty: i.qty, unit: i.unitCents, total: i.qty * i.unitCents })),
      ...(deliveryFeeCents > 0 ? [{ desc: 'Delivery fee', qty: 1, unit: deliveryFeeCents, total: deliveryFeeCents }] : []),
    ];

    let rowY = tableY + headerH;
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      const bg = i % 2 === 0 ? '#FFFFFF' : light;
      doc.rect(40, rowY, PAGE_W, 18).fill(bg);
      doc.fillColor('#1C1C1E').fontSize(8).font('Helvetica')
         .text(line.desc, 50, rowY + 5, { width: PAGE_W - 200 });
      doc.fillColor(grey).fontSize(8)
         .text(String(line.qty), 50 + PAGE_W - 190, rowY + 5, { width: 50, align: 'right' })
         .text(fmt(line.unit), 50 + PAGE_W - 130, rowY + 5, { width: 60, align: 'right' });
      doc.fillColor('#1C1C1E').font('Helvetica-Bold')
         .text(fmt(line.total), 50 + PAGE_W - 60, rowY + 5, { width: 50, align: 'right' });
      rowY += 18;
    }

    doc.rect(40, rowY, PAGE_W, 1).fill(border);
    rowY += 8;

    // ── Totals ───────────────────────────────────────────────────────────────
    const subtotalCents = data.items.reduce((s, i) => s + i.qty * i.unitCents, 0);
    const gstCents      = Math.round(subtotalCents / 11);
    const exclGstCents  = subtotalCents - gstCents;
    const totalCents    = data.totalCents || subtotalCents + deliveryFeeCents;

    const totalLines: [string, string, boolean][] = [
      ['Subtotal (excl. GST)', fmt(exclGstCents), false],
      ['GST (10%)',            fmt(gstCents),      false],
      ...(deliveryFeeCents > 0 ? [['Delivery fee', fmt(deliveryFeeCents), false] as [string, string, boolean]] : []),
      ['Total Due (AUD)',      fmt(totalCents),    true],
    ];

    for (const [label, value, isBold] of totalLines) {
      const x = 40 + PAGE_W - 200;
      if (isBold) {
        doc.rect(x, rowY, 200, 22).fill(navy);
        doc.fillColor('rgba(255,255,255,0.8)').fontSize(9).font('Helvetica').text(label, x + 10, rowY + 7, { width: 100 });
        doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text(value, x + 10, rowY + 5, { width: 180, align: 'right' });
        rowY += 28;
      } else {
        doc.fillColor(grey).fontSize(8).font('Helvetica').text(label, x + 10, rowY + 2, { width: 100 });
        doc.fillColor('#1C1C1E').font('Helvetica-Bold').text(value, x + 10, rowY + 2, { width: 180, align: 'right' });
        rowY += 14;
      }
    }
    rowY += 12;

    // ── Bank transfer ────────────────────────────────────────────────────────
    doc.rect(40, rowY, PAGE_W / 2 - 4, 70).fill(light).strokeColor(border).lineWidth(0.5).stroke();
    doc.fillColor(grey).fontSize(7).font('Helvetica-Bold')
       .text('BANK TRANSFER', 50, rowY + 8, { width: PAGE_W / 2 - 20 });
    doc.fillColor(navy).fontSize(8).font('Helvetica-Bold')
       .text('Butterfield Cookies PTY LTD', 50, rowY + 18, { width: PAGE_W / 2 - 20 });
    doc.fillColor(grey).fontSize(8).font('Helvetica')
       .text(`BSB: 067 873   |   Account: 1465 8181`, 50, rowY + 30, { width: PAGE_W / 2 - 20 })
       .text(`ABN: 24 680 761 166`, 50, rowY + 42, { width: PAGE_W / 2 - 20 });
    doc.fillColor(grey).fontSize(7).font('Helvetica')
       .text(`Reference: `, 50, rowY + 54, { continued: true, width: PAGE_W / 2 - 20 });
    doc.fillColor('#1493FF').fontSize(8).font('Helvetica-Bold')
       .text(data.invoiceNumber, { width: PAGE_W / 2 - 20 });

    // ── Notes ────────────────────────────────────────────────────────────────
    if (data.notes) {
      rowY += 80;
      doc.rect(40, rowY, PAGE_W, 28).fill('#FFFBEB');
      doc.fillColor('#92400E').fontSize(7).font('Helvetica-Bold')
         .text('NOTES: ', 50, rowY + 10, { continued: true, width: PAGE_W - 20 });
      doc.fillColor('#78350F').font('Helvetica').text(data.notes, { width: PAGE_W - 20 });
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.rect(0, 770, 595, 72).fill(navy);
    doc.fillColor('rgba(255,255,255,0.4)').fontSize(8).font('Helvetica')
       .text(
         'ABN: 24 680 761 166 · accounts@butterfieldcookies.com.au · 0480 769 995',
         40, 780, { align: 'center', width: PAGE_W },
       )
       .text('Thank you for your continued partnership.', 40, 793, { align: 'center', width: PAGE_W });

    doc.end();
  });
}
