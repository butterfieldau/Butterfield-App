import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery } from '@tanstack/react-query';
import { InvoiceStatusBadge } from '@/components/OrderStatusBadge';
import { generateInvoiceHtml, type InvoiceLine, type InvoicePdfData } from '@/lib/invoicePdf';
import { api } from '@/lib/api';
import type { Invoice } from '@/types';
import { normalizeOrderItems } from '@/lib/orderItems';

export const WS_REORDER_KEY = '@ws_pending_reorder';
const GLASS_BG     = 'rgba(255,255,255,0.72)';
const GLASS_BORDER = 'rgba(255,255,255,0.9)';
const GLASS_SHADOW = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
} as const;
// ── Colors ───────────────────────────────────────────────────────────────────
const BG    = '#EFF6FF';
const CARD  = '#FFFFFF';
const BLUE  = '#1493FF';
const GREEN = '#22C55E';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER= '#E5E7EB';
const RED   = '#EF4444';
// ── Order status config ───────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: 'Pending',    color: '#3B82F6', bg: '#DBEAFE' },
  processing: { label: 'Processing', color: '#F59E0B', bg: '#FEF3C7' },
  dispatched: { label: 'Dispatched', color: '#8B5CF6', bg: '#EDE9FE' },
  delivered:  { label: 'Delivered',  color: '#22C55E', bg: '#DCFCE7' },
  cancelled:  { label: 'Cancelled',  color: '#EF4444', bg: '#FEE2E2' },
  overdue:    { label: 'Overdue',    color: '#DC2626', bg: '#FEE2E2' },
};
// ── Invoice status config ─────────────────────────────────────────────────────
const INV_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  paid:    { label: 'Paid',    color: '#22C55E', bg: '#DCFCE7' },
  pending: { label: 'Pending', color: '#F59E0B', bg: '#FEF3C7' },
  overdue: { label: 'Overdue', color: '#DC2626', bg: '#FEE2E2' },
};
const BRAND_BG: Record<string, string> = {
  Visa: '#1A3A8C', Mastercard: '#8C1B1B', Amex: '#1B5C8C',
};
const STATUS_STEPS = ['pending', 'processing', 'dispatched', 'delivered'];
const FILTERS = ['All', 'Overdue', 'pending', 'processing', 'dispatched', 'delivered', 'cancelled'];
const FILTER_LABELS: Record<string, string> = {
  All: 'All', Overdue: 'Overdue', pending: 'Pending', processing: 'Processing',
  dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled',
};
function isOverdue(order: any): boolean {
  if (!order.scheduledDate) return false;
  if (order.status === 'delivered' || order.status === 'cancelled') return false;
  return new Date(order.scheduledDate) < new Date();
}
// ── Invoice helpers ───────────────────────────────────────────────────────────
function mapOrderToInvoice(order: any): Invoice {
  const createdAt = new Date(order.createdAt);
  const dueAt     = order.invoiceDueDate ? new Date(order.invoiceDueDate) : new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const now       = new Date();
  let status: Invoice['status'];
  const normalizedInvoiceStatus = String(order.invoiceStatus ?? '').toLowerCase();
  if (order.isPaid || String(order.stripePaymentStatus ?? '').toLowerCase() === 'paid' || normalizedInvoiceStatus === 'paid' || order.status === 'delivered') {
    status = 'paid';
  } else if (normalizedInvoiceStatus === 'voided' || normalizedInvoiceStatus === 'failed' || order.status === 'cancelled') {
    status = 'pending';
  } else if (normalizedInvoiceStatus === 'overdue') {
    status = 'overdue';
  } else if (dueAt < now) {
    status = 'overdue';
  } else {
    status = 'pending';
  }
  return {
    id:      order.id,
    number:  order.invoiceNumber ?? order.poReference ?? `INV-${order.id.slice(0, 6).toUpperCase()}`,
    date:    createdAt.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }),
    dueDate: dueAt.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }),
    amount:  (order.totalCents ?? 0) / 100,
    status,
  };
}
function getOrderLines(order: any): InvoiceLine[] {
  const items = normalizeOrderItems(order?.items);
  if (items.length > 0) {
    return items.map((item) => ({
      description: item.name,
      qty:         item.quantity,
      unitPrice:   item.unitPriceCents / 100,
    }));
  }
  return [{ description: 'Wholesale Order', qty: 1, unitPrice: (order?.totalCents ?? 0) / 100 }];
}
function buildInvoiceData(invoice: Invoice, lines: InvoiceLine[], account: any): InvoicePdfData {
  return {
    number:          invoice.number,
    date:            invoice.date,
    dueDate:         invoice.dueDate,
    status:          invoice.status,
    companyName:     account?.companyName ?? 'Wholesale Customer',
    abn:             account?.abn ?? '',
    contactEmail:    account?.accountsEmail ?? account?.email ?? '',
    deliveryAddress: account?.deliveryAddress ?? '',
    accountNumber:   account?.id?.slice(0, 8).toUpperCase() ?? '',
    lines,
  };
}
// ── Order detail modal ────────────────────────────────────────────────────────
function OrderDetailModal({ order, onClose, onReorder }: { order: any | null; onClose: () => void; onReorder: (o: any) => void }) {
  const insets = useSafeAreaInsets();
  if (!order) return null;
  const cfg    = STATUS_CONFIG[order.status] ?? { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
  const items  = normalizeOrderItems(order.items);
  const stepIdx = STATUS_STEPS.indexOf(order.status);
  const subtotal = order.totalCents ?? 0;
  const gst = Math.round(subtotal / 11);
  const overdue = isOverdue(order);
  return (
    <Modal visible={!!order} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={[mdl.header, { paddingTop: insets.top + 8, backgroundColor: CARD, borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={mdl.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={mdl.title}>Order #{order.poReference ?? order.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={mdl.subtitle}>{new Date(order.createdAt).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {overdue && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FECACA' }}>
              <Feather name="alert-circle" size={15} color={RED} />
              <Text style={{ color: RED, fontWeight: '600', fontSize: 13, flex: 1 }}>Delivery date has passed — contact your account manager</Text>
            </View>
          )}
          <View style={mdl.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={mdl.sectionTitle}>Order Status</Text>
              <View style={{ backgroundColor: cfg.bg, borderColor: cfg.color, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                <Text style={{ color: cfg.color, fontWeight: '600', fontSize: 12 }}>{cfg.label}</Text>
              </View>
            </View>
            {stepIdx >= 0 && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {STATUS_STEPS.map((step, i) => (
                  <View key={step} style={{ flex: 1 }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= stepIdx ? cfg.color : BORDER }} />
                    <Text style={{ fontSize: 9, color: i <= stepIdx ? cfg.color : MUTED, fontWeight: '500', marginTop: 4, textAlign: 'center' }}>
                      {step.charAt(0).toUpperCase() + step.slice(1)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={[mdl.sectionTitle, { marginBottom: 8 }]}>Items ({items.length})</Text>
            {items.map((item, i: number) => {
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: BORDER, gap: 10 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#E0F5FE', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: BLUE, fontWeight: '700', fontSize: 12 }}>{item.quantity}</Text>
                  </View>
                  <Text style={{ flex: 1, color: TEXT, fontWeight: '500', fontSize: 13 }}>{item.name}</Text>
                  <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>${(item.lineTotalCents / 100).toFixed(2)}</Text>
                </View>
              );
            })}
            <Text style={[mdl.sectionTitle, { marginBottom: 8 }]}>Order Summary</Text>
            <InfoRow label="Subtotal (ex. GST)" value={`$${((subtotal - gst) / 100).toFixed(2)}`} />
            <InfoRow label="GST (10%)"           value={`$${(gst / 100).toFixed(2)}`} />
            <InfoRow label="Total (AUD)"          value={`$${(subtotal / 100).toFixed(2)}`} valueColor={BLUE} />
            {order.deliveryType && <InfoRow label="Delivery" value={order.deliveryType === 'pickup' ? 'In-store Pickup' : 'Delivery'} icon="truck" />}
            {order.deliveryAddress && <InfoRow label="Address" value={order.deliveryAddress} icon="map-pin" />}
          </View>
          <Pressable
            onPress={() => onReorder(order)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BLUE, padding: 16, borderRadius: 14 }}
          >
            <Feather name="refresh-cw" size={15} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Reorder</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
function InfoRow({ label, value, icon, valueColor }: { label: string; value: string; icon?: any; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: BORDER }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {icon && <Feather name={icon} size={12} color={MUTED} />}
        <Text style={{ color: MUTED, fontWeight: '400', fontSize: 13 }}>{label}</Text>
      </View>
      <Text style={{ color: valueColor ?? TEXT, fontWeight: '500', fontSize: 13, maxWidth: '55%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}
// ── Invoice detail modal ──────────────────────────────────────────────────────
function InvoiceDetailModal({
  invoice, lines, account, defCard, onClose, onPdf, onPay, pdfLoading,
}: {
  invoice: Invoice | null; lines: InvoiceLine[]; account: any; defCard: any;
  onClose: () => void; onPdf: (inv: Invoice) => void; onPay: (inv: Invoice) => void; pdfLoading: boolean;
}) {
  const insets    = useSafeAreaInsets();
  if (!invoice) return null;
  const subtotal  = invoice.amount;
  const gst       = subtotal / 11;
  const excGst    = subtotal - gst;
  const cfg       = INV_STATUS[invoice.status] ?? { label: invoice.status, color: MUTED, bg: '#F3F4F6' };
  const isOvd     = invoice.status === 'overdue';
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={[mdl.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} style={mdl.closeBtn}><Feather name="x" size={20} color={TEXT} /></Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={mdl.title}>{invoice.number}</Text>
            <Text style={mdl.subtitle}>Issued {invoice.date}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {isOvd && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12 }}>
              <Feather name="alert-triangle" size={14} color={RED} />
              <Text style={{ color: RED, fontWeight: '600', fontSize: 13, flex: 1 }}>This invoice is overdue — please contact your account manager</Text>
            </View>
          )}
          <View style={mdl.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={mdl.sectionTitle}>Invoice Status</Text>
                <Text style={{ color: isOvd ? RED : MUTED, fontWeight: '400', fontSize: 12, marginTop: 4 }}>Due {invoice.dueDate}</Text>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, backgroundColor: cfg.bg, borderColor: cfg.color }}>
                <Text style={{ color: cfg.color, fontWeight: '600', fontSize: 12 }}>{cfg.label}</Text>
              </View>
            </View>
          </View>
          <View style={mdl.card}>
            <Text style={[mdl.sectionTitle, { marginBottom: 4 }]}>Items ({lines.length})</Text>
            {lines.map((line, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: i < lines.length - 1 ? 1 : 0, borderBottomColor: BORDER, gap: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#E0F5FE', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: BLUE, fontWeight: '700', fontSize: 12 }}>{line.qty}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TEXT, fontWeight: '500', fontSize: 13 }}>{line.description}</Text>
                  <Text style={{ color: MUTED, fontWeight: '400', fontSize: 11, marginTop: 2 }}>${line.unitPrice.toFixed(2)} each</Text>
                </View>
                <Text style={{ color: TEXT, fontWeight: '600', fontSize: 13 }}>${(line.qty * line.unitPrice).toFixed(2)}</Text>
              </View>
            ))}
          </View>
          <View style={mdl.card}>
            <Text style={[mdl.sectionTitle, { marginBottom: 8 }]}>Invoice Total</Text>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: MUTED, fontWeight: '400', fontSize: 13 }}>Subtotal (ex. GST)</Text>
                <Text style={{ color: TEXT, fontWeight: '400', fontSize: 13 }}>${excGst.toFixed(2)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: MUTED, fontWeight: '400', fontSize: 13 }}>GST (10%)</Text>
                <Text style={{ color: MUTED, fontWeight: '400', fontSize: 13 }}>${gst.toFixed(2)}</Text>
              </View>
              <View style={{ height: 1, backgroundColor: BORDER }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15 }}>Total (AUD)</Text>
                <Text style={{ color: BLUE, fontWeight: '700', fontSize: 15 }}>${subtotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</Text>
              </View>
            </View>
          </View>
          {account && (
            <View style={mdl.card}>
              <Text style={[mdl.sectionTitle, { marginBottom: 4 }]}>Billing Details</Text>
              {account.companyName    && <InfoRow label="Billed To"  value={account.companyName} />}
              {account.abn            && <InfoRow label="ABN"        value={account.abn} />}
              {account.deliveryAddress && <InfoRow label="Delivery"  value={account.deliveryAddress} />}
              {account.id             && <InfoRow label="Account #"  value={account.id.slice(0, 8).toUpperCase()} />}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => onPdf(invoice)}
              disabled={pdfLoading}
              style={[mdl.actionBtn, mdl.ghostBtn, { opacity: pdfLoading ? 0.7 : 1 }]}
            >
              {pdfLoading ? <ActivityIndicator size="small" color={BLUE} /> : <Feather name="download" size={15} color={BLUE} />}
              <Text style={mdl.ghostBtnText}>{pdfLoading ? 'Saving…' : 'Download PDF'}</Text>
            </Pressable>
            {invoice.status !== 'paid' && (
              <Pressable onPress={() => onPay(invoice)} style={[mdl.actionBtn, mdl.solidBtn]}>
                <Feather name="credit-card" size={15} color="#fff" />
                <Text style={mdl.solidBtnText}>{defCard ? `Pay •${defCard.last4}` : 'Pay Invoice'}</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
// ── Main Screen ───────────────────────────────────────────────────────────────
export default function WholesaleOrdersScreen() {
  const [subtab, setSubtab]             = useState<'orders' | 'invoices'>('orders');
  const [filter, setFilter]             = useState('All');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [loadingId, setLoadingId]       = useState<string | null>(null);
  // ── Orders query ──────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['wholesale-orders'],
    queryFn:  () => api.wholesale.orders(),
    retry: 1,
    refetchInterval: 60000,
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const allOrders: any[] = data?.data ?? [];
  const orders = allOrders.filter((o) => {
    if (filter === 'All') return true;
    if (filter === 'Overdue') return isOverdue(o);
    return o.status === filter;
  });
  const overdueCount = allOrders.filter(isOverdue).length;
  // ── Invoices query ────────────────────────────────────────────────────────
  const { data: invData, isLoading: invLoading } = useQuery({
    queryKey: ['wholesale-invoices'],
    queryFn:  api.wholesale.invoices,
  });
  const { data: accountData } = useQuery({
    queryKey: ['wholesale-account'],
    queryFn:  api.wholesale.account,
  });
  const { data: cardsData } = useQuery({ queryKey: ['wholesale-cards'], queryFn: api.wholesale.cards, retry: 1 });
  const rawInvoiceOrders: any[]  = invData?.data ?? [];
  const invoices: Invoice[]      = rawInvoiceOrders.map(mapOrderToInvoice);
  const orderMap: Record<string, any> = Object.fromEntries(rawInvoiceOrders.map(o => [o.id, o]));
  const account = accountData?.data;
  const cards   = cardsData?.data ?? [];
  const defCard = cards.find((c: any) => c.isDefault) ?? cards[0];
  const totalPending = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.amount, 0);
  const invOverdueCount = invoices.filter(i => i.status === 'overdue').length;
  const selectedLines = selectedInvoice ? getOrderLines(orderMap[selectedInvoice.id]) : [];
  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleReorder = async (order: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const rawItems: any[] = Array.isArray(order.items) ? order.items : [];
    if (rawItems.length === 0) { Alert.alert('No items', 'This order has no items to reorder.'); return; }
    const reorderItems = rawItems.map((item: any) => ({
      productId:   item.productId ?? item.product_id ?? item.id ?? '',
      qty:         Number(item.qty ?? item.quantity ?? 1),
      productName: item.productName ?? item.name ?? '',
    })).filter(i => i.productId);
    await AsyncStorage.setItem(WS_REORDER_KEY, JSON.stringify(reorderItems));
    setSelectedOrder(null);
    router.navigate('/(wholesale)/catalog');
  };
  const handleDownload = async (invoice: Invoice) => {
    setLoadingId(invoice.id);
    try {
      const sourceOrder = orderMap[invoice.id];
      if (sourceOrder?.invoicePdfUrl || sourceOrder?.invoiceUrl) {
        await WebBrowser.openBrowserAsync(sourceOrder.invoicePdfUrl || sourceOrder.invoiceUrl);
        return;
      }
      const lines = getOrderLines(orderMap[invoice.id]);
      if (Platform.OS === 'web') {
        const html = generateInvoiceHtml(buildInvoiceData(invoice, lines, account));
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 500); }
        return;
      }
      const html = generateInvoiceHtml(buildInvoiceData(invoice, lines, account));
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Invoice ${invoice.number}`, UTI: 'com.adobe.pdf' });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (e: any) { Alert.alert('PDF Error', e?.message ?? 'Could not generate PDF.'); }
    finally { setLoadingId(null); }
  };
  const handlePay = (invoice: Invoice) => {
    const sourceOrder = orderMap[invoice.id];
    if (sourceOrder?.isPaid || String(sourceOrder?.stripePaymentStatus ?? '').toLowerCase() === 'paid') {
      Alert.alert('Already paid', 'This invoice has already been paid.');
      return;
    }
    if (sourceOrder?.invoiceUrl) {
      WebBrowser.openBrowserAsync(sourceOrder.invoiceUrl).catch(() => {
        Alert.alert('Invoice unavailable', 'We could not open this invoice right now.');
      });
      return;
    }
    if (!defCard) {
      Alert.alert('Invoice unavailable', 'This invoice is still being prepared. Please check back in a moment.');
      return;
    }
    Alert.alert('Invoice unavailable', 'This invoice is still being prepared. Please check back in a moment.');
  };
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <OrderDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onReorder={handleReorder}
      />
      <InvoiceDetailModal
        invoice={selectedInvoice}
        lines={selectedLines}
        account={account}
        defCard={defCard}
        onClose={() => setSelectedInvoice(null)}
        onPdf={handleDownload}
        onPay={handlePay}
        pdfLoading={loadingId === selectedInvoice?.id}
      />
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <View style={{ backgroundColor: BG, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10 }}>
        {/* Page title row */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: TEXT }}>
            {subtab === 'orders' ? 'Orders' : 'Invoices'}
          </Text>
          {subtab === 'orders' && (
            <Text style={{ color: MUTED, fontWeight: '400', fontSize: 15 }}>{allOrders.length} total</Text>
          )}
        </View>
        {/* Sub-tab switcher */}
        <View style={st.segmentRow}>
          {(['orders', 'invoices'] as const).map(tab => (
            <Pressable
              key={tab}
              onPress={() => { setSubtab(tab); Haptics.selectionAsync(); }}
              style={[st.segmentBtn, subtab === tab && st.segmentBtnActive]}
            >
              <Feather
                name={tab === 'orders' ? 'file-text' : 'dollar-sign'}
                size={13}
                color={subtab === tab ? '#fff' : MUTED}
              />
              <Text style={[st.segmentLabel, subtab === tab && st.segmentLabelActive]}>
                {tab === 'orders' ? 'Orders' : 'Invoices'}
              </Text>
            </Pressable>
          ))}
        </View>
        {/* Context row below segment */}
        {subtab === 'orders' ? (
          <FlatList
            data={FILTERS}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={f => f}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item: f }) => {
              const active = filter === f;
              const isOvdFilter = f === 'Overdue';
              return (
                <Pressable
                  onPress={() => { setFilter(f); Haptics.selectionAsync(); }}
                  style={[st.filterPill, {
                    backgroundColor: active ? (isOvdFilter ? '#FEE2E2' : BLUE) : 'rgba(255,255,255,0.7)',
                    borderColor:     active ? (isOvdFilter ? '#FCA5A5' : BLUE) : BORDER,
                  }]}
                >
                  <Text style={{ color: active ? (isOvdFilter ? '#991B1B' : '#fff') : MUTED, fontWeight: '600', fontSize: 12 }}>
                    {FILTER_LABELS[f] ?? f}{isOvdFilter && overdueCount > 0 ? ` (${overdueCount})` : ''}
                  </Text>
                </Pressable>
              );
            }}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={[st.statCard, { backgroundColor: 'rgba(255,255,255,0.72)', borderColor: 'rgba(255,255,255,0.9)' }]}>
              <Text style={[st.statLabel, { color: MUTED }]}>OUTSTANDING</Text>
              <Text style={[st.statValue, { color: BLUE }]}>${totalPending.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</Text>
            </View>
            {invOverdueCount > 0 && (
              <View style={[st.statCard, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
                <Text style={[st.statLabel, { color: '#991B1B' }]}>OVERDUE</Text>
                <Text style={[st.statValue, { color: '#991B1B' }]}>{invOverdueCount} invoice{invOverdueCount !== 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>
        )}
      </View>
      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      {subtab === 'orders' ? (
        isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={BLUE} /></View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={(o: any) => o.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
                <Feather name="file-text" size={36} color={BORDER} />
                <Text style={{ color: MUTED, fontWeight: '400', fontSize: 14, textAlign: 'center' }}>
                  {filter === 'Overdue' ? 'No overdue orders.' : 'No orders yet.\nBrowse the catalog to place your first order.'}
                </Text>
              </View>
            }
            renderItem={({ item: order }: { item: any }) => {
              const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
              const items = normalizeOrderItems(order.items);
              const stepIdx = STATUS_STEPS.indexOf(order.status);
              const overdue = isOverdue(order);
              return (
                <Pressable
                  onPress={() => { setSelectedOrder(order); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={[st.orderCard, { backgroundColor: CARD, borderLeftColor: overdue ? RED : cfg.color }]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15 }}>
                        #{order.poReference ?? order.id.slice(0, 8).toUpperCase()}
                      </Text>
                      <Text style={{ color: MUTED, fontWeight: '400', fontSize: 11, marginTop: 2 }}>
                        {new Date(order.createdAt).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                      {overdue && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <Feather name="alert-circle" size={11} color={RED} />
                          <Text style={{ color: RED, fontWeight: '600', fontSize: 11 }}>Overdue</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <View style={{ backgroundColor: cfg.bg, borderColor: cfg.color, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                        <Text style={{ color: cfg.color, fontWeight: '600', fontSize: 11 }}>{cfg.label}</Text>
                      </View>
                      <Text style={{ color: BLUE, fontWeight: '700', fontSize: 15 }}>${(order.totalCents / 100).toFixed(2)}</Text>
                    </View>
                  </View>
                  {stepIdx >= 0 && (
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
                      {STATUS_STEPS.map((step, i) => (
                        <View key={step} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= stepIdx ? cfg.color : BORDER }} />
                      ))}
                    </View>
                  )}
                  <View style={{ gap: 2, marginTop: 8 }}>
                    {items.slice(0, 2).map((item, i: number) => {
                      return (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ color: TEXT, fontWeight: '400', fontSize: 12, flex: 1 }}>{item.quantity}× {item.name}</Text>
                          <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>${(item.lineTotalCents / 100).toFixed(2)}</Text>
                        </View>
                      );
                    })}
                    {items.length > 2 && (
                      <Text style={{ color: BLUE, fontWeight: '400', fontSize: 11, marginTop: 2 }}>+{items.length - 2} more — tap to view all</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    {order.scheduledDate ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather name="truck" size={11} color={overdue ? RED : MUTED} />
                        <Text style={{ color: overdue ? RED : MUTED, fontWeight: '400', fontSize: 11 }}>
                          {order.deliveryType === 'pickup' ? 'Pickup' : 'Delivery'} · {new Date(order.scheduledDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                    ) : <View />}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Text style={{ color: BLUE, fontWeight: '500', fontSize: 11 }}>Details</Text>
                      <Feather name="chevron-right" size={12} color={BLUE} />
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )
      ) : (
        /* ── INVOICES LIST ─────────────────────────────────────────────────── */
        <FlatList
          data={invoices}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            invLoading
              ? <ActivityIndicator color={BLUE} style={{ marginTop: 60 }} />
              : (
                <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
                  <Feather name="file-text" size={40} color={MUTED} />
                  <Text style={{ color: MUTED, fontWeight: '400', fontSize: 14 }}>No invoices yet</Text>
                  <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>Your invoices appear here once you place orders</Text>
                </View>
              )
          }
          ListHeaderComponent={
            <Pressable
              onPress={() => router.push('/(wholesale)/profile' as any)}
              style={st.payMethod}
            >
              {defCard ? (
                <>
                  <View style={[st.payIcon, { backgroundColor: BRAND_BG[defCard.cardBrand] ?? '#1A3A8C' }]}>
                    <Feather name="credit-card" size={14} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.payLabel}>Payment Method</Text>
                    <Text style={st.payValue}>{defCard.cardBrand} •••• {defCard.last4}</Text>
                  </View>
                  <Text style={{ color: BLUE, fontWeight: '600', fontSize: 12 }}>Manage</Text>
                  <Feather name="chevron-right" size={15} color={MUTED} />
                </>
              ) : (
                <>
                  <View style={[st.payIcon, { backgroundColor: '#E0F5FE' }]}>
                    <Feather name="plus" size={14} color={BLUE} />
                  </View>
                  <Text style={[st.payValue, { color: BLUE }]}>Add a card to pay invoices</Text>
                </>
              )}
            </Pressable>
          }
          renderItem={({ item: invoice }) => {
            const isPdfLoading = loadingId === invoice.id;
            const isOvd        = invoice.status === 'overdue';
            const lineCount    = getOrderLines(orderMap[invoice.id]).length;
            return (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedInvoice(invoice); }}
                style={({ pressed }) => [st.invoiceCard, { borderLeftColor: isOvd ? RED : BLUE, opacity: pressed ? 0.92 : 1 }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.invoiceNum}>{invoice.number}</Text>
                    <Text style={st.invoiceMeta}>{invoice.date} · {lineCount} line{lineCount !== 1 ? 's' : ''}</Text>
                    <Text style={[st.invoiceDue, isOvd && { color: RED }]}>Due {invoice.dueDate}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <InvoiceStatusBadge status={invoice.status} />
                    <Text style={st.invoiceAmount}>${invoice.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); handleDownload(invoice); }}
                    disabled={isPdfLoading}
                    style={[st.actionBtn, st.actionGhost, { opacity: isPdfLoading ? 0.7 : 1, flex: invoice.status !== 'paid' ? 1 : 2 }]}
                  >
                    {isPdfLoading ? <ActivityIndicator size="small" color={BLUE} /> : <Feather name="download" size={13} color={BLUE} />}
                    <Text style={st.actionGhostText}>{isPdfLoading ? 'Saving…' : 'PDF'}</Text>
                  </Pressable>
                  {invoice.status !== 'paid' && (
                    <Pressable onPress={(e) => { e.stopPropagation?.(); handlePay(invoice); }} style={[st.actionBtn, st.actionPrimary]}>
                      <Feather name="credit-card" size={13} color="#fff" />
                      <Text style={st.actionPrimaryText}>{defCard ? `Pay •${defCard.last4}` : 'Pay'}</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
// ── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  header:    { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '700' },
  headerSub:   { color: 'rgba(255,255,255,0.75)', fontWeight: '400', fontSize: 13 },
  segmentRow:        { flexDirection: 'row', gap: 8, marginBottom: 2 },
  segmentBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: BORDER, backgroundColor: 'rgba(255,255,255,0.7)' },
  segmentBtnActive:  { backgroundColor: BLUE, borderColor: BLUE },
  segmentLabel:      { fontSize: 13, fontWeight: '600', color: MUTED },
  segmentLabelActive:{ color: '#fff' },
  filterPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  statCard:  { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, gap: 3 },
  statLabel: { fontSize: 11, letterSpacing: 0.5, fontWeight: '600' },
  statValue: { fontSize: 18, fontWeight: '700' },
  orderCard: {
    padding: 16, borderRadius: 16, borderLeftWidth: 3, borderWidth: 1, borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
    gap: 0,
  },
  payMethod: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, ...GLASS_SHADOW },
  payIcon:   { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  payLabel:  { color: MUTED, fontWeight: '500', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  payValue:  { color: TEXT, fontWeight: '600', fontSize: 13, marginTop: 2 },
  invoiceCard:    { backgroundColor: GLASS_BG, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: GLASS_BORDER, borderLeftWidth: 3, ...GLASS_SHADOW },
  invoiceNum:     { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 3 },
  invoiceMeta:    { fontSize: 12, fontWeight: '400', color: MUTED, marginBottom: 1 },
  invoiceDue:     { fontSize: 12, fontWeight: '400', color: MUTED },
  invoiceAmount:  { fontSize: 17, fontWeight: '700', color: TEXT },
  actionBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, flex: 1 },
  actionGhost:     { backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: `${BLUE}30` },
  actionGhostText: { color: BLUE, fontWeight: '600', fontSize: 12 },
  actionPrimary:   { backgroundColor: BLUE },
  actionPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
const mdl = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD },
  closeBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 16, fontWeight: '700', color: TEXT },
  subtitle:    { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 },
  card:        { backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionTitle:{ fontSize: 13, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  actionBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, flex: 1 },
  ghostBtn:    { backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: `${BLUE}30` },
  ghostBtnText:{ color: BLUE, fontWeight: '600', fontSize: 13 },
  solidBtn:    { backgroundColor: BLUE },
  solidBtnText:{ color: '#fff', fontWeight: '700', fontSize: 13 },
});
