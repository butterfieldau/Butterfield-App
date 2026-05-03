import { Feather } from '@expo/vector-icons';
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InvoiceStatusBadge } from '@/components/OrderStatusBadge';
import { MOCK_INVOICES } from '@/data/mockData';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

export default function WholesaleInvoices() {
  const insets = useSafeAreaInsets();

  const totalPending = MOCK_INVOICES.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.amount, 0);
  const overdueCount = MOCK_INVOICES.filter((i) => i.status === 'overdue').length;

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
        renderItem={({ item: invoice }) => (
          <View style={[styles.invoiceCard, { backgroundColor: CARD, borderLeftColor: invoice.status === 'overdue' ? '#EF4444' : BLUE, borderLeftWidth: 3, borderWidth: 1, borderColor: BORDER }]}>
            <View style={styles.invoiceTop}>
              <View>
                <Text style={[styles.invoiceNum, { color: TEXT, fontFamily: 'Inter_600SemiBold' }]}>{invoice.number}</Text>
                <Text style={[styles.invoiceDate, { color: MUTED }]}>Issued: {invoice.date}</Text>
                <Text style={[styles.invoiceDue, { color: invoice.status === 'overdue' ? '#EF4444' : MUTED }]}>Due: {invoice.dueDate}</Text>
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
              <View style={[styles.invoiceBtn, { backgroundColor: '#E0F5FE', borderRadius: 8 }]}>
                <Feather name="download" size={14} color={BLUE} />
                <Text style={[styles.invoiceBtnText, { color: BLUE, fontFamily: 'Inter_500Medium' }]}>Download PDF</Text>
              </View>
              {invoice.status !== 'paid' && (
                <View style={[styles.invoiceBtn, { backgroundColor: BLUE, borderRadius: 8 }]}>
                  <Feather name="credit-card" size={14} color="#fff" />
                  <Text style={[styles.invoiceBtnText, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>Pay Now</Text>
                </View>
              )}
            </View>
          </View>
        )}
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
  invoiceCard: { borderRadius: 14, padding: 16, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  invoiceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invoiceNum: { fontSize: 14, marginBottom: 3 },
  invoiceDate: { fontSize: 12, marginBottom: 1, fontFamily: 'Inter_400Regular' },
  invoiceDue: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  invoiceAmount: { fontSize: 17, marginTop: 4 },
  invoiceDivider: { height: 1 },
  invoiceActions: { flexDirection: 'row', gap: 10 },
  invoiceBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  invoiceBtnText: { fontSize: 13 },
});
