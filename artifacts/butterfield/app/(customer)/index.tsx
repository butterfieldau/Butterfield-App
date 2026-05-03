import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { api, type ApiProduct } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

const PRODUCT_IMAGES: Record<string, string> = {
  'prod_classic_choc_chip': 'https://butterfieldcookies.com.au/cdn/shop/files/classic-choc-chip.jpg',
  'prod_double_chocolate': 'https://butterfieldcookies.com.au/cdn/shop/files/double-choc.jpg',
  'prod_flat_white': 'https://butterfieldcookies.com.au/cdn/shop/files/flat-white.jpg',
  'prod_cookie_sandwich': 'https://butterfieldcookies.com.au/cdn/shop/files/cookie-sandwich.jpg',
};

function getPrice(p: ApiProduct): number { return (p.prices?.[0]?.unit_amount ?? 0) / 100; }
function getGradient(p: ApiProduct): [string, string] {
  const g = p.metadata?.gradient?.split(',');
  return g?.length === 2 ? [g[0], g[1]] : ['#4B72C4', '#3A5BA8'];
}

function QuickAction({ emoji, label, color, onPress }: { emoji: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} style={styles.quickItem}>
      <View style={[styles.quickCircle, { backgroundColor: color }]}>
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      </View>
      <Text style={[styles.quickLabel, { fontFamily: 'Inter_500Medium', color: '#1C1C1E' }]}>{label}</Text>
    </Pressable>
  );
}

function FreshPickCard({ product, onPress }: { product: ApiProduct; onPress: () => void }) {
  const colors = useColors();
  const imageUrl = PRODUCT_IMAGES[product.id];
  const gradient = getGradient(product);
  const price = getPrice(product);
  const isPopular = product.metadata?.popular === 'true';

  return (
    <Pressable onPress={onPress} style={[styles.freshCard, { backgroundColor: colors.card }]}>
      <View style={styles.freshImageWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%', borderRadius: 14 }} resizeMode="cover" />
        ) : (
          <LinearGradient colors={gradient} style={{ flex: 1, borderRadius: 14 }} />
        )}
        {isPopular && (
          <View style={styles.bestSellerBadge}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 9 }}>BEST SELLER</Text>
          </View>
        )}
      </View>
      <Text style={[styles.freshName, { fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }]} numberOfLines={1}>{product.name}</Text>
      <Text style={[styles.freshPrice, { fontFamily: 'Inter_700Bold', color: '#4B72C4' }]}>${price.toFixed(2)}</Text>
    </Pressable>
  );
}

