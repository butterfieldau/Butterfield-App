import React from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

interface ShimmerBoxProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  shimmerProgress: SharedValue<number>;
}

function ShimmerBox({ width = '100%', height = 16, borderRadius = 8, style, shimmerProgress }: ShimmerBoxProps) {
  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmerProgress.value, [0, 1], [0.35, 0.75]),
  }));
  return (
    <Reanimated.View
      style={[{ width, height, borderRadius, backgroundColor: '#D1D5DB' }, animStyle, style]}
    />
  );
}

function ShimmerProductCard({ shimmerProgress }: { shimmerProgress: SharedValue<number> }) {
  return (
    <View style={s.tile}>
      <ShimmerBox width="100%" height={165} borderRadius={0} shimmerProgress={shimmerProgress} />
      <View style={s.info}>
        <ShimmerBox width="75%" height={13} borderRadius={5} shimmerProgress={shimmerProgress} />
        <ShimmerBox width="50%" height={11} borderRadius={5} shimmerProgress={shimmerProgress} />
        <View style={s.priceRow}>
          <ShimmerBox width={44} height={16} borderRadius={5} shimmerProgress={shimmerProgress} />
          <ShimmerBox width={36} height={36} borderRadius={18} shimmerProgress={shimmerProgress} />
        </View>
      </View>
    </View>
  );
}

const SHIMMER_COUNT = 6;

export function MenuShimmerGrid({
  shimmerProgress,
  numColumns,
  hPad,
}: {
  shimmerProgress: SharedValue<number>;
  numColumns: number;
  hPad: number;
}) {
  const pairs = Array.from({ length: Math.ceil(SHIMMER_COUNT / numColumns) });
  return (
    <View style={{ padding: hPad, gap: 14 }}>
      {pairs.map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
          {Array.from({ length: numColumns }).map((__, j) => (
            <View key={j} style={{ flex: 1 }}>
              <ShimmerProductCard shimmerProgress={shimmerProgress} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  tile:     { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  info:     { padding: 12, gap: 6, backgroundColor: '#fff' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
});
