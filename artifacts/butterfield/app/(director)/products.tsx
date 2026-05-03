import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable,
  RefreshControl, StyleSheet, Switch, Text, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';

const CAT_COLORS: Record<string, string> = {
  cookies:    '#F59E0B',
  coffee:     '#8B5CF6',
  desserts:   '#EC4899',
  bundles:    '#40C0F2',
  sandwiches: '#22C55E',
  merch:      '#6B7280',
};

export default function DirectorProductsScreen() {
  const qc = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-products'],
    queryFn: () => api.director.products(),
  });

  const products: any[] = data?.data ?? [];

  const toggleAvailable = async (product: any) => {
    Haptics.selectionAsync();
    try {
      await api.director.updateProduct(product.id, { isAvailable: !product.isAvailable });
      await qc.invalidateQueries({ queryKey: ['director-products'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const toggleFeatured = async (product: any) => {
    Haptics.selectionAsync();
    try {
      await api.director.updateProduct(product.id, { isFeatured: !product.isFeatured });
      await qc.invalidateQueries({ queryKey: ['director-products'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const toggleNew = async (product: any) => {
    Haptics.selectionAsync();
    try {
      await api.director.updateProduct(product.id, { isNew: !product.isNew });
      await qc.invalidateQueries({ queryKey: ['director-products'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.headerCount}>{products.length} product{products.length !== 1 ? 's' : ''}</Text>
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="package" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular' }}>No products</Text>
            </View>
          }
          renderItem={({ item: p }) => {
            const catColor = CAT_COLORS[p.category] ?? MUTED;
            const price    = ((p.priceCents ?? 0) / 100).toFixed(2);
            const wsPrice  = p.wholesalePriceCents ? ((p.wholesalePriceCents) / 100).toFixed(2) : null;
            return (
              <View style={[styles.productCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                <View style={styles.productTop}>
                  <View style={[styles.catDot, { backgroundColor: catColor + '22', borderColor: catColor + '44' }]}>
                    <Feather name="package" size={14} color={catColor} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.productName}>{p.name}</Text>
                    <View style={styles.productMeta}>
                      <View style={[styles.catPill, { backgroundColor: catColor + '18' }]}>
                        <Text style={[styles.catPillText, { color: catColor }]}>{p.category}</Text>
                      </View>
                      <Text style={styles.priceText}>AUD ${price}</Text>
                      {wsPrice && <Text style={styles.wsPriceText}>WS ${wsPrice}</Text>}
                    </View>
                  </View>
                </View>

                <View style={[styles.toggleRow, { borderTopColor: BORDER }]}>
                  <View style={styles.toggleItem}>
                    <Text style={styles.toggleLabel}>Available</Text>
                    <Switch
                      value={p.isAvailable ?? true}
                      onValueChange={() => toggleAvailable(p)}
                      trackColor={{ false: '#D1D5DB', true: GREEN }}
                      thumbColor="#fff"
                      ios_backgroundColor="#D1D5DB"
                    />
                  </View>
                  <View style={[styles.toggleItem, { borderLeftWidth: 1, borderLeftColor: BORDER }]}>
                    <Text style={styles.toggleLabel}>Featured</Text>
                    <Switch
                      value={p.isFeatured ?? false}
                      onValueChange={() => toggleFeatured(p)}
                      trackColor={{ false: '#D1D5DB', true: BLUE }}
                      thumbColor="#fff"
                      ios_backgroundColor="#D1D5DB"
                    />
                  </View>
                  <View style={[styles.toggleItem, { borderLeftWidth: 1, borderLeftColor: BORDER }]}>
                    <Text style={styles.toggleLabel}>New</Text>
                    <Switch
                      value={p.isNew ?? false}
                      onValueChange={() => toggleNew(p)}
                      trackColor={{ false: '#D1D5DB', true: '#EC4899' }}
                      thumbColor="#fff"
                      ios_backgroundColor="#D1D5DB"
                    />
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerCount:   { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93', marginBottom: 4 },
  productCard:   { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  productTop:    { flexDirection: 'row', gap: 12, padding: 14 },
  catDot:        { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  productName:   { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  productMeta:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  catPill:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  catPillText:   { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  priceText:     { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  wsPriceText:   { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  toggleRow:     { flexDirection: 'row', borderTopWidth: 1 },
  toggleItem:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  toggleLabel:   { fontSize: 12, fontFamily: 'Inter_500Medium', color: '#8E8E93' },
});
