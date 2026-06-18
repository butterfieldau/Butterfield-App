import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, Defs, LinearGradient, Path, Stop, Svg, Text as SvgText } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { api, type ShopDisplayAnalytics } from '@/lib/api';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
import { sendRegisterSummaryPrint } from '@/lib/printer';
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
  if (!s || typeof s !== 'string') return new Date();
  const parts = s.split('-').map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return new Date();
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

function offsetDate(s: string, days: number) {
  if (!s || typeof s !== 'string') return todayString();
  const d = dateFromString(s);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Move forward/back by whole calendar months, always landing on the 1st. */
function offsetMonth(s: string, delta: number) {
  if (!s || typeof s !== 'string') return todayString().slice(0, 7) + '-01';
  const parts = s.split('-').map(Number);
  if (parts.length < 2 || parts.some(isNaN)) return todayString().slice(0, 7) + '-01';
  const [y, m] = parts;
  const result = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** True when dateStr falls inside the current day/week/month (so Next should be disabled). */
function isCurrentPeriod(dateStr: string, range: Range): boolean {
  if (!dateStr || typeof dateStr !== 'string') return true;
  try {
    const today = todayString();
    if (range === 'day') return dateStr === today;
    if (range === 'month') return dateStr.slice(0, 7) === today.slice(0, 7);
    // week: compare Monday of dateStr's week to Monday of today's week
    const mondayOf = (s: string) => {
      const parts = s.split('-').map(Number);
      if (parts.length < 3 || parts.some(isNaN)) return s;
      const [y, m, d] = parts;
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      return offsetDate(s, dow === 0 ? -6 : 1 - dow);
    };
    return mondayOf(dateStr) === mondayOf(today);
  } catch {
    return true;
  }
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
  // Use a ref to track the live displayed value so the effect can read the
  // current position without being listed as a dependency (which would restart
  // the animation on every tick).
  const displayedRef = useRef(0);
  useEffect(() => {
    let frame: ReturnType<typeof requestAnimationFrame>;
    const start = Date.now();
    const from = displayedRef.current; // read current value at effect start
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      displayedRef.current = next;
      setDisplayed(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <Text>{formatter(displayed)}</Text>;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, valueCents, icon, color = BLUE, small = false }:
  { label: string; valueCents: number; icon: string; color?: string; small?: boolean }) {
  return (
    <View style={[styles.statCard, small && styles.statCardSmall]}>
      <View style={[styles.statIcon, { backgroundColor: color + '33', borderColor: color + '55' }]}>
        <Feather name={icon as any} size={small ? 18 : 22} color={color} />
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
      <View style={[styles.statIcon, { backgroundColor: color + '33', borderColor: color + '55' }]}>
        <Feather name={icon as any} size={22} color={color} />
      </View>
      <Text style={styles.statValue}>
        <AnimatedNumber value={value} formatter={(v) => String(Math.round(v)) + suffix} />
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Error Boundary ────────────────────────────────────────────────────────────
interface EBState { hasError: boolean }
class DashboardErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): EBState { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ width: 80, height: 80, borderRadius: 20, backgroundColor: AMBER + '22', borderWidth: 1.5, borderColor: AMBER + '44', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Feather name="alert-triangle" size={36} color={AMBER} />
          </View>
          <Text style={{ color: WHITE, fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 }}>
            Something went wrong
          </Text>
          <Text style={{ color: MUTED, fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 8, maxWidth: 280 }}>
            The dashboard encountered an error. Pull down to refresh or tap below to try again.
          </Text>
          <TouchableOpacity
            style={{ marginTop: 24, backgroundColor: BLUE + '22', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13, borderWidth: 1, borderColor: BLUE + '44' }}
            onPress={() => this.setState({ hasError: false })}
            activeOpacity={0.75}
          >
            <Text style={{ color: BLUE, fontSize: 15, fontWeight: '700' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Range = 'day' | 'week' | 'month';

// ── Calendar Picker ───────────────────────────────────────────────────────────
interface CalendarPickerProps {
  selectedDate: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}
function CalendarPicker({ selectedDate, onSelect, onClose }: CalendarPickerProps) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const selDate = selectedDate ? new Date(selectedDate + 'T12:00:00') : null;
  const t = today;
  const todayISO = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={cal.overlay} activeOpacity={1} onPress={onClose}>
        <Pressable style={cal.sheet} onPress={() => {}}>
          <View style={cal.header}>
            <Text style={cal.title}>Select Date</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Feather name="x" size={18} color="#374151" />
            </TouchableOpacity>
          </View>
          <InlineCalendarPicker
            selectedDate={selDate}
            onSelectDate={d => {
              const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
              onSelect(iso);
              onClose();
            }}
            accentColor={BLUE}
            maxDate={today}
          />
          <TouchableOpacity style={cal.todayBtn} onPress={() => { onSelect(todayISO); onClose(); }} activeOpacity={0.7}>
            <Text style={cal.todayBtnText}>Jump to Today</Text>
          </TouchableOpacity>
        </Pressable>
      </TouchableOpacity>
    </Modal>
  );
}

const cal = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  sheet:       { backgroundColor: '#fff', borderRadius: 20, padding: 20, width: 340,
                 shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title:       { fontSize: 16, fontWeight: '700', color: '#111827' },
  todayBtn:    { marginTop: 12, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: BLUE + '18', borderWidth: 1, borderColor: BLUE + '40' },
  todayBtnText:{ color: BLUE, fontSize: 13, fontWeight: '700' },
});

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
    ...data.tenderTypes.map(t => `${t.type},${t.count != null ? t.count : ''},${t.pct}%`),
  ];
  const csv = lines.join('\n');
  const safeName = label.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const cacheDir = ((FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory ?? "") as string;
  const fileUri = cacheDir + `butterfield-analytics-${safeName}.csv`;
  try {
    await FileSystem.writeAsStringAsync(fileUri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Analytics Report', UTI: 'public.comma-separated-values-text' });
    } else {
      Alert.alert('Export Report', csv.slice(0, 1000) + (csv.length > 1000 ? '\n…' : ''), [{ text: 'OK' }]);
    }
  } catch (err: any) {
    Alert.alert('Export failed', err?.message ?? 'Please try again.');
  }
}

// ── Inner Screen (wrapped by DashboardErrorBoundary below) ────────────────────
function DashboardScreenInner() {
  const insets = useSafeAreaInsets();
  const layoutHandled = useLayoutHandledSafeArea();
  const [range, setRange] = useState<Range>('day');
  const [date, setDate] = useState(todayString);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  // Measure the actual content width via onLayout so the chart fits correctly
  // on iPad (where a 220 px sidebar reduces the available width) and handles
  // rotation without computing from the raw device width.
  const [chartW, setChartW] = useState(300);

  const { data: storesResp } = useQuery({
    queryKey: ['shop-display-stores'],
    queryFn: () => api.shopDisplay.store(),
    staleTime: 300_000,
  });
  const stores = storesResp?.data ?? [];

  const { data: resp, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['shop-display-analytics', range, date, selectedStoreId],
    queryFn: () => api.shopDisplay.analytics(range, date, selectedStoreId),
    staleTime: 60_000,
  });

  const data = resp?.data;

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

  const handlePrintSummary = async () => {
    if (!data) return;

    // Resolve which store to use for printer config
    const store = selectedStoreId
      ? stores.find(s => s.id === selectedStoreId)
      : stores.find(s => s.printerIp);

    if (!store?.printerIp) {
      Alert.alert(
        'No Printer Configured',
        'This display has no printer IP set up.\n\nGo to Settings → Store Printer to configure a printer.',
        [{ text: 'OK' }],
      );
      return;
    }

    setPrinting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const label = formatDateLabel(date, range);
      const now = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
      const rangeTitle = range === 'day' ? 'DAILY' : range === 'week' ? 'WEEKLY' : 'MONTHLY';
      const title = `${rangeTitle} REGISTER SUMMARY`;

      const lines: string[] = [
        `Period:\t${label}`,
        `Printed:\t${now}`,
        store.name ? `Store:\t${store.name}` : '',
        '===',
        '',
        'SALES SUMMARY',
        '---',
        `Total Sales\t${fmtAUD(data.totalCents)}`,
        `Transactions\t${data.transactionCount}`,
        `Avg Spend\t${fmtAUD(data.avgSpendCents)}`,
        `Items Sold\t${data.itemsSold}`,
        '',
        ...(data.discountedCents > 0 ? [`Discounted\t${fmtAUD(data.discountedCents)}`] : []),
        ...(data.cancelledCents > 0 ? [`Cancelled\t${fmtAUD(data.cancelledCents)}`] : []),
      ];

      if (data.topSellers.length > 0) {
        lines.push('', 'TOP SELLERS', '---');
        data.topSellers.slice(0, 5).forEach((s, i) => {
          lines.push(`${i + 1}. ${s.name.slice(0, 20)}\t${s.units}x  ${fmtAUD(s.revenueCents)}`);
        });
      }

      if (data.tenderTypes.length > 0) {
        lines.push('', 'TENDER BREAKDOWN', '---');
        data.tenderTypes.forEach(t => {
          const countStr = t.count != null ? `${t.count}x  ` : '';
          lines.push(`${t.type}\t${countStr}(${t.pct}%)`);
        });
      }

      lines.push('');

      const printerBrand = (store.printerBrand === 'star' ? 'star' : 'epson') as 'epson' | 'star';
      const port = store.printerPort ?? 9100;

      await sendRegisterSummaryPrint(
        { title, lines, printerBrand },
        store.printerIp,
        port,
        api.shopDisplay.printerBytes,
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Printed', 'Sales summary sent to printer.', [{ text: 'OK' }]);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Print Failed',
        err?.message ?? 'Could not reach the printer. Check the IP and network connection.',
        [{ text: 'OK' }],
      );
    } finally {
      setPrinting(false);
    }
  };

  const handlePrev = () => {
    try {
      if (range === 'month') {
        setDate(d => offsetMonth(d, -1));
      } else {
        const days = range === 'day' ? -1 : -7;
        setDate(d => offsetDate(d, days));
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // swallow edge-case date errors silently
    }
  };

  const handleNext = () => {
    try {
      const today = todayString();
      if (range === 'month') {
        const next = offsetMonth(date, 1);
        if (next.slice(0, 7) <= today.slice(0, 7)) {
          setDate(next);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } else {
        const days = range === 'day' ? 1 : 7;
        const next = offsetDate(date, days);
        if (next <= today) {
          setDate(next);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    } catch {
      // swallow edge-case date errors silently
    }
  };

  const atCurrentPeriod = (() => { try { return isCurrentPeriod(date, range); } catch { return true; } })();
  const pb = layoutHandled ? 0 : insets.bottom;

  return (
    <View style={[styles.root, { paddingBottom: pb }]}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Text style={styles.headerSub}>{formatDateLabel(date, range)}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.exportBtn, printing && { opacity: 0.5 }]}
            onPress={handlePrintSummary}
            disabled={printing || !data}
            activeOpacity={0.75}
          >
            <Feather name="printer" size={13} color={CYAN} />
            <Text style={[styles.exportBtnText, { color: CYAN }]}>{printing ? 'Printing…' : 'Print'}</Text>
          </TouchableOpacity>
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
      </View>

      {/* ── Store picker (only shown when >1 store available) ───────────── */}
      {stores.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.storePicker}
          contentContainerStyle={styles.storePickerContent}
        >
          <TouchableOpacity
            key="all"
            style={[styles.storePill, selectedStoreId === null && styles.storePillActive]}
            onPress={() => { setSelectedStoreId(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            activeOpacity={0.75}
          >
            <Feather name="layers" size={11} color={selectedStoreId === null ? WHITE : MUTED} />
            <Text style={[styles.storePillText, selectedStoreId === null && styles.storePillTextActive]}>
              All Stores
            </Text>
          </TouchableOpacity>
          {stores.map(store => (
            <TouchableOpacity
              key={store.id}
              style={[styles.storePill, selectedStoreId === store.id && styles.storePillActive]}
              onPress={() => { setSelectedStoreId(store.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.75}
            >
              <Feather name="map-pin" size={11} color={selectedStoreId === store.id ? WHITE : MUTED} />
              <Text style={[styles.storePillText, selectedStoreId === store.id && styles.storePillTextActive]} numberOfLines={1}>
                {store.suburb ?? store.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

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
          <TouchableOpacity
            style={styles.dateNavCenter}
            onPress={() => { setShowCalendar(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            activeOpacity={0.7}
          >
            <Text style={styles.dateNavDate}>{dateFromString(date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
            <View style={styles.dateNavPickerHint}>
              <Feather name="calendar" size={10} color={BLUE} />
              {atCurrentPeriod
                ? <Text style={styles.dateNavToday}>Today</Text>
                : <Text style={[styles.dateNavToday, { color: MUTED }]}>Pick date</Text>
              }
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dateNavBtn, atCurrentPeriod && styles.dateNavBtnDisabled]}
            onPress={handleNext}
            disabled={atCurrentPeriod}
            activeOpacity={0.7}
          >
            <Text style={styles.dateNavBtnText}>Next</Text>
            <Feather name="chevron-right" size={16} color={atCurrentPeriod ? MUTED : WHITE} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Calendar Picker Modal ─────────────────────────────────────────── */}
      {showCalendar && (
        <CalendarPicker
          selectedDate={date}
          onSelect={setDate}
          onClose={() => setShowCalendar(false)}
        />
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

              {/* Area chart — measured via onLayout so width is correct on iPad */}
              <View
                style={styles.chartWrap}
                onLayout={e => {
                  const w = e.nativeEvent.layout.width;
                  if (w > 0) setChartW(w);
                }}
              >
                <AreaChart data={data.chartData} width={chartW} range={range} />
              </View>
            </View>

            {/* ── Sales by Channel ──────────────────────────────────────── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Feather name="layers" size={14} color={BLUE} />
                </View>
                <Text style={styles.sectionTitle}>Sales by Channel</Text>
              </View>
              <View style={styles.channelRow}>
                <View style={styles.channelCard}>
                  <View style={[styles.channelIconWrap, { backgroundColor: BLUE + '33', borderColor: BLUE + '55' }]}>
                    <Feather name="shopping-bag" size={16} color={BLUE} />
                  </View>
                  <Text style={styles.channelLabel}>App Sales</Text>
                  <Text style={styles.channelValue}>{fmtAUD(data.channelBreakdown.appCents)}</Text>
                  <Text style={styles.channelPct}>
                    {data.totalCents > 0 ? Math.round((data.channelBreakdown.appCents / data.totalCents) * 100) : 0}%
                  </Text>
                </View>
                <View style={styles.channelCard}>
                  <View style={[styles.channelIconWrap, { backgroundColor: CYAN + '33', borderColor: CYAN + '55' }]}>
                    <Feather name="monitor" size={16} color={CYAN} />
                  </View>
                  <Text style={styles.channelLabel}>POS Sales</Text>
                  <Text style={styles.channelValue}>{fmtAUD(data.channelBreakdown.posCents)}</Text>
                  <Text style={styles.channelPct}>
                    {data.totalCents > 0 ? Math.round((data.channelBreakdown.posCents / data.totalCents) * 100) : 0}%
                  </Text>
                </View>
                <View style={styles.channelCard}>
                  <View style={[styles.channelIconWrap, { backgroundColor: AMBER + '33', borderColor: AMBER + '55' }]}>
                    <Feather name="truck" size={16} color={AMBER} />
                  </View>
                  <Text style={styles.channelLabel}>Wholesale</Text>
                  <Text style={styles.channelValue}>{fmtAUD(data.channelBreakdown.wholesaleCents)}</Text>
                  <Text style={styles.channelPct}>
                    {data.totalCents > 0 ? Math.round((data.channelBreakdown.wholesaleCents / data.totalCents) * 100) : 0}%
                  </Text>
                </View>
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
                        <Text style={styles.rankCount}>{t.count != null ? `${t.count}×` : '—'}</Text>
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

// ── Public export — wraps inner screen in error boundary ──────────────────────
export default function DashboardScreen() {
  return (
    <DashboardErrorBoundary>
      <DashboardScreenInner />
    </DashboardErrorBoundary>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: BG },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  headerTitle:      { fontSize: 22, fontWeight: '800', color: WHITE, letterSpacing: -0.4 },
  headerSub:        { fontSize: 12, color: MUTED, marginTop: 2 },
  headerActions:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BLUE + '18', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: BLUE + '44' },
  exportBtnText:    { color: BLUE, fontSize: 13, fontWeight: '700' },

  storePicker:        { marginBottom: 10 },
  storePickerContent: { paddingHorizontal: 20, gap: 8, flexDirection: 'row' },
  storePill:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: 'transparent' },
  storePillActive:    { backgroundColor: BLUE, borderColor: BLUE },
  storePillText:      { fontSize: 12, fontWeight: '700', color: MUTED },
  storePillTextActive:{ color: WHITE },

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
  dateNavPickerHint:{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  dateNavToday:     { color: BLUE, fontSize: 11, fontWeight: '700' },

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
  statIcon:         { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 2, borderWidth: 1.5 },
  statValue:        { fontSize: 26, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },
  statValueSmall:   { fontSize: 22 },
  statLabel:        { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  statLabelSmall:   { fontSize: 11 },

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

  channelRow:       { flexDirection: 'row', gap: 8 },
  channelCard:      { flex: 1, backgroundColor: BG, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 12, alignItems: 'center', gap: 4 },
  channelIconWrap:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2, borderWidth: 1.5 },
  channelLabel:     { fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  channelValue:     { fontSize: 14, fontWeight: '800', color: WHITE },
  channelPct:       { fontSize: 11, fontWeight: '600', color: MUTED },
});
