import React, { useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { ApiProduct } from '@/lib/api';
import { PRODUCT_IMAGES } from '@/components/ProductTile';

const BLUE   = '#40C0F2';
const CHERRY = '#D20001';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

export interface CookieSelection {
  quantity: number;
  surchargeCents: number;
  name: string;
}

interface CookieTileProps {
  product: ApiProduct;
  qty: number;
  onIncrement: () => void;
  onDecrement: () => void;
  tileWidth: number;
}

function CookieTile({ product, qty, onIncrement, onDecrement, tileWidth }: CookieTileProps) {
  const surchargeCents = (product as any).buildABoxSurchargeCents ?? 0;
  const imageUri = product.images?.[0] ?? PRODUCT_IMAGES[product.name];
  const scaleAnim = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scaleAnim.value }] }));

  const handlePress = (dir: 'inc' | 'dec') => {
    scaleAnim.value = withTiming(0.93, { duration: 60 }, () => {
      scaleAnim.value = withTiming(1, { duration: 100 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (dir === 'inc') onIncrement(); else onDecrement();
  };

  return (
    <Reanimated.View style={[s.tile, { width: tileWidth }, animStyle, qty > 0 && s.tileSelected]}>
      <View style={s.imageWrap}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={s.image} contentFit="cover" transition={200} />
        ) : (
          <View style={[s.image, { backgroundColor: '#F2F2F7', borderRadius: 12 }]} />
        )}
        {surchargeCents > 0 && (
          <View style={s.surchargeBadge}>
            <Text style={s.surchargeBadgeText}>+${(surchargeCents / 100).toFixed(2)}</Text>
          </View>
        )}
        {qty > 0 && (
          <View style={s.qtyBubble}>
            <Text style={s.qtyBubbleText}>{qty}</Text>
          </View>
        )}
      </View>

      <Text style={s.tileName} numberOfLines={2}>{product.name}</Text>

      <View style={s.stepperRow}>
        <Pressable
          onPress={() => handlePress('dec')}
          style={[s.stepBtn, qty === 0 && s.stepBtnDisabled]}
          disabled={qty === 0}
          hitSlop={6}
        >
          <Text style={[s.stepBtnText, qty === 0 && { color: MUTED }]}>−</Text>
        </Pressable>
        <Text style={s.stepQty}>{qty}</Text>
        <Pressable onPress={() => handlePress('inc')} style={s.stepBtn} hitSlop={6}>
          <Text style={s.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </Reanimated.View>
  );
}

interface Props {
  cookies: ApiProduct[];
  selections: Map<string, CookieSelection>;
  boxSize: number;
  onIncrement: (product: ApiProduct) => void;
  onDecrement: (productId: string) => void;
  numColumns?: number;
}

export default function CookiePicker({
  cookies, selections, boxSize, onIncrement, onDecrement, numColumns = 2,
}: Props) {
  const [gridWidth, setGridWidth] = useState(0);

  // Compute tile width in pixels so it works correctly for any numColumns value
  const tileWidth = gridWidth > 0
    ? Math.floor((gridWidth - TILE_PAD * 2 - TILE_GAP * (numColumns - 1)) / numColumns)
    : 0;

  return (
    <View style={s.root}>
      <View style={s.subHeader}>
        <Text style={s.subHeading}>Fill your box</Text>
        <Text style={s.subCount}>{boxSize} cookies total</Text>
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.grid}
        onLayout={e => setGridWidth(e.nativeEvent.layout.width)}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {tileWidth > 0 && cookies.map(product => (
          <CookieTile
            key={product.id}
            product={product}
            qty={selections.get(product.id)?.quantity ?? 0}
            onIncrement={() => onIncrement(product)}
            onDecrement={() => onDecrement(product.id)}
            tileWidth={tileWidth}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const TILE_GAP = 10;
const TILE_PAD = 14;

const s = StyleSheet.create({
  root:       { flex: 1 },
  subHeader:  {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: TILE_PAD + 2, paddingTop: 14, paddingBottom: 10,
  },
  subHeading: { fontSize: 17, fontWeight: '700', color: TEXT },
  subCount:   { fontSize: 13, color: MUTED, fontWeight: '500' },

  scroll:     { flex: 1 },
  grid:       {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: TILE_PAD, paddingBottom: 16,
    gap: TILE_GAP,
  },

  tile:         {
    backgroundColor: '#fff',
    borderRadius: 14, padding: 10,
    borderWidth: 1.5, borderColor: BORDER,
    alignItems: 'center', gap: 7,
  },
  tileSelected: { borderColor: BLUE, backgroundColor: '#EBF7FD' },

  imageWrap:  { width: '100%', aspectRatio: 1, position: 'relative' },
  image:      { width: '100%', height: '100%', borderRadius: 10 },

  surchargeBadge: {
    position: 'absolute', top: 5, right: 5,
    backgroundColor: CHERRY, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 2,
  },
  surchargeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  qtyBubble:  {
    position: 'absolute', bottom: 5, left: 5,
    backgroundColor: BLUE, borderRadius: 9, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBubbleText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  tileName:   { fontSize: 11, fontWeight: '600', color: TEXT, textAlign: 'center', lineHeight: 15, height: 30 },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn:    {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: CHERRY, alignItems: 'center', justifyContent: 'center',
  },
  stepBtnDisabled: { backgroundColor: '#E5E7EB' },
  stepBtnText:     { color: '#fff', fontSize: 17, fontWeight: '700', lineHeight: 21 },
  stepQty:         { fontSize: 14, fontWeight: '700', color: TEXT, minWidth: 18, textAlign: 'center' },
});
