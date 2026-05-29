import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

export const INTERNAL_GLASS_BG = 'rgba(255,255,255,0.6)';
export const INTERNAL_GLASS_BORDER = 'rgba(255,255,255,0.85)';
export const INTERNAL_GLASS_RADIUS = 20;

type GlassCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function InternalGlassCard({ children, style }: GlassCardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: INTERNAL_GLASS_BG,
          borderRadius: INTERNAL_GLASS_RADIUS,
          borderWidth: 1,
          borderColor: INTERNAL_GLASS_BORDER,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 16,
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
