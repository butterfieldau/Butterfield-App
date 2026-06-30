import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import ProductGridCard from './ProductGridCard';
import styles from './posStyles';
import { BLUE } from './types';

const CHERRY = '#D20001';

type Category = { slug: string; name: string; color?: string | null };

function BuildABoxTile({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
      style={local.tile}
    >
      <View style={local.inner}>
        <View style={local.left}>
          <Text style={local.eyebrow}>SPECIAL ORDER</Text>
          <Text style={local.heading}>Build Your Box</Text>
          <Text style={local.sub}>Mix & match to order</Text>
        </View>
        <View style={local.iconWrap}>
          <Feather name="package" size={22} color="#fff" />
        </View>
      </View>
    </Pressable>
  );
}

const local = StyleSheet.create({
  tile: {
    marginHorizontal: 12, marginTop: 10, marginBottom: 4,
    backgroundColor: CHERRY, borderRadius: 12,
    overflow: 'hidden',
    shadowColor: CHERRY, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  inner: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, gap: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 12,
  },
  left:    { flex: 1 },
  eyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: '700', letterSpacing: 2.5, marginBottom: 3 },
  heading: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  sub:     { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '500', marginTop: 2 },
  iconWrap:{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#A80001', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#8A0001' },
});

export default function PosProductBrowser({
  isWide,
  orderedCategories,
  selCategory,
  customCatColors,
  getDefaultCatColor,
  loadingProducts,
  filteredProducts,
  productListRef,
  loadingDetail,
  onCategorySelect,
  onCategoryLongPress,
  onProductPress,
  onBuildABox,
}: {
  isWide: boolean;
  orderedCategories: Category[];
  selCategory: string;
  customCatColors: Record<string, string>;
  getDefaultCatColor: (slug: string, color?: string | null) => string;
  loadingProducts: boolean;
  filteredProducts: any[];
  productListRef: React.RefObject<FlatList<any> | null>;
  loadingDetail: string | null;
  onCategorySelect: (slug: string) => void;
  onCategoryLongPress: (slug: string) => void;
  onProductPress: (product: any) => void;
  onBuildABox?: () => void;
}) {
  const [containerWidth, setContainerWidth] = useState(0);

  // Show the Build Your Box tile when viewing cookies or all products
  const showBuildABox = !!onBuildABox && (selCategory === 'cookies' || selCategory === 'all');

  const numCols = isWide ? 3 : 2;
  // content padding=8 each side, columnWrapper paddingHorizontal=4 each side, gap=8 between cols
  const itemWidth = containerWidth > 0
    ? Math.floor((containerWidth - 16 - 8 - (numCols - 1) * 8) / numCols)
    : 0;

  return (
    <View
      style={[styles.menuPane, isWide && { flex: 3 }]}
      onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/* Horizontal category scroll — narrow screens only */}
      {!isWide && (
        <View style={{ height: 84, flexShrink: 0 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
            {orderedCategories.map(cat => {
              const active = selCategory === cat.slug;
              const color = customCatColors[cat.slug.toLowerCase()] ?? getDefaultCatColor(cat.slug, cat.color);
              return (
                <Pressable key={cat.slug} onPress={() => onCategorySelect(cat.slug)} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onCategoryLongPress(cat.slug); }} delayLongPress={400} style={[styles.catTile, active ? { backgroundColor: color, borderColor: color } : { backgroundColor: `${color}18`, borderColor: `${color}45` }]}>
                  <Text style={[styles.catTileLabel, { color: active ? '#fff' : color }]} numberOfLines={2}>{cat.name}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => onCategorySelect('all')} style={[styles.catTile, selCategory === 'all' ? { backgroundColor: BLUE, borderColor: BLUE } : { backgroundColor: `${BLUE}15`, borderColor: `${BLUE}40` }]}>
              <Text style={[styles.catTileLabel, { color: selCategory === 'all' ? '#fff' : BLUE }]}>All</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      {loadingProducts ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={BLUE} /></View>
      ) : (
        <FlatList
          ref={productListRef}
          data={filteredProducts}
          keyExtractor={item => item.id}
          numColumns={isWide ? 3 : 2}
          key={isWide ? 'wide' : 'narrow'}
          contentContainerStyle={{ padding: 8, gap: 0 }}
          columnWrapperStyle={{ gap: 8, marginBottom: 8, paddingHorizontal: 4 }}
          ListHeaderComponent={showBuildABox ? <BuildABoxTile onPress={onBuildABox!} /> : null}
          renderItem={({ item }) => (
            <ProductGridCard product={item} onPress={() => onProductPress(item)} loading={loadingDetail === item.id} isWide={isWide} itemWidth={itemWidth || undefined} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
