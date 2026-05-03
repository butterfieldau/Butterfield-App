import { Feather } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InvoiceStatusBadge } from '@/components/OrderStatusBadge';
import { MOCK_INVOICES } from '@/data/mockData';
import { useColors } from '@/hooks/useColors';

export default function WholesaleInvoices() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const totalPending = MOCK_INVOICES.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.amount, 0);
  const overdueCount = MOCK_INVOICES.filter((i) => i.status === 'overdue').length;

  return (
    <View style={{ flex: 1, backgroundColor: '#F2F8F5' }}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 80 : insets.top + 20 }]}>
        <Text style={[styles.title, { color: '#1A3A2A', fontFamily: 'Inter_700Bold' }]}>Invoices</Text>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: '#fff', borderColor: '#C8DDD4' }]}>
            <Text style={[styles.summaryLabel, { color: '#6A9A7A' }]}>Outstanding</Text>
            <Text style={[styles.summaryValue, { color: '#1A3A2A', fontFamily: 'Inter_700Bold' }]}>
              ${totalPending.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          {overdueCount > 0 && (
            <View style={[styles.summaryCard, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
              <Text style={[styles.summaryLabel, { color: '#991B1B' }]}>Overdue</Text>
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
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: invoice }) => (
          <View
            style={[
              styles.invoiceCard,
              {
                backgroundColor: '#fff',
                borderRadius: colors.radius,
                borderColor: invoice.status === 'overdue' ? '#FCA5A5' : '#C8DDD4',
                borderLeftWidth: invoice.status === 'overdue' ? 3 : 1,
                borderLeftColor: invoice.status === 'overdue' ? '#EF4444' : '#C8DDD4',
              },
            ]}
          >
            <View style={styles.invoiceTop}>
              <View>
                <Text style={[styles.invoiceNum, { color: '#1A3A2A', fontFamily: 'Inter_600SemiBold' }]}>
                  {invoice.number}
                </Text>
                <Text style={[styles.invoiceDate, { color: '#6A9A7A' }]}>Issued: {invoice.date}</Text>
                <Text style={[styles.invoiceDue, { color: invoice.status === 'overdue' ? '#EF4444' : '#6A9A7A' }]}>
                  Due: {invoice.dueDate}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <InvoiceStatusBadge status={invoice.status} />
                <Text style={[styles.invoiceAmount, { color: '#1A3A2A', fontFamily: 'Inter_700Bold' }]}>
                  ${invoice.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            <View style={[styles.invoiceDivider, { backgroundColor: '#E8F4EE' }]} />

            <View style={styles.invoiceActions}>
              <View style={[styles.invoiceBtn, { backgroundColor: '#E8F4EE', borderRadius: 8 }]}>
                <Feather name="download" size={14} color="#2A6A4A" />
                <Text style={[styles.invoiceBtnText, { color: '#2A6A4A', fontFamily: 'Inter_500Medium' }]}>Download PDF</Text>
              </View>
              {invoice.status !== 'paid' && (
                <View style={[styles.invoiceBtn, { backgroundColor: '#2A6A4A', borderRadius: 8 }]}>
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
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#C8DDD4',
    gap: 12,
    backgroundColor: '#F2F8F5',
  },
  title: {
    fontSize: 26,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 3,
  },
  summaryLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 18,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  invoiceCard: {
    padding: 16,
    gap: 12,
    borderWidth: 1,
    marginBottom: 10,
    shadowColor: '#1A3A2A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  invoiceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  invoiceNum: {
    fontSize: 14,
    marginBottom: 3,
  },
  invoiceDate: {
    fontSize: 12,
    marginBottom: 1,
  },
  invoiceDue: {
    fontSize: 12,
  },
  invoiceAmount: {
    fontSize: 17,
    marginTop: 4,
  },
  invoiceDivider: {
    height: 1,
  },
  invoiceActions: {
    flexDirection: 'row',
    gap: 10,
  },
  invoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  invoiceBtnText: {
    fontSize: 13,
  },
});
