import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BG    = '#EFF6FF';
const BLUE  = '#1493FF';
const DARK  = '#1C1C1E';
const MUTED = '#8E8E93';

interface Props {
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  headerBottom?: ReactNode;
  children: ReactNode;
  backgroundColor?: string;
}

export function DirectorStandaloneScreen({
  title,
  subtitle,
  headerRight,
  headerBottom,
  children,
  backgroundColor = BG,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor }}>
      <View style={{ paddingTop: insets.top, backgroundColor }}>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={ss.backRow}
          hitSlop={12}
        >
          <Feather name="chevron-left" size={20} color={BLUE} />
          <Text style={ss.backText}>More</Text>
        </Pressable>
        <View style={ss.titleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={ss.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={ss.subtitle}>{subtitle}</Text> : null}
          </View>
          {headerRight ?? null}
        </View>
        {headerBottom ?? null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const ss = StyleSheet.create({
  backRow:  { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  backText: { fontSize: 15, fontWeight: '600', color: BLUE },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, gap: 12 },
  title:    { fontSize: 28, fontWeight: '700', color: DARK },
  subtitle: { fontSize: 13, color: MUTED, marginTop: 2 },
});
