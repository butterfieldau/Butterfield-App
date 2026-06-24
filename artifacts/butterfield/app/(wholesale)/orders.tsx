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
import { generateInvoiceHtml, type InvoiceLine, type InvoicePdfData } from '@/lib/invoicePdf';
import { api, getWholesaleInvoiceUrl } from '@/lib/api';
import WholesaleConfidentialWatermark from '@/components/wholesale/WholesaleConfidentialWatermark';
import { useWholesaleScreenSecurity } from '@/hooks/useWholesaleScreenSecurity';
import type { Invoice } from '@/types';
import { normalizeOrderItems } from '@/lib/orderItems';

export const WS_REORDER_KEY = '@ws_pending_reorder';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const RED    = '#EF4444';
const GLASS_BG     = 'rgba(255,255,255,0.72)';
const GLASS_BORDER = 'rgba(255,255,255,0.9)';
const GLASS_SHADOW = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
} as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: 'Pending',    color: '#3B82F6', bg: '#DBEAFE' },
  processing: { label: 'Processing', color: '#F59E0B', bg: '#FEF3C7' },
  dispatched: { label: 'Dispatched', color: '#8B5CF6', bg: '#EDE9FE' },
  delivered:  { label: 'Delivered',  color: '#22C55E', bg: '#DCFCE7' },
  cancelled:  { label: 'Cancelled',  color: '#EF4444', bg: '#FEE2E2' },
  overdue:    { label: 'Overdue',    color: '#DC2626', bg: '#FEE2E2' },
};

const INV_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  paid:    { label: 'Paid',    color: '#22C55E', bg: '#DCFCE7' },
  pending: { label: 'Pending', color: '#F59E0B', bg: '#FEF3C7' },
  overdue: { label: 'Overdue', color: '#DC2626', bg: '#FEE2E2' },
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

