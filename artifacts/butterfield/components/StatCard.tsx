import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  gradient?: [string, string];
  dark?: boolean;
}

export function StatCard({ label, value, subtitle, gradient, dark }: StatCardProps) {
  const colors = useColors();

  if (gradient) {
    return (
      <LinearGradient
        colors={gradient}
        style={[styles.card, { borderRadius: colors.radius }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.gradientLabel}>{label}</Text>
        <Text style={styles.gradientValue}>{value}</Text>
        {subtitle && <Text style={styles.gradientSubtitle}>{subtitle}</Text>}
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: dark ? colors.accent : colors.card,
          borderRadius: colors.radius,
          shadowColor: colors.accent,
        },
      ]}
    >
      <Text style={[styles.label, { color: dark ? 'rgba(255,255,255,0.7)' : colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.value, { color: dark ? '#fff' : colors.foreground, fontFamily: 'Inter_700Bold' }]}>
        {value}
      </Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: dark ? 'rgba(255,255,255,0.6)' : colors.mutedForeground }]}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 16,
    gap: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  label: {
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: 'Inter_500Medium',
  },
  value: {
    fontSize: 26,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  gradientLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: 'Inter_500Medium',
  },
  gradientValue: {
    fontSize: 26,
    color: '#fff',
    fontFamily: 'Inter_700Bold',
  },
  gradientSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
});
