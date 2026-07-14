import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { s as rs } from './reportStyles';
import {
  BG, CARD, BLUE, TEXT, MUTED, BORDER, GREEN, RED, AMBER,
  GLASS_SHADOW, RADIUS_MD,
} from './directorColors';
import { fmtAUD, toYMD } from './reportHelpers';
import ReportDateRangePicker, {
  type DateRange, type RangePreset, getPresetRange,
} from './ReportDateRangePicker';
import SalesSummarySection    from './SalesSummarySection';
import PaymentsSection        from './PaymentsSection';
import ProductsSection        from './ProductsSection';
import BusyTimesSection       from './BusyTimesSection';
import StaffSection           from './StaffSection';
import RefundsSection         from './RefundsSection';
import CustomerGrowthSection  from './CustomerGrowthSection';

// ── Sub-sections ──────────────────────────────────────────────────────────────
const SUB_SECTIONS = [
  { id: 'sales'      as const, label: 'Sales',       icon: 'trending-up'  as const },
  { id: 'payments'   as const, label: 'Payments',    icon: 'credit-card'  as const },
  { id: 'products'   as const, label: 'Products',    icon: 'shopping-bag' as const },
  { id: 'staff'      as const, label: 'Staff',       icon: 'users'        as const },
  { id: 'customers'  as const, label: 'Customers',   icon: 'user'         as const },
  { id: 'busytimes'  as const, label: 'Busy Times',  icon: 'clock'        as const },
] as const;

