import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { api, type ApiProduct } from '@/lib/api';

function getGradient(p: ApiProduct): [string, string] {
  const g = p.metadata?.gradient?.split(',');
  return g?.length === 2 ? [g[0], g[1]] : ['#024B68', '#013A52'];
}

function getPrice(p: ApiProduct): number {
  return (p.prices?.[0]?.unit_amount ?? 0) / 100;
}

export default function FavouritesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { addItem } = useCart();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['favourites'],
    queryFn: () => api.favourites.list(),
    retry: 1,
  });

  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
    retry: 1,
  });

  const favouriteIds = new Set((data?.data ?? []).map((f: any) => f.productStripeId));
  const products = (productsData?.data ?? []).filter((p) => favouriteIds.has(p.id));

  const handleRemove = async (productId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Remove from Favourites', 'Remove this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.favourites.remove(productId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            qc.invalidateQueries({ queryKey: ['favourites'] });
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const handleAddToCart = (p: ApiProduct) => {
    addItem({
      id: p.id,
      name: p.name,
      category: (p.metadata?.category ?? 'cookies') as any,
      price: getPrice(p),
      description: p.description,
      available: p.metadata?.available !== 'false',
      gradient: getGradient(p),
      priceId: p.prices?.[0]?.id,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Added to Cart', `${p.name} added to your cart.`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Favourites</Text>
        <View style={{ width: 38 }} />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
          columnWrapperStyle={{ gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 14 }}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
                <Feather name="heart" size={32} color={colors.mutedForeground} />
              </View>
              <Text style={[{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 17 }]}>No favourites yet</Text>
              <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 21 }]}>
                Tap the heart on any item in the menu to save it here.
              </Text>
              <Pressable
                onPress={() => router.push('/(customer)/menu')}
                style={[styles.shopBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>Browse Menu</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: p }) => {
            const gradient = getGradient(p);
            const price = getPrice(p);
            return (
              <View style={[styles.favCard, { flex: 1, backgroundColor: colors.card, borderRadius: colors.radius }]}>
                <LinearGradient colors={gradient} style={styles.favThumb} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Pressable
                    onPress={() => handleRemove(p.id)}
                    style={[styles.heartBtn, { backgroundColor: 'rgba(0,0,0,0.35)' }]}
                  >
                    <Feather name="heart" size={14} color="#EF4444" />
                  </Pressable>
                </LinearGradient>
                <View style={{ padding: 12, gap: 4 }}>
                  <Text style={[{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }]} numberOfLines={1}>{p.name}</Text>
                  <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11 }]} numberOfLines={1}>{p.description}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                    <Text style={[{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>${price.toFixed(2)}</Text>
                    <Pressable onPress={() => handleAddToCart(p)} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                      <Feather name="plus" size={14} color="#fff" />
                    </Pressable>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  shopBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 4 },
  favCard: { overflow: 'hidden' },
  favThumb: { height: 110, position: 'relative' },
  heartBtn: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
