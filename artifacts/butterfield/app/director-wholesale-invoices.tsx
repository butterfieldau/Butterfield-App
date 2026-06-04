import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { normalizeOrderItems } from '@/lib/orderItems';

const NAVY   = '#1A2B4A';
const BLUE   = '#1493FF';
const BG     = '#F8F9FB';
const CARD   = '#FFFFFF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const RED    = '#EF4444';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  net_7:  'NET 7',
  net_14: 'NET 14',
  net_30: 'NET 30',
  net_60: 'NET 60',
};

type FilterTab = 'All' | 'Unpaid' | 'Overdue' | 'Paid';

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveStatus(order: any): 'paid' | 'overdue' | 'unpaid' {
  if (
    order.isPaid ||
    String(order.stripePaymentStatus ?? '').toLowerCase() === 'paid' ||
    String(order.invoiceStatus ?? '').toLowerCase() === 'paid' ||
    order.status === 'delivered'
  ) return 'paid';

  const invoiceStatus = String(order.invoiceStatus ?? '').toLowerCase();
  if (invoiceStatus === 'overdue') return 'overdue';

  const dueAt = order.invoiceDueDate ? new Date(order.invoiceDueDate) : null;
  if (dueAt && dueAt < new Date()) return 'overdue';

  return 'unpaid';
}

