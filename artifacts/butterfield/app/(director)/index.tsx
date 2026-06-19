import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useScrollToTopCompat as useScrollToTop } from '@/hooks/useScrollToTopCompat';
import {
  ActivityIndicator, Alert, Animated, Modal, Pressable, RefreshControl,
  ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import Svg, {
  Rect, Line,
} from 'react-native-svg';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { PortalHeader } from '@/components/PortalHeader';
import { api } from '@/lib/api';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
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
  const [step, setStep]   = useState<'start' | 'end'>('start');
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd]     = useState<Date | null>(null);

  const today = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; })[0];

  const handleClose = () => { setStart(null); setEnd(null); setStep('start'); onClose(); };
  const handleApply = () => {
    if (!start || !end) return;
    const to = new Date(end); to.setHours(23, 59, 59, 999);
    onApply(start, to);
    onClose();
  };

  const handleSelectDate = (d: Date) => {
    if (step === 'start') {
      setStart(d); setEnd(null); setStep('end');
    } else {
      if (start && d < start) { setEnd(start); setStart(d); }
      else { setEnd(d); }
      setStep('start');
    }
    Haptics.selectionAsync();
  };

  const displayDate = step === 'start' ? start : (end ?? start);

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
          {/* Step indicator boxes */}
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

          <Text style={{ fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 8, fontWeight: '400' }}>
            {step === 'start' ? 'Tap a date to set the start' : 'Now tap a date to set the end'}
          </Text>

          <InlineCalendarPicker
            selectedDate={displayDate}
            onSelectDate={handleSelectDate}
            accentColor={BLUE}
            maxDate={today}
          />

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

// ── Delta badge ───────────────────────────────────────────────────────────────
function DeltaBadge({ pct, dark }: { pct: number | null | undefined; dark?: boolean }) {
  if (pct == null) return null;
  const abs  = Math.abs(pct);
  const up   = pct > 0;
  const flat = abs <= 2;
  if (dark) {
    const color = flat ? 'rgba(255,255,255,0.4)' : up ? '#00FF94' : '#FF2D55';
    return (
      <Text style={{ fontSize: 10, fontWeight: '700', color, letterSpacing: 0.3 }}>
        {flat ? '—' : up ? '▲' : '▼'} {abs}%
      </Text>
    );
  }
  const color = flat ? MUTED : up ? GREEN : RED;
  return (
    <Text style={{ fontSize: 10, fontWeight: '700', color, letterSpacing: 0.3 }}>
      {flat ? '—' : up ? '▲' : '▼'} {abs}%
    </Text>
  );
}

// ── AOV + Customer split row ──────────────────────────────────────────────────
function AovCustomerRow({
  aovCents, aovDelta, newCust, returningCust,
}: {
  aovCents: number; aovDelta: number | null | undefined;
  newCust: number; returningCust: number;
}) {
  const total  = newCust + returningCust;
  const newPct = total > 0 ? Math.round((newCust / total) * 100) : 0;
  const dayLabel = new Intl.DateTimeFormat('en-AU', { weekday: 'short' }).format(new Date(Date.now() - 7 * 86400000));

  const cardStyle = {
    flex: 1, backgroundColor: CARD, borderRadius: 18, borderWidth: 1,
    borderColor: BORDER, padding: 14, gap: 6,
    ...GLASS_SHADOW,
  };

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {/* AOV */}
      <View style={cardStyle}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: BLUE, letterSpacing: 1.5 }}>AVG ORDER</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: TEXT, letterSpacing: -0.5 }}>{fmtAUD(aovCents)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <DeltaBadge pct={aovDelta} />
          <Text style={{ fontSize: 9, fontWeight: '400', color: MUTED }}>vs last {dayLabel}</Text>
        </View>
      </View>
      {/* New vs returning */}
      <View style={cardStyle}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: AMBER, letterSpacing: 1.5 }}>CUSTOMERS</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: TEXT, letterSpacing: -0.5 }}>{total}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 9, fontWeight: '600', color: BLUE }}>{newCust} NEW</Text>
          <Text style={{ fontSize: 9, color: MUTED }}>·</Text>
          <Text style={{ fontSize: 9, fontWeight: '600', color: AMBER }}>{returningCust} RETURN</Text>
        </View>
        {total > 0 && (
          <View style={{ flexDirection: 'row', height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: BORDER }}>
            <View style={{ width: `${newPct}%`, height: '100%', backgroundColor: BLUE }} />
          </View>
        )}
      </View>
    </View>
  );
}


