import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  type RegisterSessionReport,
  type ReportsSummary,
  type ReportsProduct,
  type ReportsBusyBucket,
  type ReportsStaffMember,
  type ReportsPaymentBreakdown,
  type ReportsRefundsData,
  type ReportsCustomerGrowth,
  type RefundOperator,
  type RefundEvent,
} from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
import { sendRegisterSummaryPrint } from '@/lib/printer';
import ZReportModal from '@/components/ZReportModal';

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

const TABS = ['Analytics', 'Register Reports', 'Feedback'] as const;
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

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Not recorded';
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildRegisterSummaryPrintLines(report: RegisterSessionReport): string[] {
  const s = report.summary;
  const actualCash = s.actualCountedCashCents === null ? 'Not entered' : fmtAUD(s.actualCountedCashCents);
  const variance = s.varianceCents === null ? 'Not calculated' : fmtAUD(s.varianceCents);
  const notes = [report.closeNote, report.varianceNote].filter(Boolean).join(' | ');
  return [
    `Date\t${report.tradingDate}`,
    `Register\t${report.registerName}`,
    `Location\t${report.registerLocation ?? 'Butterfield Cookies'}`,
    `Opened By\t${report.openedByName ?? 'Not recorded'}`,
    `Closed By\t${report.closedByName ?? (report.autoClosed ? 'Auto close' : 'Not recorded')}`,
    '===',
    `Opening Float\t${fmtAUD(s.startingFloatCents ?? 0)}`,
    `Cash Sales\t${fmtAUD(s.cashSalesCents)}`,
    `Card Sales\t${fmtAUD(s.cardSalesCents)}`,
    `Refunds\t${fmtAUD(s.totalRefundsCents)}`,
    `Discounts\t${fmtAUD(s.discountsCents)}`,
    `Surcharges\t${fmtAUD(s.surchargesCents)}`,
    `Cash Added\t${fmtAUD(s.cashAddedCents)}`,
    `Cash Removed\t${fmtAUD(s.cashRemovedCents)}`,
    `Expected Cash\t${fmtAUD(s.expectedCashCents)}`,
    `Actual Cash\t${actualCash}`,
    `Variance\t${variance}`,
    `Total Sales\t${fmtAUD(s.totalSalesCents)}`,
    `Close Method\t${report.autoClosed ? 'Auto Close' : 'Manual Close'}`,
    '---',
    `Notes\t${notes || 'None'}`,
  ];
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
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
  const [showFromCal, setShowFromCal] = useState(false);
  const [showToCal,   setShowToCal]   = useState(false);

  const PRESETS: { key: RangePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: '7 Days' },
    { key: 'month', label: 'Month' },
    { key: 'custom',label: 'Custom' },
  ];

  const today    = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const fromDate = useMemo(() => range.from ? new Date(range.from + 'T12:00:00') : null, [range.from]);
  const toDate   = useMemo(() => range.to   ? new Date(range.to   + 'T12:00:00') : null, [range.to]);

  function toISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function fmtLabel(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

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
        <>
          <View style={s.drpCustomRow}>
            <Pressable style={s.drpDateBtn} onPress={() => { Haptics.selectionAsync(); setShowFromCal(true); }}>
              <Feather name="calendar" size={13} color={BLUE} />
              <Text style={[s.drpDateText, !range.from && { color: MUTED }]}>
                {range.from ? fmtLabel(range.from) : 'From date'}
              </Text>
            </Pressable>
            <Text style={s.drpSep}>→</Text>
            <Pressable style={s.drpDateBtn} onPress={() => { Haptics.selectionAsync(); setShowToCal(true); }}>
              <Feather name="calendar" size={13} color={BLUE} />
              <Text style={[s.drpDateText, !range.to && { color: MUTED }]}>
                {range.to ? fmtLabel(range.to) : 'To date'}
              </Text>
            </Pressable>
          </View>

          {/* From calendar */}
          <Modal visible={showFromCal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFromCal(false)}>
            <View style={{ flex: 1, backgroundColor: BG }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD }}>
                <Pressable onPress={() => setShowFromCal(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="x" size={20} color={TEXT} />
                </Pressable>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT }}>Start Date</Text>
                <View style={{ width: 36 }} />
              </View>
              <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
                <InlineCalendarPicker
                  selectedDate={fromDate}
                  onSelectDate={d => { onCustomChange({ ...range, from: toISO(d) }); setShowFromCal(false); Haptics.selectionAsync(); }}
                  accentColor={BLUE}
                  maxDate={today}
                />
              </ScrollView>
            </View>
          </Modal>

          {/* To calendar */}
          <Modal visible={showToCal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowToCal(false)}>
            <View style={{ flex: 1, backgroundColor: BG }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD }}>
                <Pressable onPress={() => setShowToCal(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="x" size={20} color={TEXT} />
                </Pressable>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT }}>End Date</Text>
                <View style={{ width: 36 }} />
              </View>
              <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
                <InlineCalendarPicker
                  selectedDate={toDate}
                  onSelectDate={d => { onCustomChange({ ...range, to: toISO(d) }); setShowToCal(false); Haptics.selectionAsync(); }}
                  accentColor={BLUE}
                  maxDate={today}
                />
              </ScrollView>
            </View>
          </Modal>
        </>
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

      <RefundOperatorsCard from={from} to={to} />
    </View>
  );
}

