import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getPalette } from '@/constants/categoryColors';
import type { ApiProduct } from '@/lib/api';
import { getProductCategory, getProductPriceCents } from '@/lib/productPairings';

interface SuggestionTileProps {
  product: ApiProduct;
  onPress: () => void;
}

export default function SuggestionTile({ product, onPress }: SuggestionTileProps) {
  const category = getProductCategory(product);
  const palette  = getPalette(category);
  const cents    = getProductPriceCents(product);
  const imageUrl = product.images?.[0] ?? null;

  return (
    <Pressable
      style={s.tile}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={[s.imgWrap, { backgroundColor: imageUrl ? '#F0EDE8' : palette.bg }]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={s.img}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <Text style={s.emoji}>{palette.emoji}</Text>
        )}
      </View>
      <View style={s.info}>
        <Text style={s.name} numberOfLines={1}>{product.name}</Text>
        {cents > 0 && (
          <Text style={s.price}>${(cents / 100).toFixed(2)}</Text>
        )}
      </View>
      <View style={s.plusBtn}>
        <Feather name="plus" size={14} color="#fff" />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tile: {
    width: 120,
    borderRadius: 16,
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F5',
  },
  imgWrap: {
    width: '100%',
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  emoji: {
    fontSize: 38,
  },
  info: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 2,
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1C1C1E',
    lineHeight: 16,
  },
  price: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1493FF',
  },
  plusBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D0312D',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
