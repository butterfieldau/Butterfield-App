import React, { type ReactNode } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayoutHandledSafeArea } from '@/context/LayoutSafeAreaContext';

const HEADER_BG  = '#EFF6FF';
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
}

export function DirectorTabScreen({
  title,
  subtitle,
  headerRight,
  headerBottom,
  children,
  backgroundColor = CONTENT_BG,
}: Props) {
  const insets = useSafeAreaInsets();
  const layoutHandledSA = useLayoutHandledSafeArea();

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <StatusBar barStyle="dark-content" />

      {/* Fills the status-bar height — skipped when the layout wrapper already did it */}
      {!layoutHandledSA && (
        <View style={{ height: insets.top, backgroundColor: HEADER_BG }} />
      )}

      {/* Three-column header row — title is always screen-centred */}
      <View style={ss.header}>
        {/* Left side: flex:1 so it mirror-matches the right side width */}
        <View style={ss.sideLeft} />

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

      {/* Optional sub-header row (chips, search bar, segment control…) */}
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
  },
  sideLeft:  { flex: 1, alignItems: 'flex-start' },
  sideRight: { flex: 1, alignItems: 'flex-end' },
  center:    { alignItems: 'center', paddingHorizontal: 4 },
  title:     { fontSize: 16, fontWeight: '700', color: NAVY },
  subtitle:  { fontSize: 11, color: MUTED, marginTop: 2, textAlign: 'center' },
});
