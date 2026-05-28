import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type TabCfg = { icon: string; title: string };

const WHITE   = '#FFFFFF';
const MUTED   = '#9CA3AF';
const ICON_SZ = 20;
const BASE_W  = 50;   // collapsed width  — centres a 20px icon  (50-20)/2 = 15px each side
const PILL_H  = 52;   // inner pill height

// Calculates expanded width from label length so "Home" feels tight and "Dashboard" has room
function expandedWidth(title: string): number {
  return Math.min(Math.max(90, Math.round(title.length * 8.2 + 66)), 148);
}

// ── Animated tab item ──────────────────────────────────────────────────────────
// Renders a pill that springs open (showing icon + label) when focused,
// and shrinks back to a tight icon-only capsule when unfocused.
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

  useEffect(() => {
    Animated.spring(anim, {
      toValue:          focused ? 1 : 0,
      tension:          75,
      friction:         12,
      useNativeDriver:  false,
    }).start();
  }, [focused]);

  const animWidth   = anim.interpolate({ inputRange: [0, 1], outputRange: [BASE_W, EXP_W] });
  const animBg      = anim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', activeColor] });
  const labelOpacity = anim.interpolate({ inputRange: [0, 0.52, 1], outputRange: [0, 0, 1] });

  return (
    <Pressable onPress={onPress} style={ts.touch}>
      <Animated.View
        style={[
          ts.pill,
          { width: animWidth, backgroundColor: animBg },
        ]}
      >
        {/* Icon — always centered at BASE_W due to paddingHorizontal: 15 */}
        <View style={ts.iconWrap}>
          <Feather name={cfg.icon as any} size={ICON_SZ} color={focused ? WHITE : MUTED} />
          {/* Cart / notification badge */}
          {badgeCount != null && badgeCount > 0 && (
            <View style={ts.badge}>
              <Text style={ts.badgeText}>{badgeCount > 99 ? '99+' : String(badgeCount)}</Text>
            </View>
          )}
        </View>

        {/* Label — fades in as pill expands, clipped by overflow:hidden */}
        <Animated.Text
          style={[ts.label, { opacity: labelOpacity }]}
          numberOfLines={1}
        >
          {cfg.title}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Glass pill wrapper ─────────────────────────────────────────────────────────
// On iOS: BlurView + white overlay = frosted glass capsule with shadow.
// On Android / web: solid white capsule.
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
            intensity={90}
            tint="systemChromeMaterial"
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: useBlur ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.97)' },
          ]}
        />
        <View style={gp.row}>{children}</View>
      </View>
    </View>
  );
}

// ── Glass circle (account / profile button) ────────────────────────────────────
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
            intensity={90}
            tint="systemChromeMaterial"
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: useBlur ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.97)' },
          ]}
        />
        <View style={[gc.content, { width: size, height: size }]}>{children}</View>
      </View>
    </View>
  );
}

// ── Floating tab bar (staff / manager) ────────────────────────────────────────
// Drop-in replacement for the default Expo Router tab bar in staff / manager portals.
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

  const visibleRoutes = state.routes.filter((r: any) =>
    visibleRouteNames.includes(r.name),
  );

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
  shadowOpacity: 0.13,
  shadowRadius:  22,
  elevation:     12,
} as const;

const ts = StyleSheet.create({
  touch: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
  },
  pill: {
    height:            PILL_H,
    borderRadius:      999,
    overflow:          'hidden',
    flexDirection:     'row',
    alignItems:        'center',
    // paddingHorizontal: 15 centres the 20px icon exactly in BASE_W=50
    paddingHorizontal: 15,
    gap:               7,
  },
  iconWrap: {
    position:       'relative',
    alignItems:     'center',
    justifyContent: 'center',
    width:          ICON_SZ,
    height:         ICON_SZ,
  },
  label: {
    color:        WHITE,
    fontSize:     13,
    fontWeight:   '700',
    letterSpacing: -0.3,
  },
  badge: {
    position:         'absolute',
    top:              -5,
    right:            -8,
    minWidth:         16,
    height:           16,
    borderRadius:     8,
    backgroundColor:  '#FF3B30',
    alignItems:       'center',
    justifyContent:   'center',
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
  },
  clip: {
    borderRadius: 999,
    overflow:     'hidden',
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical:   10,
    paddingHorizontal: 10,
  },
});

const gc = StyleSheet.create({
  shadow: {
    ...SHADOW,
  },
  clip: {
    overflow: 'hidden',
  },
  content: {
    alignItems:     'center',
    justifyContent: 'center',
  },
});

const ft = StyleSheet.create({
  wrap: {
    position:        'absolute',
    left:            0,
    right:           0,
    bottom:          0,
    paddingHorizontal: 20,
  },
});
