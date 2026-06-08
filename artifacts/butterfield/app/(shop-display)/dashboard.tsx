import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, Defs, LinearGradient, Path, Stop, Svg, Text as SvgText } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { api, type ShopDisplayAnalytics } from '@/lib/api';
import { useLayoutHandledSafeArea } from '@/context/LayoutSafeAreaContext';

// ── Palette ──────────────────────────────────────────────────────────────────
const BG      = '#060D1A';
const CARD    = 'rgba(20,147,255,0.07)';
const BORDER  = 'rgba(255,255,255,0.09)';
const BLUE    = '#1493FF';
const CYAN    = '#00D4FF';
const AMBER   = '#F59E0B';
const GREEN   = '#10B981';
const RED     = '#EF4444';
const WHITE   = '#FFFFFF';
const MUTED   = 'rgba(255,255,255,0.4)';
const DIM     = 'rgba(255,255,255,0.12)';

const SLICE_COLORS = [BLUE, CYAN, '#6366F1', '#8B5CF6', '#EC4899', AMBER];
const TENDER_PALETTE: Record<string, string> = {
  Cash: GREEN, Card: BLUE, Stripe: BLUE, Split: '#8B5CF6',
  Loyalty: AMBER, Eftpos: CYAN, Other: '#64748B',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtAUD(cents: number) {
  const d = cents / 100;
  return '$' + d.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtAUDShort(cents: number) {
  if (cents >= 100_00000) return '$' + (cents / 100_000).toFixed(0) + 'k';
  if (cents >= 10_00000)  return '$' + (cents / 100_000).toFixed(1) + 'k';
  if (cents >= 1_00000)   return '$' + (cents / 100_000).toFixed(1) + 'k';
  return fmtAUD(cents);
}

function todayString() {
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateFromString(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function offsetDate(s: string, days: number) {
  const d = dateFromString(s);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function formatDateLabel(date: string, range: Range) {
  const d = dateFromString(date);
  if (range === 'day') {
    return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (range === 'week') {
    const dow = d.getDay();
    const mondayDiff = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(d); mon.setDate(d.getDate() + mondayDiff);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const monStr = mon.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const sunStr = sun.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    return `${monStr} – ${sunStr}`;
  }
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

function pctChange(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

// ── Area Chart ────────────────────────────────────────────────────────────────
function buildPaths(values: number[], W: number, H: number) {
  const maxVal = Math.max(...values, 1);
  const n = values.length;
  if (n === 0) return { area: '', line: '' };
  const pts = values.map((v, i) => ({
    x: n === 1 ? W / 2 : (i / (n - 1)) * W,
    y: H * 0.9 - (v / maxVal) * H * 0.82,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  return { area, line };
}

interface AreaChartProps {
  data: ShopDisplayAnalytics['chartData'];
  width: number;
  height?: number;
  range: Range;
}
function AreaChart({ data, width, height = 160, range }: AreaChartProps) {
  const W = width - 2;
  const H = height;
  const currValues = data.map(d => d.valueCents);
  const prevValues = data.map(d => d.prevValueCents);
  const { area: currArea, line: currLine } = buildPaths(currValues, W, H);
  const { line: prevLine } = buildPaths(prevValues, W, H);

  // X-axis labels: show at most 8 evenly spaced
  const step = Math.max(1, Math.ceil(data.length / 8));
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  const maxVal = Math.max(...currValues, ...prevValues, 1);
  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    y: H * 0.9 - f * H * 0.82,
    label: f === 0 ? '$0' : fmtAUDShort(Math.round(maxVal * f)),
  }));

  return (
    <Svg width={W} height={H + 24}>
      <Defs>
        <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={BLUE} stopOpacity="0.45" />
          <Stop offset="1" stopColor={BLUE} stopOpacity="0.02" />
        </LinearGradient>
      </Defs>
      {/* Grid lines */}
      {yTicks.map((t, i) => (
        <React.Fragment key={i}>
          <Path d={`M0,${t.y.toFixed(1)} L${W},${t.y.toFixed(1)}`} stroke={DIM} strokeWidth="1" />
          <SvgText x="2" y={(t.y - 3).toFixed(1)} fontSize="9" fill={MUTED} fontWeight="600">{t.label}</SvgText>
        </React.Fragment>
      ))}
      {/* Current area fill */}
      {currArea ? <Path d={currArea} fill="url(#areaGrad)" /> : null}
      {/* Prior period line */}
      {prevLine ? <Path d={prevLine} stroke={AMBER} strokeWidth="1.5" fill="none" strokeDasharray="4 3" opacity="0.7" /> : null}
      {/* Current line */}
      {currLine ? <Path d={currLine} stroke={BLUE} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {/* X-axis labels */}
      {xLabels.map((d, i) => {
        const idx = data.indexOf(d);
        const x = data.length === 1 ? W / 2 : (idx / (data.length - 1)) * W;
        return (
          <SvgText key={i} x={x.toFixed(1)} y={H + 18} fontSize="9" fill={MUTED} fontWeight="600" textAnchor="middle">
            {d.label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
interface DonutSegment { pct: number; color: string }
interface DonutChartProps { segments: DonutSegment[]; size?: number; thickness?: number }

function DonutChart({ segments, size = 130, thickness = 22 }: DonutChartProps) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  let cumAngle = -90;

  const filledTotal = segments.reduce((s, seg) => s + seg.pct, 0);
  const isEmpty = filledTotal === 0;

  return (
    <Svg width={size} height={size}>
      {/* Track */}
      <Circle cx={cx} cy={cy} r={r} stroke={DIM} strokeWidth={thickness} fill="none" />
      {isEmpty ? (
        <Circle cx={cx} cy={cy} r={r} stroke={MUTED} strokeWidth={thickness} fill="none" strokeDasharray={`${C * 0.5} ${C}`} />
      ) : segments.map((seg, i) => {
        if (seg.pct === 0) return null;
        const segLen = (seg.pct / 100) * C;
        const gap = Math.min(2, segLen * 0.05);
        const actualLen = Math.max(0, segLen - gap);
        const el = (
          <Circle
            key={i}
            cx={cx} cy={cy} r={r}
            stroke={seg.color}
            strokeWidth={thickness}
            fill="none"
            strokeDasharray={`${actualLen} ${C - actualLen}`}
            strokeDashoffset={-((cumAngle + 90) / 360) * C}
            transform={`rotate(${cumAngle + 90} ${cx} ${cy})`}
            strokeLinecap="round"
          />
        );
        cumAngle += (seg.pct / 100) * 360;
        return el;
      })}
    </Svg>
  );
}

// ── Animated Number ───────────────────────────────────────────────────────────
function AnimatedNumber({ value, formatter }: { value: number; formatter: (v: number) => string }) {
  const [displayed, setDisplayed] = useState(0);
  const animVal = useSharedValue(0);
  useEffect(() => {
    animVal.value = withTiming(value, { duration: 900 });
    let frame: ReturnType<typeof requestAnimationFrame>;
    const start = Date.now();
    const from = displayed;
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Text>{formatter(displayed)}</Text>;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, valueCents, icon, color = BLUE, small = false }:
  { label: string; valueCents: number; icon: string; color?: string; small?: boolean }) {
  return (
    <View style={[styles.statCard, small && styles.statCardSmall]}>
      <View style={[styles.statIcon, { backgroundColor: color + '22' }]}>
        <Feather name={icon as any} size={small ? 12 : 14} color={color} />
      </View>
      <Text style={[styles.statValue, small && styles.statValueSmall]}>
        <AnimatedNumber value={valueCents} formatter={fmtAUD} />
      </Text>
      <Text style={[styles.statLabel, small && styles.statLabelSmall]}>{label}</Text>
    </View>
  );
}

function CountCard({ label, value, icon, color = WHITE, suffix = '' }:
  { label: string; value: number; icon: string; color?: string; suffix?: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Feather name={icon as any} size={14} color={color} />
      </View>
      <Text style={styles.statValue}>
        <AnimatedNumber value={value} formatter={(v) => String(Math.round(v)) + suffix} />
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Range = 'day' | 'week' | 'month';

// ── Export ────────────────────────────────────────────────────────────────────
async function exportReport(data: ShopDisplayAnalytics, range: Range, date: string) {
  const label = formatDateLabel(date, range);
  const lines: string[] = [
    'Butterfield Cookies — Sales Analytics Report',
    `Period: ${label}`,
    `Generated: ${new Date().toLocaleString('en-AU')}`,
    '',
    '--- SUMMARY ---',
    `Total Sales,${fmtAUD(data.totalCents)}`,
    `Transactions,${data.transactionCount}`,
    `Avg Spend,${fmtAUD(data.avgSpendCents)}`,
    `Items Sold,${data.itemsSold}`,
    `Discounted,${fmtAUD(data.discountedCents)}`,
    `Cancelled,${fmtAUD(data.cancelledCents)}`,
    '',
    '--- CHART DATA ---',
    'Period,Sales',
    ...data.chartData.map(d => `${d.label},${fmtAUD(d.valueCents)}`),
    '',
    '--- TOP SELLERS ---',
    'Product,Units,Revenue,Share',
    ...data.topSellers.map(s => `${s.name},${s.units},${fmtAUD(s.revenueCents)},${s.pct}%`),
    '',
    '--- TENDER TYPES ---',
    'Type,Count,Share',
    ...data.tenderTypes.map(t => `${t.type},${t.count},${t.pct}%`),
  ];
  const csv = lines.join('\n');
  const safeName = label.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const cacheDir = ((FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory ?? "") as string;
  const fileUri = cacheDir + `butterfield-analytics-${safeName}.csv`;
  try {
    await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Analytics Report', UTI: 'public.comma-separated-values-text' });
    } else {
      Alert.alert('Export Report', csv.slice(0, 1000) + (csv.length > 1000 ? '\n…' : ''), [{ text: 'OK' }]);
    }
  } catch (err: any) {
    Alert.alert('Export failed', err?.message ?? 'Please try again.');
  }
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const layoutHandled = useLayoutHandledSafeArea();
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<Range>('day');
  const [date, setDate] = useState(todayString);
  const [exporting, setExporting] = useState(false);

  const { data: resp, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['shop-display-analytics', range, date],
    queryFn: () => api.shopDisplay.analytics(range, date),
    staleTime: 60_000,
  });

  const data = resp?.data;

  // Chart width (full width minus card padding)
  const chartW = width - 64;

  const pct = data ? pctChange(data.totalCents, data.prevPeriodTotalCents) : 0;
  const pctPositive = pct >= 0;

  // Top sellers donut
  const sellerSegments: DonutSegment[] = useMemo(() => {
    if (!data?.topSellers.length) return [];
    const total = data.topSellers.reduce((s, p) => s + p.pct, 0);
    const segs = data.topSellers.map((p, i) => ({ pct: p.pct, color: SLICE_COLORS[i % SLICE_COLORS.length] }));
    const remaining = Math.max(0, 100 - total);
    if (remaining > 2) segs.push({ pct: remaining, color: DIM });
    return segs;
  }, [data?.topSellers]);

  // Tender donut
  const tenderSegments: DonutSegment[] = useMemo(() => {
    if (!data?.tenderTypes.length) return [];
    return data.tenderTypes.map(t => ({
      pct: t.pct,
      color: TENDER_PALETTE[t.type] ?? '#64748B',
    }));
  }, [data?.tenderTypes]);

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await exportReport(data, range, date);
    setExporting(false);
  };

  const handlePrev = () => {
    const days = range === 'day' ? -1 : range === 'week' ? -7 : -28;
    setDate(d => offsetDate(d, days));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleNext = () => {
    const days = range === 'day' ? 1 : range === 'week' ? 7 : 28;
    const next = offsetDate(date, days);
    if (next <= todayString()) {
      setDate(next);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const isToday = date === todayString();
  const pb = layoutHandled ? 0 : insets.bottom;

  return (
    <View style={[styles.root, { paddingBottom: pb }]}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Analytics</Text>
          <Text style={styles.headerSub}>{formatDateLabel(date, range)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.exportBtn, exporting && { opacity: 0.5 }]}
          onPress={handleExport}
          disabled={exporting || !data}
          activeOpacity={0.75}
        >
          <Feather name="download" size={13} color={BLUE} />
          <Text style={styles.exportBtnText}>{exporting ? 'Exporting…' : 'Export'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Range pills ─────────────────────────────────────────────────── */}
      <View style={styles.rangePills}>
        {(['day', 'week', 'month'] as Range[]).map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.pill, range === r && styles.pillActive]}
            onPress={() => { setRange(r); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.pillText, range === r && styles.pillTextActive]}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Date nav (day only) ──────────────────────────────────────────── */}
      {range === 'day' && (
        <View style={styles.dateNav}>
          <TouchableOpacity style={styles.dateNavBtn} onPress={handlePrev} activeOpacity={0.7}>
            <Feather name="chevron-left" size={16} color={WHITE} />
            <Text style={styles.dateNavBtnText}>Prev</Text>
          </TouchableOpacity>
          <View style={styles.dateNavCenter}>
            <Text style={styles.dateNavDate}>{dateFromString(date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
            {isToday && <Text style={styles.dateNavToday}>Today</Text>}
          </View>
          <TouchableOpacity
            style={[styles.dateNavBtn, isToday && styles.dateNavBtnDisabled]}
            onPress={handleNext}
            disabled={isToday}
            activeOpacity={0.7}
          >
            <Text style={styles.dateNavBtnText}>Next</Text>
            <Feather name="chevron-right" size={16} color={isToday ? MUTED : WHITE} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={BLUE} />}
      >
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={BLUE} size="large" />
            <Text style={styles.loadingText}>Loading analytics…</Text>
          </View>
        ) : !data ? (
          <View style={styles.loadingBox}>
            <Feather name="alert-circle" size={32} color={MUTED} />
            <Text style={styles.loadingText}>No data available</Text>
          </View>
        ) : (
          <>
            {/* ── Hero card ─────────────────────────────────────────────── */}
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View>
                  <Text style={styles.heroLabel}>Total Sales</Text>
                  <Text style={styles.heroValue}>{fmtAUD(data.totalCents)}</Text>
                </View>
                <View style={[styles.pctBadge, { backgroundColor: pctPositive ? GREEN + '22' : RED + '22' }]}>
                  <Feather name={pctPositive ? 'trending-up' : 'trending-down'} size={12} color={pctPositive ? GREEN : RED} />
                  <Text style={[styles.pctText, { color: pctPositive ? GREEN : RED }]}>
                    {pctPositive ? '+' : ''}{pct}%
                  </Text>
                </View>
              </View>
              <Text style={styles.heroSub}>vs prior {range}</Text>

              {/* Legend */}
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: BLUE }]} />
                  <Text style={styles.legendText}>This {range}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: AMBER }]} />
                  <Text style={styles.legendText}>Prior {range}</Text>
                </View>
              </View>

              {/* Area chart */}
              <View style={styles.chartWrap}>
                <AreaChart data={data.chartData} width={chartW} range={range} />
              </View>
            </View>

            {/* ── 3-col stat row ────────────────────────────────────────── */}
            <View style={styles.statRow}>
              <CountCard label="Transactions" value={data.transactionCount} icon="repeat" color={CYAN} />
              <StatCard label="Avg Spend" valueCents={data.avgSpendCents} icon="user" color={WHITE} />
              <CountCard label="Items Sold" value={data.itemsSold} icon="package" color={AMBER} />
            </View>

            {/* ── 2-col row: Discounted / Cancelled ────────────────────── */}
            <View style={[styles.statRow, { gap: 10 }]}>
              <StatCard label="Discounted" valueCents={data.discountedCents} icon="tag" color={GREEN} small />
              <StatCard label="Cancelled" valueCents={data.cancelledCents} icon="x-circle" color={RED} small />
            </View>

            {/* ── Top Sellers ──────────────────────────────────────────── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Feather name="award" size={14} color={BLUE} />
                </View>
                <Text style={styles.sectionTitle}>Top Sellers</Text>
                {data.topSellers.length === 0 && <Text style={styles.sectionEmpty}>No sales yet</Text>}
              </View>
              {data.topSellers.length > 0 && (
                <View style={styles.chartSection}>
                  <DonutChart segments={sellerSegments} />
                  <View style={styles.rankList}>
                    {data.topSellers.slice(0, 5).map((item, i) => (
                      <View key={i} style={styles.rankRow}>
                        <View style={[styles.rankDot, { backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }]} />
                        <Text style={styles.rankName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.rankPct}>{item.pct}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* ── Tender Types ─────────────────────────────────────────── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Feather name="credit-card" size={14} color={BLUE} />
                </View>
                <Text style={styles.sectionTitle}>Tender Type</Text>
                {data.tenderTypes.length === 0 && <Text style={styles.sectionEmpty}>No transactions</Text>}
              </View>
              {data.tenderTypes.length > 0 && (
                <View style={styles.chartSection}>
                  <DonutChart segments={tenderSegments} />
                  <View style={styles.rankList}>
                    {data.tenderTypes.map((t, i) => (
                      <View key={i} style={styles.rankRow}>
                        <View style={[styles.rankDot, { backgroundColor: TENDER_PALETTE[t.type] ?? '#64748B' }]} />
                        <Text style={styles.rankName} numberOfLines={1}>{t.type}</Text>
                        <Text style={styles.rankCount}>{t.count}×</Text>
                        <Text style={styles.rankPct}>{t.pct}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* ── Bottom spacer ────────────────────────────────────────── */}
            <View style={{ height: 32 }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: BG },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  headerTitle:      { fontSize: 22, fontWeight: '800', color: WHITE, letterSpacing: -0.4 },
  headerSub:        { fontSize: 12, color: MUTED, marginTop: 2 },
  exportBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BLUE + '18', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: BLUE + '44' },
  exportBtnText:    { color: BLUE, fontSize: 13, fontWeight: '700' },

  rangePills:       { flexDirection: 'row', marginHorizontal: 20, gap: 8, marginBottom: 12 },
  pill:             { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: BORDER },
  pillActive:       { backgroundColor: BLUE, borderColor: BLUE },
  pillText:         { fontSize: 13, fontWeight: '700', color: MUTED },
  pillTextActive:   { color: WHITE },

  dateNav:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginBottom: 12, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 10 },
  dateNavBtn:       { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  dateNavBtnText:   { color: WHITE, fontSize: 13, fontWeight: '600' },
  dateNavBtnDisabled: { opacity: 0.3 },
  dateNavCenter:    { alignItems: 'center' },
  dateNavDate:      { color: WHITE, fontSize: 14, fontWeight: '700' },
  dateNavToday:     { color: BLUE, fontSize: 11, fontWeight: '700', marginTop: 2 },

  scroll:           { flex: 1 },
  scrollContent:    { paddingHorizontal: 20 },

  loadingBox:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 80 },
  loadingText:      { color: MUTED, fontSize: 14 },

  heroCard:         { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 18, marginBottom: 12 },
  heroTop:          { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 2 },
  heroLabel:        { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' },
  heroValue:        { fontSize: 34, fontWeight: '800', color: WHITE, letterSpacing: -1, marginTop: 4 },
  heroSub:          { fontSize: 11, color: MUTED, marginBottom: 10 },
  pctBadge:         { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  pctText:          { fontSize: 13, fontWeight: '800' },
  legendRow:        { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:        { width: 8, height: 8, borderRadius: 4 },
  legendText:       { color: MUTED, fontSize: 11, fontWeight: '600' },
  chartWrap:        { overflow: 'hidden' },

  statRow:          { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statCard:         { flex: 1, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14, gap: 6 },
  statCardSmall:    { padding: 12 },
  statIcon:         { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statValue:        { fontSize: 18, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },
  statValueSmall:   { fontSize: 15 },
  statLabel:        { fontSize: 10, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  statLabelSmall:   { fontSize: 9 },

  section:          { backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 18, marginBottom: 10 },
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionIconWrap:  { width: 28, height: 28, borderRadius: 8, backgroundColor: BLUE + '22', alignItems: 'center', justifyContent: 'center' },
  sectionTitle:     { fontSize: 14, fontWeight: '800', color: WHITE, flex: 1 },
  sectionEmpty:     { fontSize: 12, color: MUTED },
  chartSection:     { flexDirection: 'row', alignItems: 'center', gap: 16 },
  rankList:         { flex: 1, gap: 10 },
  rankRow:          { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rankDot:          { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  rankName:         { flex: 1, fontSize: 13, fontWeight: '600', color: WHITE },
  rankPct:          { fontSize: 13, fontWeight: '700', color: MUTED, minWidth: 34, textAlign: 'right' },
  rankCount:        { fontSize: 12, color: MUTED, minWidth: 26, textAlign: 'right' },
});
