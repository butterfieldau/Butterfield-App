import React, { type ReactNode } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
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

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <StatusBar barStyle="dark-content" />

      {/* ── White compact header ── */}
      <View style={[ss.header, { paddingTop: insets.top + 6 }]}>
        {/* Title: absolutely centred — unaffected by right slot width */}
        <View style={ss.titleAbs} pointerEvents="none">
          <Text style={ss.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={ss.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>

        {/* Left spacer balances right side so title stays centred */}
        {headerRight ? <View style={{ minWidth: 36 }} /> : null}
        <View style={{ flex: 1 }} />

        {/* Right slot — naturally sized */}
        {headerRight ?? null}
      </View>

      {/* Optional sub-header row (chips, search bar, etc.) */}
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
  titleAbs: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  title:    { fontSize: 16, fontWeight: '700', color: NAVY },
  subtitle: { fontSize: 11, color: MUTED, marginTop: 2, textAlign: 'center' },
});
