import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import ProductGridCard from './ProductGridCard';
import styles from './posStyles';
import { BLUE } from './types';

const CHERRY = '#D20001';
const DARK   = '#1A0A04';
const CREAM  = '#FBF7F2';
const CARAMEL = '#C8833A';

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
          <Feather name="package" size={22} color={CARAMEL} />
        </View>
      </View>
    </Pressable>
  );
}

const local = StyleSheet.create({
  tile: {
    marginHorizontal: 12, marginTop: 10, marginBottom: 4,
    backgroundColor: DARK, borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  inner: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, gap: 12,
    borderWidth: 1, borderColor: CARAMEL + '55', borderRadius: 12,
  },
  left:    { flex: 1 },
  eyebrow: { color: CARAMEL, fontSize: 9, fontWeight: '700', letterSpacing: 2.5, marginBottom: 3 },
  heading: { color: CREAM, fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  sub:     { color: CARAMEL + 'CC', fontSize: 12, fontWeight: '500', marginTop: 2 },
  iconWrap:{ width: 44, height: 44, borderRadius: 22, backgroundColor: CARAMEL + '20', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: CARAMEL + '40' },
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
  // Show the Build Your Box tile when viewing cookies or all products
  const showBuildABox = !!onBuildABox && (selCategory === 'cookies' || selCategory === 'all');

  return (
    <View style={[styles.menuPane, isWide && { flex: 3 }]}>
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
            <ProductGridCard product={item} onPress={() => onProductPress(item)} loading={loadingDetail === item.id} isWide={isWide} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
