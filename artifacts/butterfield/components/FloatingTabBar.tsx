import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type TabCfg = { icon: string; title: string };

const WHITE   = '#FFFFFF';
const MUTED   = '#111111';
const ICON_SZ = 20;
const BASE_W  = 44;   // collapsed width for inactive tab (just icon + tight padding)
const PILL_H  = 46;   // pill height

// Calculates expanded width — tight fit around icon (20) + gap (6) + label text
function expandedWidth(title: string): number {
  // icon(20) + gap(6) + paddingH(12+12) = 50px overhead; min 90 so short words (Home, Menu) always fit
  // 8.5px per char handles bold 13px labels like "Dashboard" without truncation
  return Math.min(Math.max(90, Math.round(title.length * 8.5 + 50)), 160);
}

// ── Animated tab item ──────────────────────────────────────────────────────────
// The outer Animated.View drives the layout width so siblings reposition.
// The pill inside matches that same width — no overflow is possible.
export function AnimatedTabItem({
  focused,
  onPress,
  cfg,
  activeColor,
  badgeCount,
}: {
  focused:     boolean;
  onPress:     () => void;
  cfg:         TabCfg;
  activeColor: string;
  badgeCount?: number;
}) {
  const anim  = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const EXP_W = expandedWidth(cfg.title);

  // Badge bounce — spring scale up then back when count increases
  const badgeScale   = useSharedValue(1);
  const prevCountRef = useRef<number>(badgeCount ?? 0);

  useEffect(() => {
    Animated.spring(anim, {
      toValue:         focused ? 1 : 0,
      tension:         80,
      friction:        13,
      useNativeDriver: false,
    }).start();
  }, [focused]);

  useEffect(() => {
    const prev = prevCountRef.current;
    const curr = badgeCount ?? 0;
    if (curr > prev) {
      badgeScale.value = withSequence(
        withTiming(1.22, { duration: 100 }),
        withTiming(1, { duration: 160 }),
      );
    }
    prevCountRef.current = curr;
  }, [badgeCount]);

  const badgeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  const animWidth    = anim.interpolate({ inputRange: [0, 1], outputRange: [BASE_W, EXP_W] });
  const animBg       = anim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', activeColor] });
  const labelOpacity = anim.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] });

  return (
    // Outer wrapper: drives layout — siblings shift as this grows/shrinks
    <Animated.View style={{ width: animWidth, height: PILL_H, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable
        onPress={onPress}
        style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Pill: same width as outer — can never overflow */}
        <Animated.View style={[ts.pill, { width: animWidth, backgroundColor: animBg }]}>
          <View style={ts.iconWrap}>
            <Ionicons name={cfg.icon as any} size={ICON_SZ} color={focused ? WHITE : MUTED} />
            {badgeCount != null && badgeCount > 0 && (
              <Reanimated.View style={[ts.badge, badgeAnimStyle]}>
                <Text style={ts.badgeText}>{badgeCount > 99 ? '99+' : String(badgeCount)}</Text>
              </Reanimated.View>
            )}
          </View>
          <Animated.Text style={[ts.label, { opacity: labelOpacity }]} numberOfLines={1}>
            {cfg.title}
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ── Glass pill wrapper ─────────────────────────────────────────────────────────
export function GlassPill({
  children,
  style,
}: {
  children: React.ReactNode;
  style?:   object;
}) {
  const useBlur = Platform.OS === 'ios';
  return (
    <View style={[gp.shadow, style]}>
      <View style={gp.clip}>
        {useBlur && (
          <BlurView
            intensity={80}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: useBlur ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.97)' },
          ]}
        />
        {/* Row: no flex-stretch, gap so icons sit snugly */}
        <View style={gp.row}>{children}</View>
      </View>
    </View>
  );
}

// ── Glass circle (profile button) ──────────────────────────────────────────────
export function GlassCircle({
  children,
  size = 64,
}: {
  children: React.ReactNode;
  size?:    number;
}) {
  const useBlur = Platform.OS === 'ios';
  return (
    <View style={[gc.shadow, { borderRadius: size / 2 }]}>
      <View style={[gc.clip, { width: size, height: size, borderRadius: size / 2 }]}>
        {useBlur && (
          <BlurView
            intensity={80}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: useBlur ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.97)' },
          ]}
        />
        <View style={[gc.content, { width: size, height: size }]}>{children}</View>
      </View>
    </View>
  );
}

// ── Floating tab bar (staff / manager) ────────────────────────────────────────
export function FloatingInternalTabBar({
  state,
  navigation,
  visibleRouteNames,
  tabConfig,
  activeColor = '#1493FF',
}: {
  state:              any;
  navigation:         any;
  visibleRouteNames:  string[];
  tabConfig:          Record<string, TabCfg>;
  activeColor?:       string;
}) {
  const insets = useSafeAreaInsets();

  const visibleRoutes = visibleRouteNames
    .map((name) => state.routes.find((r: any) => r.name === name))
    .filter(Boolean);

  return (
    <View
      pointerEvents="box-none"
      style={[ft.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <GlassPill>
        {visibleRoutes.map((route: any) => {
          const routeIndex = state.routes.findIndex((r: any) => r.key === route.key);
          const focused    = state.index === routeIndex;
          const cfg        = tabConfig[route.name] ?? { icon: 'circle', title: route.name };

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress', target: route.key, canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              Haptics.selectionAsync();
              navigation.navigate(route.name);
            }
          };

          return (
            <AnimatedTabItem
              key={route.key}
              focused={focused}
              onPress={onPress}
              cfg={cfg}
              activeColor={activeColor}
            />
          );
        })}
      </GlassPill>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const SHADOW = {
  shadowColor:   '#000',
  shadowOffset:  { width: 0, height: 6 },
  shadowOpacity: 0.12,
  shadowRadius:  20,
  elevation:     10,
} as const;

const ts = StyleSheet.create({
  pill: {
    height:            PILL_H,
    borderRadius:      999,
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 12,
    gap:               6,
  },
  iconWrap: {
    position:       'relative',
    alignItems:     'center',
    justifyContent: 'center',
    width:          ICON_SZ,
    height:         ICON_SZ,
  },
  label: {
    color:         WHITE,
    fontSize:      13,
    fontWeight:    '700',
    letterSpacing: -0.2,
    flexShrink:    1,
  },
  badge: {
    position:          'absolute',
    top:               -5,
    right:             -8,
    minWidth:          16,
    height:            16,
    borderRadius:      8,
    backgroundColor:   '#FF3B30',
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color:      WHITE,
    fontSize:   9,
    fontWeight: '700',
    lineHeight: 12,
  },
});

const gp = StyleSheet.create({
  shadow: {
    ...SHADOW,
    borderRadius: 999,
    alignSelf:    'center',
  },
  clip: {
    borderRadius: 999,
    overflow:     'hidden',
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   8,
    paddingHorizontal: 8,
    gap:               4,
  },
});

const gc = StyleSheet.create({
  shadow: { ...SHADOW },
  clip:   { overflow: 'hidden' },
  content: {
    alignItems:     'center',
    justifyContent: 'center',
  },
});

const ft = StyleSheet.create({
  wrap: {
    position:          'absolute',
    left:              0,
    right:             0,
    bottom:            0,
    paddingHorizontal: 24,
    alignItems:        'center',
  },
});
