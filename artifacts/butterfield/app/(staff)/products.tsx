import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiProduct } from '@/lib/api';

const BG = '#0D0604';
const CARD = '#1A0A04';
const ACCENT = '#C8833A';

function getPrice(p: ApiProduct) { return (p.prices?.[0]?.unit_amount ?? 0) / 100; }
function getGradient(p: ApiProduct): [string, string] {
  const g = p.metadata?.gradient?.split(',');
  return g?.length === 2 ? [g[0], g[1]] : ['#C8833A', '#8B4513'];
}

export default function StaffProductsScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ['products'], queryFn: () => api.products.list(), retry: 1 });
  const products = data?.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.title, { fontFamily: 'Inter_700Bold', color: '#fff' }]}>Product Availability</Text>
        <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 13 }]}>Live from Stripe · {products.length} products</Text>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={ACCENT} /></View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={ACCENT} />}
          contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 12 }}>
              <Feather name="box" size={36} color="rgba(255,255,255,0.2)" />
              <Text style={[{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 14 }]}>
                No products yet — connect Stripe and run the seed script
              </Text>
            </View>
          }
          renderItem={({ item: p }) => {
            const available = p.metadata?.available !== 'false' && p.active;
            const price = getPrice(p);
            const gradient = getGradient(p);
            return (
              <View style={[styles.productRow, { backgroundColor: CARD, borderRadius: 14, borderLeftColor: available ? '#22C55E' : '#EF4444', borderLeftWidth: 3 }]}>
                <LinearGradient colors={gradient} style={styles.productThumb} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }]}>{p.name}</Text>
                  <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }]} numberOfLines={1}>{p.description}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <View style={[styles.catBadge, { backgroundColor: `${ACCENT}20` }]}>
                      <Text style={[{ color: ACCENT, fontFamily: 'Inter_600SemiBold', fontSize: 10, textTransform: 'capitalize' }]}>{p.metadata?.category ?? 'product'}</Text>
                    </View>
                    {p.metadata?.popular === 'true' && <View style={[styles.catBadge, { backgroundColor: '#F59E0B20' }]}><Text style={[{ color: '#F59E0B', fontFamily: 'Inter_600SemiBold', fontSize: 10 }]}>POPULAR</Text></View>}
                    {p.metadata?.isNew === 'true' && <View style={[styles.catBadge, { backgroundColor: '#22C55E20' }]}><Text style={[{ color: '#22C55E', fontFamily: 'Inter_600SemiBold', fontSize: 10 }]}>NEW</Text></View>}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>${price.toFixed(2)}</Text>
                  <View style={[styles.statusDot, { backgroundColor: available ? '#22C55E20' : '#EF444420', borderColor: available ? '#22C55E' : '#EF4444', borderWidth: 1 }]}>
                    <Text style={[{ color: available ? '#22C55E' : '#EF4444', fontFamily: 'Inter_600SemiBold', fontSize: 10 }]}>{available ? 'Available' : 'Unavailable'}</Text>
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
  header: { paddingHorizontal: 20, paddingBottom: 16, gap: 4 },
  title: { fontSize: 26 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  productThumb: { width: 52, height: 52, borderRadius: 10 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusDot: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
});
