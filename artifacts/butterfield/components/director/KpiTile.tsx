import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { kpi } from './dashboardStyles';
import { MUTED, TEXT } from './directorColors';

export default function KpiTile({ icon, label, value, color, alert, onPress, helper }: {
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
