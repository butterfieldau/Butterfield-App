import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export function AppBackground({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[s.root, style]}>
      <View style={[StyleSheet.absoluteFillObject, s.base]} />
      <LinearGradient
        colors={['rgba(255,175,145,0.42)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.72 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(155,185,252,0.48)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 0.72 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  base: { backgroundColor: '#EDF2FF' },
});
