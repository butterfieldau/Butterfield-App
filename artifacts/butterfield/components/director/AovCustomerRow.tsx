import React from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CARD, BORDER, BLUE, AMBER, TEAL, TEXT, MUTED, GLASS_SHADOW } from './directorColors';
import DeltaBadge from './DeltaBadge';
import { fmtAUD } from './dashboardHelpers';

export default function AovCustomerRow({
  aovCents, aovDelta, newCust, returningCust, totalSessions,
}: {
  aovCents: number; aovDelta: number | null | undefined;
  newCust: number; returningCust: number; totalSessions: number;
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
      <View style={cardStyle}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: BLUE, letterSpacing: 1.5 }}>AVG ORDER</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: TEXT, letterSpacing: -0.5 }}>{fmtAUD(aovCents)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <DeltaBadge pct={aovDelta} />
          <Text style={{ fontSize: 9, fontWeight: '400', color: MUTED }}>vs last {dayLabel}</Text>
        </View>
      </View>
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
            <View style={{ width: `${newPct}%` as any, height: '100%', backgroundColor: BLUE }} />
          </View>
        )}
      </View>
      <View style={cardStyle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: `${TEAL}18`, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="activity" size={13} color={TEAL} />
          </View>
          <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.4 }}>SESSIONS</Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>{totalSessions}</Text>
        <Text style={{ fontSize: 11, color: MUTED, fontWeight: '400', marginTop: 1 }}>today</Text>
      </View>
    </View>
  );
}
