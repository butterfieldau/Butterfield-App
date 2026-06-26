import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { InvoiceStatusBadge } from '@/components/OrderStatusBadge';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { generateInvoiceHtml, type InvoiceLine, type InvoicePdfData } from '@/lib/invoicePdf';
import { api, getWholesaleInvoiceUrl } from '@/lib/api';
import type { Invoice } from '@/types';
import { normalizeOrderItems } from '@/lib/orderItems';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const RED    = '#EF4444';

const BRAND_BG: Record<string, string> = {
  Visa: '#1A3A8C', Mastercard: '#8C1B1B', Amex: '#1B5C8C',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  paid:    { label: 'Paid',    color: '#22C55E', bg: '#DCFCE7' },
  pending: { label: 'Pending', color: '#F59E0B', bg: '#FEF3C7' },
  overdue: { label: 'Overdue', color: '#DC2626', bg: '#FEE2E2' },
  revised: { label: 'Revised', color: '#7C3AED', bg: '#EDE9FE' },
};

// ── Data helpers ─────────────────────────────────────────────────────────────

function mapOrderToInvoice(order: any): Invoice {
  const createdAt = new Date(order.createdAt);
  const dueAt     = order.invoiceDueDate ? new Date(order.invoiceDueDate) : new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const now       = new Date();
  let status: Invoice['status'];
  const normalizedInvoiceStatus = String(order.invoiceStatus ?? '').toLowerCase();
  // 'revised' takes precedence over 'paid': a director may revise an invoice after
  // payment (e.g. issued credit memo), and the badge must reflect the revision.
  if (normalizedInvoiceStatus === 'revised') {
    status = 'revised';
  } else if (order.isPaid || String(order.stripePaymentStatus ?? '').toLowerCase() === 'paid' || normalizedInvoiceStatus === 'paid' || order.status === 'delivered') {
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

// ── Invoice Detail Modal ─────────────────────────────────────────────────────
function InvoiceDetailModal({
  invoice,
  lines,
  account,
  defCard,
  onClose,
  onPdf,
  onPay,
  pdfLoading,
}: {
  invoice: Invoice | null;
  lines: InvoiceLine[];
  account: any;
  defCard: any;
  onClose: () => void;
  onPdf: (inv: Invoice) => void;
  onPay: (inv: Invoice) => void;
  pdfLoading: boolean;
}) {
  const insets = useSafeAreaInsets();
  if (!invoice) return null;
  const subtotal = invoice.amount;
  const gst      = subtotal / 11;
  const excGst   = subtotal - gst;
  const cfg      = STATUS_CONFIG[invoice.status] ?? { label: invoice.status, color: MUTED, bg: '#F3F4F6' };
  const isOverdue = invoice.status === 'overdue';

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>

        {/* Header */}
        <View style={[mdl.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} style={mdl.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={mdl.title}>{invoice.number}</Text>
            <Text style={mdl.subtitle}>Issued {invoice.date}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Overdue banner */}
          {isOverdue && (
            <View style={mdl.overdueBanner}>
              <Feather name="alert-circle" size={15} color={RED} />
              <Text style={{ color: RED, fontWeight: '600', fontSize: 13, flex: 1 }}>
                This invoice is overdue — please contact your account manager
              </Text>
            </View>
          )}

          {/* Status + due */}
          <View style={mdl.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={mdl.sectionTitle}>Invoice Status</Text>
                <Text style={[mdl.dueText, isOverdue && { color: RED }]}>Due {invoice.dueDate}</Text>
              </View>
              <View style={[mdl.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
                <Text style={[mdl.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            </View>
          </View>

          {/* Line items */}
          <View style={mdl.card}>
            <Text style={[mdl.sectionTitle, { marginBottom: 4 }]}>Items ({lines.length})</Text>
            {lines.map((line, i) => {
              const lineTotal = line.qty * line.unitPrice;
              return (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    paddingVertical: 10,
                    borderBottomWidth: i < lines.length - 1 ? 1 : 0,
                    borderBottomColor: BORDER,
                    gap: 10,
                  }}
                >
                  <View style={mdl.qtyBadge}>
                    <Text style={mdl.qtyText}>{line.qty}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: TEXT, fontWeight: '500', fontSize: 13 }}>{line.description}</Text>
                    <Text style={{ color: MUTED, fontWeight: '400', fontSize: 11, marginTop: 2 }}>
                      ${line.unitPrice.toFixed(2)} each
                    </Text>
                  </View>
                  <Text style={{ color: TEXT, fontWeight: '600', fontSize: 13 }}>
                    ${lineTotal.toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Totals */}
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
                <Text style={{ color: BLUE, fontWeight: '700', fontSize: 15 }}>
                  ${subtotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          </View>

          {/* Billing details */}
          <View style={mdl.card}>
            <Text style={[mdl.sectionTitle, { marginBottom: 4 }]}>Billing Details</Text>
            {!!account?.companyName    && <InfoRow label="Billed To"  value={account.companyName} />}
            {!!account?.abn            && <InfoRow label="ABN"        value={account.abn} />}
            {!!account?.deliveryAddress && <InfoRow label="Delivery"  value={account.deliveryAddress} />}
            {!!account?.id             && <InfoRow label="Account #"  value={account.id.slice(0, 8).toUpperCase()} last />}
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => onPdf(invoice)}
              disabled={pdfLoading}
              style={[mdl.actionBtn, mdl.ghostBtn, { opacity: pdfLoading ? 0.7 : 1 }]}
            >
              {pdfLoading
                ? <ActivityIndicator size="small" color={BLUE} />
                : <Feather name="download" size={15} color={BLUE} />
              }
              <Text style={mdl.ghostBtnText}>{pdfLoading ? 'Saving…' : 'Download PDF'}</Text>
            </Pressable>

            {invoice.status !== 'paid' && (
              <Pressable onPress={() => onPay(invoice)} style={[mdl.actionBtn, mdl.solidBtn]}>
                <Feather name="external-link" size={15} color="#fff" />
                <Text style={mdl.solidBtnText}>View &amp; Pay</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderBottomColor: BORDER }}>
      <Text style={{ color: MUTED, fontWeight: '400', fontSize: 13 }}>{label}</Text>
      <Text style={{ color: TEXT, fontWeight: '500', fontSize: 13, maxWidth: '55%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function WholesaleInvoices() {
  const insets = useSafeAreaInsets();

  const { data: ordersData, isLoading, refetch: refetchInvoices } = useQuery({
    queryKey: ['wholesale-invoices'],
    queryFn:  api.wholesale.invoices,
    retry: 1,
  });
  const { data: accountData, refetch: refetchAccount } = useQuery({
    queryKey: ['wholesale-account'],
    queryFn:  api.wholesale.account,
    retry: 1,
  });
  const { data: cardsData, refetch: refetchCards } = useQuery({ queryKey: ['wholesale-cards'], queryFn: api.wholesale.cards, retry: 1 });
  const { refreshing, onRefresh } = useRefreshControl(refetchInvoices, refetchAccount, refetchCards);

  useFocusEffect(
    useCallback(() => {
      refetchInvoices();
    }, [refetchInvoices]),
  );

  const rawOrders: any[] = ordersData?.data ?? [];
  const invoices: Invoice[] = rawOrders.map(mapOrderToInvoice);
  const orderMap: Record<string, any> = Object.fromEntries(rawOrders.map(o => [o.id, o]));
  const account = accountData?.data;
  const cards   = cardsData?.data ?? [];
  const defCard = cards.find((c: any) => c.isDefault) ?? cards[0];

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [loadingId, setLoadingId]             = useState<string | null>(null);

  const totalPending = invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.amount, 0);
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;

  const selectedLines = selectedInvoice ? getOrderLines(orderMap[selectedInvoice.id]) : [];

  const handleDownload = async (invoice: Invoice) => {
    setLoadingId(invoice.id);
    try {
      const sourceOrder = orderMap[invoice.id];

      // Fetch HTML from custom invoice endpoint (has logos + professional layout),
      // then convert to PDF locally using expo-print — no browser URL shown.
      let html: string | null = null;
      if (sourceOrder?.id) {
        try {
          const resp = await fetch(getWholesaleInvoiceUrl(sourceOrder.id));
          if (resp.ok) html = await resp.text();
        } catch { /* fall through to legacy template */ }
      }

      if (!html) {
        const lines = getOrderLines(orderMap[invoice.id]);
        html = generateInvoiceHtml(buildInvoiceData(invoice, lines, account));
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

  const goManageCards = () => router.push('/(wholesale)/profile' as any);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Detail modal */}
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

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <LinearGradient colors={['#1A2B4A', '#253B5E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[ss.header, { paddingTop: 16 }]}>
        <Text style={[ss.title, { color: '#fff' }]}>Invoices</Text>
        <View style={ss.summaryRow}>
          <View style={[ss.summaryCard, { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.35)' }]}>
            <Text style={[ss.summaryLabel, { color: 'rgba(255,255,255,0.8)' }]}>OUTSTANDING</Text>
            <Text style={[ss.summaryValue, { color: '#fff' }]}>
              ${totalPending.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          {overdueCount > 0 && (
            <View style={[ss.summaryCard, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
              <Text style={[ss.summaryLabel, { color: '#991B1B' }]}>OVERDUE</Text>
              <Text style={[ss.summaryValue, { color: '#991B1B' }]}>
                {overdueCount} invoice{overdueCount > 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <FlatList
        data={invoices}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        ListEmptyComponent={
          isLoading
            ? <ActivityIndicator color={BLUE} style={{ marginTop: 60 }} />
            : (
              <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
                <Feather name="file-text" size={40} color={MUTED} />
                <Text style={{ color: MUTED, fontWeight: '400', fontSize: 14 }}>No invoices yet</Text>
                <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>Your invoices will appear here once you place orders</Text>
              </View>
            )
        }
        ListHeaderComponent={
          <Pressable onPress={goManageCards} style={ss.payMethod}>
            {defCard ? (
              <>
                <View style={[ss.payIcon, { backgroundColor: BRAND_BG[defCard.cardBrand] ?? '#1A3A8C' }]}>
                  <Feather name="credit-card" size={14} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ss.payLabel}>Payment Method</Text>
                  <Text style={ss.payValue}>{defCard.cardBrand} •••• {defCard.last4}</Text>
                </View>
                <Text style={ss.payManage}>Manage</Text>
                <Feather name="chevron-right" size={15} color={MUTED} />
              </>
            ) : (
              <>
                <View style={[ss.payIcon, { backgroundColor: '#E0F5FE' }]}>
                  <Feather name="plus" size={14} color={BLUE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ss.payLabel}>Payment Method</Text>
                  <Text style={[ss.payValue, { color: BLUE }]}>Add a card to pay invoices</Text>
                </View>
                <Feather name="chevron-right" size={15} color={MUTED} />
              </>
            )}
          </Pressable>
        }
        renderItem={({ item: invoice }) => {
          const isPdfLoading = loadingId === invoice.id;
          const isOverdue    = invoice.status === 'overdue';
          const lineCount    = getOrderLines(orderMap[invoice.id]).length;
          const sourceOrder  = orderMap[invoice.id];
          const isModified   = Array.isArray(sourceOrder?.editHistory) && sourceOrder.editHistory.length > 0;
          const hasCreditMemo = (Array.isArray(sourceOrder?.creditMemos) && sourceOrder.creditMemos.length > 0)
            || (Number(sourceOrder?.refundedCents ?? 0) > 0);

          return (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedInvoice(invoice); }}
              style={({ pressed }) => [ss.invoiceCard, { borderLeftColor: isOverdue ? RED : BLUE, opacity: pressed ? 0.92 : 1 }]}
            >
              {/* Top row */}
              <View style={ss.invoiceTop}>
                <View style={{ flex: 1 }}>
                  <Text style={ss.invoiceNum}>{invoice.number}</Text>
                  <Text style={ss.invoiceMeta}>
                    {invoice.date} · {lineCount} line{lineCount !== 1 ? 's' : ''}
                  </Text>
                  {/* Modified / Credit badges — tap for dated change notes */}
                  {(isModified || hasCreditMemo) && (
                    <View style={{ flexDirection: 'row', gap: 5, marginTop: 4 }}>
                      {isModified && (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.();
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            const history: any[] = sourceOrder?.editHistory ?? [];
                            const itemEdits = history.filter((h: any) => h.type === 'item_edit' || (!h.type && h.itemsBefore));
                            const lines = itemEdits.map((h: any) => {
                              const d = new Date(h.editedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
                              const by = h.editedBy ?? 'Director';
                              const from = h.totalBefore != null ? `$${(h.totalBefore / 100).toFixed(2)}` : '?';
                              const to   = h.totalAfter  != null ? `$${(h.totalAfter  / 100).toFixed(2)}` : '?';
                              return `${d} by ${by}\n  ${from} → ${to}${h.reason ? `\n  "${h.reason}"` : ''}`;
                            });
                            Alert.alert('Order Modified', lines.length ? lines.join('\n\n') : 'Items were edited by a director.', [{ text: 'OK' }]);
                          }}
                          style={{ backgroundColor: '#EFF6FF', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#BFDBFE' }}
                        >
                          <Text style={{ color: '#1D4ED8', fontWeight: '600', fontSize: 10 }}>MODIFIED</Text>
                        </Pressable>
                      )}
                      {hasCreditMemo && (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.();
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            const memos: any[] = sourceOrder?.creditMemos ?? [];
                            const lines = memos.map((m: any) => {
                              const d = new Date(m.createdAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
                              const amt = `$${(m.amountCents / 100).toFixed(2)}`;
                              const by = m.createdBy ?? 'Director';
                              return `${d} — ${amt} by ${by}\n  "${m.reason ?? 'No reason given'}"`;
                            });
                            Alert.alert('Credit Notes', lines.length ? lines.join('\n\n') : 'A credit has been issued on this order.', [{ text: 'OK' }]);
                          }}
                          style={{ backgroundColor: '#FEF9C3', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#FDE047' }}
                        >
                          <Text style={{ color: '#854D0E', fontWeight: '600', fontSize: 10 }}>CREDIT ISSUED</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                  <Text style={[ss.invoiceDue, isOverdue && { color: RED }]}>
                    Due {invoice.dueDate}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <InvoiceStatusBadge status={invoice.status} />
                  <Text style={ss.invoiceAmount}>
                    ${invoice.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>

              {/* Action buttons — stop propagation so they don't open the modal */}
              <View style={ss.invoiceActions}>
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); handleDownload(invoice); }}
                  disabled={isPdfLoading}
                  style={[ss.actionBtn, ss.actionGhost, { opacity: isPdfLoading ? 0.7 : 1, flex: invoice.status !== 'paid' ? 1 : 2 }]}
                >
                  {isPdfLoading
                    ? <ActivityIndicator size="small" color={BLUE} />
                    : <Feather name="download" size={13} color={BLUE} />
                  }
                  <Text style={ss.actionGhostText}>{isPdfLoading ? 'Saving…' : 'PDF'}</Text>
                </Pressable>

                {invoice.status !== 'paid' && (
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); handlePay(invoice); }}
                    style={[ss.actionBtn, ss.actionPrimary]}
                  >
                    <Feather name="external-link" size={13} color="#fff" />
                    <Text style={ss.actionPrimaryText}>View &amp; Pay</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const mdl = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER },
  closeBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  title:        { fontSize: 16, fontWeight: '700', color: TEXT },
  subtitle:     { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 },
  card:         { backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  dueText:      { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 4 },
  statusPill:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusPillText: { fontSize: 12, fontWeight: '600' },
  overdueBanner:{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FECACA' },
  qtyBadge:     { width: 32, height: 32, borderRadius: 8, backgroundColor: '#E0F5FE', alignItems: 'center', justifyContent: 'center' },
  qtyText:      { color: BLUE, fontWeight: '700', fontSize: 12 },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, flex: 1 },
  ghostBtn:     { backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: `${BLUE}30` },
  ghostBtnText: { color: BLUE, fontWeight: '600', fontSize: 13 },
  solidBtn:     { backgroundColor: BLUE },
  solidBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

const ss = StyleSheet.create({
  header:           { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  title:            { fontSize: 26, fontWeight: '700', color: TEXT },
  summaryRow:       { flexDirection: 'row', gap: 10 },
  summaryCard:      { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, gap: 3 },
  summaryLabel:     { fontSize: 11, letterSpacing: 0.5, fontWeight: '600' },
  summaryValue:     { fontSize: 18, fontWeight: '700' },

  payMethod:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  payIcon:          { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  payLabel:         { color: MUTED, fontWeight: '500', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  payValue:         { color: TEXT, fontWeight: '600', fontSize: 13, marginTop: 2 },
  payManage:        { color: BLUE, fontWeight: '600', fontSize: 12 },

  invoiceCard:      { backgroundColor: CARD, borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: BORDER, borderLeftWidth: 3 },
  invoiceTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invoiceNum:       { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 3 },
  invoiceMeta:      { fontSize: 12, fontWeight: '400', color: MUTED, marginBottom: 1 },
  invoiceDue:       { fontSize: 12, fontWeight: '400', color: MUTED },
  invoiceAmount:    { fontSize: 17, fontWeight: '700', color: TEXT },
  invoiceActions:   { flexDirection: 'row', gap: 8 },
  actionBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, flex: 1 },
  actionGhost:      { backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: `${BLUE}30` },
  actionGhostText:  { color: BLUE, fontWeight: '600', fontSize: 12 },
  actionPrimary:    { backgroundColor: BLUE },
  actionPrimaryText:{ color: '#fff', fontWeight: '700', fontSize: 12 },
});
