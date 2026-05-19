import { GlassView, GlassContainer, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, View, type ViewStyle } from 'react-native';

type GlassTabPillProps = {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  tintColor?: string;
  colorScheme?: 'auto' | 'light' | 'dark';
  fallbackBg?: string;
};

/**
 * Renders a liquid-glass pill on iOS 26+ (UIGlassEffect via expo-glass-effect),
 * falls back to BlurView on older iOS, and a solid view on Android / web.
 */
export function GlassTabPill({
  children,
  style,
  tintColor,
  colorScheme = 'light',
  fallbackBg = 'rgba(255,255,255,0.92)',
}: GlassTabPillProps) {
  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        style={style as ViewStyle}
        tintColor={tintColor}
        isInteractive={true}
        colorScheme={colorScheme}
        glassEffectStyle="regular"
      >
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <BlurView
        intensity={72}
        tint={colorScheme === 'dark' ? 'dark' : 'light'}
        style={[style as ViewStyle, { overflow: 'hidden' }]}
      >
        {children}
      </BlurView>
    );
  }

  return (
    <View style={[style as ViewStyle, { backgroundColor: fallbackBg }]}>
      {children}
    </View>
  );
}

type GlassTabContainerProps = {
  children: React.ReactNode;
  spacing?: number;
  style?: ViewStyle;
};

/**
 * On iOS 26+ wraps children in a GlassContainer so adjacent GlassTabPill
 * elements merge together (the "liquid" pull effect). Falls back to a plain
 * View on everything else.
 */
export function GlassTabContainer({ children, spacing = 12, style }: GlassTabContainerProps) {
  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
    return (
      <GlassContainer spacing={spacing} style={style}>
        {children}
      </GlassContainer>
    );
  }
  return <View style={style}>{children}</View>;
}
