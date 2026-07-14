import { Feather } from '@expo/vector-icons';
import React from 'react';
import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { s } from './reportStyles';
import { AMBER, BORDER, NAVY, MUTED, TEXT } from './directorColors';
import { fmtHour } from './reportHelpers';
import ReportSectionHeader from './ReportSectionHeader';
import EmptyState from './EmptyState';
import SectionLoader from './SectionLoader';

export default function BusyTimesSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-busy-times', from, to],
    queryFn: () => api.director.reportsBusyTimes(from, to),
    staleTime: 60_000,
  });
  const buckets = data?.data ?? [];
  const maxAvg = Math.max(...buckets.map(b => b.avgPerDay), 1);
  const peakHour = buckets.reduce((p, b) => b.avgPerDay > (p?.avgPerDay ?? 0) ? b : p, buckets[0]);
  const tradeHours = buckets.filter(b => b.orderCount > 0);

  if (isLoading) return <SectionLoader />;

  return (
    <View style={s.section}>
      <ReportSectionHeader title="BUSY TIMES" icon="clock" />
      <View style={s.card}>
        {peakHour && peakHour.orderCount > 0 && (
          <View style={s.peakBanner}>
            <Feather name="zap" size={14} color={AMBER} />
            <Text style={s.peakText}>
              Peak hour: <Text style={{ fontWeight: '700' }}>{fmtHour(peakHour.hour)}</Text>
              {' '}— avg {peakHour.avgPerDay} {peakHour.avgPerDay === 1 ? 'order' : 'orders'}/day
            </Text>
          </View>
        )}
        {tradeHours.length === 0
          ? <EmptyState icon="clock" text="No orders in this period" />
          : (
            <View style={s.heatmapGrid}>
              {buckets.map(b => {
                const intensity = b.avgPerDay / maxAvg;
                const bg = b.orderCount === 0
                  ? BORDER
                  : `rgba(20, 147, 255, ${Math.max(0.12, intensity)})`;
                return (
                  <View key={b.hour} style={s.heatCell}>
                    <View style={[s.heatBlock, { backgroundColor: bg }]}>
                      {b.avgPerDay > 0 && (
                        <Text style={[s.heatCount, { color: intensity > 0.5 ? '#fff' : TEXT }]}>
                          {b.avgPerDay}
                        </Text>
                      )}
                    </View>
                    <Text style={s.heatLabel}>{fmtHour(b.hour)}</Text>
                  </View>
                );
              })}
            </View>
          )
        }
      </View>
    </View>
  );
}