// ── Hourly Insights Chart (Revenue + Sessions, 6 AM – 12 AM midnight) ────────
const HOUR_START = 6;
const HOUR_END   = 23;        // inclusive — 18 slots (6 AM … 11 PM; "12A" is boundary)
const NUM_HOURS  = 18;        // HOUR_END - HOUR_START + 1

const BAR_W     = 13;
const BAR_GAP   =  2;
const GROUP_GAP =  8;
const GROUP_W   = BAR_W * 2 + BAR_GAP + GROUP_GAP; // 36
const CHART_H   = 110;
const PAD_TOP   =   8;
const SVG_H     = PAD_TOP + CHART_H;               // 118
const SVG_W     = GROUP_GAP + NUM_HOURS * GROUP_W; // 656

function hrLabel(h: number): string {
  if (h === 0)  return '12A';
  if (h === 12) return '12P';
  return h > 12 ? `${h - 12}P` : `${h}A`;
}

function hrFull(h: number): string {
  if (h === 0)  return '12 AM';
  if (h === 12) return '12 PM';
  return h > 12 ? `${h - 12} PM` : `${h} AM`;
}

interface InsightsHour { hour: number; revenueCents: number }
interface InsightsSess { hour: number; count: number }

function HourlyInsightsChart({
  hours,
  sessions,
  totalRevenueCents,
  totalSessions,
  liveCount,
}: {
  hours: InsightsHour[];
  sessions: InsightsSess[];
  totalRevenueCents: number;
  totalSessions: number;
  liveCount: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const nowHour = parseInt(
    new Intl.DateTimeFormat('en-AU', {
      hour: 'numeric', hour12: false, timeZone: 'Australia/Sydney',
    }).format(new Date()),
    10,
  );

  const maxRev  = Math.max(...hours.filter(h => h.hour >= HOUR_START && h.hour <= HOUR_END).map(h => h.revenueCents), 1);
  const maxSess = Math.max(...sessions.filter(s => s.hour >= HOUR_START && s.hour <= HOUR_END).map(s => s.count), 1);

  const revMap:  Record<number, number> = {};
  const sessMap: Record<number, number> = {};
  hours.forEach(h    => { revMap[h.hour]  = h.revenueCents; });
  sessions.forEach(s => { sessMap[s.hour] = s.count; });

  return (
    <View style={{
      backgroundColor: CARD, borderRadius: 20, borderWidth: 1,
      borderColor: BORDER, overflow: 'hidden', ...GLASS_SHADOW,
    }}>
      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: BLUE, letterSpacing: 1.5 }}>REVENUE TODAY</Text>
          <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT, letterSpacing: -0.5, marginTop: 2 }}>
            {fmtAUD(totalRevenueCents)}
          </Text>
        </View>
        <View style={{ width: 1, height: 38, backgroundColor: BORDER, marginHorizontal: 14 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: GREEN, letterSpacing: 1.5 }}>SESSIONS TODAY</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT, letterSpacing: -0.5 }}>{totalSessions}</Text>
            {liveCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GREEN + '22', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN }} />
                <Text style={{ fontSize: 9, fontWeight: '700', color: GREEN }}>{liveCount} LIVE</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* ── Legend ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: BLUE }} />
          <Text style={{ fontSize: 10, color: MUTED, fontWeight: '500' }}>Revenue</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: GREEN }} />
          <Text style={{ fontSize: 10, color: MUTED, fontWeight: '500' }}>Sessions</Text>
        </View>
      </View>

      {/* ── Scrollable grouped-bar chart ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 14 }}
        contentContainerStyle={{ paddingHorizontal: 4 }}
      >
        <View style={{ width: SVG_W, height: SVG_H + 22, position: 'relative' }}>

          {/* SVG bar shapes — Rect only, no SvgText */}
          <Svg width={SVG_W} height={SVG_H}>
            <Line x1={0} y1={PAD_TOP + CHART_H} x2={SVG_W} y2={PAD_TOP + CHART_H} stroke={BORDER} strokeWidth={1} />
            {Array.from({ length: NUM_HOURS }, (_, i) => {
              const h          = HOUR_START + i;
              const rev        = revMap[h]  ?? 0;
              const sess       = sessMap[h] ?? 0;
              const isCurrent  = h === nowHour;
              const isPast     = h < nowHour;
              const xRev       = GROUP_GAP / 2 + i * GROUP_W;
              const xSess      = xRev + BAR_W + BAR_GAP;
              const revH       = rev  > 0 ? Math.max((rev  / maxRev)  * CHART_H, 4) : 0;
              const sessH      = sess > 0 ? Math.max((sess / maxSess) * CHART_H, 4) : 0;
              const revOp      = isCurrent ? 1 : isPast ? 0.85 : 0.15;
              const sessOp     = isCurrent ? 1 : isPast ? 0.85 : 0.15;
              const isSelected = selected === i;
              return (
                <React.Fragment key={h}>
                  {(isSelected || isCurrent) && (
                    <Rect
                      x={xRev - 3} y={PAD_TOP + 2}
                      width={BAR_W * 2 + BAR_GAP + 6} height={CHART_H - 2}
                      rx={4} fill={isSelected ? BLUE : GREEN}
                      opacity={isSelected ? 0.1 : 0.06}
                    />
                  )}
                  {revH > 0 && (
                    <Rect x={xRev} y={PAD_TOP + CHART_H - revH} width={BAR_W} height={revH} rx={3} fill={BLUE} opacity={revOp} />
                  )}
                  {sessH > 0 && (
                    <Rect x={xSess} y={PAD_TOP + CHART_H - sessH} width={BAR_W} height={sessH} rx={3} fill={GREEN} opacity={sessOp} />
                  )}
                </React.Fragment>
              );
            })}
          </Svg>

          {/* Tap targets per group (RN Pressable, not SVG) */}
          {Array.from({ length: NUM_HOURS }, (_, i) => {
            const xRev = GROUP_GAP / 2 + i * GROUP_W;
            return (
              <Pressable
                key={i}
                onPress={() => { Haptics.selectionAsync(); setSelected(s => s === i ? null : i); }}
                style={{ position: 'absolute', left: xRev - 3, top: 0, width: BAR_W * 2 + BAR_GAP + 6, height: SVG_H }}
              />
            );
          })}

          {/* Hour labels — RN Text, never SvgText (SvgText crashes TestFlight) */}
          {Array.from({ length: NUM_HOURS }, (_, i) => {
            const h          = HOUR_START + i;
            const isCurrent  = h === nowHour;
            const isSelected = selected === i;
            const xRev       = GROUP_GAP / 2 + i * GROUP_W;
            const cx         = xRev + (BAR_W * 2 + BAR_GAP) / 2;
            return (
              <Text
                key={h}
                style={{
                  position: 'absolute', left: cx - 10, top: SVG_H + 3,
                  width: 20, textAlign: 'center',
                  fontSize: 8,
                  fontWeight: isCurrent ? '700' : '400',
                  color: isSelected ? BLUE : isCurrent ? GREEN : MUTED,
                }}
              >
                {hrLabel(h)}
              </Text>
            );
          })}
          {/* "12A" boundary marker at right edge */}
          <Text style={{
            position: 'absolute',
            left: GROUP_GAP / 2 + NUM_HOURS * GROUP_W - 10,
            top: SVG_H + 3,
            width: 20, textAlign: 'center',
            fontSize: 8, color: MUTED,
          }}>
            12A
          </Text>

          {/* Floating callout (RN View + Text) */}
          {selected !== null && (() => {
            const h    = HOUR_START + selected;
            const rev  = revMap[h]  ?? 0;
            const sess = sessMap[h] ?? 0;
            const xRev = GROUP_GAP / 2 + selected * GROUP_W;
            const cw   = 112;
            const cl   = Math.max(0, Math.min(
              xRev - cw / 2 + (BAR_W * 2 + BAR_GAP) / 2,
              SVG_W - cw - 4,
            ));
            return (
              <View style={{
                position: 'absolute', left: cl, top: 4,
                width: cw, backgroundColor: NAVY, borderRadius: 10,
                padding: 9, gap: 5,
                shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.28, shadowRadius: 8, elevation: 9, zIndex: 100,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.4 }}>
                  {hrFull(h)}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: BLUE }} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{fmtAUD(rev)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: GREEN }} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{sess} session{sess !== 1 ? 's' : ''}</Text>
                </View>
              </View>
            );
          })()}
        </View>
      </ScrollView>
    </View>
  );
}


