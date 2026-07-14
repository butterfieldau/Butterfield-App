import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

const BLUE  = '#1493FF';
const NAVY  = '#1A2B4A';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const CARD   = '#FFFFFF';
const GLASS_SHADOW = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
} as const;

const HOUR_START = 6;
const HOUR_END   = 23;
const NUM_HOURS  = 18;

const BAR_W     = 13;
const BAR_GAP   =  2;
const GROUP_GAP =  8;
const GROUP_W   = BAR_W * 2 + BAR_GAP + GROUP_GAP;
const CHART_H   = 110;
const PAD_TOP   =   8;
const SVG_H     = PAD_TOP + CHART_H;
const SVG_W     = GROUP_GAP + NUM_HOURS * GROUP_W;
const CALLOUT_W = 112;
const CALLOUT_TOP = 84;

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

function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface InsightsHour { hour: number; revenueCents: number }

export default function HourlyInsightsChart({
  hours,
  lastWeekHourly,
  totalRevenueCents,
  lastWeekRevCents,
}: {
  hours: InsightsHour[];
  lastWeekHourly: InsightsHour[];
  totalRevenueCents: number;
  lastWeekRevCents: number;
}) {
  const [selected, setSelected]   = useState<number | null>(null);
  const [scrollX, setScrollX]     = useState(0);
  const [cardWidth, setCardWidth] = useState(0);

  const calloutLeft = selected !== null ? (() => {
    const xRev      = GROUP_GAP / 2 + selected * GROUP_W;
    const barCenter = xRev + (BAR_W * 2 + BAR_GAP) / 2 - scrollX + 4;
    const cw        = cardWidth > 0 ? cardWidth : 350;
    return Math.max(8, Math.min(barCenter - CALLOUT_W / 2, cw - CALLOUT_W - 8));
  })() : 0;

  const nowHour = new Date().getHours();

  const maxRev  = Math.max(...hours.filter(h => h.hour >= HOUR_START && h.hour <= HOUR_END).map(h => h.revenueCents), 1);
  const maxLW   = Math.max(...lastWeekHourly.filter(h => h.hour >= HOUR_START && h.hour <= HOUR_END).map(h => h.revenueCents), 1);
  const maxBar  = Math.max(maxRev, maxLW);

  const revMap: Record<number, number> = {};
  const lwMap:  Record<number, number> = {};
  hours.forEach(h         => { revMap[h.hour] = h.revenueCents; });
  lastWeekHourly.forEach(h => { lwMap[h.hour]  = h.revenueCents; });

  return (
    <Pressable
      onPress={() => setSelected(null)}
      onLayout={e => setCardWidth(e.nativeEvent.layout.width)}
      style={{
        backgroundColor: CARD, borderRadius: 20, borderWidth: 1,
        borderColor: BORDER, overflow: 'hidden', ...GLASS_SHADOW,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: BLUE, letterSpacing: 1.5 }}>REVENUE TODAY</Text>
          <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT, letterSpacing: -0.5, marginTop: 2 }}>
            {fmtAUD(totalRevenueCents)}
          </Text>
        </View>
        <View style={{ width: 1, height: 38, backgroundColor: BORDER, marginHorizontal: 14 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: GREEN, letterSpacing: 1.5 }}>SAME DAY LAST WEEK</Text>
          <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT, letterSpacing: -0.5, marginTop: 2 }}>
            {fmtAUD(lastWeekRevCents)}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: BLUE }} />
          <Text style={{ fontSize: 10, color: MUTED, fontWeight: '500' }}>Today</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: GREEN }} />
          <Text style={{ fontSize: 10, color: MUTED, fontWeight: '500' }}>Last Week</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 14 }}
        contentContainerStyle={{ paddingHorizontal: 4 }}
        onScroll={e => setScrollX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
      >
        <View style={{ width: SVG_W, height: SVG_H + 22, position: 'relative' }}>
          <Pressable
            onPress={() => setSelected(null)}
            style={{ position: 'absolute', left: 0, top: 0, width: SVG_W, height: SVG_H }}
          />
          <Svg width={SVG_W} height={SVG_H} pointerEvents="none">
            <Line x1={0} y1={PAD_TOP + CHART_H} x2={SVG_W} y2={PAD_TOP + CHART_H} stroke={BORDER} strokeWidth={1} />
            {Array.from({ length: NUM_HOURS }, (_, i) => {
              const h          = HOUR_START + i;
              const rev        = revMap[h] ?? 0;
              const lw         = lwMap[h]  ?? 0;
              const isCurrent  = h === nowHour;
              const isPast     = h < nowHour;
              const isFuture   = !isCurrent && !isPast;
              const xRev       = GROUP_GAP / 2 + i * GROUP_W;
              const xLW        = xRev + BAR_W + BAR_GAP;
              const revH       = rev > 0 ? Math.max((rev / maxBar) * CHART_H, 4) : isFuture ? 4 : 0;
              const lwH        = lw  > 0 ? Math.max((lw  / maxBar) * CHART_H, 4) : isFuture ? 4 : 0;
              const revOp      = isCurrent ? 1 : isPast ? 0.85 : 0.15;
              const lwOp       = isCurrent ? 1 : isPast ? 0.85 : 0.15;
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
                  {lwH > 0 && (
                    <Rect x={xLW} y={PAD_TOP + CHART_H - lwH} width={BAR_W} height={lwH} rx={3} fill={GREEN} opacity={lwOp} />
                  )}
                </React.Fragment>
              );
            })}
          </Svg>

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
          <Text style={{
            position: 'absolute',
            left: GROUP_GAP / 2 + NUM_HOURS * GROUP_W - 10,
            top: SVG_H + 3,
            width: 20, textAlign: 'center',
            fontSize: 8, color: MUTED,
          }}>
            12A
          </Text>
        </View>
      </ScrollView>

      {selected !== null && (() => {
        const h   = HOUR_START + selected;
        const rev = revMap[h] ?? 0;
        const lw  = lwMap[h]  ?? 0;
        return (
          <Pressable
            onPress={() => {/* consume touch */}}
            style={{
              position: 'absolute', left: calloutLeft, top: CALLOUT_TOP,
              width: CALLOUT_W, backgroundColor: TEXT, borderRadius: 10,
              padding: 9, gap: 5,
              shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.28, shadowRadius: 8, elevation: 9, zIndex: 10,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.4 }}>
              {hrFull(h)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: BLUE }} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{fmtAUD(rev)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: GREEN }} />
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{fmtAUD(lw)} last wk</Text>
            </View>
          </Pressable>
        );
      })()}
    </Pressable>
  );
}
