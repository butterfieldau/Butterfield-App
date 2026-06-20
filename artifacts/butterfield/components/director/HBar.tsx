import React from 'react';
import { View } from 'react-native';
import { s } from './reportStyles';

export default function HBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 3;
  return (
    <View style={s.hBarTrack}>
      <View style={[s.hBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}
