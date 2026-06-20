import React from 'react';
import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { s } from './reportStyles';
import { BLUE } from './directorColors';
import { fmtAUD, fmtPaymentMethod } from './reportHelpers';
import ReportSectionHeader from './ReportSectionHeader';
import HBar from './HBar';
import EmptyState from './EmptyState';
import SectionLoader from './SectionLoader';

export default function PaymentsSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-payments', from, to],
    queryFn: () => api.director.reportsPayments(from, to),
    staleTime: 60_000,
  });
  const rows = data?.data ?? [];
  const maxRev = Math.max(...rows.map(r => r.revenueCents), 1);

  if (isLoading) return <SectionLoader />;

  return (
    <View style={s.section}>
      <ReportSectionHeader title="PAYMENT BREAKDOWN" icon="credit-card" />
      {rows.length === 0
        ? <EmptyState icon="credit-card" text="No payment data for this period" />
        : (
          <View style={s.card}>
            {rows.map((r, i) => (
              <View key={r.method}>
                {i > 0 && <View style={s.divider} />}
                <View style={s.breakRow}>
                  <Text style={[s.breakLabel, { flex: 1 }]}>{fmtPaymentMethod(r.method)}</Text>
                  <Text style={s.breakCount}>{r.orderCount} orders</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <HBar value={r.revenueCents} max={maxRev} color={BLUE} />
                  </View>
                  <Text style={s.breakValue}>{fmtAUD(r.revenueCents)}</Text>
                </View>
              </View>
            ))}
          </View>
        )
      }
    </View>
  );
}
