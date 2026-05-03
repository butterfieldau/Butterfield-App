import { Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InvoiceStatusBadge } from '@/components/OrderStatusBadge';
import { MOCK_INVOICES } from '@/data/mockData';
import { generateInvoiceHtml, type InvoiceLine, type InvoicePdfData } from '@/lib/invoicePdf';
import type { Invoice } from '@/types';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

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

async function getPdfUri(invoice: Invoice): Promise<string> {
  const html = generateInvoiceHtml(buildInvoiceData(invoice));
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

export default function WholesaleInvoices() {
  const insets = useSafeAreaInsets();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const totalPending = MOCK_INVOICES.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.amount, 0);
  const overdueCount = MOCK_INVOICES.filter((i) => i.status === 'overdue').length;

  const handleView = async (invoice: Invoice) => {
    setActionId(invoice.id);
    try {
      const html = generateInvoiceHtml(buildInvoiceData(invoice));
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); win.focus(); }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await WebBrowser.openBrowserAsync(uri, {
        toolbarColor: '#1C1C1E',
        controlsColor: '#40C0F2',
        dismissButtonStyle: 'close',
      });
    } catch (e: any) {
      Alert.alert('View Error', e?.message ?? 'Could not open invoice.');
    } finally {
      setActionId(null);
    }
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
      const uri = await getPdfUri(invoice);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Invoice ${invoice.number}`, UTI: 'com.adobe.pdf' });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (e: any) {
      Alert.alert('PDF Error', e?.message ?? 'Could not generate PDF. Please try again.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }]}>
        <Text style={[styles.title, { color: TEXT, fontFamily: 'Inter_700Bold' }]}>Invoices</Text>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: '#E0F5FE', borderColor: BLUE }]}>
            <Text style={[styles.summaryLabel, { color: BLUE }]}>OUTSTANDING</Text>
            <Text style={[styles.summaryValue, { color: TEXT, fontFamily: 'Inter_700Bold' }]}>
              ${totalPending.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          {overdueCount > 0 && (
            <View style={[styles.summaryCard, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
              <Text style={[styles.summaryLabel, { color: '#991B1B' }]}>OVERDUE</Text>
              <Text style={[styles.summaryValue, { color: '#991B1B', fontFamily: 'Inter_700Bold' }]}>
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
        renderItem={({ item: invoice }) => {
          const isViewing = actionId === invoice.id;
          const isPdfLoading = loadingId === invoice.id;

          return (
            <View style={[styles.invoiceCard, {
              backgroundColor: CARD,
              borderLeftColor: invoice.status === 'overdue' ? '#EF4444' : BLUE,
              borderLeftWidth: 3, borderWidth: 1, borderColor: BORDER,
            }]}>
              <View style={styles.invoiceTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.invoiceNum, { color: TEXT, fontFamily: 'Inter_600SemiBold' }]}>{invoice.number}</Text>
                  <Text style={[styles.invoiceDate, { color: MUTED }]}>Issued: {invoice.date}</Text>
                  <Text style={[styles.invoiceDue, { color: invoice.status === 'overdue' ? '#EF4444' : MUTED }]}>Due: {invoice.dueDate}</Text>
                  <Text style={[styles.invoiceLines, { color: MUTED }]}>
                    {(INVOICE_LINES[invoice.id]?.length ?? 1)} line item{(INVOICE_LINES[invoice.id]?.length ?? 1) !== 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <InvoiceStatusBadge status={invoice.status} />
                  <Text style={[styles.invoiceAmount, { color: TEXT, fontFamily: 'Inter_700Bold' }]}>
                    ${invoice.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>

              <View style={[styles.invoiceDivider, { backgroundColor: BORDER }]} />

              <View style={styles.invoiceActions}>
                {/* View button */}
                <Pressable
                  onPress={() => handleView(invoice)}
                  disabled={isViewing || isPdfLoading}
                  style={[styles.invoiceBtn, { backgroundColor: '#F0F9FF', borderRadius: 10, flex: 1, borderWidth: 1, borderColor: `${BLUE}30`, opacity: isViewing ? 0.7 : 1 }]}
                >
                  {isViewing ? (
                    <ActivityIndicator size="small" color={BLUE} />
                  ) : (
                    <Feather name="eye" size={14} color={BLUE} />
                  )}
                  <Text style={[styles.invoiceBtnText, { color: BLUE, fontFamily: 'Inter_600SemiBold' }]}>
                    {isViewing ? 'Opening…' : 'View'}
                  </Text>
                </Pressable>

                {/* Download / Share button */}
                <Pressable
                  onPress={() => handleDownload(invoice)}
                  disabled={isPdfLoading || isViewing}
                  style={[styles.invoiceBtn, { backgroundColor: isPdfLoading ? `${BLUE}20` : '#E0F5FE', borderRadius: 10, flex: 1, opacity: isPdfLoading ? 0.7 : 1 }]}
                >
                  {isPdfLoading ? (
                    <ActivityIndicator size="small" color={BLUE} />
                  ) : (
                    <Feather name="download" size={14} color={BLUE} />
                  )}
                  <Text style={[styles.invoiceBtnText, { color: BLUE, fontFamily: 'Inter_600SemiBold' }]}>
                    {isPdfLoading ? 'Generating…' : 'Download'}
                  </Text>
                </Pressable>

                {invoice.status !== 'paid' && (
                  <Pressable
                    onPress={() => Alert.alert('Pay Invoice', `Pay ${invoice.number} for $${invoice.amount.toFixed(2)}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Pay Now', style: 'default' }])}
                    style={[styles.invoiceBtn, { backgroundColor: BLUE, borderRadius: 10, flex: 1 }]}
                  >
                    <Feather name="credit-card" size={14} color="#fff" />
                    <Text style={[styles.invoiceBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>Pay Now</Text>
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

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  title: { fontSize: 26 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, gap: 3 },
  summaryLabel: { fontSize: 11, letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' },
  summaryValue: { fontSize: 18 },
  invoiceCard: {
    borderRadius: 14, padding: 16, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  invoiceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invoiceNum: { fontSize: 14, marginBottom: 3 },
  invoiceDate: { fontSize: 12, marginBottom: 1, fontFamily: 'Inter_400Regular' },
  invoiceDue: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  invoiceLines: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  invoiceAmount: { fontSize: 17, marginTop: 4 },
  invoiceDivider: { height: 1 },
  invoiceActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  invoiceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 11 },
  invoiceBtnText: { fontSize: 13 },
});