function RefundOperatorsCard({ from, to }: { from: string; to: string }) {
  const [showRefunds, setShowRefunds] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['reports-refund-operators', from, to],
    queryFn: () => api.director.reportsRefundOperators(from, to),
    staleTime: 60_000,
  });
  const operators: RefundOperator[] = data?.data ?? [];
  const refunds: RefundEvent[] = data?.refunds ?? [];
  const grandTotal: number = data?.grandTotalRefundedCents ?? 0;
  if (isLoading) return <ActivityIndicator color={NAVY} style={{ marginVertical: 8 }} />;
  if (operators.length === 0 && refunds.length === 0) return null;
  return (
    <View style={s.card}>
      {/* Grand total row */}
      <View style={[s.breakRow, { marginBottom: 12 }]}>
        <Text style={[s.sectionTitle, { flex: 1 }]}>REFUND SUMMARY</Text>
        <Text style={[s.breakCount, { color: RED, fontSize: 16 }]}>
          ${(grandTotal / 100).toFixed(2)}
        </Text>
      </View>

      {/* Operator breakdown */}
      {operators.length > 0 && (
        <>
          <Text style={[s.sectionTitle, { marginBottom: 8 }]}>BY OPERATOR</Text>
          {operators.map((op, i) => (
            <View key={op.userId}>
              {i > 0 && <View style={s.divider} />}
              <View style={s.breakRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.breakLabel}>{op.name}</Text>
                  <Text style={s.breakSub}>{op.role}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {op.refunds > 0 && (
                    <Text style={[s.breakCount, { color: RED }]}>
                      {op.refunds} refund{op.refunds !== 1 ? 's' : ''}
                      {op.totalRefundedCents > 0 ? ` · $${(op.totalRefundedCents / 100).toFixed(2)}` : ''}
                    </Text>
                  )}
                  {op.voids > 0 && <Text style={[s.breakCount, { color: AMBER }]}>{op.voids} void{op.voids !== 1 ? 's' : ''}</Text>}
                  {op.discounts > 0 && <Text style={[s.breakCount, { color: BLUE }]}>{op.discounts} discount{op.discounts !== 1 ? 's' : ''}</Text>}
                </View>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Individual refund events toggle */}
      {refunds.length > 0 && (
        <>
          <View style={s.divider} />
          <Pressable
            style={[s.breakRow, { marginTop: 8 }]}
            onPress={() => setShowRefunds(v => !v)}
          >
            <Text style={[s.sectionTitle, { flex: 1 }]}>REFUND EVENTS ({refunds.length})</Text>
            <Feather name={showRefunds ? 'chevron-up' : 'chevron-down'} size={14} color={MUTED} />
          </Pressable>
          {showRefunds && refunds.map((r, i) => (
            <View key={r.id}>
              {i > 0 && <View style={[s.divider, { opacity: 0.5 }]} />}
              <View style={[s.breakRow, { marginTop: 6 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.breakSub}>
                    {r.operatorName} · {new Date(r.createdAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
                  </Text>
                  {r.orderId && <Text style={[s.breakSub, { fontSize: 10 }]}>Order {r.orderId.slice(0, 12)}…</Text>}
                  {r.reason && <Text style={[s.breakSub, { fontSize: 10, fontStyle: 'italic' }]}>{r.reason}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.breakCount, { color: RED }]}>
                    ${(r.refundAmountCents / 100).toFixed(2)}
                  </Text>
                  {r.refundType && <Text style={[s.breakSub, { fontSize: 10 }]}>{r.refundType}</Text>}
                </View>
              </View>
            </View>
          ))}
        </>
      )}
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
        const res2 = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
        if (!res2.ok) throw new Error(await res2.text());
        const buf = await res2.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...(bytes.subarray(i, i + chunk) as any));
        }
        const base64 = btoa(binary);
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Save Butterfield Report',
            UTI: 'com.microsoft.excel.xlsx',
          });
        } else {
          Alert.alert('File Saved', `Saved to: ${fileUri}`);
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

// ── Register Reports Tab ──────────────────────────────────────────────────────

function RegisterReportsTab() {
  const qc = useQueryClient();
  const [preset, setPreset] = useState<RangePreset>('week');
  const [customRange, setCustomRange] = useState<DateRange>(() => getPresetRange('week'));
  const [registerFilter, setRegisterFilter] = useState('');
  const [staffUserId, setStaffUserId] = useState<string>('all');
  const [closeMethod, setCloseMethod] = useState<'all' | 'manual' | 'auto'>('all');
  const [variance, setVariance] = useState<'all' | 'with_variance' | 'without_variance'>('all');
  const [activity, setActivity] = useState<'all' | 'meaningful' | 'empty'>('meaningful');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const range = useMemo<DateRange>(() =>
    preset === 'custom' ? customRange : getPresetRange(preset),
    [preset, customRange],
  );

  const handlePreset = useCallback((next: RangePreset) => {
    setPreset(next);
    if (next !== 'custom') setCustomRange(getPresetRange(next));
  }, []);

  const { data: staffData } = useQuery({
    queryKey: ['director-staff-list'],
    queryFn: () => api.director.staffList(),
    staleTime: 5 * 60_000,
  });

  const {
    data,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['director-register-reports', range.from, range.to, registerFilter, staffUserId, closeMethod, variance, activity],
    queryFn: () => api.director.registerReports({
      from: range.from,
      to: range.to,
      register: registerFilter.trim() || undefined,
      staffUserId: staffUserId !== 'all' ? staffUserId : undefined,
      closeMethod: closeMethod !== 'all' ? closeMethod : undefined,
      variance,
      activity,
    }),
    staleTime: 60_000,
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const reports = data?.data ?? [];
  const staffMembers = staffData?.data ?? [];

  const handleExport = useCallback(async () => {
    if (reports.length === 0) {
      Alert.alert('Nothing to Export', 'There are no register reports in this filtered view yet.');
      return;
    }
    setExporting(true);
    try {
      const header = [
        'Trading Date',
        'Register',
        'Location',
        'Opened By',
        'Closed By',
        'Close Method',
        'Opening Float',
        'Cash Sales',
        'Card Sales',
        'Total Refunds',
        'Discounts',
        'Surcharges',
        'Cash Added',
        'Cash Removed',
        'Expected Cash',
        'Actual Cash',
        'Variance',
        'Total Sales',
        'Close Note',
        'Variance Note',
      ];
      const rows = reports.map((report) => {
        const s = report.summary;
        return [
          report.tradingDate,
          report.registerName,
          report.registerLocation ?? '',
          report.openedByName ?? '',
          report.closedByName ?? '',
          report.autoClosed ? 'Auto Close' : 'Manual Close',
          (s.startingFloatCents ?? 0) / 100,
          s.cashSalesCents / 100,
          s.cardSalesCents / 100,
          s.totalRefundsCents / 100,
          s.discountsCents / 100,
          s.surchargesCents / 100,
          s.cashAddedCents / 100,
          s.cashRemovedCents / 100,
          s.expectedCashCents / 100,
          s.actualCountedCashCents == null ? '' : s.actualCountedCashCents / 100,
          s.varianceCents == null ? '' : s.varianceCents / 100,
          s.totalSalesCents / 100,
          report.closeNote ?? '',
          report.varianceNote ?? '',
        ];
      });
      const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
      const filename = `daily-register-reports-${range.from}-to-${range.to}.csv`;

      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
      } else {
        const fileUri = `${FileSystem.cacheDirectory ?? ''}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Export Daily Register Reports',
            UTI: 'public.comma-separated-values-text',
          });
        } else {
          Alert.alert('Export Saved', `Saved to: ${fileUri}`);
        }
      }
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message ?? 'Could not export these register reports.');
    } finally {
      setExporting(false);
    }
  }, [range.from, range.to, reports]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      >
        <DateRangePicker
          preset={preset}
          range={range}
          onPreset={handlePreset}
          onCustomChange={setCustomRange}
        />

        <View style={s.section}>
          <SectionHeader title="DAILY REGISTER REPORTS" icon="archive" />
          <View style={s.card}>
            <TextInput
              value={registerFilter}
              onChangeText={setRegisterFilter}
              placeholder="Filter by register"
              placeholderTextColor={MUTED}
              style={s.filterInput}
              autoCorrect={false}
            />

            <Text style={s.filterLabel}>Staff</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterChipRow}>
              <Pressable onPress={() => setStaffUserId('all')} style={[s.filterChip, staffUserId === 'all' && s.filterChipActive]}>
                <Text style={[s.filterChipText, staffUserId === 'all' && s.filterChipTextActive]}>All Staff</Text>
              </Pressable>
              {staffMembers.map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => setStaffUserId(member.id)}
                  style={[s.filterChip, staffUserId === member.id && s.filterChipActive]}
                >
                  <Text style={[s.filterChipText, staffUserId === member.id && s.filterChipTextActive]}>{member.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={s.filterLabel}>Close Method</Text>
            <View style={s.filterChipWrap}>
              {[
                { key: 'all', label: 'All' },
                { key: 'manual', label: 'Manual Close' },
                { key: 'auto', label: 'Auto Close' },
              ].map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => setCloseMethod(option.key as 'all' | 'manual' | 'auto')}
                  style={[s.filterChip, closeMethod === option.key && s.filterChipActive]}
                >
                  <Text style={[s.filterChipText, closeMethod === option.key && s.filterChipTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.filterLabel}>Cash Variance</Text>
            <View style={s.filterChipWrap}>
              {[
                { key: 'all', label: 'All' },
                { key: 'with_variance', label: 'With Variance' },
                { key: 'without_variance', label: 'No Variance' },
              ].map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => setVariance(option.key as 'all' | 'with_variance' | 'without_variance')}
                  style={[s.filterChip, variance === option.key && s.filterChipActive]}
                >
                  <Text style={[s.filterChipText, variance === option.key && s.filterChipTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.filterLabel}>Session Activity</Text>
            <View style={s.filterChipWrap}>
              {[
                { key: 'meaningful', label: 'Active Only' },
                { key: 'all',        label: 'All' },
                { key: 'empty',      label: 'Empty Only' },
              ].map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => { Haptics.selectionAsync(); setActivity(option.key as 'all' | 'meaningful' | 'empty'); }}
                  style={[s.filterChip, activity === option.key && s.filterChipActive]}
                >
                  <Text style={[s.filterChipText, activity === option.key && s.filterChipTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={s.section}>
          <SectionHeader title="SESSIONS" icon="file-text" />
          {isLoading ? (
            <SectionLoader />
          ) : reports.length === 0 ? (
            <EmptyState icon="archive" text="No closed register sessions match these filters" />
          ) : (
            <View style={{ gap: 10 }}>
              {reports.map((report) => {
                const varianceCents = report.summary.varianceCents;
                const varianceTone = varianceCents == null
                  ? MUTED
                  : varianceCents === 0
                    ? GREEN
                    : RED;
                return (
                  <Pressable key={report.id} style={s.card} onPress={() => setSelectedReportId(report.id)}>
                    <View style={s.registerReportHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.breakLabel}>{report.registerName}</Text>
                        <Text style={s.breakSub}>
                          {fmtDisplayDate(report.tradingDate)} · {report.registerLocation ?? 'Butterfield Cookies'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {report.isEmpty && (
                          <View style={s.statusPillEmpty}>
                            <Text style={s.statusPillTextEmpty}>Empty</Text>
                          </View>
                        )}
                        <View style={[s.statusPill, report.autoClosed ? s.statusPillAuto : s.statusPillManual]}>
                          <Text style={[s.statusPillText, report.autoClosed ? s.statusPillTextAuto : s.statusPillTextManual]}>
                            {report.autoClosed ? 'Auto Close' : 'Manual Close'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Revenue row — always visible regardless of payment method */}
                    <View style={s.registerRevRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.registerRevLabel}>TOTAL SALES</Text>
                        <Text style={s.registerRevValue}>{fmtAUD(report.summary.totalSalesCents)}</Text>
                      </View>
                      <View style={s.registerRevBreakdown}>
                        <Text style={s.registerRevBreakdownItem}>
                          <Text style={s.registerRevBreakdownDim}>Card </Text>
                          {fmtAUD(report.summary.cardSalesCents)}
                        </Text>
                        {report.summary.cashSalesCents > 0 && (
                          <Text style={s.registerRevBreakdownItem}>
                            <Text style={s.registerRevBreakdownDim}>Cash </Text>
                            {fmtAUD(report.summary.cashSalesCents)}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Cash reconciliation */}
                    <View style={s.registerReportGrid}>
                      <View style={s.registerMetricBox}>
                        <Text style={s.registerMetricBoxLabel}>Expected Cash</Text>
                        <Text style={s.registerMetricBoxValue}>{fmtAUD(report.summary.expectedCashCents)}</Text>
                      </View>
                      <View style={s.registerMetricBox}>
                        <Text style={s.registerMetricBoxLabel}>Actual Cash</Text>
                        <Text style={s.registerMetricBoxValue}>
                          {report.summary.actualCountedCashCents == null ? 'Not entered' : fmtAUD(report.summary.actualCountedCashCents)}
                        </Text>
                      </View>
                      <View style={s.registerMetricBox}>
                        <Text style={s.registerMetricBoxLabel}>Variance</Text>
                        <Text style={[s.registerMetricBoxValue, { color: varianceTone }]}>
                          {varianceCents == null ? 'Not calculated' : fmtAUD(varianceCents)}
                        </Text>
                      </View>
                    </View>

                    <View style={s.registerMetaRow}>
                      <Text style={s.breakSub}>Opened by {report.openedByName ?? 'Unknown'}</Text>
                      <Text style={s.breakSub}>{fmtDateTime(report.closedAt ?? report.openedAt)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <Pressable onPress={handleExport} style={[s.downloadBtn, exporting && { opacity: 0.7 }]} disabled={exporting}>
          {exporting ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="download" size={16} color="#fff" />}
          <Text style={s.downloadBtnText}>{exporting ? 'Exporting…' : 'Export Filtered Register Reports'}</Text>
        </Pressable>
      </ScrollView>

      <RegisterReportDetailModal
        reportId={selectedReportId}
        onClose={() => setSelectedReportId(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['director-register-reports'] });
          if (selectedReportId) qc.invalidateQueries({ queryKey: ['director-register-report', selectedReportId] });
        }}
      />
    </View>
  );
}

function RegisterReportDetailModal({
  reportId,
  onClose,
  onSaved,
}: {
  reportId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['director-register-report', reportId],
    queryFn: () => api.director.registerReport(reportId!),
    enabled: !!reportId,
  });
  const { data: settingsData } = useQuery({
    queryKey: ['director-settings-register-print'],
    queryFn: () => api.director.settings(),
    staleTime: 60_000,
    enabled: !!reportId,
  });

  const report = data?.data ?? null;
  const [closeNote, setCloseNote] = useState('');
  const [varianceNote, setVarianceNote] = useState('');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    setCloseNote(report?.closeNote ?? '');
    setVarianceNote(report?.varianceNote ?? '');
  }, [report?.closeNote, report?.varianceNote, reportId]);

  const saveMutation = useMutation({
    mutationFn: () => api.director.updateRegisterReportNotes(reportId!, { closeNote, varianceNote }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    },
    onError: (err: any) => Alert.alert('Could Not Save Notes', err?.message ?? 'Please try again.'),
  });

  const handlePrint = useCallback(async () => {
    if (!report) return;
    const settings = settingsData?.data ?? {};
    const printerIp = settings.printerIp;
    const printerBrand = settings.printerBrand === 'star' ? 'star' : 'epson';
    if (!printerIp) {
      Alert.alert('No Printer', 'Add a printer in POS settings before printing register summaries.');
      return;
    }
    setPrinting(true);
    try {
      await sendRegisterSummaryPrint({
        title: 'Daily Register Summary',
        lines: buildRegisterSummaryPrintLines(report),
        printerBrand,
      }, printerIp, settings.printerPort ? Number(settings.printerPort) : 9100, api.director.printerBytes);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Print Failed', err?.message ?? 'Could not print this register summary.');
    } finally {
      setPrinting(false);
    }
  }, [report, settingsData?.data]);

  return (
    <ZReportModal
      visible={!!reportId}
      report={report}
      loading={isLoading}
      onDone={onClose}
      onPrint={handlePrint}
      printing={printing}
      editableNotes
      closeNote={closeNote}
      varianceNote={varianceNote}
      onCloseNoteChange={setCloseNote}
      onVarianceNoteChange={setVarianceNote}
      onSaveNotes={() => saveMutation.mutate()}
      savingNotes={saveMutation.isPending}
    />
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
      {tab === 'Register Reports' && <RegisterReportsTab />}
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
  drpDateBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BG, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: BORDER },
  drpDateText:  { flex: 1, fontSize: 13, fontWeight: '500', color: TEXT },
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

  // Register reports
  filterInput: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: TEXT,
    marginBottom: 12,
  },
  filterLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 8 },
  filterChipRow: { gap: 8, paddingRight: 4, marginBottom: 12 },
  filterChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  filterChipActive: { backgroundColor: BLUE, borderColor: BLUE },
  filterChipText: { fontSize: 12, fontWeight: '600', color: MUTED },
  filterChipTextActive: { color: '#fff' },
  registerReportHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  statusPillManual: { backgroundColor: '#ECFDF5', borderColor: '#BBF7D0' },
  statusPillAuto: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  statusPillEmpty: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, backgroundColor: '#F5F5F5', borderColor: '#D1D5DB' },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  statusPillTextManual: { color: '#15803D' },
  statusPillTextAuto: { color: BLUE },
  statusPillTextEmpty: { fontSize: 11, fontWeight: '600', color: MUTED },
  registerRevRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#EFF6FF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 10, borderWidth: 1, borderColor: '#BFDBFE',
  },
  registerRevLabel: { fontSize: 10, fontWeight: '800', color: BLUE, letterSpacing: 1, marginBottom: 2 },
  registerRevValue: { fontSize: 20, fontWeight: '800', color: BLUE },
  registerRevBreakdown: { alignItems: 'flex-end', gap: 2 },
  registerRevBreakdownItem: { fontSize: 12, fontWeight: '700', color: TEXT },
  registerRevBreakdownDim: { fontSize: 12, fontWeight: '500', color: MUTED },
  registerReportGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  registerMetricBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
  },
  registerMetricBoxLabel: { fontSize: 10, fontWeight: '700', color: MUTED, marginBottom: 4, letterSpacing: 0.6 },
  registerMetricBoxValue: { fontSize: 13, fontWeight: '700', color: TEXT },
  registerMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  notesInput: {
    minHeight: 92,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: TEXT,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  detailActionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  secondaryActionText: { fontSize: 14, fontWeight: '700', color: BLUE },
  primaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: NAVY,
  },
  primaryActionText: { fontSize: 14, fontWeight: '700', color: '#fff' },

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
