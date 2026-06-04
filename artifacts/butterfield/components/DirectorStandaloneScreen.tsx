import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { type ReactNode } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HEADER_BG  = '#FFFFFF';
const CONTENT_BG = '#EFF6FF';
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

      {/* Fills the status-bar height so the header row starts below the camera */}
      <View style={{ height: insets.top, backgroundColor: HEADER_BG }} />

      {/* Three-column header row — title is always screen-centred */}
      <View style={ss.header}>
        {/* Left side: back button, flex:1 mirrors the right side */}
        <View style={ss.sideLeft}>
          <Pressable onPress={handleBack} style={ss.backBtn} hitSlop={12}>
            <Feather name="arrow-left" size={20} color={NAVY} />
          </Pressable>
        </View>

        {/* Centre: title + optional subtitle */}
        <View style={ss.center}>
          <Text style={ss.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={ss.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>

        {/* Right side: flex:1, content aligned to the trailing edge */}
        <View style={ss.sideRight}>
          {headerRight ?? null}
        </View>
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: HEADER_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  sideLeft:  { flex: 1, alignItems: 'flex-start' },
  sideRight: { flex: 1, alignItems: 'flex-end' },
  center:    { alignItems: 'center', paddingHorizontal: 4 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 16, fontWeight: '700', color: NAVY },
  subtitle:  { fontSize: 11, color: MUTED, marginTop: 2, textAlign: 'center' },
});
