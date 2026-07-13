import React, { type ReactNode } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayoutHandledSafeArea } from '@/context/LayoutSafeAreaContext';
import { useFocusStatusBar } from '@/hooks/useScrollStatusBar';

const HEADER_BG  = '#F2F2F7';
const CONTENT_BG = '#F2F2F7';
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
  /** Optional overrides — leave unset to keep the default light Director theme. */
  headerBackgroundColor?: string;
  titleColor?: string;
  subtitleColor?: string;
  statusBarStyle?: 'dark-content' | 'light-content';
  /** Hide the nav header row (title bar). Safe-area fill is still rendered. */
  hideHeader?: boolean;
}

export function DirectorTabScreen({
  title,
  subtitle,
  headerRight,
  headerBottom,
  children,
  backgroundColor = CONTENT_BG,
  headerBackgroundColor = HEADER_BG,
  titleColor = NAVY,
  subtitleColor = MUTED,
  statusBarStyle = 'dark-content',
  hideHeader = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const layoutHandledSA = useLayoutHandledSafeArea();
  useFocusStatusBar(statusBarStyle);

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <StatusBar barStyle={statusBarStyle} translucent backgroundColor="transparent" />

      {/* Fills the status-bar height — skipped when the layout wrapper already did it */}
      {!layoutHandledSA && (
        <View style={{ height: insets.top, backgroundColor: headerBackgroundColor }} />
      )}

      {/* Three-column header row — hidden when hideHeader=true */}
      {!hideHeader && (
        <View style={[ss.header, { backgroundColor: headerBackgroundColor }]}>
          {/* Left side: flex:1 so it mirror-matches the right side width */}
          <View style={ss.sideLeft} />

          {/* Centre: title + optional subtitle */}
          <View style={ss.center}>
            <Text style={[ss.title, { color: titleColor }]} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={[ss.subtitle, { color: subtitleColor }]} numberOfLines={2}>{subtitle}</Text> : null}
          </View>

          {/* Right side: flex:1, content aligned to the trailing edge */}
          <View style={ss.sideRight}>
            {headerRight ?? null}
          </View>
        </View>
      )}

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
  sideRight: { flex: 1, alignItems: 'flex-end', minWidth: 0, flexShrink: 1 },
  center:    { alignItems: 'center', paddingHorizontal: 4, flexShrink: 1, minWidth: 0 },
  title:     { fontSize: 16, fontWeight: '700', color: NAVY },
  subtitle:  { fontSize: 11, color: MUTED, marginTop: 2, textAlign: 'center' },
});
