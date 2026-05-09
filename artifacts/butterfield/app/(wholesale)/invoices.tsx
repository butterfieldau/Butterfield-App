import { Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { InvoiceStatusBadge } from '@/components/OrderStatusBadge';
import { MOCK_INVOICES } from '@/data/mockData';
import { generateInvoiceHtml, type InvoiceLine, type InvoicePdfData } from '@/lib/invoicePdf';
import { api } from '@/lib/api';
import type { Invoice } from '@/types';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const BRAND_BG: Record<string, string> = {
  Visa: '#1A3A8C', Mastercard: '#8C1B1B', Amex: '#1B5C8C',
};

const INVOICE_LINES: Record<string, InvoiceLine[]> = {
  inv1: [
    { description: 'Classic Choc Chip Cookie',   qty: 192, unitPrice: 2.31 },
    { description: 'Double Chocolate Cookie',     qty: 96,  unitPrice: 2.97 },
    { description: 'Brown Butter Oat Cookie',     qty: 96,  unitPrice: 2.42 },
    { description: 'Cookie Dozen Bundle',         qty: 15,  unitPrice: 26.40 },
    { description: 'Gift Box – Premium Assorted', qty: 10,  unitPrice: 39.60 },
    { description: 'NY Cheesecake Slice',         qty: 24,  unitPrice: 6.60 },
  ],
  inv2: [
    { description: 'Classic Choc Chip Cookie',   qty: 288, unitPrice: 2.31 },
    { description: 'Lemon Zest Cookie',           qty: 96,  unitPrice: 2.31 },
    { description: 'Cookie Dozen Bundle',         qty: 20,  unitPrice: 26.40 },
    { description: 'Cinnamon Roll',               qty: 24,  unitPrice: 3.96 },
    { description: 'NY Cheesecake Slice',         qty: 36,  unitPrice: 6.60 },
    { description: 'Tiramisu Cup',                qty: 12,  unitPrice: 5.50 },
  ],
  inv3: [
    { description: 'Classic Choc Chip Cookie',   qty: 48,  unitPrice: 2.31 },
    { description: 'Double Chocolate Cookie',     qty: 48,  unitPrice: 2.97 },
    { description: 'Snickerdoodle Cookie',        qty: 48,  unitPrice: 2.09 },
    { description: 'Cinnamon Roll',               qty: 12,  unitPrice: 3.96 },
  ],
  inv4: [
    { description: 'Classic Choc Chip Cookie',   qty: 144, unitPrice: 2.31 },
    { description: 'Brown Butter Oat Cookie',     qty: 96,  unitPrice: 2.42 },
    { description: 'Cookie Dozen Bundle',         qty: 12,  unitPrice: 26.40 },
    { description: 'Gift Box – Premium Assorted', qty: 8,   unitPrice: 39.60 },
    { description: 'NY Cheesecake Slice',         qty: 12,  unitPrice: 6.60 },
  ],
  inv5: [
    { description: 'Classic Choc Chip Cookie',   qty: 48,  unitPrice: 2.31 },
    { description: 'Double Chocolate Cookie',     qty: 24,  unitPrice: 2.97 },
    { description: 'Cookie Dozen Bundle',         qty: 10,  unitPrice: 24.20 },
  ],
};

function buildInvoiceData(invoice: Invoice): InvoicePdfData {
  return {
    number: invoice.number,
    date: invoice.date,
    dueDate: invoice.dueDate,
    status: invoice.status,
    companyName: 'Fresh Bite Café Group',
    abn: '98 765 432 100',
    contactEmail: 'accounts@freshbite.com.au',
    deliveryAddress: '12 Market Street\nParramatta NSW 2150',
    accountNumber: 'WH-2891',
    lines: INVOICE_LINES[invoice.id] ?? [{ description: 'Wholesale Cookie Order', qty: 1, unitPrice: invoice.amount }],
  };
}

export default function WholesaleInvoices() {
  const insets = useSafeAreaInsets();
  const { data: cardsData } = useQuery({ queryKey: ['wholesale-cards'], queryFn: api.wholesale.cards, retry: 1 });
  const cards    = cardsData?.data ?? [];
  const defCard  = cards.find((c: any) => c.isDefault) ?? cards[0];

  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [actionId, setActionId]   = useState<string | null>(null);

  const totalPending = MOCK_INVOICES.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.amount, 0);
  const overdueCount = MOCK_INVOICES.filter((i) => i.status === 'overdue').length;

  const handleView = async (invoice: Invoice) => {
    setActionId(invoice.id);
    try {
      if (Platform.OS === 'web') {
        const html = generateInvoiceHtml(buildInvoiceData(invoice));
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); win.focus(); }
        return;
      }
      await Print.printAsync({ html: generateInvoiceHtml(buildInvoiceData(invoice)) });
    } catch (e: any) { Alert.alert('View Error', e?.message ?? 'Could not open invoice.'); }
    finally { setActionId(null); }
  };

  const handleDownload = async (invoice: Invoice) => {
    setLoadingId(invoice.id);
    try {
      if (Platform.OS === 'web') {
        const html = generateInvoiceHtml(buildInvoiceData(invoice));
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 500); }
        return;
      }
      const html = generateInvoiceHtml(buildInvoiceData(invoice));
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
    if (!defCard) {
      Alert.alert(
        'No Card on File',
        'Add a payment card from the Account tab to pay invoices directly.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Account', onPress: () => router.push('/(wholesale)/profile' as any) },
        ],
      );
      return;
    }
    Alert.alert(
      `Pay ${invoice.number}`,
      `Charge $${invoice.amount.toFixed(2)} to ${defCard.cardBrand} •••• ${defCard.last4}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pay Now', onPress: () => Alert.alert('Payment Submitted', 'Your payment has been submitted for processing.') },
      ],
    );
  };

  const goManageCards = () => router.push('/(wholesale)/profile' as any);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <View style={[ss.header, { paddingTop: insets.top + 16 }]}>
        <Text style={ss.title}>Invoices</Text>
        <View style={ss.summaryRow}>
          <View style={[ss.summaryCard, { backgroundColor: '#E0F5FE', borderColor: BLUE }]}>
            <Text style={[ss.summaryLabel, { color: BLUE }]}>OUTSTANDING</Text>
            <Text style={[ss.summaryValue, { color: TEXT }]}>
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
      </View>

      <FlatList
        data={MOCK_INVOICES}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
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
          const isViewing    = actionId === invoice.id;
          const isPdfLoading = loadingId === invoice.id;
          const isOverdue    = invoice.status === 'overdue';

          return (
            <View style={[ss.invoiceCard, { borderLeftColor: isOverdue ? '#EF4444' : BLUE }]}>
              <View style={ss.invoiceTop}>
                <View style={{ flex: 1 }}>
                  <Text style={ss.invoiceNum}>{invoice.number}</Text>
                  <Text style={ss.invoiceMeta}>
                    {invoice.date} · {(INVOICE_LINES[invoice.id]?.length ?? 1)} line{(INVOICE_LINES[invoice.id]?.length ?? 1) !== 1 ? 's' : ''}
                  </Text>
                  <Text style={[ss.invoiceDue, isOverdue && { color: '#EF4444' }]}>
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

              <View style={ss.invoiceActions}>
                <Pressable
                  onPress={() => handleView(invoice)}
                  disabled={isViewing || isPdfLoading}
                  style={[ss.actionBtn, ss.actionGhost, { opacity: isViewing ? 0.7 : 1 }]}
                >
                  {isViewing ? <ActivityIndicator size="small" color={BLUE} /> : <Feather name="file-text" size={13} color={BLUE} />}
                  <Text style={ss.actionGhostText}>{isViewing ? 'Opening…' : 'View'}</Text>
                </Pressable>

                <Pressable
                  onPress={() => handleDownload(invoice)}
                  disabled={isPdfLoading || isViewing}
                  style={[ss.actionBtn, ss.actionGhost, { opacity: isPdfLoading ? 0.7 : 1 }]}
                >
                  {isPdfLoading ? <ActivityIndicator size="small" color={BLUE} /> : <Feather name="download" size={13} color={BLUE} />}
                  <Text style={ss.actionGhostText}>{isPdfLoading ? 'Saving…' : 'PDF'}</Text>
                </Pressable>

                {invoice.status !== 'paid' && (
                  <Pressable onPress={() => handlePay(invoice)} style={[ss.actionBtn, ss.actionPrimary]}>
                    <Feather name="credit-card" size={13} color="#fff" />
                    <Text style={ss.actionPrimaryText}>{defCard ? `Pay •${defCard.last4}` : 'Pay'}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const ss = StyleSheet.create({
  header:           { paddingHorizontal: 16, paddingBottom: 16, gap: 12, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER },
  title:            { fontSize: 26, fontFamily: 'Inter_700Bold', color: TEXT },
  summaryRow:       { flexDirection: 'row', gap: 10 },
  summaryCard:      { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, gap: 3 },
  summaryLabel:     { fontSize: 11, letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' },
  summaryValue:     { fontSize: 18, fontFamily: 'Inter_700Bold' },

  payMethod:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  payIcon:          { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  payLabel:         { color: MUTED, fontFamily: 'Inter_500Medium', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  payValue:         { color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 2 },
  payManage:        { color: BLUE, fontFamily: 'Inter_600SemiBold', fontSize: 12 },

  invoiceCard:      { backgroundColor: CARD, borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: BORDER, borderLeftWidth: 3 },
  invoiceTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invoiceNum:       { fontSize: 14, fontFamily: 'Inter_700Bold', color: TEXT, marginBottom: 3 },
  invoiceMeta:      { fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED, marginBottom: 1 },
  invoiceDue:       { fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED },
  invoiceAmount:    { fontSize: 17, fontFamily: 'Inter_700Bold', color: TEXT },
  invoiceActions:   { flexDirection: 'row', gap: 8 },
  actionBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, flex: 1 },
  actionGhost:      { backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: `${BLUE}30` },
  actionGhostText:  { color: BLUE, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  actionPrimary:    { backgroundColor: BLUE },
  actionPrimaryText:{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 },
});
