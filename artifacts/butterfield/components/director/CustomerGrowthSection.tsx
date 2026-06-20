import React from 'react';
import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { s } from './reportStyles';
import { GREEN, BLUE } from './directorColors';
import { fmtDateShort } from './reportHelpers';
import ReportSectionHeader from './ReportSectionHeader';
import StatCard from './StatCard';
import HBar from './HBar';
import SectionLoader from './SectionLoader';

export default function CustomerGrowthSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-customers', from, to],
    queryFn: () => api.director.reportsCustomers(from, to),
    staleTime: 60_000,
  });
  const d = data?.data;
  const maxDay = Math.max(...(d?.byDay.map(b => b.count) ?? [1]), 1);

  if (isLoading) return <SectionLoader />;
  if (!d) return null;

  return (
    <View style={s.section}>
      <ReportSectionHeader title="CUSTOMER GROWTH" icon="users" />
      <View style={s.card}>
        <View style={s.statRow}>
          <StatCard label="New Customers" value={String(d.newCustomers)} color={GREEN} icon="user-plus" />
          <StatCard label="Total Customers" value={String(d.totalCustomers)} />
          <StatCard label="Active (period)" value={String(d.activeCustomers)} color={BLUE} />
        </View>

        {d.byDay.length > 0 && (
          <>
            <View style={[s.divider, { marginVertical: 12 }]} />
            <Text style={[s.sectionTitle, { marginBottom: 8 }]}>NEW CUSTOMERS BY DAY</Text>
            {d.byDay.map((b, i) => (
              <View key={i} style={s.breakRow}>
                <Text style={[s.breakLabel, { width: 72 }]}>{fmtDateShort(b.day)}</Text>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <HBar value={b.count} max={maxDay} color={GREEN} />
                </View>
                <Text style={s.breakCount}>{b.count}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}
