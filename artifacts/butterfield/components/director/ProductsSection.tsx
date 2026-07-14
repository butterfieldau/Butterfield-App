import React from 'react';
import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { s } from './reportStyles';
import { NAVY, BLUE } from './directorColors';
import { fmtAUD } from './reportHelpers';
import ReportSectionHeader from './ReportSectionHeader';
import HBar from './HBar';
import EmptyState from './EmptyState';
import SectionLoader from './SectionLoader';

export default function ProductsSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-products', from, to],
    queryFn: () => api.director.reportsProducts(from, to),
    staleTime: 60_000,
  });
  const rows = data?.data ?? [];
  const maxUnits = Math.max(...rows.map(r => r.units), 1);

  if (isLoading) return <SectionLoader />;

  return (
    <View style={s.section}>
      <ReportSectionHeader title="PRODUCT PERFORMANCE" icon="package" />
      {rows.length === 0
        ? <EmptyState icon="package" text="No product sales for this period" />
        : (
          <View style={s.card}>
            {rows.map((r, i) => (
              <View key={r.name}>
                {i > 0 && <View style={s.divider} />}
                <View style={s.breakRow}>
                  <Text style={[s.breakLabel, { flex: 1 }]} numberOfLines={1}>
                    {i + 1}. {r.name}
                  </Text>
                  <Text style={s.breakCount}>{r.units} sold</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <HBar value={r.units} max={maxUnits} color={BLUE} />
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
