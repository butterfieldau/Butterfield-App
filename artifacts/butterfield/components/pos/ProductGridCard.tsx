import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { ActivityIndicator, TouchableOpacity, Text, View } from 'react-native';
import styles from './posStyles';
import { BLUE, fmtCents } from './types';

export default function ProductGridCard({
  product, onPress, loading, isWide, itemWidth,
}: {
  product: any; onPress: () => void; loading: boolean; isWide: boolean; itemWidth?: number;
}) {
  void isWide;
  const basePriceCents = product.salePriceCents ?? product.priceCents ?? 0;
  const imgUrl = product.images?.[0] ?? null;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.productCard, itemWidth ? { width: itemWidth } : { flex: 1 }]}
      activeOpacity={0.75}
    >
      {imgUrl ? (
        <ExpoImage source={{ uri: imgUrl }} style={styles.productCardImage} contentFit="cover" cachePolicy="disk" />
      ) : (
        <View style={[styles.productCardImage, { backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' }]}>
          <Feather name="package" size={28} color={BLUE} />
        </View>
      )}
      <View style={styles.productCardBody}>
        <Text style={styles.productCardName} numberOfLines={2}>{product.name}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <Text style={styles.productCardPrice}>{fmtCents(basePriceCents)}</Text>
          {product.hasVariants && (
            <View style={styles.variantBadge}>
              <Text style={styles.variantBadgeText}>options</Text>
            </View>
          )}
        </View>
      </View>
      {loading && (
        <View style={styles.productCardOverlay}>
          <ActivityIndicator color={BLUE} size="small" />
        </View>
      )}
    </TouchableOpacity>
  );
}
