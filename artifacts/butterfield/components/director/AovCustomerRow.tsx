import React from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CARD, BORDER, BLUE, AMBER, TEAL, TEXT, MUTED, GLASS_SHADOW } from './directorColors';
import DeltaBadge from './DeltaBadge';
import Sparkline from './Sparkline';
import { fmtAUD } from './dashboardHelpers';

export default function AovCustomerRow({
  aovCents, aovDelta, newCust, returningCust, totalSessions,
  aovSparkline, sessionsSparkline,
}: {
  aovCents: number; aovDelta: number | null | undefined;
  newCust: number; returningCust: number; totalSessions: number;
  aovSparkline?: number[];
  sessionsSparkline?: number[];
}) {
  const total  = newCust + returningCust;
  const newPct = total > 0 ? Math.round((newCust / total) * 100) : 0;
  const dayLabel = new Intl.DateTimeFormat('en-AU', { weekday: 'short' }).format(new Date(Date.now() - 7 * 86400000));

  const cardStyle = {
    flex: 1, backgroundColor: CARD, borderRadius: 18, borderWidth: 1,
    borderColor: BORDER, padding: 14, gap: 4,
    ...GLASS_SHADOW,
  };

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {/* ── AVG ORDER ── */}
      <View style={cardStyle}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: BLUE, letterSpacing: 1.5 }}>AVG ORDER</Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT, letterSpacing: -0.5 }}>{fmtAUD(aovCents)}</Text>
        {aovSparkline && aovSparkline.length >= 2 && (
          <View style={{ marginVertical: 2 }}>
            <Sparkline data={aovSparkline} color={BLUE} width={78} height={26} />
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <DeltaBadge pct={aovDelta} />
          <Text style={{ fontSize: 9, fontWeight: '400', color: MUTED }}>vs last {dayLabel}</Text>
        </View>
      </View>

      {/* ── CUSTOMERS ── */}
      <View style={cardStyle}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: AMBER, letterSpacing: 1.5 }}>CUSTOMERS</Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT, letterSpacing: -0.5 }}>{total}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <Text style={{ fontSize: 9, fontWeight: '600', color: BLUE }}>{newCust} NEW</Text>
          <Text style={{ fontSize: 9, color: MUTED }}>·</Text>
          <Text style={{ fontSize: 9, fontWeight: '600', color: AMBER }}>{returningCust} RETURN</Text>
        </View>
        {total > 0 && (
          <View style={{ flexDirection: 'row', height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: BORDER, marginTop: 4 }}>
            <View style={{ width: `${newPct}%` as any, height: '100%', backgroundColor: BLUE }} />
          </View>
        )}
      </View>

      {/* ── SESSIONS ── */}
      <View style={cardStyle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: `${TEAL}18`, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="activity" size={11} color={TEAL} />
          </View>
          <Text style={{ fontSize: 9, fontWeight: '700', color: MUTED, letterSpacing: 0.4 }}>SESSIONS</Text>
        </View>
        <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT }}>{totalSessions}</Text>
        {sessionsSparkline && sessionsSparkline.length >= 2 && (
          <View style={{ marginVertical: 2 }}>
            <Sparkline data={sessionsSparkline} color={TEAL} width={78} height={26} />
          </View>
        )}
        <Text style={{ fontSize: 9, color: MUTED, fontWeight: '400' }}>today</Text>
      </View>
    </View>
  );
}
