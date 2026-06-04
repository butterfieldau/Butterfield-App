import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { type ReactNode } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HEADER_BG  = '#FFFFFF';
const CONTENT_BG = '#F8F9FB';
const BORDER     = '#E5E7EB';
const NAVY       = '#1A2B4A';
const MUTED      = '#6B7280';

interface Props {
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  headerBottom?: ReactNode;
  children: ReactNode;
  backgroundColor?: string;
  onBack?: () => void;
}

export function DirectorStandaloneScreen({
  title,
  subtitle,
  headerRight,
  headerBottom,
  children,
  backgroundColor = CONTENT_BG,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    Haptics.selectionAsync();
    if (onBack) { onBack(); return; }
    if (router.canGoBack()) { router.back(); return; }
    router.navigate('/(director)/more' as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <StatusBar barStyle="dark-content" />

      {/* ── Nav bar ── */}
      <View style={[ss.header, { paddingTop: insets.top + 6 }]}>
        {/* Title: absolutely centred so button widths don't affect it */}
        <View style={ss.titleAbs} pointerEvents="none">
          <Text style={ss.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={ss.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>

        {/* Back arrow (left) */}
        <Pressable onPress={handleBack} style={ss.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </Pressable>

        {/* Spacer pushes right slot to the far right */}
        <View style={{ flex: 1 }} />

        {/* Right slot — unconstrained, naturally sized */}
        {headerRight ?? <View style={{ width: 36 }} />}
      </View>

      {/* Optional sub-header row (search bar, filter chips, etc.) */}
      {headerBottom ?? null}

      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const ss = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: HEADER_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  backBtn:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  titleAbs: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  title:    { fontSize: 16, fontWeight: '700', color: NAVY },
  subtitle: { fontSize: 11, color: MUTED, marginTop: 2, textAlign: 'center' },
});
