import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  interpolateColor,
} from 'react-native-reanimated';
import { getPalette } from '@/constants/categoryColors';
import { type ApiProduct } from '@/lib/api';

export const PRODUCT_IMAGES: Record<string, string> = {
  'Choc Chip Cookie':       'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_ChocChip_2880x2304_0fb8e9b6-eb1d-4afe-97f5-0fca062170a8.jpg?v=1764302334&width=600',
  'Pistachio Cookie':       'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Pistachio_2880x2304_22fcddc2-bd6f-48b2-b5c0-cfe6528a14b5.jpg?v=1764302160&width=600',
  'Biscoff':                'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Biscoff_2880x2304_c0c0d24b-bd23-4dbf-b563-82b0d49eeb65.jpg?v=1764302195&width=600',
  'M&Ms Cookie':            'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldCookies_MAndMs.jpg?v=1764302008&width=600',
  'Red Velvet Cookie':      'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_RedValvet_2880x2304_1af322bc-b56c-4635-8477-309d188fe6dd.jpg?v=1764302309&width=600',
  'Almond Croissant Cookie':'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldCookies_AlmondCroissantCookie_2880x2304_ad98ea84-f045-47a1-8af7-e6b6e79fa74d.jpg?v=1771549363&width=600',
  'Bueno Cookie':           'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Bueno_2880x2304_3b3d438c-63c9-41ae-82bc-92da907cf7ce.jpg?v=1764301910&width=600',
};

interface Props {
  product: ApiProduct;
  onPress: () => void;
  onAddToCart?: () => void;
}

const ADD_BLUE       = '#1493FF';
const ADD_BLUE_FLASH = '#5BB8FF';

export default function ProductTile({ product, onPress, onAddToCart }: Props) {
  const raw       = product as any;
  const priceCents = raw.priceCents ?? product.prices?.[0]?.unit_amount ?? 0;
  const saleCents  = raw.salePriceCents;
  const display    = (saleCents ?? priceCents) / 100;
  const was        = saleCents ? priceCents / 100 : null;
  const palette    = getPalette(product.metadata?.category);
  const available  = product.metadata?.available !== 'false';
  const isSoldOut  = !available || raw.isSoldOut;
  const isNew      = product.metadata?.isNew === 'true';
  const isLimited  = product.metadata?.isLimitedDrop === 'true' || raw.isLimitedDrop;
  const imageUrl   = product.images?.[0] ?? PRODUCT_IMAGES[product.name] ?? null;
  const shortDesc  = raw.shortDescription || (palette.emoji + ' ' + (product.metadata?.category ?? 'treat'));

  // ── Add button animation ──────────────────────────────────────────────
  const addScale   = useSharedValue(1);
  const flashProg  = useSharedValue(0);

  const addBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: addScale.value }],
    backgroundColor: interpolateColor(flashProg.value, [0, 1], [ADD_BLUE, ADD_BLUE_FLASH]),
  }));

  const handleAddPress = () => {
    if (isSoldOut) return;
    // Out then in, pure timing — zero oscillation, exactly one cycle
    addScale.value = withSequence(
      withTiming(1.2, { duration: 80 }),
      withTiming(1, { duration: 130 }),
    );
    // Flash colour: quick flash to lighter cherry then back
    flashProg.value = withTiming(1, { duration: 80 }, () => {
      flashProg.value = withTiming(0, { duration: 200 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onAddToCart) onAddToCart();
    else onPress();
  };

  return (
    <Pressable
      onPress={() => {
        if (!isSoldOut) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }
      }}
      style={[s.tile, { opacity: isSoldOut ? 0.65 : 1 }]}
    >
      <View style={[s.imageArea, { backgroundColor: imageUrl ? '#F4F1EC' : palette.bg }]}>
        {imageUrl
          ? <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
          : <Text style={s.emoji}>{palette.emoji}</Text>
        }
        {(isNew || isLimited) && (
          <View style={s.badgeRow}>
            {isNew     && <View style={[s.badge, { backgroundColor: '#1C1C1E' }]}><Text style={[s.badgeText, { fontWeight: '700' }]}>NEW</Text></View>}
            {isLimited && <View style={[s.badge, { backgroundColor: '#F40009' }]}><Text style={[s.badgeText, { fontWeight: '700' }]}>LIMITED</Text></View>}
          </View>
        )}
        {isSoldOut && (
          <View style={s.soldOut}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Sold Out</Text>
          </View>
        )}
      </View>

      <View style={s.info}>
        <Text style={[s.name, { fontWeight: '700' }]} numberOfLines={1}>{product.name}</Text>
        <Text style={[s.desc, { fontWeight: '400' }]} numberOfLines={1}>{shortDesc}</Text>
        <View style={s.priceRow}>
          <Text style={[s.price, { fontWeight: '700' }]}>
            {was
              ? <Text style={{ textDecorationLine: 'line-through', color: '#BBB', fontSize: 10, fontWeight: '400' }}>${was.toFixed(2)} </Text>
              : null}
            ${display.toFixed(2)}
          </Text>
          <Reanimated.View style={[s.addBtn, addBtnAnimStyle]}>
            <Pressable
              onPress={(e) => { e.stopPropagation(); handleAddPress(); }}
              style={s.addBtnInner}
              hitSlop={6}
            >
              <Feather name="shopping-bag" size={13} color="#fff" />
            </Pressable>
          </Reanimated.View>
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tile: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  imageArea: {
    height: 165,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emoji:    { fontSize: 48, lineHeight: 60 },
  badgeRow: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 },
  badge:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText:{ color: '#fff', fontSize: 9 },
  soldOut:  { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center' },

  info:     { padding: 12, gap: 3, backgroundColor: '#fff' },
  name:     { fontSize: 14, color: '#1C1C1E' },
  desc:     { fontSize: 11, color: '#8E8E93', lineHeight: 15 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  price:    { fontSize: 16, color: '#1C1C1E' },
  addBtn:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addBtnInner: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
