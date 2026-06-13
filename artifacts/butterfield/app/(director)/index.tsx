import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useScrollToTopCompat as useScrollToTop } from '@/hooks/useScrollToTopCompat';
import {
  ActivityIndicator, Alert, Animated, Modal, Pressable, RefreshControl,
  ScrollView, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import Svg, {
  Defs, LinearGradient, Path, Stop, Line, Text as SvgText,
} from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { PortalHeader } from '@/components/PortalHeader';
import { api } from '@/lib/api';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { StaffDashboard } from './_staff-dashboard';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const RED    = '#F40009';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER      = '#E5E7EB';
const GLASS_BG    = 'rgba(255,255,255,0.6)';
const GLASS_BORDER= 'rgba(255,255,255,0.85)';
const GLASS_SHADOW = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
} as const;
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';
const PINK   = '#EC4899';

function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Smooth bezier path from data points ──────────────────────────────────────
function makePath(pts: { x: number; y: number }[], close = false, baseY = 0): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx1 = (prev.x + (curr.x - prev.x) * 0.4).toFixed(1);
    const cpy1 = prev.y.toFixed(1);
    const cpx2 = (curr.x - (curr.x - prev.x) * 0.4).toFixed(1);
    const cpy2 = curr.y.toFixed(1);
    d += ` C ${cpx1} ${cpy1} ${cpx2} ${cpy2} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }
  if (close) {
    d += ` L ${pts[pts.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L ${pts[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`;
  }
  return d;
}

// ── Revenue date-range picker modal ──────────────────────────────────────────
function fmtDateBox(d: Date) {
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function RevenueRangePicker({
  visible, onClose, onApply,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (from: Date, to: Date) => void;
}) {
  const [step, setStep]     = useState<'start' | 'end'>('start');
  const [start, setStart]   = useState<Date | null>(null);
  const [end, setEnd]       = useState<Date | null>(null);
  const [calYear, setCalYear]   = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  const today       = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; })[0];
  const twoYearsAgo = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 2); d.setHours(0,0,0,0); return d; })[0];

  const canGoPrev = new Date(calYear, calMonth, 1) > new Date(twoYearsAgo.getFullYear(), twoYearsAgo.getMonth(), 1);
  const canGoNext = new Date(calYear, calMonth, 1) < new Date(today.getFullYear(), today.getMonth(), 1);

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const dateOf   = (day: number) => new Date(calYear, calMonth, day);
  const isFut    = (day: number) => { const d = dateOf(day); d.setHours(0,0,0,0); return d > today; };
  const isStart  = (day: number) => !!start && start.getFullYear() === calYear && start.getMonth() === calMonth && start.getDate() === day;
  const isEnd    = (day: number) => !!end && end.getFullYear() === calYear && end.getMonth() === calMonth && end.getDate() === day;
  const isInRange = (day: number) => {
    if (!start || !end) return false;
    const d = dateOf(day);
    return d > start && d < end;
  };
  const isToday = (day: number) => today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day;

  const prevMonth = () => {
    if (!canGoPrev) return;
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); } else { setCalMonth(m => m - 1); }
  };
  const nextMonth = () => {
    if (!canGoNext) return;
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); } else { setCalMonth(m => m + 1); }
  };

  const handleDayPress = (day: number) => {
    if (isFut(day)) return;
    const d = dateOf(day);
    if (step === 'start') {
      setStart(d);
      setEnd(null);
      setStep('end');
    } else {
      if (start && d < start) { setEnd(start); setStart(d); }
      else { setEnd(d); }
      setStep('start');
    }
    Haptics.selectionAsync();
  };

  const handleClose = () => { setStart(null); setEnd(null); setStep('start'); onClose(); };
  const handleApply = () => {
    if (!start || !end) return;
    const to = new Date(end); to.setHours(23, 59, 59, 999);
    onApply(start, to);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD }}>
          <Pressable onPress={handleClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT }}>Custom Revenue Range</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          {/* Date selection boxes */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <Pressable
              onPress={() => setStep('start')}
              style={{ flex: 1, backgroundColor: step === 'start' ? `${BLUE}12` : CARD, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: step === 'start' ? BLUE : BORDER }}
            >
              <Text style={{ fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>From</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: start ? TEXT : MUTED }}>{start ? fmtDateBox(start) : '—'}</Text>
            </Pressable>
            <View style={{ justifyContent: 'center' }}>
              <Feather name="arrow-right" size={18} color={MUTED} />
            </View>
            <Pressable
              onPress={() => { if (start) setStep('end'); }}
              style={{ flex: 1, backgroundColor: step === 'end' ? `${BLUE}12` : CARD, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: step === 'end' ? BLUE : BORDER }}
            >
              <Text style={{ fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>To</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: end ? TEXT : MUTED }}>{end ? fmtDateBox(end) : '—'}</Text>
            </Pressable>
          </View>

          <Text style={{ fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 16, fontWeight: '400' }}>
            {step === 'start' ? 'Tap a date to set the start' : 'Now tap a date to set the end'}
          </Text>

          {/* Month navigator */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Pressable onPress={prevMonth} style={{ padding: 10 }} hitSlop={8}>
              <Feather name="chevron-left" size={22} color={canGoPrev ? TEXT : BORDER} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT }}>{monthLabel}</Text>
            <Pressable onPress={nextMonth} style={{ padding: 10 }} hitSlop={8}>
              <Feather name="chevron-right" size={22} color={canGoNext ? TEXT : BORDER} />
            </Pressable>
          </View>

          {/* Day headers */}
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            {DAYS.map(d => (
              <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: MUTED }}>{d}</Text>
            ))}
          </View>

          {/* Calendar grid */}
          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <View key={row} style={{ flexDirection: 'row', marginBottom: 4 }}>
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (day === null) return <View key={col} style={{ flex: 1, height: 44 }} />;
                const fut = isFut(day);
                const sel = isStart(day) || isEnd(day);
                const inR = isInRange(day);
                const tod = isToday(day);
                const textColor = sel ? '#fff' : fut ? BORDER : tod ? BLUE : TEXT;
                return (
                  <Pressable
                    key={col}
                    onPress={() => handleDayPress(day)}
                    style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: inR ? `${BLUE}14` : 'transparent' }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? BLUE : 'transparent' }}>
                      <Text style={{ fontSize: 14, fontWeight: sel || tod ? '700' : '400', color: textColor }}>{day}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* Apply button */}
          {start && end && (
            <Pressable
              onPress={handleApply}
              style={{ marginTop: 20, backgroundColor: NAVY, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                Apply — {fmtDateBox(start)} to {fmtDateBox(end)}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Sessions line chart ───────────────────────────────────────────────────────
type HourlyPoint = { hour: number; count: number };

function SessionsChart({
  today,
  lastWeek,
  totalToday,
  pctChange,
  liveCount,
}: {
  today: HourlyPoint[];
  lastWeek: HourlyPoint[];
  totalToday: number;
  pctChange: number | null;
  liveCount: number;
}) {
  const W    = 340;
  const H    = 130;
  const PAD  = { top: 12, right: 8, bottom: 28, left: 24 };
  const cW   = W - PAD.left - PAD.right;
  const cH   = H - PAD.top  - PAD.bottom;

  const maxVal = Math.max(
    ...today.map(p => p.count),
    ...lastWeek.map(p => p.count),
    1,
  );

  const toXY = (pts: HourlyPoint[]) =>
    pts.map(p => ({
      x: PAD.left + (p.hour / 23) * cW,
      y: PAD.top  + cH - (p.count / maxVal) * cH,
    }));

  const todayPts    = toXY(today);
  const lastWeekPts = toXY(lastWeek);

  const todayLine    = makePath(todayPts);
  const todayFill    = makePath(todayPts, true, PAD.top + cH);
  const lastWeekLine = makePath(lastWeekPts);

  const gridVals = [0, Math.ceil(maxVal / 2), maxVal];

  const xLabels = [
    { hour: 0,  label: '12 AM' },
    { hour: 8,  label: '8 AM'  },
    { hour: 12, label: '12 PM' },
    { hour: 18, label: '6 PM'  },
    { hour: 23, label: 'Now'   },
  ];

  const up = pctChange !== null && pctChange >= 0;

  return (
    <View style={ch.card}>
      {/* Header stats */}
      <View style={ch.statsRow}>
        <View style={ch.statBlock}>
          <Text style={ch.statLabel}>Sessions</Text>
          <Text style={ch.statVal}>{totalToday}</Text>
          {pctChange !== null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Feather name={up ? 'trending-up' : 'trending-down'} size={12} color={up ? GREEN : RED} />
              <Text style={[ch.pct, { color: up ? GREEN : RED }]}>
                {up ? '+' : ''}{pctChange}%
              </Text>
            </View>
          )}
        </View>
        <View style={ch.divider} />
        <View style={ch.statBlock}>
          <Text style={ch.statLabel}>Live now</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={ch.liveDot} />
            <Text style={ch.statVal}>{liveCount}</Text>
          </View>
        </View>
        <View style={ch.divider} />
        <View style={ch.statBlock}>
          <Text style={ch.statLabel}>vs Last Week</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[ch.legendDash, { borderColor: MUTED }]} />
            <Text style={[ch.statVal, { color: MUTED }]}>{lastWeek.reduce((a, p) => a + p.count, 0)}</Text>
          </View>
        </View>
      </View>

      {/* SVG Chart */}
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="todayGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0"   stopColor={BLUE} stopOpacity="0.22" />
            <Stop offset="1"   stopColor={BLUE} stopOpacity="0.0"  />
          </LinearGradient>
        </Defs>

        {/* Grid lines */}
        {gridVals.map((v, i) => {
          const y = PAD.top + cH - (v / maxVal) * cH;
          return (
            <React.Fragment key={i}>
              <Line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={BORDER} strokeWidth="0.7" />
              <SvgText x={PAD.left - 4} y={y + 4} fontSize="8" fill={MUTED} textAnchor="end">{v}</SvgText>
            </React.Fragment>
          );
        })}

        {/* Last week dashed line */}
        <Path d={lastWeekLine} fill="none" stroke={MUTED} strokeWidth="1.2" strokeDasharray="4 3" opacity="0.55" />

        {/* Today gradient fill */}
        <Path d={todayFill} fill="url(#todayGrad)" />

        {/* Today solid line */}
        <Path d={todayLine} fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* X-axis labels */}
        {xLabels.map(({ hour, label }) => {
          const x = PAD.left + (hour / 23) * cW;
          return (
            <SvgText key={hour} x={x} y={H - 4} fontSize="8" fill={MUTED} textAnchor="middle">{label}</SvgText>
          );
        })}
      </Svg>

      <Text style={ch.sub}>App sessions today · logins + orders</Text>
    </View>
  );
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────
function KpiTile({ icon, label, value, color, alert, onPress, helper }: {
  icon: string; label: string; value: string | number; color: string; alert?: boolean; onPress?: () => void; helper?: string;
}) {
  return (
    <Pressable onPress={onPress} style={[kpi.tile, alert ? { borderColor: color + '60' } : undefined]}>
      <View style={[kpi.iconBox, { backgroundColor: color + '33', borderColor: color + '55' }]}>
        <Feather name={icon as any} size={16} color={color} />
        {alert && <View style={kpi.alertDot} />}
      </View>
      <Text style={[kpi.value, { color: TEXT }]}>{value}</Text>
      {helper ? <Text style={[kpi.helper, { color }]} numberOfLines={1}>{helper}</Text> : null}
      <Text style={[kpi.label, { color: MUTED }]}>{label}</Text>
    </Pressable>
  );
}

// ── Quick action button ───────────────────────────────────────────────────────
function QuickBtn({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} style={qa.btn}>
      <View style={[qa.icon, { backgroundColor: color + '33', borderColor: color + '55' }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={[qa.label, { color: TEXT }]}>{label}</Text>
    </Pressable>
  );
}

// ── Director/Master dashboard ─────────────────────────────────────────────────
function DirectorDashboardInner() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-stats'],
    queryFn: () => api.director.stats(),
    refetchInterval: 30000,
  });

  const { data: activityData, refetch: refetchActivity } = useQuery({
    queryKey: ['director-activity'],
    queryFn: () => api.director.activity(),
    refetchInterval: 60000,
  });

  const { data: sessionsData, refetch: refetchSessions } = useQuery({
    queryKey: ['director-sessions'],
    queryFn: () => api.director.sessions(),
    refetchInterval: 60000,
  });

  const [showRevPicker, setShowRevPicker]     = useState(false);
  const [customRevTotal, setCustomRevTotal]   = useState<number | null>(null);
  const [customRevRange, setCustomRevRange]   = useState<{ from: Date; to: Date } | null>(null);
  const [customRevLoading, setCustomRevLoading] = useState(false);

  const handleApplyRevRange = async (from: Date, to: Date) => {
    setCustomRevLoading(true);
    setCustomRevRange({ from, to });
    try {
      const res = await api.director.revenue(from.toISOString(), to.toISOString());
      setCustomRevTotal(res.data.total);
    } catch {
      setCustomRevTotal(null);
    } finally {
      setCustomRevLoading(false);
    }
  };

  const s        = data?.data;
  const activity: any[] = activityData?.data ?? [];
  const sess     = sessionsData?.data;
  const hasAlerts = (s?.users.pendingStaff ?? 0) > 0 || (s?.users.pendingWholesale ?? 0) > 0 || (s?.issues.high ?? 0) > 0;

  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  const { refreshing, onRefresh } = useRefreshControl(refetch, refetchActivity, refetchSessions);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
    >
      <View style={{ paddingHorizontal: 16, gap: 16, paddingTop: 14 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: TEXT }}>Dashboard</Text>

        {isLoading ? (
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <ActivityIndicator color={BLUE} size="large" />
            <Text style={{ color: MUTED, marginTop: 12, fontWeight: '400' }}>Loading control centre…</Text>
          </View>
        ) : (
          <>
            {/* ── Revenue hero ─────────────────────────────────── */}
            <View style={[styles.revCard, { backgroundColor: NAVY }]}>
              <View style={styles.revHeader}>
                <Text style={[styles.revTitle, { fontWeight: '700' }]}>REVENUE</Text>
                <View style={styles.liveChip}>
                  <View style={styles.liveDot} />
                  <Text style={[styles.liveText, { fontWeight: '700' }]}>LIVE</Text>
                </View>
              </View>
              <View style={styles.revRow}>
                {[
                  { label: 'Today',      value: fmtAUD(s?.revenue.today ?? 0) },
                  { label: 'This Week',  value: fmtAUD(s?.revenue.week  ?? 0) },
                  { label: 'This Month', value: fmtAUD(s?.revenue.month ?? 0) },
                ].map((r, i) => (
                  <View key={r.label} style={[styles.revItem, i > 0 && styles.revItemBorder]}>
                    <Text style={[styles.revAmount, { fontWeight: '700' }]}>{r.value}</Text>
                    <Text style={[styles.revLabel,  { fontWeight: '400' }]}>{r.label}</Text>
                  </View>
                ))}
              </View>
              {/* Custom date range row */}
              <Pressable
                onPress={() => { setShowRevPicker(true); Haptics.selectionAsync(); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="calendar" size={14} color="rgba(255,255,255,0.65)" />
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '500' }}>
                    {customRevRange ? `${fmtDateBox(customRevRange.from)} – ${fmtDateBox(customRevRange.to)}` : 'Custom Date Range'}
                  </Text>
                </View>
                {customRevLoading ? (
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.65)" />
                ) : customRevTotal !== null ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{fmtAUD(customRevTotal)}</Text>
                    <Pressable onPress={() => { setCustomRevTotal(null); setCustomRevRange(null); }}>
                      <Feather name="x-circle" size={16} color="rgba(255,255,255,0.45)" />
                    </Pressable>
                  </View>
                ) : (
                  <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.45)" />
                )}
              </Pressable>
            </View>

            {/* Revenue range picker */}
            <RevenueRangePicker
              visible={showRevPicker}
              onClose={() => setShowRevPicker(false)}
              onApply={handleApplyRevRange}
            />

            {/* ── Sessions chart ───────────────────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, { fontWeight: '600' }]}>APP SESSIONS · TODAY</Text>
              {sess ? (
                <SessionsChart
                  today={sess.today}
                  lastWeek={sess.lastWeek}
                  totalToday={sess.totalToday}
                  pctChange={sess.pctChange}
                  liveCount={sess.liveCount}
                />
              ) : (
                <View style={[styles.emptyCard, { paddingVertical: 28 }]}>
                  <ActivityIndicator color={BLUE} />
                </View>
              )}
            </View>

            {/* ── Urgent alerts ─────────────────────────────────── */}
            {hasAlerts && (
              <View style={[styles.alertCard, { backgroundColor: '#FFF1F0', borderColor: '#FCA5A5' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <View style={[styles.alertDotBig, { backgroundColor: RED }]} />
                  <Text style={[styles.alertHeading, { fontWeight: '700', color: '#7F1D1D' }]}>Urgent — Action Required</Text>
                </View>
                {(s?.users.pendingStaff ?? 0) > 0 && (
                  <Pressable onPress={() => router.navigate('/(director)/users' as any)} style={styles.alertRow}>
                    <Feather name="user-check" size={13} color="#991B1B" />
                    <Text style={[styles.alertRowText, { fontWeight: '400', color: '#991B1B' }]}>{s?.users.pendingStaff} staff account{s?.users.pendingStaff !== 1 ? 's' : ''} awaiting approval</Text>
                    <Text style={[styles.reviewLink,   { fontWeight: '700',   color: '#991B1B' }]}>Review →</Text>
                  </Pressable>
                )}
                {(s?.users.pendingWholesale ?? 0) > 0 && (
                  <Pressable onPress={() => router.navigate('/(director)/users' as any)} style={styles.alertRow}>
                    <Feather name="package" size={13} color="#991B1B" />
                    <Text style={[styles.alertRowText, { fontWeight: '400', color: '#991B1B' }]}>{s?.users.pendingWholesale} wholesale application{s?.users.pendingWholesale !== 1 ? 's' : ''} pending</Text>
                    <Text style={[styles.reviewLink,   { fontWeight: '700',   color: '#991B1B' }]}>Review →</Text>
                  </Pressable>
                )}
                {(s?.issues.high ?? 0) > 0 && (
                  <Pressable
                    style={styles.alertRow}
                    onPress={() => Alert.alert(
                      `${s?.issues.high} High-Priority Issue${s?.issues.high !== 1 ? 's' : ''}`,
                      'Staff-submitted issues are managed through the Staff Portal.\n\nAsk your on-duty manager to review and resolve open issues, or approve a staff account to give them access.',
                      [
                        { text: 'View Staff', onPress: () => router.navigate('/(director)/users' as any) },
                        { text: 'Dismiss', style: 'cancel' },
                      ],
                    )}
                  >
                    <Feather name="alert-triangle" size={13} color="#991B1B" />
                    <Text style={[styles.alertRowText, { fontWeight: '400', color: '#991B1B' }]}>{s?.issues.high} high-priority issue{s?.issues.high !== 1 ? 's' : ''} open</Text>
                    <Text style={[styles.reviewLink,   { fontWeight: '700',   color: '#991B1B' }]}>View →</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* ── Quick actions ──────────────────────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, { fontWeight: '600' }]}>QUICK ACTIONS</Text>
              <View style={styles.qaGrid}>
                <QuickBtn icon="box"          label="Products"   color={BLUE}    onPress={() => router.navigate('/(director)/products' as any)} />
                <QuickBtn icon="users"        label="Staff"      color={PURPLE}  onPress={() => router.push({ pathname: '/(director)/users', params: { tab: 'Staff' } } as any)} />
                <QuickBtn icon="briefcase"    label="Wholesale"  color={GREEN}   onPress={() => router.push({ pathname: '/(director)/more', params: { category: 'wholesale' } } as any)} />
                <QuickBtn icon="shopping-bag" label="View Orders"   color={AMBER}   onPress={() => router.navigate('/(director)/orders' as any)} />
                <QuickBtn icon="clipboard"    label="Tasks"         color={BLUE}    onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'tasks' } } as any)} />
                <QuickBtn icon="bell"         label="Notify"        color="#06B6D4" onPress={() => router.push('/director-settings-notify' as any)} />
                <QuickBtn icon="bar-chart-2"  label="Reports"       color={NAVY}    onPress={() => router.push('/director-reports' as any)} />
                <QuickBtn icon="settings"     label="Settings"      color={MUTED}   onPress={() => router.navigate('/(director)/more' as any)} />
              </View>
            </View>

            {/* ── KPI grid ───────────────────────────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, { fontWeight: '600' }]}>TODAY'S OVERVIEW</Text>
              <View style={styles.kpiGrid}>
                <KpiTile icon="shopping-bag"   label="Orders today"     value={s?.orders.today      ?? 0} color={BLUE}   onPress={() => router.navigate('/(director)/orders' as any)} />
                <KpiTile icon="zap"            label="Active orders"    value={s?.orders.active     ?? 0} color={GREEN}  alert={(s?.orders.active ?? 0) > 0} onPress={() => router.navigate('/(director)/orders' as any)} />
                <KpiTile icon="users"          label="Staff clocked in" value={s?.staff.clockedIn   ?? 0} color={PURPLE} helper={`Week wages ${fmtAUD(s?.staff.weekWagesOwedCents ?? 0)}`} onPress={() => router.push('/director-staff-hours' as any)} />
                <KpiTile icon="clipboard"      label="Open tasks"      value={s?.tasks?.open       ?? 0} color={BLUE}   onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'tasks' } } as any)} />
                <KpiTile icon="package"        label="Sold out"         value={s?.products.soldOut  ?? 0} color={RED}    alert={(s?.products.soldOut ?? 0) > 0}  onPress={() => router.navigate('/(director)/products' as any)} />
                <KpiTile icon="trending-down"  label="Low stock"        value={s?.products.lowStock ?? 0} color={AMBER}  alert={(s?.products.lowStock ?? 0) > 0} onPress={() => router.navigate('/(director)/products' as any)} />
                <KpiTile icon="alert-octagon"  label="Open issues"      value={s?.issues.open       ?? 0} color={RED}    alert={(s?.issues.open ?? 0) > 0}   onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'issues' } } as any)} />
                <KpiTile icon="trash-2"        label="Wastage today"    value={s?.wastage.countToday ?? 0} color={PURPLE} helper={`Week loss ${fmtAUD(s?.wastage.costWeek ?? 0)}`} onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'wastage' } } as any)} />
                <KpiTile icon="mail"           label="Pending leave"    value={s?.staff.pendingLeave ?? 0} color={AMBER}  onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'leave' } } as any)} />
                <KpiTile icon="package"        label="WS pending"       value={s?.orders.wholesaleNew ?? 0} color={GREEN} alert={(s?.orders.wholesaleNew ?? 0) > 0} onPress={() => router.navigate('/(director)/orders' as any)} />
              </View>
            </View>

            {/* ── Wastage cost banner ───────────────────────────── */}
            {((s?.wastage.costToday ?? 0) > 0 || (s?.wastage.costWeek ?? 0) > 0) && (
              <Pressable
                onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'wastage' } } as any)}
                style={[styles.wastageCard, { backgroundColor: '#FDF4FF', borderColor: '#E9D5FF' }]}
              >
                <Feather name="trash-2" size={16} color={PURPLE} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.wastageTitle, { fontWeight: '600', color: PURPLE }]}>This Week's Wastage Cost</Text>
                  <Text style={[styles.wastageSub, { fontWeight: '400', color: MUTED }]}>
                    {s?.wastage.countWeek ?? 0} item{(s?.wastage.countWeek ?? 0) !== 1 ? 's' : ''} logged — estimated {fmtAUD(s?.wastage.costWeek ?? 0)} lost
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={PURPLE} />
              </Pressable>
            )}

            {/* ── Activity feed ─────────────────────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, { fontWeight: '600' }]}>RECENT ACTIVITY</Text>
              {activity.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Feather name="activity" size={28} color={BORDER} />
                  <Text style={[styles.emptyText, { fontWeight: '400', color: MUTED }]}>No recent activity</Text>
                </View>
              ) : (
                <View style={styles.activityList}>
                  {activity.slice(0, 12).map((ev: any, i: number) => (
                    <View key={ev.id + i} style={[styles.activityRow, i > 0 && { borderTopWidth: 1, borderTopColor: BORDER }]}>
                      <View style={[styles.activityIcon, { backgroundColor: ev.color + '18' }]}>
                        <Feather name={ev.icon as any} size={13} color={ev.color} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.activityTitle, { fontWeight: '600', color: TEXT }]} numberOfLines={1}>{ev.title}</Text>
                        <Text style={[styles.activitySub,   { fontWeight: '400',  color: MUTED }]} numberOfLines={1}>{ev.sub}</Text>
                      </View>
                      <Text style={[styles.activityTime, { fontWeight: '400', color: MUTED }]}>{timeAgo(ev.at)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  revCard:       { borderRadius: 20, padding: 20, gap: 16 },
  revHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  revTitle:      { color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 1.5 },
  liveChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(34,197,94,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  liveDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  liveText:      { color: GREEN, fontSize: 10, letterSpacing: 1 },
  revRow:        { flexDirection: 'row' },
  revItem:       { flex: 1, alignItems: 'center' },
  revItemBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.12)' },
  revAmount:     { color: '#fff', fontSize: 18 },
  revLabel:      { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 3 },
  alertCard:     { borderRadius: 14, padding: 14, borderWidth: 1, gap: 6 },
  alertDotBig:   { width: 8, height: 8, borderRadius: 4 },
  alertHeading:  { fontSize: 13 },
  alertRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertRowText:  { flex: 1, fontSize: 13 },
  reviewLink:    { fontSize: 12 },
  sectionTitle:  { fontSize: 11, color: MUTED, letterSpacing: 1.5, marginBottom: 10 },
  qaGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  wastageCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  wastageTitle:  { fontSize: 13 },
  wastageSub:    { fontSize: 12, marginTop: 2 },
  activityList:  { borderRadius: 20, borderWidth: 1, overflow: 'hidden', backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  activityRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  activityIcon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityTitle: { fontSize: 13 },
  activitySub:   { fontSize: 11 },
  activityTime:  { fontSize: 11 },
  emptyCard:     { alignItems: 'center', gap: 10, padding: 32, borderRadius: 20, borderWidth: 1, backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  emptyText:     { fontSize: 14 },
});

const kpi = StyleSheet.create({
  tile:     { width: '47.5%', backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, borderRadius: 16, borderWidth: 1, padding: 14, gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  iconBox:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative', borderWidth: 1 },
  alertDot: { position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  value:    { fontSize: 26, fontWeight: '700' },
  helper:   { fontSize: 11, fontWeight: '600' },
  label:    { fontSize: 11, fontWeight: '500' },
});

const qa = StyleSheet.create({
  btn:   { width: '23%', backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, borderRadius: 16, borderWidth: 1, padding: 10, gap: 6, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  icon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  label: { fontSize: 10, fontWeight: '500', textAlign: 'center' },
});

const ch = StyleSheet.create({
  card:       { backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, borderRadius: 20, borderWidth: 1, padding: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  statsRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  statBlock:  { flex: 1, gap: 3 },
  statLabel:  { fontSize: 11, fontWeight: '400', color: MUTED },
  statVal:    { fontSize: 22, fontWeight: '700', color: TEXT },
  pct:        { fontSize: 12, fontWeight: '600' },
  divider:    { width: 1, backgroundColor: BORDER, marginHorizontal: 12, height: 44, marginTop: 4 },
  liveDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  legendDash: { width: 14, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed' },
  sub:        { fontSize: 10, fontWeight: '400', color: MUTED, marginTop: 6, textAlign: 'center' },
});

// ── Role-aware wrapper ─────────────────────────────────────────────────────────
const BADGE_LABEL: Record<string, string> = {
  master:   'MASTER',
  director: 'DIRECTOR',
};
const BADGE_COLOR: Record<string, string> = {
  master:   '#7C3AED',
  director: '#EF4444',
};

export default function DirectorHome() {
  const { user, logout } = useAuth();
  if (user?.role === 'staff' || user?.role === 'manager') {
    return <StaffDashboard />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <PortalHeader
        badge={BADGE_LABEL[user?.role ?? ''] ?? 'DIRECTOR'}
        badgeColor={BADGE_COLOR[user?.role ?? ''] ?? '#EF4444'}
        backgroundColor={NAVY}
        onLogout={() => logout().then(() => router.replace('/(auth)/login' as any))}
      />
      <DirectorDashboardInner />
    </View>
  );
}