type SubSection = typeof SUB_SECTIONS[number]['id'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPreviousPeriodRange(from: string, to: string): DateRange {
  const startDate = new Date(from + 'T12:00:00');
  const endDate   = new Date(to   + 'T12:00:00');
  const durationDays = Math.max(1, Math.round(
    (endDate.getTime() - startDate.getTime()) / 86_400_000,
  ));
  const prevEnd   = new Date(startDate.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - durationDays * 86_400_000);
  return { from: toYMD(prevStart), to: toYMD(prevEnd) };
}

function calcDelta(curr: number, prev: number): { pct: string; up: boolean } | null {
  if (!prev) return null;
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  return { pct: `${Math.abs(pct).toFixed(0)}%`, up: pct >= 0 };
}

// ── KPI strip card ────────────────────────────────────────────────────────────
function KpiCard({
  label, value, delta, valueColor = TEXT,
}: {
  label: string;
  value: string;
  delta: { pct: string; up: boolean } | null | undefined;
  valueColor?: string;
}) {
  return (
    <View style={k.cell}>
      <Text style={k.label}>{label}</Text>
      <Text style={[k.value, { color: valueColor }]}>{value}</Text>
      {delta ? (
        <View style={k.deltaRow}>
          <Feather
            name={delta.up ? 'arrow-up-right' : 'arrow-down-right'}
            size={11}
            color={delta.up ? GREEN : RED}
          />
          <Text style={[k.deltaText, { color: delta.up ? GREEN : RED }]}>
            {delta.pct} vs last
          </Text>
        </View>
      ) : (
        <View style={k.deltaRow} />
      )}
    </View>
  );
}

const k = StyleSheet.create({
  cell:     { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 },
  label:    { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.9, marginBottom: 4, textTransform: 'uppercase', textAlign: 'center' },
  value:    { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3, height: 16 },
  deltaText:{ fontSize: 10, fontWeight: '600' },
});

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AnalyticsTab({ onDownloadPress }: { onDownloadPress: () => void }) {
  const [preset,      setPreset]      = useState<RangePreset>('today');
  const [customRange, setCustomRange] = useState<DateRange>(() => getPresetRange('today'));
  const [section,     setSection]     = useState<SubSection>('sales');

  const range = useMemo<DateRange>(() =>
    preset === 'custom' ? customRange : getPresetRange(preset),
    [preset, customRange],
  );
  const prevRange = useMemo(() => getPreviousPeriodRange(range.from, range.to), [range.from, range.to]);

  const handlePreset = useCallback((p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') setCustomRange(getPresetRange(p));
  }, []);

  const { data: curr } = useQuery({
    queryKey: ['reports-summary', range.from, range.to],
    queryFn:  () => api.director.reportsSummary(range.from, range.to),
    staleTime: 60_000,
  });
  const { data: prev } = useQuery({
    queryKey: ['reports-summary', prevRange.from, prevRange.to],
    queryFn:  () => api.director.reportsSummary(prevRange.from, prevRange.to),
    staleTime: 60_000,
  });

  const cd = curr?.data;
  const pd = prev?.data;

  const kpis = [
    {
      label:      'REVENUE',
      value:      cd ? fmtAUD(cd.totalRevenueCents)    : '—',
      delta:      cd && pd ? calcDelta(cd.totalRevenueCents,    pd.totalRevenueCents)    : null,
      valueColor: BLUE,
    },
    {
      label: 'ORDERS',
      value: cd ? String(cd.orderCount)               : '—',
      delta: cd && pd ? calcDelta(cd.orderCount,               pd.orderCount)               : null,
    },
    {
      label: 'AVG ORDER',
      value: cd ? fmtAUD(cd.avgOrderValueCents)       : '—',
      delta: cd && pd ? calcDelta(cd.avgOrderValueCents,       pd.avgOrderValueCents)       : null,
    },
  ] as const;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 56 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Date range picker */}
      <ReportDateRangePicker
        preset={preset}
        range={range}
        onPreset={handlePreset}
        onCustomChange={setCustomRange}
      />

      {/* KPI strip */}
      <View style={[a.kpiCard, GLASS_SHADOW]}>
        {kpis.map((kpi, i) => (
          <React.Fragment key={kpi.label}>
            {i > 0 && <View style={a.kpiDivider} />}
            <KpiCard {...kpi} />
          </React.Fragment>
        ))}
      </View>

      {/* Section sub-nav */}
      <View style={a.subNavWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={a.subNavContent}
        >
          {SUB_SECTIONS.map(sec => {
            const active = section === sec.id;
            return (
              <Pressable
                key={sec.id}
                onPress={() => { setSection(sec.id); Haptics.selectionAsync(); }}
                style={[a.subNavChip, active ? a.subNavChipActive : a.subNavChipInactive]}
              >
                <Feather
                  name={sec.icon}
                  size={12}
                  color={active ? '#fff' : MUTED}
                />
                <Text style={[a.subNavLabel, active ? a.subNavLabelActive : a.subNavLabelInactive]}>
                  {sec.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Section content */}
      {section === 'sales' && (
        <>
          <SalesSummarySection from={range.from} to={range.to} />
          <RefundsSection      from={range.from} to={range.to} />
        </>
      )}
      {section === 'payments'  && <PaymentsSection       from={range.from} to={range.to} />}
      {section === 'products'  && <ProductsSection       from={range.from} to={range.to} />}
      {section === 'staff'     && <StaffSection          from={range.from} to={range.to} />}
      {section === 'customers' && <CustomerGrowthSection from={range.from} to={range.to} />}
      {section === 'busytimes' && <BusyTimesSection      from={range.from} to={range.to} />}

      {/* Download button */}
      <Pressable onPress={onDownloadPress} style={rs.downloadBtn}>
        <Feather name="download" size={16} color="#fff" />
        <Text style={rs.downloadBtnText}>Download Excel Report</Text>
      </Pressable>
    </ScrollView>
  );
}

const a = StyleSheet.create({
  kpiCard: {
    flexDirection: 'row',
    backgroundColor: CARD,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: RADIUS_MD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  kpiDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
  },
  subNavWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    backgroundColor: BG,
    marginTop: 14,
  },
  subNavContent: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  subNavChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
  },
  subNavChipActive: {
    backgroundColor: '#1C1C1E',
    borderColor: '#1C1C1E',
  },
  subNavChipInactive: {
    backgroundColor: CARD,
    borderColor: BORDER,
  },
  subNavLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  subNavLabelActive: {
    color: '#fff',
  },
  subNavLabelInactive: {
    color: MUTED,
  },
});
