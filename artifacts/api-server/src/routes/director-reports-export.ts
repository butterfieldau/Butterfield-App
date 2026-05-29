import { Router } from 'express';
import ExcelJS from 'exceljs';
import { and, gte, lte, eq, desc } from 'drizzle-orm';
import {
  db, ordersTable, usersTable, wholesaleOrdersTable, wholesaleAccountsTable,
} from '@workspace/db';
import { requireRole } from '../middlewares/auth.js';
import { requireManagerPermission } from '../middlewares/managerPermission.js';

const router = Router();

const BRAND_NAVY  = 'FF1A2B4A';
const BRAND_BLUE  = 'FF1493FF';
const LIGHT_BLUE  = 'FFEBF5FF';
const LIGHT_GREY  = 'FFF5F6FA';
const WHITE       = 'FFFFFFFF';
const BORDER_GREY = 'FFE5E7EB';

function fmtMoney(cents: number) {
  return (cents / 100).toFixed(2);
}

function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fmtDateOnly(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function addBrandHeader(ws: ExcelJS.Worksheet, title: string, cols: number, dateFrom: string, dateTo: string) {
  const colLetter = String.fromCharCode(64 + cols);

  ws.addRow([`Butterfield Cookies — ${title}`]);
  const r1 = ws.lastRow!;
  ws.mergeCells(`A${r1.number}:${colLetter}${r1.number}`);
  r1.font        = { bold: true, size: 14, color: { argb: WHITE }, name: 'Calibri' };
  r1.fill        = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_NAVY } };
  r1.alignment   = { vertical: 'middle', horizontal: 'center' };
  r1.height      = 26;

  ws.addRow([`Date Range: ${dateFrom}  →  ${dateTo}`]);
  const r2 = ws.lastRow!;
  ws.mergeCells(`A${r2.number}:${colLetter}${r2.number}`);
  r2.font        = { size: 10, color: { argb: BRAND_NAVY }, name: 'Calibri', italic: true };
  r2.fill        = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
  r2.alignment   = { vertical: 'middle', horizontal: 'center' };
  r2.height      = 17;

  ws.addRow([]);
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.font      = { bold: true, color: { argb: WHITE }, name: 'Calibri', size: 11 };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_BLUE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border    = {
      top:    { style: 'thin',  color: { argb: BRAND_BLUE } },
      bottom: { style: 'thin',  color: { argb: BRAND_BLUE } },
      left:   { style: 'thin',  color: { argb: BORDER_GREY } },
      right:  { style: 'thin',  color: { argb: BORDER_GREY } },
    };
  });
  row.height = 20;
}

function styleData(row: ExcelJS.Row, isAlt: boolean) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? LIGHT_GREY : WHITE } };
    cell.border = {
      bottom: { style: 'hair', color: { argb: BORDER_GREY } },
      left:   { style: 'hair', color: { argb: BORDER_GREY } },
      right:  { style: 'hair', color: { argb: BORDER_GREY } },
    };
    cell.font = { name: 'Calibri', size: 10 };
  });
  row.height = 16;
}

function freezeAfterHeader(ws: ExcelJS.Worksheet) {
  const headerRow = ws.lastRow?.number ?? 4;
  ws.views = [{ state: 'frozen', ySplit: headerRow }];
}

function addWorksheetWithTabColor(wb: ExcelJS.Workbook, name: string, tabColor: string) {
  const ws = wb.addWorksheet(name);
  (ws.properties as ExcelJS.WorksheetProperties & { tabColor?: { argb: string } }).tabColor = { argb: tabColor };
  return ws;
}