export default function CustomerHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { totalItems } = useCart();
  const [refreshing, setRefreshing] = useState(false);

  const { data: productsData, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
    retry: 2,
  });
  const { data: loyaltyData } = useQuery({
    queryKey: ['loyalty-profile'],
    queryFn: () => api.loyalty.profile(),
    retry: 1,
  });

  const products = productsData?.data ?? [];
  const freshPicks = products.slice(0, 6);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const initial = user?.name?.charAt(0).toUpperCase() ?? 'B';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F5F6FA' }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4B72C4" />}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14, backgroundColor: '#F5F6FA' }]}>
        <Text style={[styles.logo, { fontFamily: 'Inter_700Bold' }]}>Butterfield</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => router.push('/(customer)/cart')} style={[styles.headerIconBtn, { backgroundColor: '#fff' }]}>
            <Feather name="shopping-bag" size={18} color="#1C1C1E" />
            {totalItems > 0 && (
              <View style={[styles.headerBadge, { backgroundColor: '#4B72C4' }]}>
                <Text style={{ color: '#fff', fontSize: 9, fontFamily: 'Inter_700Bold' }}>{totalItems}</Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => router.push('/(customer)/profile')} style={[styles.avatarBtn, { backgroundColor: '#4B72C4' }]}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }}>{initial}</Text>
          </Pressable>
        </View>
      </View>

      {/* Hero Banner */}
      <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
        <LinearGradient colors={['#4B72C4', '#3058A8']} style={styles.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <View style={styles.heroLeft}>
            <View style={styles.freshBadge}>
              <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>✦ FRESH TODAY</Text>
            </View>
            <Text style={[styles.heroTitle, { fontFamily: 'Inter_700Bold' }]}>Delicious from every angle.</Text>
            <Text style={[styles.heroSub, { fontFamily: 'Inter_400Regular' }]}>Order ahead and pick up at our Merrylands store.</Text>
            <Pressable onPress={() => router.push('/(customer)/menu')} style={styles.startBtn}>
              <Text style={[styles.startBtnText, { fontFamily: 'Inter_700Bold' }]}>Start order →</Text>
            </Pressable>
          </View>
          <View style={styles.heroRight}>
            <View style={[styles.heroImageBg, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Text style={{ fontSize: 48 }}>🍪</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* In-Store Pickup */}
      <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
        <Pressable onPress={() => { Haptics.selectionAsync(); router.push('/(customer)/store'); }} style={[styles.pickupRow, { backgroundColor: '#fff', borderRadius: 14 }]}>
          <View style={[styles.pickupIcon, { backgroundColor: '#EBF0FA' }]}>
            <Feather name="map-pin" size={18} color="#4B72C4" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#4B72C4', fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.5 }}>IN-STORE PICKUP</Text>
            <Text style={{ color: '#1C1C1E', fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 1 }}>Butterfield Cookies — Merrylands...</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#8E8E93" />
        </Pressable>
      </View>

      {/* Quick Actions */}
      <View style={[styles.quickRow, { paddingHorizontal: 16, marginTop: 16 }]}>
        <QuickAction
          emoji="🍪"
          label="Order cookies"
          color="#EBF0FA"
          onPress={() => router.push('/(customer)/menu')}
        />
        <QuickAction
          emoji="☕"
          label="Coffee Club"
          color="#FEE8E8"
          onPress={() => router.push('/(customer)/loyalty')}
        />
        <QuickAction
          emoji="🛍"
          label="My order"
          color="#F0F0F0"
          onPress={() => router.push('/(customer)/orders')}
        />
      </View>

      {/* Fresh Picks */}
      {freshPicks.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={{ color: '#4B72C4', fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.5 }}>TODAY'S BATCH</Text>
              <Text style={[styles.sectionTitle, { fontFamily: 'Inter_700Bold', color: '#1C1C1E' }]}>Fresh picks</Text>
            </View>
            <Pressable onPress={() => router.push('/(customer)/menu')}>
              <Text style={{ color: '#4B72C4', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>See all</Text>
            </Pressable>
          </View>
          <FlatList
            data={freshPicks}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingVertical: 4 }}
            renderItem={({ item }) => (
              <FreshPickCard
                product={item}
                onPress={() => router.push(`/(customer)/product/${item.id}` as any)}
              />
            )}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  logo: { fontSize: 26, color: '#4B72C4', fontStyle: 'italic' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2 },
  headerBadge: { position: 'absolute', top: 5, right: 5, width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  avatarBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 18, flexDirection: 'row', overflow: 'hidden', minHeight: 160 },
  heroLeft: { flex: 1, padding: 18, gap: 6, justifyContent: 'center' },
  freshBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  heroTitle: { color: '#fff', fontSize: 20, lineHeight: 26 },
  heroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 17 },
  startBtn: { marginTop: 6, alignSelf: 'flex-start', backgroundColor: '#DC2626', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  startBtnText: { color: '#fff', fontSize: 13 },
  heroRight: { width: 110, alignItems: 'center', justifyContent: 'center' },
  heroImageBg: { width: 90, height: 90, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pickupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  pickupIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickRow: { flexDirection: 'row', gap: 0, justifyContent: 'space-between' },
  quickItem: { flex: 1, alignItems: 'center', gap: 8, padding: 8 },
  quickCircle: { width: 62, height: 62, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 22, marginTop: 2 },
  freshCard: { width: 140, borderRadius: 16, padding: 10, gap: 8, shadowColor: '#4B72C4', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  freshImageWrap: { width: '100%', height: 100, borderRadius: 14, overflow: 'hidden' },
  bestSellerBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#DC2626', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  freshName: { fontSize: 13 },
  freshPrice: { fontSize: 13 },
});
