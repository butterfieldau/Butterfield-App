import React from 'react';
import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { s } from './reportStyles';
import { PURPLE } from './directorColors';
import { fmtAUD, fmtMins } from './reportHelpers';
import ReportSectionHeader from './ReportSectionHeader';
import HBar from './HBar';
import EmptyState from './EmptyState';
import SectionLoader from './SectionLoader';

export default function StaffSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-staff', from, to],
    queryFn: () => api.director.reportsStaff(from, to),
    staleTime: 60_000,
  });
  const rows = data?.data ?? [];
  const maxMins = Math.max(...rows.map(r => r.totalMinutes), 1);

  if (isLoading) return <SectionLoader />;

  return (
    <View style={s.section}>
      <ReportSectionHeader title="STAFF PERFORMANCE" icon="users" />
      {rows.length === 0
        ? <EmptyState icon="users" text="No completed shifts in this period" />
        : (
          <View style={s.card}>
            {rows.map((r, i) => (
              <View key={r.userId}>
                {i > 0 && <View style={s.divider} />}
                <View style={s.breakRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.breakLabel}>{r.name}</Text>
                    {r.position && <Text style={s.breakSub}>{r.position}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.breakCount}>{r.shiftCount} {r.shiftCount === 1 ? 'shift' : 'shifts'} · {fmtMins(r.totalMinutes)}</Text>
                    {r.ordersProcessed !== null
                      ? <Text style={s.breakValue}>{r.ordersProcessed} orders · {fmtAUD(r.revenueHandledCents ?? 0)}</Text>
                      : <Text style={[s.breakSub, { fontStyle: 'italic' }]}>Orders N/A (historical)</Text>
                    }
                  </View>
                </View>
                <View style={{ marginTop: 6 }}>
                  <HBar value={r.totalMinutes} max={maxMins} color={PURPLE} />
                </View>
              </View>
            ))}
          </View>
        )
      }
    </View>
  );
}
