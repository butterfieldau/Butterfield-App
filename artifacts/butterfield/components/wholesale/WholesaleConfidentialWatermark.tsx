import React, { useMemo } from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';

interface Props {
  businessName?: string;
  email?: string;
}

const LOGO = require('@/assets/images/logo-blue.png');
const { width: SW, height: SH } = Dimensions.get('window');

const CELL_W = 200;
const CELL_H = 120;
const ANGLE  = -22;

const COLS = Math.ceil(SW / CELL_W) + 2;
const ROWS = Math.ceil(SH / CELL_H) + 4;

export default function WholesaleConfidentialWatermark({ businessName, email }: Props) {
  const subLine = useMemo(() => {
    const parts: string[] = [];
    if (businessName) parts.push(businessName);
    if (email)        parts.push(email);
    return parts.join('  ·  ');
  }, [businessName, email]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.grid}>
        {Array.from({ length: ROWS }).map((_, r) =>
          Array.from({ length: COLS }).map((__, c) => (
            <View
              key={`${r}-${c}`}
              style={[
                styles.cell,
                {
                  top:  r * CELL_H - 80,
                  left: c * CELL_W - 40,
                  transform: [{ rotate: `${ANGLE}deg` }],
                },
              ]}
            >
              <Image source={LOGO} style={styles.logo} resizeMode="contain" />
              <Text style={styles.heading}>CONFIDENTIAL</Text>
              {!!subLine && (
                <Text style={styles.sub} numberOfLines={1}>{subLine}</Text>
              )}
            </View>
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
  cell: {
    position:   'absolute',
    alignItems: 'center',
    width:      CELL_W,
  },
  logo: {
    width:   28,
    height:  28,
    opacity: 0.06,
    marginBottom: 3,
  },
  heading: {
    fontSize:    10,
    fontWeight:  '700',
    color:       'rgba(0,0,0,0.07)',
    letterSpacing: 2.5,
  },
  sub: {
    fontSize:    7.5,
    fontWeight:  '400',
    color:       'rgba(0,0,0,0.05)',
    letterSpacing: 0.3,
    marginTop:   1,
    maxWidth:    CELL_W - 10,
  },
});
