import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  businessName?: string;
  email?: string;
}

function formatDate() {
  return new Date().toLocaleDateString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
}

export default function WholesaleConfidentialWatermark({ businessName, email }: Props) {
  const line = useMemo(() => {
    const parts: string[] = [];
    if (businessName) parts.push(businessName);
    if (email)        parts.push(email);
    parts.push(formatDate());
    parts.push('Confidential Wholesale Pricing');
    return parts.join('  ·  ');
  }, [businessName, email]);

  const rows = Array.from({ length: 14 });
  const cols = Array.from({ length: 3 });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.grid}>
        {rows.map((_, r) =>
          cols.map((__, c) => (
            <Text
              key={`${r}-${c}`}
              style={[styles.mark, { marginTop: r * 80, marginLeft: c * 240 }]}
              numberOfLines={1}
            >
              {line}
            </Text>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  mark: {
    position: 'absolute',
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(0,0,0,0.055)',
    transform: [{ rotate: '-22deg' }],
    letterSpacing: 0.3,
    width: 360,
  },
});