function mapOrderToInvoice(order: any): Invoice {
  const createdAt = new Date(order.createdAt);
  const dueAt = order.invoiceDueDate
    ? new Date(order.invoiceDueDate)
    : new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  let status: Invoice['status'];
  const normInvStatus = String(order.invoiceStatus ?? '').toLowerCase();
  if (
    order.isPaid ||
    String(order.stripePaymentStatus ?? '').toLowerCase() === 'paid' ||
    normInvStatus === 'paid' ||
    order.status === 'delivered'
  ) {
    status = 'paid';
  } else if (normInvStatus === 'voided' || normInvStatus === 'failed' || order.status === 'cancelled') {
    status = 'pending';
  } else if (normInvStatus === 'overdue') {
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
  const deliveryFee = order?.deliveryFeeCents ?? 0;
  const lines: InvoiceLine[] = items.length > 0
    ? items.map(item => ({
        description: item.name,
        qty:         item.quantity,
        unitPrice:   item.unitPriceCents / 100,
      }))
    : [{ description: 'Wholesale Order', qty: 1, unitPrice: ((order?.totalCents ?? 0) - deliveryFee) / 100 }];
  return lines;
}

function buildInvoiceData(invoice: Invoice, lines: InvoiceLine[], account: any, order?: any): InvoicePdfData {
  return {
    number:           invoice.number,
    date:             invoice.date,
    dueDate:          invoice.dueDate,
    status:           invoice.status,
    companyName:      account?.companyName ?? 'Wholesale Customer',
    abn:              account?.abn ?? '',
    contactEmail:     account?.accountsEmail ?? account?.email ?? '',
    deliveryAddress:  account?.deliveryAddress ?? '',
    accountNumber:    account?.id?.slice(0, 8).toUpperCase() ?? '',
    lines,
    deliveryFeeCents: order?.deliveryFeeCents ?? 0,
  };
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

// ── Combined Order + Invoice Detail Modal ─────────────────────────────────────
function OrderDetailModal({
  order, invoice, account, defCard,
  onClose, onReorder, onDownload, onPay, pdfLoading,
}: {
  order: any | null;
  invoice: Invoice | null;
  account: any;
  defCard: any;
  onClose: () => void;
  onReorder: (o: any) => void;
  onDownload: (inv: Invoice, order: any) => void;
  onPay: (inv: Invoice, order: any) => void;
  pdfLoading: boolean;
}) {
  const insets = useSafeAreaInsets();
  if (!order) return null;

  const cfg      = STATUS_CONFIG[order.status] ?? { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
  const items    = normalizeOrderItems(order.items);
  const stepIdx  = STATUS_STEPS.indexOf(order.status);
  const subtotal = order.totalCents ?? 0;
  const gst      = Math.round(subtotal / 11);
  const overdue  = isOverdue(order);
  const inv      = invoice;
  const invCfg   = inv ? (INV_STATUS[inv.status] ?? { label: inv.status, color: MUTED, bg: '#F3F4F6' }) : null;

  return (
    <Modal visible={!!order} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Header */}
        <View style={[mdl.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} style={mdl.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={mdl.title}>Order #{order.orderNumber ?? order.poReference ?? order.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={mdl.subtitle}>{new Date(order.createdAt).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

          {/* Overdue alert */}
          {overdue && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FECACA' }}>
              <Feather name="alert-circle" size={15} color={RED} />
              <Text style={{ color: RED, fontWeight: '600', fontSize: 13, flex: 1 }}>Delivery date has passed — contact your account manager</Text>
            </View>
          )}

          {/* Order status + progress */}
          <View style={mdl.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: stepIdx >= 0 ? 14 : 0 }}>
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
          </View>

          {/* Items */}
          <View style={mdl.card}>
            <Text style={[mdl.sectionTitle, { marginBottom: 10 }]}>Items ({items.length})</Text>
            {items.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: BORDER, gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: '#E0F5FE', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: BLUE, fontWeight: '700', fontSize: 13 }}>{item.quantity}</Text>
                </View>
                <Text style={{ flex: 1, color: TEXT, fontWeight: '500', fontSize: 13 }}>{item.name}</Text>
                <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>${(item.lineTotalCents / 100).toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* Order summary */}
          <View style={mdl.card}>
            <Text style={[mdl.sectionTitle, { marginBottom: 10 }]}>Order Summary</Text>
            <InfoRow label="Subtotal (ex. GST)" value={`$${((subtotal - gst) / 100).toFixed(2)}`} />
            <InfoRow label="GST (10%)"           value={`$${(gst / 100).toFixed(2)}`} />
            <InfoRow label="Total (AUD)"          value={`$${(subtotal / 100).toFixed(2)}`} valueColor={BLUE} />
            {order.deliveryType     && <InfoRow label="Delivery" value={order.deliveryType === 'pickup' ? 'In-store Pickup' : 'Delivery'} icon="truck" />}
            {order.deliveryFeeCents > 0 && <InfoRow label="Delivery fee" value={`$${(order.deliveryFeeCents / 100).toFixed(2)}`} icon="package" />}
            {order.deliveryAddress  && <InfoRow label="Address"  value={order.deliveryAddress} icon="map-pin" />}
            {order.scheduledDate    && <InfoRow label="Scheduled" value={new Date(order.scheduledDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} icon="calendar" />}
          </View>

          {/* Invoice section */}
          {inv && invCfg && (
            <View style={mdl.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={mdl.sectionTitle}>Invoice</Text>
                <View style={{ backgroundColor: invCfg.bg, borderColor: invCfg.color, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                  <Text style={{ color: invCfg.color, fontWeight: '600', fontSize: 12 }}>{invCfg.label}</Text>
                </View>
              </View>
              <InfoRow label="Invoice #"  value={inv.number} />
              <InfoRow label="Issued"     value={inv.date} />
              <InfoRow label="Due"        value={inv.dueDate} valueColor={inv.status === 'overdue' ? RED : undefined} />
              <InfoRow label="Amount"     value={`$${inv.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`} valueColor={BLUE} />
            </View>
          )}

          {/* Action buttons */}
          <View style={{ gap: 10 }}>
            {/* Download Invoice PDF */}
            {inv && (
              <Pressable
                onPress={() => onDownload(inv, order)}
                disabled={pdfLoading}
                style={[mdl.actionBtn, mdl.ghostBtn, { opacity: pdfLoading ? 0.7 : 1 }]}
              >
                {pdfLoading
                  ? <ActivityIndicator size="small" color={BLUE} />
                  : <Feather name="download" size={15} color={BLUE} />}
                <Text style={mdl.ghostBtnText}>{pdfLoading ? 'Saving PDF…' : 'Download Invoice PDF'}</Text>
              </Pressable>
            )}

            {/* Pay invoice (if unpaid) */}
            {inv && inv.status !== 'paid' && (
              <Pressable onPress={() => onPay(inv, order)} style={[mdl.actionBtn, { backgroundColor: '#10B981' }]}>
                <Feather name="credit-card" size={15} color="#fff" />
                <Text style={[mdl.ghostBtnText, { color: '#fff' }]}>
                  {defCard ? `Pay •${defCard.last4}` : 'Pay Invoice'}
                </Text>
              </Pressable>
            )}

            {/* Reorder */}
            <Pressable
              onPress={() => onReorder(order)}
              style={[mdl.actionBtn, { backgroundColor: BLUE }]}
            >
              <Feather name="refresh-cw" size={15} color="#fff" />
              <Text style={[mdl.ghostBtnText, { color: '#fff' }]}>Reorder</Text>
            </Pressable>
          </View>

        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function WholesaleOrdersScreen() {
  const [filter, setFilter]               = useState('All');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [loadingId, setLoadingId]         = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['wholesale-orders'],
    queryFn:  () => api.wholesale.orders(),
    retry: 1,
    refetchInterval: 60000,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const { data: invData } = useQuery({
    queryKey: ['wholesale-invoices'],
    queryFn:  api.wholesale.invoices,
  });
  const { data: accountData } = useQuery({
    queryKey: ['wholesale-account'],
    queryFn:  api.wholesale.account,
  });
  const { data: cardsData } = useQuery({ queryKey: ['wholesale-cards'], queryFn: api.wholesale.cards, retry: 1 });

  const allOrders: any[] = data?.data ?? [];
  const filteredOrders = allOrders.filter(o => {
    if (filter === 'All') return true;
    if (filter === 'Overdue') return isOverdue(o);
    return o.status === filter;
  });
  const overdueCount = allOrders.filter(isOverdue).length;

  const rawInvoiceOrders: any[] = invData?.data ?? [];
  const invoiceMap: Record<string, Invoice> = Object.fromEntries(
    rawInvoiceOrders.map(o => [o.id, mapOrderToInvoice(o)])
  );
  const account = accountData?.data;

  useWholesaleScreenSecurity({ screenName: 'WholesaleOrders' });
  const cards   = cardsData?.data ?? [];
  const defCard = cards.find((c: any) => c.isDefault) ?? cards[0];

  // For orders not yet in invoiceMap (just placed), derive invoice on the fly
  function getInvoice(order: any): Invoice {
    return invoiceMap[order.id] ?? mapOrderToInvoice(order);
  }

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

  const handleDownload = async (invoice: Invoice, order: any) => {
    setLoadingId(invoice.id);
    try {
      let html: string | null = null;
      if (order?.id) {
        try {
          const resp = await fetch(getWholesaleInvoiceUrl(order.id));
          if (resp.ok) html = await resp.text();
        } catch { /* fall through */ }
      }
      if (!html) {
        const lines = getOrderLines(order);
        html = generateInvoiceHtml(buildInvoiceData(invoice, lines, account, order));
      }
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 500); }
        return;
      }
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

  const handlePay = (invoice: Invoice, order: any) => {
    if (order?.isPaid || String(order?.stripePaymentStatus ?? '').toLowerCase() === 'paid') {
      Alert.alert('Already paid', 'This invoice has already been paid.');
      return;
    }
    if (order?.invoiceUrl) {
      WebBrowser.openBrowserAsync(order.invoiceUrl).catch(() => {
        Alert.alert('Invoice unavailable', 'We could not open this invoice right now.');
      });
      return;
    }
    Alert.alert('Invoice unavailable', 'This invoice is still being prepared. Please check back in a moment.');
  };

  const selectedInvoice = selectedOrder ? getInvoice(selectedOrder) : null;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <WholesaleConfidentialWatermark businessName={account?.companyName ?? undefined} email={account?.email ?? undefined} />
      <OrderDetailModal
        order={selectedOrder}
        invoice={selectedInvoice}
        account={account}
        defCard={defCard}
        onClose={() => setSelectedOrder(null)}
        onReorder={handleReorder}
        onDownload={handleDownload}
        onPay={handlePay}
        pdfLoading={!!(selectedOrder && loadingId === selectedInvoice?.id)}
      />

      {/* Header */}
      <View style={{ backgroundColor: BG, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: TEXT }}>Orders</Text>
          <Text style={{ color: MUTED, fontWeight: '400', fontSize: 15 }}>{allOrders.length} total</Text>
        </View>
        {/* Status filter chips */}
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
      </View>

      {/* Orders list */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
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
            const cfg     = STATUS_CONFIG[order.status] ?? { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
            const items   = normalizeOrderItems(order.items);
            const stepIdx = STATUS_STEPS.indexOf(order.status);
            const overdue = isOverdue(order);
            const inv     = getInvoice(order);
            const invCfg  = INV_STATUS[inv.status] ?? null;

            return (
              <Pressable
                onPress={() => { setSelectedOrder(order); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[st.orderCard, { borderLeftColor: overdue ? RED : cfg.color }]}
              >
                {/* Top row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15 }}>
                      #{order.orderNumber ?? order.poReference ?? order.id.slice(0, 8).toUpperCase()}
                    </Text>
                    <Text style={{ color: MUTED, fontWeight: '400', fontSize: 11 }}>
                      {new Date(order.createdAt).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                    {overdue && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather name="alert-circle" size={11} color={RED} />
                        <Text style={{ color: RED, fontWeight: '600', fontSize: 11 }}>Overdue</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <View style={{ backgroundColor: cfg.bg, borderColor: cfg.color, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                      <Text style={{ color: cfg.color, fontWeight: '600', fontSize: 11 }}>{cfg.label}</Text>
                    </View>
                    <Text style={{ color: BLUE, fontWeight: '700', fontSize: 15 }}>${(order.totalCents / 100).toFixed(2)}</Text>
                  </View>
                </View>

                {/* Progress bar */}
                {stepIdx >= 0 && (
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
                    {STATUS_STEPS.map((step, i) => (
                      <View key={step} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= stepIdx ? cfg.color : BORDER }} />
                    ))}
                  </View>
                )}

                {/* Items summary */}
                <View style={{ gap: 2, marginTop: 8 }}>
                  {items.slice(0, 2).map((item, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: TEXT, fontWeight: '400', fontSize: 12, flex: 1 }}>{item.quantity}× {item.name}</Text>
                      <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>${(item.lineTotalCents / 100).toFixed(2)}</Text>
                    </View>
                  ))}
                  {items.length > 2 && (
                    <Text style={{ color: BLUE, fontWeight: '400', fontSize: 11, marginTop: 2 }}>+{items.length - 2} more items</Text>
                  )}
                </View>

                {/* Footer: delivery + invoice badge + details link */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {order.scheduledDate ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Feather name="truck" size={11} color={overdue ? RED : MUTED} />
                        <Text style={{ color: overdue ? RED : MUTED, fontWeight: '400', fontSize: 11 }}>
                          {order.deliveryType === 'pickup' ? 'Pickup' : 'Delivery'} · {new Date(order.scheduledDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                    ) : null}
                    {invCfg && (
                      <View style={{ backgroundColor: invCfg.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                        <Text style={{ color: invCfg.color, fontWeight: '600', fontSize: 10 }}>{invCfg.label}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text style={{ color: BLUE, fontWeight: '500', fontSize: 11 }}>Details</Text>
                    <Feather name="chevron-right" size={12} color={BLUE} />
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  filterPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  orderCard: {
    padding: 16, borderRadius: 16, borderLeftWidth: 3, borderWidth: 1, borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG, ...GLASS_SHADOW,
  },
});

const mdl = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD },
  closeBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 16, fontWeight: '700', color: TEXT },
  subtitle:    { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 },
  card:        { backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionTitle:{ fontSize: 11, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  actionBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderRadius: 13 },
  ghostBtn:    { backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: `${BLUE}30` },
  ghostBtnText:{ fontWeight: '700', fontSize: 14, color: BLUE },
});
