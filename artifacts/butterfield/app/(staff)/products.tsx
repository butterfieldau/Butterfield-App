import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getPalette } from '@/constants/categoryColors';
import { api, type ApiProduct } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

function getPrice(p: ApiProduct) { return (p.prices?.[0]?.unit_amount ?? 0) / 100; }

export default function StaffProductsScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ['products'], queryFn: () => api.products.list(), retry: 1 });
  const products = data?.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: BORDER }]}>
        <Text style={[styles.title, { fontWeight: '700', color: TEXT }]}>Product Availability</Text>
        <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 13 }]}>Live from Stripe · {products.length} products</Text>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={BLUE} /></View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 12 }}>
              <Feather name="box" size={36} color={BORDER} />
              <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 14 }]}>
                No products yet — connect Stripe and run the seed script
              </Text>
            </View>
          }
          renderItem={({ item: p }) => {
            const available = p.metadata?.available !== 'false' && p.active;
            const price = getPrice(p);
            const palette = getPalette(p.metadata?.category);
            return (
              <View style={[styles.productRow, { backgroundColor: CARD, borderRadius: 14, borderLeftColor: available ? '#22C55E' : '#EF4444', borderLeftWidth: 3, borderWidth: 1, borderColor: BORDER }]}>
                <View style={[styles.productThumb, { backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }]}>
                  <Text style={{ fontSize: 24 }}>{palette.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: TEXT, fontWeight: '600', fontSize: 14 }]}>{p.name}</Text>
                  <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 11, marginTop: 2 }]} numberOfLines={1}>{p.description}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                    <View style={[styles.badge, { backgroundColor: `${BLUE}15` }]}>
                      <Text style={[{ color: BLUE, fontWeight: '600', fontSize: 10, textTransform: 'capitalize' }]}>{p.metadata?.category ?? 'product'}</Text>
                    </View>
                    {p.metadata?.popular === 'true' && <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}><Text style={[{ color: '#D97706', fontWeight: '600', fontSize: 10 }]}>POPULAR</Text></View>}
                    {p.metadata?.isNew === 'true' && <View style={[styles.badge, { backgroundColor: '#DCFCE7' }]}><Text style={[{ color: '#15803D', fontWeight: '600', fontSize: 10 }]}>NEW</Text></View>}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[{ color: BLUE, fontWeight: '700', fontSize: 14 }]}>${price.toFixed(2)}</Text>
                  <View style={[styles.badge, { backgroundColor: available ? '#DCFCE7' : '#FEE2E2', borderColor: available ? '#22C55E' : '#EF4444', borderWidth: 1 }]}>
                    <Text style={[{ color: available ? '#15803D' : '#DC2626', fontWeight: '600', fontSize: 10 }]}>{available ? 'Available' : 'Unavailable'}</Text>
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
  header: { paddingHorizontal: 16, paddingBottom: 14, gap: 4 },
  title: { fontSize: 26 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  productThumb: { width: 52, height: 52 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
});