function formatDate(raw: string | Date | null | undefined): string {
  if (!raw) return '—';
  return new Date(raw).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAUD(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
}

function invoiceNumber(order: any): string {
  return order.invoiceNumber ?? order.poReference ?? `INV-${String(order.id).slice(0, 6).toUpperCase()}`;
}

function getLines(order: any) {
  const items = normalizeOrderItems(order?.items);
  if (items.length > 0) {
    return items.map((item: any) => ({
      description: item.name,
      qty:         item.quantity,
      unitPrice:   item.unitPriceCents / 100,
    }));
  }
  return [{ description: 'Wholesale Order', qty: 1, unitPrice: (order?.totalCents ?? 0) / 100 }];
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'paid' | 'overdue' | 'unpaid' }) {
  const cfg = {
    paid:    { label: 'Paid',    color: GREEN, bg: '#DCFCE7' },
    overdue: { label: 'Overdue', color: RED,   bg: '#FEE2E2' },
    unpaid:  { label: 'Unpaid',  color: AMBER, bg: '#FEF3C7' },
  }[status];
  return (
    <View style={[ss.badge, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
      <Text style={[ss.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DetailModal({
  order,
  onClose,
  onMarkPaid,
  marking,
  onSendReminder,
  sendingReminder,
}: {
  order: any | null;
  onClose: () => void;
  onMarkPaid: (id: string) => void;
  marking: boolean;
  onSendReminder: (id: string) => void;
  sendingReminder: boolean;
}) {
  const insets = useSafeAreaInsets();
  if (!order) return null;

  const status = deriveStatus(order);
  const lines  = getLines(order);
  const total  = (order.totalCents ?? 0) / 100;
  const gst    = total / 11;
  const excGst = total - gst;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Header */}
        <View style={[mdl.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} style={mdl.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={mdl.title}>{invoiceNumber(order)}</Text>
            <Text style={mdl.subtitle}>{order.companyName}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {/* Overdue banner */}
          {status === 'overdue' && (
            <View style={mdl.overdueBanner}>
              <Feather name="alert-circle" size={15} color={RED} />
              <Text style={{ color: RED, fontWeight: '600', fontSize: 13, flex: 1 }}>
                This invoice is overdue
              </Text>
            </View>
          )}

          {/* Status card */}
          <View style={mdl.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={mdl.sectionTitle}>Invoice Status</Text>
                <Text style={[mdl.sub, status === 'overdue' && { color: RED }]}>
                  Due {formatDate(order.invoiceDueDate)}
                </Text>
                {order.paymentTerms && (
                  <Text style={mdl.sub}>
                    Terms: {PAYMENT_TERMS_LABELS[order.paymentTerms] ?? order.paymentTerms}
                  </Text>
                )}
              </View>
              <StatusBadge status={status} />
            </View>
          </View>

          {/* Billing */}
          <View style={mdl.card}>
            <Text style={[mdl.sectionTitle, { marginBottom: 4 }]}>Billing Details</Text>
            <InfoRow label="Company"    value={order.companyName} />
            {!!order.abn             && <InfoRow label="ABN"        value={order.abn} />}
            {!!order.accountsEmail   && <InfoRow label="Accounts"   value={order.accountsEmail} />}
            {!!order.deliveryAddress && <InfoRow label="Address"    value={order.deliveryAddress} last />}
          </View>

          {/* Line items */}
          <View style={mdl.card}>
            <Text style={[mdl.sectionTitle, { marginBottom: 4 }]}>Items ({lines.length})</Text>
            {lines.map((line: any, i: number) => (
              <View key={i} style={{
                flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10,
                borderBottomWidth: i < lines.length - 1 ? 1 : 0, borderBottomColor: BORDER, gap: 10,
              }}>
                <View style={mdl.qtyBadge}>
                  <Text style={mdl.qtyText}>{line.qty}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TEXT, fontWeight: '500', fontSize: 13 }}>{line.description}</Text>
                  <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>${line.unitPrice.toFixed(2)} each</Text>
                </View>
                <Text style={{ color: TEXT, fontWeight: '600', fontSize: 13 }}>
                  ${(line.qty * line.unitPrice).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>

          {/* Totals */}
          <View style={mdl.card}>
            <Text style={[mdl.sectionTitle, { marginBottom: 8 }]}>Invoice Total</Text>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: MUTED, fontSize: 13 }}>Subtotal (ex. GST)</Text>
                <Text style={{ color: TEXT, fontSize: 13 }}>${excGst.toFixed(2)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: MUTED, fontSize: 13 }}>GST (10%)</Text>
                <Text style={{ color: MUTED, fontSize: 13 }}>${gst.toFixed(2)}</Text>
              </View>
              <View style={{ height: 1, backgroundColor: BORDER }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15 }}>Total (AUD)</Text>
                <Text style={{ color: BLUE, fontWeight: '700', fontSize: 15 }}>
                  {formatAUD(order.totalCents ?? 0)}
                </Text>
              </View>
            </View>
          </View>

          {/* Order details */}
          <View style={mdl.card}>
            <Text style={[mdl.sectionTitle, { marginBottom: 4 }]}>Order Details</Text>
            <InfoRow label="Invoice #"  value={invoiceNumber(order)} />
            <InfoRow label="Issued"     value={formatDate(order.createdAt)} />
            {!!order.poReference && <InfoRow label="PO Ref" value={order.poReference} />}
            <InfoRow label="Order #"    value={String(order.id).slice(0, 8).toUpperCase()} last />
          </View>

          {/* Action buttons */}
          {status !== 'paid' && (
            <View style={{ gap: 10 }}>
              {/* Send Reminder */}
              <Pressable
                onPress={() => {
                  const email = order.accountsEmail || order.contactEmail;
                  const emailNote = email ? `\n\nEmail will be sent to: ${email}` : '\n\nNo accounts email on file — add one in account settings first.';
                  Alert.alert(
                    'Send Payment Reminder',
                    `Send a ${status === 'overdue' ? 'overdue notice' : 'payment reminder'} for ${invoiceNumber(order)} (${formatAUD(order.totalCents ?? 0)})?${emailNote}`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Send Email', style: 'default', onPress: () => onSendReminder(order.id) },
                    ],
                  );
                }}
                disabled={sendingReminder}
                style={({ pressed }) => [mdl.reminderBtn, { opacity: pressed || sendingReminder ? 0.7 : 1 }]}
              >
                {sendingReminder
                  ? <ActivityIndicator size="small" color={BLUE} />
                  : <Feather name="send" size={15} color={BLUE} />
                }
                <Text style={mdl.reminderText}>{sendingReminder ? 'Sending…' : 'Send Reminder Email'}</Text>
              </Pressable>

              {/* Mark as Paid */}
              <Pressable
                onPress={() => {
                  Alert.alert(
                    'Mark as Paid',
                    `Mark ${invoiceNumber(order)} (${formatAUD(order.totalCents ?? 0)}) as paid? This cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Mark Paid', style: 'default', onPress: () => onMarkPaid(order.id) },
                    ],
                  );
                }}
                disabled={marking}
                style={({ pressed }) => [mdl.markPaidBtn, { opacity: pressed || marking ? 0.7 : 1 }]}
              >
                {marking
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="check-circle" size={16} color="#fff" />
                }
                <Text style={mdl.markPaidText}>{marking ? 'Marking…' : 'Mark as Paid'}</Text>
              </Pressable>
            </View>
          )}

          {status === 'paid' && (
            <View style={mdl.paidConfirm}>
              <Feather name="check-circle" size={16} color={GREEN} />
              <Text style={{ color: GREEN, fontWeight: '600', fontSize: 14 }}>
                Paid {order.paidAt ? formatDate(order.paidAt) : ''}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
      paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderBottomColor: BORDER,
    }}>
      <Text style={{ color: MUTED, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: TEXT, fontWeight: '500', fontSize: 13, maxWidth: '58%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

const FILTER_TABS: FilterTab[] = ['All', 'Unpaid', 'Overdue', 'Paid'];

export default function DirectorWholesaleInvoices() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-wholesale-invoices'],
    queryFn:  api.director.wholesaleInvoicesList,
    retry: 1,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const markPaidMutation = useMutation({
    mutationFn: (orderId: string) => api.director.markWholesaleInvoicePaid(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['director-wholesale-invoices'] });
      setSelectedOrder(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => Alert.alert('Error', 'Could not mark invoice as paid. Please try again.'),
  });

  const sendReminderMutation = useMutation({
    mutationFn: (orderId: string) => api.director.sendInvoiceReminder(orderId),
    onSuccess: (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Reminder Sent', `Payment reminder email sent to ${res.sentTo}`);
    },
    onError: () => Alert.alert('Error', 'Could not send reminder. Check the Resend integration is connected.'),
  });

  const [filter, setFilter]               = useState<FilterTab>('All');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const rawOrders: any[] = data?.data ?? [];

  const unpaidOrders   = rawOrders.filter((o) => deriveStatus(o) !== 'paid');
  const overdueOrders  = rawOrders.filter((o) => deriveStatus(o) === 'overdue');
  const outstandingCents = unpaidOrders.reduce((s, o) => s + (o.totalCents ?? 0), 0);

  const filtered = rawOrders.filter((o) => {
    const s = deriveStatus(o);
    if (filter === 'All')    return true;
    if (filter === 'Unpaid') return s === 'unpaid';
    if (filter === 'Overdue') return s === 'overdue';
    if (filter === 'Paid')   return s === 'paid';
    return true;
  });

  const countFor = (tab: FilterTab) => {
    if (tab === 'All')    return rawOrders.length;
    if (tab === 'Unpaid') return rawOrders.filter((o) => deriveStatus(o) === 'unpaid').length;
    if (tab === 'Overdue') return overdueOrders.length;
    return rawOrders.filter((o) => deriveStatus(o) === 'paid').length;
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Detail Modal */}
      <DetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onMarkPaid={(id) => markPaidMutation.mutate(id)}
        marking={markPaidMutation.isPending}
        onSendReminder={(id) => sendReminderMutation.mutate(id)}
        sendingReminder={sendReminderMutation.isPending}
      />

      {/* ── Compact white header ── */}
      <View style={ss.header}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.navigate('/(director)/more' as any)}
          style={ss.backBtn}
        >
          <Feather name="arrow-left" size={20} color={NAVY} />
        </Pressable>
        <Text style={ss.headerTitle}>Invoice Management</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Stats strip ── */}
      <View style={ss.statsStrip}>
        <View style={ss.statItem}>
          <Text style={ss.statLabel}>Outstanding</Text>
          <Text style={[ss.statValue, { color: outstandingCents > 0 ? NAVY : MUTED }]}>
            {formatAUD(outstandingCents)}
          </Text>
        </View>
        <View style={ss.statDivider} />
        <View style={ss.statItem}>
          <Text style={ss.statLabel}>Unpaid</Text>
          <Text style={[ss.statValue, { color: unpaidOrders.length > 0 ? AMBER : MUTED }]}>
            {unpaidOrders.length}
          </Text>
        </View>
        <View style={ss.statDivider} />
        <View style={ss.statItem}>
          <Text style={ss.statLabel}>Overdue</Text>
          <Text style={[ss.statValue, { color: overdueOrders.length > 0 ? RED : MUTED }]}>
            {overdueOrders.length}
          </Text>
        </View>
      </View>

      {/* ── Filter chips ── */}
      <View style={ss.filterRow}>
        {FILTER_TABS.map((tab) => {
          const count  = countFor(tab);
          const active = filter === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFilter(tab); }}
              style={[ss.filterChip, active && ss.filterChipActive]}
            >
              <Text style={[ss.filterChipText, active && ss.filterChipTextActive]}>
                {tab}{count > 0 ? ` (${count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Invoice list ── */}
      <FlatList
        data={filtered}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={BLUE} style={{ marginTop: 60 }} />
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
              <Feather name="file-text" size={38} color={MUTED} />
              <Text style={{ color: MUTED, fontSize: 14 }}>
                {filter === 'All' ? 'No NET-account invoices found' : `No ${filter.toLowerCase()} invoices`}
              </Text>
              {filter === 'All' && (
                <Text style={{ color: MUTED, fontSize: 12, textAlign: 'center', paddingHorizontal: 32 }}>
                  Invoices appear here when wholesale accounts have NET payment terms
                </Text>
              )}
            </View>
          )
        }
        renderItem={({ item: order }) => {
          const status     = deriveStatus(order);
          const isOverdue  = status === 'overdue';
          const accentColor = status === 'paid' ? GREEN : isOverdue ? RED : AMBER;

          return (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedOrder(order); }}
              style={({ pressed }) => [ss.card, { borderLeftColor: accentColor, opacity: pressed ? 0.92 : 1 }]}
            >
              {/* Main row */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={ss.companyName} numberOfLines={1}>{order.companyName}</Text>
                  <Text style={ss.invoiceNum}>{invoiceNumber(order)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Text style={[ss.dueDate, isOverdue && { color: RED }]}>
                      Due {formatDate(order.invoiceDueDate)}
                    </Text>
                    {order.paymentTerms && (
                      <View style={ss.termsBadge}>
                        <Text style={ss.termsText}>
                          {PAYMENT_TERMS_LABELS[order.paymentTerms] ?? order.paymentTerms}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 5 }}>
                  <StatusBadge status={status} />
                  <Text style={ss.amount}>{formatAUD(order.totalCents ?? 0)}</Text>
                </View>
              </View>

              {/* Mark as Paid quick action */}
              {status !== 'paid' && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    Alert.alert(
                      'Mark as Paid',
                      `Mark ${invoiceNumber(order)} for ${order.companyName} as paid?\n${formatAUD(order.totalCents ?? 0)}`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Mark Paid', style: 'default', onPress: () => markPaidMutation.mutate(order.id) },
                      ],
                    );
                  }}
                  style={ss.markBtn}
                >
                  <Feather name="check-circle" size={12} color={GREEN} />
                  <Text style={ss.markBtnText}>Mark as Paid</Text>
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  // Header
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  backBtn:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { flex: 1, textAlign: 'center', color: NAVY, fontSize: 16, fontWeight: '700' },
  // Stats strip
  statsStrip:   { flexDirection: 'row', backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, paddingVertical: 10 },
  statItem:     { flex: 1, alignItems: 'center', gap: 2 },
  statLabel:    { color: MUTED, fontSize: 10, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue:    { fontSize: 17, fontWeight: '700' },
  statDivider:  { width: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginVertical: 4 },
  // Filters
  filterRow:    { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6, backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  filterChip:   { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: BORDER },
  filterChipActive: { backgroundColor: NAVY, borderColor: NAVY },
  filterChipText:   { color: MUTED, fontSize: 12, fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  // Cards
  card:         { backgroundColor: CARD, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER, borderLeftWidth: 4, gap: 8 },
  companyName:  { color: TEXT, fontSize: 14, fontWeight: '700' },
  invoiceNum:   { color: MUTED, fontSize: 11, fontWeight: '500' },
  dueDate:      { color: MUTED, fontSize: 11 },
  amount:       { color: TEXT, fontSize: 15, fontWeight: '700' },
  termsBadge:   { backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  termsText:    { color: BLUE, fontSize: 10, fontWeight: '600' },
  badge:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  badgeText:    { fontSize: 10, fontWeight: '600' },
  markBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#86EFAC' },
  markBtnText:  { color: GREEN, fontSize: 11, fontWeight: '600' },
});

const mdl = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER },
  closeBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  title:         { fontSize: 16, fontWeight: '700', color: TEXT },
  subtitle:      { fontSize: 12, color: MUTED, marginTop: 2 },
  card:          { backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionTitle:  { fontSize: 11, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  sub:           { fontSize: 12, color: MUTED, marginTop: 3 },
  overdueBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FECACA' },
  qtyBadge:      { width: 30, height: 30, borderRadius: 8, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  qtyText:       { color: BLUE, fontWeight: '700', fontSize: 12 },
  reminderBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#BFDBFE' },
  reminderText:  { color: BLUE, fontWeight: '600', fontSize: 15 },
  markPaidBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 12, padding: 15 },
  markPaidText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  paidConfirm:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#DCFCE7', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#86EFAC' },
});
