import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import React, { useState, useMemo, useCallback } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import {
  api, getToken,
  type DirectorFeedback,
  type ReportsSummary,
  type ReportsProduct,
  type ReportsBusyBucket,
  type ReportsStaffMember,
  type ReportsPaymentBreakdown,
  type ReportsRefundsData,
  type ReportsCustomerGrowth,
} from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';
const PURPLE = '#8B5CF6';

const TABS = ['Analytics', 'Feedback'] as const;
type TabKey = typeof TABS[number];

type RangePreset = 'today' | 'week' | 'month' | 'custom';

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : 'http://localhost:80/api';

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso: string) {
  const d = new Date(iso);
  if (!isNaN(d.getTime())) return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  return iso;
}

function fmtDisplayDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtHour(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtPaymentMethod(method: string): string {
  const MAP: Record<string, string> = {
    card:          'Card',
    pay_at_pickup: 'Pay at Pickup',
    cash:          'Cash',
    eftpos:        'EFTPOS',
    split:         'Split',
    unknown:       'Unknown',
  };
  return MAP[method] ?? method.replace(/_/g, ' ');
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={s.sectionHeader}>
      <Feather name={icon as any} size={13} color={MUTED} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: string;
}) {
  return (
    <View style={s.statCard}>
      {icon ? <Feather name={icon as any} size={16} color={color ?? BLUE} style={{ marginBottom: 6 }} /> : null}
      <Text style={[s.statValue, { color: color ?? TEXT }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

function HBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 3;
  return (
    <View style={s.hBarTrack}>
      <View style={[s.hBarFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.emptyState}>
      <Feather name={icon as any} size={28} color={BORDER} />
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

function SectionLoader() {
  return (
    <View style={s.sectionLoader}>
      <ActivityIndicator color={BLUE} size="small" />
    </View>
  );
}

// ── Date Range Picker ─────────────────────────────────────────────────────────

interface DateRange { from: string; to: string }

function getPresetRange(preset: RangePreset): DateRange {
  const today = new Date();
  const ymd = toYMD;
  switch (preset) {
    case 'today':
      return { from: ymd(today), to: ymd(today) };
    case 'week': {
      const d = new Date(today); d.setDate(d.getDate() - 6);
      return { from: ymd(d), to: ymd(today) };
    }
    case 'month': {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: ymd(d), to: ymd(today) };
    }
    default:
      return { from: ymd(today), to: ymd(today) };
  }
}

interface DateRangePickerProps {
  preset: RangePreset;
  range: DateRange;
  onPreset: (p: RangePreset) => void;
  onCustomChange: (r: DateRange) => void;
}

function DateRangePicker({ preset, range, onPreset, onCustomChange }: DateRangePickerProps) {
  const PRESETS: { key: RangePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: '7 Days' },
    { key: 'month', label: 'Month' },
    { key: 'custom',label: 'Custom' },
  ];

  return (
    <View style={s.drpContainer}>
      <View style={s.drpRow}>
        {PRESETS.map(p => (
          <Pressable
            key={p.key}
            onPress={() => { Haptics.selectionAsync(); onPreset(p.key); }}
            style={[s.drpChip, preset === p.key && s.drpChipActive]}
          >
            <Text style={[s.drpChipText, preset === p.key && s.drpChipTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      {preset === 'custom' && (
        <View style={s.drpCustomRow}>
          <View style={s.drpInputWrap}>
            <Feather name="calendar" size={13} color={MUTED} />
            <TextInput
              style={s.drpInput}
              value={range.from}
              onChangeText={v => onCustomChange({ ...range, from: v })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={MUTED}
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
            />
          </View>
          <Text style={s.drpSep}>→</Text>
          <View style={s.drpInputWrap}>
            <Feather name="calendar" size={13} color={MUTED} />
            <TextInput
              style={s.drpInput}
              value={range.to}
              onChangeText={v => onCustomChange({ ...range, to: v })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={MUTED}
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// ── Analytics Sections ────────────────────────────────────────────────────────

function SalesSummarySection({ from, to }: { from: string; to: string }) {
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
      <SectionHeader title="SALES SUMMARY" icon="dollar-sign" />
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

function PaymentsSection({ from, to }: { from: string; to: string }) {
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
      <SectionHeader title="PAYMENT BREAKDOWN" icon="credit-card" />
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

function ProductsSection({ from, to }: { from: string; to: string }) {
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
      <SectionHeader title="PRODUCT PERFORMANCE" icon="package" />
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
                    <HBar value={r.units} max={maxUnits} color={NAVY} />
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

function BusyTimesSection({ from, to }: { from: string; to: string }) {
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
      <SectionHeader title="BUSY TIMES" icon="clock" />
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
                        <Text style={[s.heatCount, { color: intensity > 0.5 ? '#fff' : NAVY }]}>
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

function StaffSection({ from, to }: { from: string; to: string }) {
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
      <SectionHeader title="STAFF PERFORMANCE" icon="users" />
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

function RefundsSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-refunds', from, to],
    queryFn: () => api.director.reportsRefunds(from, to),
    staleTime: 60_000,
  });
  const d = data?.data;
  const maxCode = Math.max(...(d?.discounts.byCode.map(c => c.totalDiscountCents) ?? [1]), 1);

  if (isLoading) return <SectionLoader />;
  if (!d) return null;

  return (
    <View style={s.section}>
      <SectionHeader title="REFUNDS & DISCOUNTS" icon="rotate-ccw" />
      <View style={s.card}>
        <View style={s.statRow}>
          <StatCard
            label="Refunds"
            value={String(d.refunds.count)}
            sub={fmtAUD(d.refunds.totalCents)}
            color={d.refunds.count > 0 ? RED : TEXT}
            icon="rotate-ccw"
          />
          <StatCard
            label="Discounts Used"
            value={String(d.discounts.count)}
            sub={fmtAUD(d.discounts.totalCents) + ' off'}
            color={AMBER}
            icon="percent"
          />
          <View style={s.statCard} />
        </View>

        {d.refunds.topReasons.length > 0 && (
          <>
            <View style={s.divider} />
            <Text style={[s.sectionTitle, { marginTop: 8, marginBottom: 6 }]}>TOP REFUND/CANCEL REASONS</Text>
            {d.refunds.topReasons.map((r, i) => (
              <View key={r.reason}>
                {i > 0 && <View style={s.divider} />}
                <View style={s.breakRow}>
                  <Text style={[s.breakLabel, { flex: 1 }]} numberOfLines={2}>{r.reason}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.breakCount}>{r.count}×</Text>
                    <Text style={s.breakValue}>{fmtAUD(r.totalCents)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {d.discounts.byType.length > 0 && (
          <>
            <View style={s.divider} />
            <Text style={[s.sectionTitle, { marginTop: 8, marginBottom: 6 }]}>BY DISCOUNT TYPE</Text>
            {d.discounts.byType.map((t, i) => {
              const label = t.type === 'loyalty_redemption' ? 'Loyalty Redemption'
                : t.type === 'percentage' ? 'Percentage Off'
                : t.type === 'fixed_amount' ? 'Fixed Amount Off'
                : t.type === 'free_delivery' ? 'Free Delivery'
                : t.type === 'promo_code' ? 'Promo Code'
                : t.type.replace(/_/g, ' ');
              const maxByType = Math.max(...d.discounts.byType.map(x => x.totalDiscountCents), 1);
              return (
                <View key={t.type}>
                  {i > 0 && <View style={s.divider} />}
                  <View style={s.breakRow}>
                    <Text style={[s.breakLabel, { flex: 1 }]}>{label}</Text>
                    <Text style={s.breakCount}>{t.count}×</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <View style={{ flex: 1 }}>
                      <HBar value={t.totalDiscountCents} max={maxByType} color={AMBER} />
                    </View>
                    <Text style={s.breakValue}>{fmtAUD(t.totalDiscountCents)}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {d.discounts.byCode.length > 0 && (
          <>
            <View style={s.divider} />
            <Text style={[s.sectionTitle, { marginTop: 8, marginBottom: 6 }]}>BY DISCOUNT CODE</Text>
            {d.discounts.byCode.map((c, i) => (
              <View key={c.code}>
                {i > 0 && <View style={s.divider} />}
                <View style={s.breakRow}>
                  <Text style={[s.breakLabel, { flex: 1, fontFamily: 'monospace' }]} numberOfLines={1}>
                    {c.code === 'no_code' ? '(no code)' : c.code}
                  </Text>
                  <Text style={s.breakCount}>{c.count}×</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <HBar value={c.totalDiscountCents} max={maxCode} color={AMBER} />
                  </View>
                  <Text style={s.breakValue}>{fmtAUD(c.totalDiscountCents)}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}

function CustomerGrowthSection({ from, to }: { from: string; to: string }) {
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
      <SectionHeader title="CUSTOMER GROWTH" icon="users" />
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

// ── Download Report Modal ─────────────────────────────────────────────────────

interface DownloadModalProps { visible: boolean; onClose: () => void }

function DownloadReportModal({ visible, onClose }: DownloadModalProps) {
  const today = new Date();
  const [fromStr, setFromStr] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return toYMD(d); });
  const [toStr, setToStr] = useState(() => toYMD(today));
  const [loading, setLoading] = useState(false);

  const PRESETS = [
    { label: 'Last 7 days',  from: () => { const d = new Date(); d.setDate(d.getDate() - 7);  return toYMD(d); }, to: () => toYMD(today) },
    { label: 'Last 30 days', from: () => { const d = new Date(); d.setDate(d.getDate() - 30); return toYMD(d); }, to: () => toYMD(today) },
    { label: 'This month',   from: () => { const d = new Date(today.getFullYear(), today.getMonth(), 1); return toYMD(d); }, to: () => toYMD(today) },
    { label: 'This year',    from: () => `${today.getFullYear()}-01-01`, to: () => toYMD(today) },
  ];

  const validate = (): string | null => {
    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!ymdRe.test(fromStr)) return 'From date must be YYYY-MM-DD';
    if (!ymdRe.test(toStr))   return 'To date must be YYYY-MM-DD';
    const f = new Date(fromStr); const t = new Date(toStr);
    if (isNaN(f.getTime())) return 'From date is invalid';
    if (isNaN(t.getTime())) return 'To date is invalid';
    if (f > t) return '"From" date must be before "To" date';
    return null;
  };

  const handleDownload = async () => {
    const err = validate();
    if (err) { Alert.alert('Invalid Date', err); return; }
    setLoading(true);
    try {
      const token    = await getToken();
      const url      = `${API_BASE}/director/reports/export?from=${fromStr}&to=${toStr}`;
      const filename = `butterfield-report-${fromStr}-to-${toStr}.xlsx`;
      if (Platform.OS === 'web') {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
        if (!res.ok) throw new Error(await res.text());
        const blob   = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a      = document.createElement('a');
        a.href = objUrl; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
      } else {
        const fileUri = (FileSystem.cacheDirectory ?? '') + filename;
        const result  = await FileSystem.downloadAsync(url, fileUri, { headers: { Authorization: `Bearer ${token ?? ''}` } });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(result.uri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Save Butterfield Report',
            UTI: 'com.microsoft.excel.xlsx',
          });
        } else {
          Alert.alert('File Saved', `Saved to: ${result.uri}`);
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (e: any) {
      Alert.alert('Download Failed', e?.message ?? 'Unknown error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={dl.container}>
          <View style={dl.header}>
            <View style={dl.headerLeft}>
              <View style={dl.iconBox}><Feather name="download" size={18} color={BLUE} /></View>
              <View>
                <Text style={dl.title}>Download Report</Text>
                <Text style={dl.subtitle}>Export to Excel (.xlsx)</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={dl.closeBtn} disabled={loading}>
              <Feather name="x" size={20} color={MUTED} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 8 }}>
              <Text style={dl.sectionLabel}>QUICK RANGE</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PRESETS.map(p => (
                  <Pressable key={p.label} onPress={() => { setFromStr(p.from()); setToStr(p.to()); Haptics.selectionAsync(); }}
                    style={[dl.preset, fromStr === p.from() && toStr === p.to() && dl.presetActive]}>
                    <Text style={[dl.presetText, fromStr === p.from() && toStr === p.to() && { color: '#fff' }]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ gap: 12 }}>
              <Text style={dl.sectionLabel}>CUSTOM DATE RANGE</Text>
              <View style={dl.dateRow}>
                <Text style={dl.dateLabel}>From</Text>
                <View style={dl.dateInputWrap}>
                  <Feather name="calendar" size={15} color={MUTED} />
                  <TextInput style={dl.dateInput} value={fromStr} onChangeText={setFromStr}
                    placeholder="YYYY-MM-DD" placeholderTextColor={MUTED} keyboardType="numbers-and-punctuation" autoCorrect={false} editable={!loading} />
                  {fromStr ? <Text style={dl.dateParsed} numberOfLines={1}>{fmtDisplayDate(fromStr)}</Text> : null}
                </View>
              </View>
              <View style={dl.dateRow}>
                <Text style={dl.dateLabel}>To</Text>
                <View style={dl.dateInputWrap}>
                  <Feather name="calendar" size={15} color={MUTED} />
                  <TextInput style={dl.dateInput} value={toStr} onChangeText={setToStr}
                    placeholder="YYYY-MM-DD" placeholderTextColor={MUTED} keyboardType="numbers-and-punctuation" autoCorrect={false} editable={!loading} />
                  {toStr ? <Text style={dl.dateParsed} numberOfLines={1}>{fmtDisplayDate(toStr)}</Text> : null}
                </View>
              </View>
            </View>
          </ScrollView>
          <View style={[dl.footer, { borderTopColor: BORDER }]}>
            <Pressable onPress={onClose} style={dl.cancelBtn} disabled={loading}><Text style={dl.cancelText}>Cancel</Text></Pressable>
            <Pressable onPress={handleDownload} style={[dl.downloadBtn, loading && { opacity: 0.7 }]} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="download" size={16} color="#fff" />}
              <Text style={dl.downloadText}>{loading ? 'Generating…' : 'Download Excel'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function AnalyticsTab({ onDownloadPress }: { onDownloadPress: () => void }) {
  const [preset, setPreset] = useState<RangePreset>('today');
  const [customRange, setCustomRange] = useState<DateRange>(() => getPresetRange('today'));

  const range = useMemo<DateRange>(() =>
    preset === 'custom' ? customRange : getPresetRange(preset),
    [preset, customRange],
  );

  const handlePreset = useCallback((p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') setCustomRange(getPresetRange(p));
  }, []);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <DateRangePicker
        preset={preset}
        range={range}
        onPreset={handlePreset}
        onCustomChange={setCustomRange}
      />

      <SalesSummarySection from={range.from} to={range.to} />
      <PaymentsSection     from={range.from} to={range.to} />
      <ProductsSection     from={range.from} to={range.to} />
      <BusyTimesSection    from={range.from} to={range.to} />
      <StaffSection        from={range.from} to={range.to} />
      <RefundsSection      from={range.from} to={range.to} />
      <CustomerGrowthSection from={range.from} to={range.to} />

      <Pressable
        onPress={onDownloadPress}
        style={s.downloadBtn}
      >
        <Feather name="download" size={16} color="#fff" />
        <Text style={s.downloadBtnText}>Download Excel Report</Text>
      </Pressable>
    </ScrollView>
  );
}

// ── Feedback Tab ──────────────────────────────────────────────────────────────

function FeedbackTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-feedback'],
    queryFn: () => api.director.allFeedback(),
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const feedback = data?.data ?? [];

  const markRead = useMutation({
    mutationFn: (id: string) => api.director.markFeedbackRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director-feedback'] }),
  });

  const CATS: Record<string, { color: string; bg: string }> = {
    general:  { color: '#0369A1', bg: '#EBF8FF' },
    product:  { color: '#5B21B6', bg: '#EDE9FE' },
    service:  { color: '#166534', bg: '#DCFCE7' },
    app:      { color: '#854D0E', bg: '#FEF9C3' },
    complaint:{ color: '#991B1B', bg: '#FEF2F2' },
  };

  if (isLoading) return <View style={s.center}><ActivityIndicator color={BLUE} /></View>;

  return (
    <FlatList
      data={feedback}
      keyExtractor={f => f.id}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      ListEmptyComponent={
        <View style={s.center}>
          <Feather name="message-square" size={32} color={MUTED} />
          <Text style={s.emptyText}>No feedback yet</Text>
        </View>
      }
      renderItem={({ item: f }: { item: DirectorFeedback }) => {
        const cat = CATS[f.category] ?? { color: MUTED, bg: BG };
        return (
          <Pressable
            style={[s.card, { backgroundColor: f.isRead ? 'rgba(255,255,255,0.6)' : '#F0F9FF', borderColor: f.isRead ? BORDER : BLUE + '40', padding: 14 }]}
            onPress={() => { if (!f.isRead) { Haptics.selectionAsync(); markRead.mutate(f.id); } }}
          >
            <View style={s.fbHeader}>
              <View style={[s.pill, { backgroundColor: cat.bg }]}>
                <Text style={[s.pillText, { color: cat.color }]}>{f.category.toUpperCase()}</Text>
              </View>
              {f.rating != null && (
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {[1,2,3,4,5].map(n => (
                    <Feather key={n} name="star" size={11} color={n <= f.rating! ? AMBER : BORDER} />
                  ))}
                </View>
              )}
              <Text style={s.fbDate}>{fmtDate(f.createdAt)}</Text>
              {!f.isRead && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BLUE }} />}
            </View>
            <Text style={s.fbMessage}>{f.message}</Text>
          </Pressable>
        );
      }}
    />
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function DirectorReportsScreen() {
  const [tab, setTab] = useState<TabKey>('Analytics');
  const [showDownload, setShowDownload] = useState(false);

  return (
    <DirectorStandaloneScreen title="Reports">
      <View style={[s.tabBar, { borderBottomColor: BORDER }]}>
        {TABS.map(t => (
          <Pressable
            key={t}
            style={[s.tabBtn, tab === t && { borderBottomColor: BLUE, borderBottomWidth: 2 }]}
            onPress={() => { setTab(t); Haptics.selectionAsync(); }}
          >
            <Text style={[s.tabText, { color: tab === t ? BLUE : MUTED }]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'Analytics' && (
        <AnalyticsTab
          onDownloadPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowDownload(true);
          }}
        />
      )}
      {tab === 'Feedback' && <FeedbackTab />}

      <DownloadReportModal visible={showDownload} onClose={() => setShowDownload(false)} />
    </DirectorStandaloneScreen>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText:   { fontSize: 14, color: MUTED },
  tabBar:      { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1 },
  tabBtn:      { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:     { fontSize: 13, fontWeight: '600' },

  // Date range picker
  drpContainer: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  drpRow:       { flexDirection: 'row', gap: 8 },
  drpChip:      { flex: 1, paddingVertical: 7, borderRadius: 10, backgroundColor: BG, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  drpChipActive:{ backgroundColor: BLUE, borderColor: BLUE },
  drpChipText:  { fontSize: 12, fontWeight: '600', color: MUTED },
  drpChipTextActive: { color: '#fff' },
  drpCustomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  drpInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BG, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: BORDER },
  drpInput:     { flex: 1, fontSize: 13, color: TEXT },
  drpSep:       { fontSize: 14, color: MUTED, fontWeight: '600' },

  // Section
  section:      { paddingHorizontal: 16, paddingTop: 16 },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 1.2 },

  // Card
  card:  { backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, gap: 0 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginVertical: 10 },

  // Stat row / card
  statRow:  { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  statValue:{ fontSize: 18, fontWeight: '700', color: TEXT },
  statLabel:{ fontSize: 11, fontWeight: '500', color: MUTED, marginTop: 2, textAlign: 'center' },
  statSub:  { fontSize: 10, color: MUTED, textAlign: 'center', marginTop: 1 },

  // Horizontal bar
  hBarTrack:{ height: 6, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden' },
  hBarFill: { height: '100%', borderRadius: 3 },

  // Break rows
  breakRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  breakLabel:{ fontSize: 13, fontWeight: '600', color: TEXT },
  breakSub:  { fontSize: 11, color: MUTED },
  breakCount:{ fontSize: 12, fontWeight: '600', color: MUTED },
  breakValue:{ fontSize: 13, fontWeight: '700', color: NAVY, minWidth: 70, textAlign: 'right' },

  // Heatmap
  peakBanner:{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: AMBER + '15', borderRadius: 10, padding: 10, marginBottom: 12 },
  peakText:  { fontSize: 13, color: TEXT, flex: 1 },
  heatmapGrid:{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  heatCell:  { width: '12%', alignItems: 'center', gap: 3 },
  heatBlock: { width: '100%', aspectRatio: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  heatCount: { fontSize: 10, fontWeight: '700' },
  heatLabel: { fontSize: 8, color: MUTED, textAlign: 'center' },

  // Empty
  emptyState:{ alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 8 },

  // Loader
  sectionLoader:{ paddingVertical: 32, alignItems: 'center' },

  // Feedback
  fbHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  fbDate:    { fontSize: 11, color: MUTED, marginLeft: 'auto' },
  fbMessage: { fontSize: 13, color: TEXT, lineHeight: 19 },
  pill:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  pillText:  { fontSize: 10, fontWeight: '700' },

  // Download button
  downloadBtn:     { margin: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: NAVY, paddingVertical: 14, borderRadius: 14 },
  downloadBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

const dl = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#FAFAFA' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox:      { width: 40, height: 40, borderRadius: 12, backgroundColor: BLUE + '15', alignItems: 'center', justifyContent: 'center' },
  title:        { fontSize: 17, fontWeight: '700', color: TEXT },
  subtitle:     { fontSize: 12, color: MUTED, marginTop: 1 },
  closeBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 1.2 },
  preset:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  presetActive: { backgroundColor: BLUE, borderColor: BLUE },
  presetText:   { fontSize: 13, fontWeight: '600', color: TEXT },
  dateRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateLabel:    { fontSize: 13, fontWeight: '600', color: MUTED, width: 36 },
  dateInputWrap:{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  dateInput:    { flex: 1, fontSize: 14, color: TEXT },
  dateParsed:   { fontSize: 12, color: MUTED },
  footer:       { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1 },
  cancelBtn:    { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: BORDER, alignItems: 'center' },
  cancelText:   { fontSize: 15, fontWeight: '600', color: TEXT },
  downloadBtn:  { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: BLUE },
  downloadText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
