import React from 'react';
import { Text } from 'react-native';
import { GREEN, MUTED, RED } from './directorColors';

export default function DeltaBadge({ pct, dark }: { pct: number | null | undefined; dark?: boolean }) {
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
