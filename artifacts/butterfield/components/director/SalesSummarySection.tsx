import React from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { s } from './reportStyles';
import { BLUE, MUTED, AMBER, RED, TEXT } from './directorColors';
import { fmtAUD } from './reportHelpers';
import ReportSectionHeader from './ReportSectionHeader';
import StatCard from './StatCard';
import SectionLoader from './SectionLoader';

export default function SalesSummarySection({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-summary', from, to],
    queryFn: () => api.director.reportsSummary(from, to),
    staleTime: 60_000,
  });
  const d = data?.data;

  if (isLoading) return <SectionLoader />;
  if (!d) return null;

  return (
    <View style={s.section}>
      <ReportSectionHeader title="SALES SUMMARY" icon="dollar-sign" />
      <View style={s.card}>
        <View style={s.statRow}>
          <StatCard label="Total Revenue" value={fmtAUD(d.totalRevenueCents)} color={BLUE} icon="trending-up" />
          <StatCard label="Orders"        value={String(d.orderCount)}          icon="shopping-bag" />
          <StatCard label="Avg Order"     value={fmtAUD(d.avgOrderValueCents)}  icon="activity" />
        </View>
        <View style={[s.divider, { marginVertical: 12 }]} />
        <View style={s.statRow}>
          <StatCard label="Net Revenue" value={fmtAUD(d.netRevenueCents)} sub="excl. GST" />
          <StatCard label="GST Collected" value={fmtAUD(d.gstCents)} sub="10% incl." color={MUTED} />
          <StatCard label="Discounts Given" value={fmtAUD(d.totalDiscountCents)} color={AMBER} />
        </View>
        <View style={[s.divider, { marginVertical: 12 }]} />
        <View style={s.statRow}>
          <StatCard label="Refunds" value={String(d.refundCount)} color={RED} icon="rotate-ccw" />
          <StatCard label="Cancelled" value={String(d.cancelCount)} color={AMBER} icon="x-circle" />
          <View style={s.statCard} />
        </View>
      </View>
    </View>
  );
}