// ── Director/Master dashboard ─────────────────────────────────────────────────
function DirectorDashboardInner() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-stats'],
    queryFn: () => api.director.stats(),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });

  const { data: activityData, refetch: refetchActivity } = useQuery({
    queryKey: ['director-activity'],
    queryFn: () => api.director.activity(),
    refetchInterval: 60000,
    placeholderData: keepPreviousData,
  });

  const { data: insightsData, refetch: refetchInsights } = useQuery({
    queryKey: ['director-insights'],
    queryFn: () => api.director.insights(),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
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
  const insights = insightsData?.data;
  const hasAlerts = (s?.users.pendingStaff ?? 0) > 0 || (s?.users.pendingWholesale ?? 0) > 0 || (s?.issues.high ?? 0) > 0;

  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  const { refreshing, onRefresh } = useRefreshControl(refetch, refetchActivity, refetchInsights);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={BLUE} />}
    >
      <View style={{ paddingHorizontal: 16, gap: 16, paddingTop: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: TEXT, flex: 1 }}>Dashboard</Text>
          {isLoading && <ActivityIndicator color={BLUE} size="small" />}
        </View>

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
                {([
                  { label: 'Today',      value: fmtAUD(s?.revenue.today ?? 0), delta: s?.revenue.todayDeltaPct, cmp: 'vs same time last week', drillMode: 'today' },
                  { label: 'This Week',  value: fmtAUD(s?.revenue.week  ?? 0), delta: s?.revenue.weekDeltaPct,  cmp: 'vs prior week-to-date',  drillMode: 'week'  },
                  { label: 'This Month', value: fmtAUD(s?.revenue.month ?? 0), delta: s?.revenue.monthDeltaPct, cmp: 'vs prior month-to-date', drillMode: 'month' },
                ] as const).map((r, i) => (
                  <Pressable
                    key={r.label}
                    style={({ pressed }) => [styles.revItem, i > 0 && styles.revItemBorder, { opacity: pressed ? 0.75 : 1 }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      router.push({ pathname: '/(director)/orders', params: { drillMode: r.drillMode } } as any);
                    }}
                  >
                    <Text style={[styles.revAmount, { fontWeight: '700' }]}>{r.value}</Text>
                    <Text style={[styles.revLabel,  { fontWeight: '400' }]}>{r.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <DeltaBadge pct={r.delta} dark />
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 5, padding: 3 }}>
                        <Feather name="chevron-right" size={9} color="rgba(255,255,255,0.5)" />
                      </View>
                    </View>
                    {r.delta != null && (
                      <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontWeight: '400', marginTop: 1 }}>{r.cmp}</Text>
                    )}
                  </Pressable>
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

            {/* ── Channel KPI strip ───────────────────────────── */}
            {s?.channels && (
              <View>
                <Text style={[styles.sectionTitle, { fontWeight: '600' }]}>ORDERS BY CHANNEL · TODAY</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {/* App */}
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(director)/orders', params: { tab: 'app' } } as any); }}
                    style={[styles.channelCard, { flex: 1 }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: `${BLUE}18`, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="smartphone" size={13} color={BLUE} />
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.4 }}>APP</Text>
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>{s.channels.appOrders.countToday}</Text>
                    <Text style={{ fontSize: 11, color: MUTED, fontWeight: '400', marginTop: 1 }}>orders</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE, marginTop: 4 }}>{fmtAUD(s.channels.appOrders.revenueTodayCents)}</Text>
                  </Pressable>
                  {/* POS */}
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(director)/orders', params: { tab: 'pos' } } as any); }}
                    style={[styles.channelCard, { flex: 1 }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: `${PURPLE}18`, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="monitor" size={13} color={PURPLE} />
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.4 }}>POS</Text>
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>{s.channels.posTransactions.countToday}</Text>
                    <Text style={{ fontSize: 11, color: MUTED, fontWeight: '400', marginTop: 1 }}>transactions</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: PURPLE, marginTop: 4 }}>{fmtAUD(s.channels.posTransactions.revenueTodayCents)}</Text>
                  </Pressable>
                  {/* Wholesale */}
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(director)/orders', params: { tab: 'app' } } as any); }}
                    style={[styles.channelCard, { flex: 1 }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: `${GREEN}18`, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="package" size={13} color={GREEN} />
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.4 }}>WHOLESALE</Text>
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>{s.channels.wholesaleOrders.activeCount}</Text>
                    <Text style={{ fontSize: 11, color: MUTED, fontWeight: '400', marginTop: 1 }}>active orders</Text>
                    {s.channels.wholesaleOrders.outstandingCents > 0 && (
                      <Text style={{ fontSize: 13, fontWeight: '600', color: GREEN, marginTop: 4 }}>{fmtAUD(s.channels.wholesaleOrders.outstandingCents)}</Text>
                    )}
                    {s.channels.wholesaleOrders.outstandingCents === 0 && (
                      <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Feather name="chevron-right" size={11} color={GREEN} />
                        <Text style={{ fontSize: 11, color: GREEN, fontWeight: '500' }}>View all</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── AOV + Customer split ─────────────────────────── */}
            {s && (
              <AovCustomerRow
                aovCents={s.revenue.aovTodayCents ?? 0}
                aovDelta={s.revenue.aovDeltaPct}
                newCust={s.revenue.newCustomersToday ?? 0}
                returningCust={s.revenue.returningCustomersToday ?? 0}
              />
            )}

            {/* ── Hourly Insights (Revenue + Sessions) ────────── */}
            <View>
              <Text style={[styles.sectionTitle, { fontWeight: '600' }]}>HOURLY INSIGHTS · TODAY</Text>
              {insights ? (
                <HourlyInsightsChart
                  hours={insights.hourly}
                  sessions={insights.sessions}
                  totalRevenueCents={insights.totalRevenueCents}
                  totalSessions={insights.totalSessions}
                  liveCount={insights.liveCount}
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
                <QuickBtn icon="briefcase"    label="Wholesale"  color={AMBER}   onPress={() => router.push({ pathname: '/director-more-category', params: { category: 'wholesale' } } as any)} />
                <QuickBtn icon="shopping-bag" label="View Orders"   color="#06B6D4" onPress={() => router.navigate('/(director)/orders' as any)} />
                <QuickBtn icon="clipboard"    label="Tasks"         color={BLUE}    onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'tasks' } } as any)} />
                <QuickBtn icon="bell"         label="Notify"        color="#06B6D4" onPress={() => router.push('/director-settings-notify' as any)} />
                <QuickBtn icon="bar-chart-2"  label="Reports"       color={NAVY}    onPress={() => router.push('/director-reports' as any)} />
                <QuickBtn icon="settings"     label="Settings"      color={NAVY}    onPress={() => router.push({ pathname: '/director-more-category', params: { category: 'system' } } as any)} />
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
                <KpiTile icon="package"        label="WS pending"       value={s?.orders.wholesaleNew ?? 0} color={AMBER} alert={(s?.orders.wholesaleNew ?? 0) > 0} onPress={() => router.navigate('/(director)/orders' as any)} />
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
  channelCard:   { backgroundColor: GLASS_BG, borderRadius: 16, borderWidth: 1, borderColor: GLASS_BORDER, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
});

const kpi = StyleSheet.create({
  tile:     { width: '47.5%', backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, borderRadius: 16, borderWidth: 1, padding: 14, gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  iconBox:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative', borderWidth: 1.5 },
  alertDot: { position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  value:    { fontSize: 26, fontWeight: '700' },
  helper:   { fontSize: 11, fontWeight: '600' },
  label:    { fontSize: 11, fontWeight: '500' },
});

const qa = StyleSheet.create({
  btn:   { width: '23%', backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, borderRadius: 16, borderWidth: 1, padding: 10, gap: 6, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  icon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  label: { fontSize: 10, fontWeight: '500', textAlign: 'center' },
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
