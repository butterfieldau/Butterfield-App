import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import ProductGridCard from './ProductGridCard';
import styles from './posStyles';
import { BLUE } from './types';

type Category = { slug: string; name: string; color?: string | null };

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
}) {
  return (
    <View style={[styles.menuPane, isWide && { flex: 3 }]}>
      {/* Horizontal category scroll — narrow screens only; wide screens use the vertical CategoryColumn */}
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
        <FlatList ref={productListRef} data={filteredProducts} keyExtractor={item => item.id} numColumns={isWide ? 3 : 2} key={isWide ? 'wide' : 'narrow'} contentContainerStyle={{ padding: 8, gap: 0 }} columnWrapperStyle={{ gap: 8, marginBottom: 8, paddingHorizontal: 4 }}
          renderItem={({ item }) => <ProductGridCard product={item} onPress={() => onProductPress(item)} loading={loadingDetail === item.id} isWide={isWide} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
