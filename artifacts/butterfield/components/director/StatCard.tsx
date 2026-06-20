import { Feather } from '@expo/vector-icons';
import React from 'react';
import { View, Text } from 'react-native';
import { s } from './reportStyles';
import { BLUE, TEXT } from './directorColors';

export default function StatCard({ label, value, sub, color, icon }: {
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