router.get('/reports/export', requireRole('director', 'master', 'manager'), requireManagerPermission('reports'), async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };

  if (!from || !to) {
    return res.status(400).json({ error: 'Query params "from" and "to" are required (YYYY-MM-DD)' });
  }

  const fromDate = new Date(`${from}T00:00:00+10:00`);
  const toDate   = new Date(`${to}T23:59:59+10:00`);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }

  const dateFromLabel = fmtDateOnly(fromDate);
  const dateToLabel   = fmtDateOnly(toDate);

  const [orders, allUsers, wsAccounts, newCustomers] = await Promise.all([
    db.select().from(ordersTable)
      .where(and(gte(ordersTable.createdAt, fromDate), lte(ordersTable.createdAt, toDate)))
      .orderBy(desc(ordersTable.createdAt)),
    db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone }).from(usersTable),
    db.select({ id: wholesaleAccountsTable.id, userId: wholesaleAccountsTable.userId, companyName: wholesaleAccountsTable.companyName }).from(wholesaleAccountsTable),
    db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, createdAt: usersTable.createdAt })
      .from(usersTable)
      .where(and(
        eq(usersTable.role, 'customer' as any),
        gte(usersTable.createdAt, fromDate),
        lte(usersTable.createdAt, toDate),
      ))
      .orderBy(desc(usersTable.createdAt)),
  ]);

  const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
  const wsMap   = Object.fromEntries(wsAccounts.map(w => [w.userId, w]));

  const enriched = orders.map(o => ({
    ...o,
    customerName:  wsMap[o.userId]?.companyName ?? userMap[o.userId]?.name  ?? 'Unknown',
    customerEmail: userMap[o.userId]?.email ?? '',
    customerPhone: userMap[o.userId]?.phone ?? '',
  }));

  const activeOrders     = enriched.filter(o => !['cancelled','refunded'].includes(o.status));
  const completedOrders  = enriched.filter(o => o.status === 'completed');
  const cancelledOrders  = enriched.filter(o => o.status === 'cancelled');
  const refundedOrders   = enriched.filter(o => o.status === 'refunded');
  const deliveryOrders   = enriched.filter(o => o.type === 'delivery');
  const pickupOrders     = enriched.filter(o => o.type === 'pickup');

  const totalRevenueCents = activeOrders.reduce((s, o) => s + (o.totalCents ?? 0), 0);
  const avgOrderCents     = activeOrders.length > 0 ? Math.round(totalRevenueCents / activeOrders.length) : 0;

  const itemMap = new Map<string, { name: string; quantity: number; revenueCents: number; addons: string[] }>();
  for (const order of activeOrders) {
    const items = Array.isArray(order.items) ? order.items as any[] : [];
    for (const item of items) {
      const name  = ((item?.name ?? item?.productName ?? item?.title ?? '') as string).trim() || 'Unknown';
      const qty   = Math.max(1, Math.floor(Number(item?.quantity ?? 1)));
      const price = Number(item?.price ?? item?.priceCents ?? 0) * qty;
      const addons: string[] = [];
      if (Array.isArray(item?.options)) {
        for (const opt of item.options) {
          const oName = opt?.optionName ?? opt?.name ?? '';
          if (oName) addons.push(oName);
        }
      }
      const existing = itemMap.get(name);
      if (existing) {
        existing.quantity += qty;
        existing.revenueCents += price;
        for (const a of addons) {
          if (!existing.addons.includes(a)) existing.addons.push(a);
        }
      } else {
        itemMap.set(name, { name, quantity: qty, revenueCents: price, addons });
      }
    }
  }
  const itemSales = Array.from(itemMap.values()).sort((a, b) => b.quantity - a.quantity);
  const totalItemsSold = itemSales.reduce((s, i) => s + i.quantity, 0);

  const statusMap = new Map<string, number>();
  for (const o of enriched) statusMap.set(o.status, (statusMap.get(o.status) ?? 0) + 1);

  const STATUS_LABELS: Record<string, string> = {
    completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded',
    received: 'Received', being_prepared: 'Being Prepared',
    ready_for_pickup: 'Ready for Pickup', out_for_delivery: 'Out for Delivery',
  };

  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Butterfield Cookies';
  wb.created  = new Date();
  wb.modified = new Date();

  // ─── Sheet 1: Summary ───────────────────────────────────────────────────────
  const wsSummary = addWorksheetWithTabColor(wb, 'Summary', BRAND_NAVY);
  addBrandHeader(wsSummary, 'Business Report', 2, dateFromLabel, dateToLabel);

  const sections: [string, string | number][] = [
    ['REVENUE', ''],
    ['Total Revenue (AUD)',    `$${fmtMoney(totalRevenueCents)}`],
    ['Average Order Value',   `$${fmtMoney(avgOrderCents)}`],
    ['', ''],
    ['ORDERS', ''],
    ['Total Orders',          enriched.length],
    ['Completed Orders',      completedOrders.length],
    ['Cancelled Orders',      cancelledOrders.length],
    ['Refunded Orders',       refundedOrders.length],
    ['Delivery Orders',       deliveryOrders.length],
    ['Pickup Orders',         pickupOrders.length],
    ['', ''],
    ['PRODUCTS', ''],
    ['Total Items Sold',      totalItemsSold],
    ['Unique Products',       itemSales.length],
    ['', ''],
    ['CUSTOMERS', ''],
    ['New Customers',         newCustomers.length],
  ];

  const SECTION_KEYS = new Set(['REVENUE','ORDERS','PRODUCTS','CUSTOMERS']);
  for (const [label, value] of sections) {
    const row = wsSummary.addRow([label, value]);
    if (SECTION_KEYS.has(label as string)) {
      row.getCell(1).font  = { bold: true, size: 11, name: 'Calibri', color: { argb: BRAND_NAVY } };
      row.fill             = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
      row.height           = 18;
      wsSummary.mergeCells(`A${row.number}:B${row.number}`);
    } else if (label === '') {
      row.height = 6;
    } else {
      row.getCell(1).font  = { name: 'Calibri', size: 10, color: { argb: 'FF333333' } };
      row.getCell(2).font  = { bold: true, name: 'Calibri', size: 10 };
      row.getCell(2).alignment = { horizontal: 'right' };
      row.eachCell({ includeEmpty: true }, c => {
        c.border = { bottom: { style: 'hair', color: { argb: BORDER_GREY } } };
      });
    }
  }
  wsSummary.getColumn(1).width = 36;
  wsSummary.getColumn(2).width = 24;

  // ─── Sheet 2: Item Sales ────────────────────────────────────────────────────
  const wsItems = addWorksheetWithTabColor(wb, 'Item Sales', BRAND_BLUE);
  addBrandHeader(wsItems, 'Item Sales', 4, dateFromLabel, dateToLabel);

  const itemHdr = wsItems.addRow(['Item Name', 'Add-ons / Options', 'Qty Sold', 'Revenue (AUD)']);
  styleHeader(itemHdr);
  freezeAfterHeader(wsItems);

  for (const [i, item] of itemSales.entries()) {
    const row = wsItems.addRow([
      item.name,
      item.addons.join(', ') || '—',
      item.quantity,
      parseFloat(fmtMoney(item.revenueCents)),
    ]);
    styleData(row, i % 2 === 1);
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).numFmt    = '"$"#,##0.00';
    row.getCell(4).alignment = { horizontal: 'right' };
  }

  if (itemSales.length > 0) {
    const totRow = wsItems.addRow([
      'TOTAL',
      '',
      itemSales.reduce((s, i) => s + i.quantity, 0),
      parseFloat(fmtMoney(itemSales.reduce((s, i) => s + i.revenueCents, 0))),
    ]);
    totRow.font              = { bold: true, name: 'Calibri', size: 10 };
    totRow.fill              = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    totRow.getCell(3).alignment = { horizontal: 'center' };
    totRow.getCell(4).numFmt = '"$"#,##0.00';
    totRow.getCell(4).alignment = { horizontal: 'right' };
  }

  wsItems.getColumn(1).width = 38;
  wsItems.getColumn(2).width = 28;
  wsItems.getColumn(3).width = 13;
  wsItems.getColumn(4).width = 18;

  // ─── Sheet 3: Order Types ───────────────────────────────────────────────────
  const wsTypes = addWorksheetWithTabColor(wb, 'Order Types', 'FF22C55E');
  addBrandHeader(wsTypes, 'Order Types', 3, dateFromLabel, dateToLabel);

  const typeHdr = wsTypes.addRow(['Order Type', 'Count', 'Revenue (AUD)']);
  styleHeader(typeHdr);
  freezeAfterHeader(wsTypes);

  const typeBreakdown = [
    { label: 'Delivery', orders: deliveryOrders },
    { label: 'Pickup',   orders: pickupOrders   },
  ];
  for (const [i, tb] of typeBreakdown.entries()) {
    const rev = tb.orders.filter(o => !['cancelled','refunded'].includes(o.status)).reduce((s, o) => s + (o.totalCents ?? 0), 0);
    const row = wsTypes.addRow([tb.label, tb.orders.length, parseFloat(fmtMoney(rev))]);
    styleData(row, i % 2 === 1);
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).numFmt    = '"$"#,##0.00';
    row.getCell(3).alignment = { horizontal: 'right' };
  }
  wsTypes.getColumn(1).width = 18;
  wsTypes.getColumn(2).width = 12;
  wsTypes.getColumn(3).width = 18;

  // ─── Sheet 4: Order Status ──────────────────────────────────────────────────
  const wsStatus = addWorksheetWithTabColor(wb, 'Order Status', 'FFF59E0B');
  addBrandHeader(wsStatus, 'Order Status', 2, dateFromLabel, dateToLabel);

  const statusHdr = wsStatus.addRow(['Status', 'Count']);
  styleHeader(statusHdr);
  freezeAfterHeader(wsStatus);

  const statusEntries = Array.from(statusMap.entries()).sort((a, b) => b[1] - a[1]);
  for (const [i, [status, cnt]] of statusEntries.entries()) {
    const row = wsStatus.addRow([STATUS_LABELS[status] ?? status, cnt]);
    styleData(row, i % 2 === 1);
    row.getCell(2).alignment = { horizontal: 'center' };
  }
  wsStatus.getColumn(1).width = 22;
  wsStatus.getColumn(2).width = 12;

  // ─── Sheet 5: New Customers ─────────────────────────────────────────────────
  const wsCust = addWorksheetWithTabColor(wb, 'New Customers', 'FF8B5CF6');
  addBrandHeader(wsCust, 'New Customers', 3, dateFromLabel, dateToLabel);

  const custHdr = wsCust.addRow(['Name', 'Email', 'Registered']);
  styleHeader(custHdr);
  freezeAfterHeader(wsCust);

  if (newCustomers.length === 0) {
    wsCust.addRow(['No new customers in this date range', '', '']);
  } else {
    for (const [i, c] of newCustomers.entries()) {
      const row = wsCust.addRow([c.name ?? '', c.email, fmtDateTime(c.createdAt)]);
      styleData(row, i % 2 === 1);
    }
  }
  wsCust.getColumn(1).width = 28;
  wsCust.getColumn(2).width = 34;
  wsCust.getColumn(3).width = 24;

  // ─── Sheet 6: Detailed Orders ───────────────────────────────────────────────
  const wsOrders = addWorksheetWithTabColor(wb, 'Detailed Orders', 'FFD20001');
  addBrandHeader(wsOrders, 'Detailed Orders', 10, dateFromLabel, dateToLabel);

  const ordHdr = wsOrders.addRow([
    'Order #', 'Customer', 'Email', 'Phone',
    'Date & Time', 'Type', 'Status',
    'Items', 'Total Items', 'Total (AUD)', 'Payment',
  ]);
  styleHeader(ordHdr);
  freezeAfterHeader(wsOrders);

  for (const [i, o] of enriched.entries()) {
    const items      = Array.isArray(o.items) ? o.items as any[] : [];
    const itemStr    = items.map((it: any) => {
      const name = ((it?.name ?? it?.productName ?? it?.title ?? '') as string).trim() || 'Item';
      const qty  = it?.quantity ?? 1;
      return `${name} ×${qty}`;
    }).join('\n');
    const totalItems = items.reduce((s: number, it: any) => s + Math.max(1, Number(it?.quantity ?? 1)), 0);

    const row = wsOrders.addRow([
      o.id.slice(-8).toUpperCase(),
      o.customerName,
      o.customerEmail,
      o.customerPhone,
      fmtDateTime(o.createdAt),
      o.type.charAt(0).toUpperCase() + o.type.slice(1),
      STATUS_LABELS[o.status] ?? o.status,
      itemStr,
      totalItems,
      parseFloat(fmtMoney(o.totalCents)),
      o.stripePaymentStatus ?? 'Unknown',
    ]);
    styleData(row, i % 2 === 1);
    row.getCell(7).alignment  = { wrapText: true };
    row.getCell(8).alignment  = { wrapText: true, vertical: 'top' };
    row.getCell(9).alignment  = { horizontal: 'center' };
    row.getCell(10).numFmt    = '"$"#,##0.00';
    row.getCell(10).alignment = { horizontal: 'right' };
    row.height = Math.min(80, Math.max(16, items.length * 16));
  }

  wsOrders.getColumn(1).width  = 12;
  wsOrders.getColumn(2).width  = 24;
  wsOrders.getColumn(3).width  = 30;
  wsOrders.getColumn(4).width  = 16;
  wsOrders.getColumn(5).width  = 22;
  wsOrders.getColumn(6).width  = 12;
  wsOrders.getColumn(7).width  = 18;
  wsOrders.getColumn(8).width  = 40;
  wsOrders.getColumn(9).width  = 12;
  wsOrders.getColumn(10).width = 16;
  wsOrders.getColumn(11).width = 14;

  const filename = `butterfield-report-${from}-to-${to}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-cache');

  await wb.xlsx.write(res);
  return res.end();
});

export default router;
