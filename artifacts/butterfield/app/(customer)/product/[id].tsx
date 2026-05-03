import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { api, type ApiProduct } from '@/lib/api';

const PRODUCT_IMAGES: Record<string, string> = {
  'prod_classic_choc_chip': 'https://butterfieldcookies.com.au/cdn/shop/files/classic-choc-chip.jpg',
  'prod_double_chocolate': 'https://butterfieldcookies.com.au/cdn/shop/files/double-choc.jpg',
  'prod_flat_white': 'https://butterfieldcookies.com.au/cdn/shop/files/flat-white.jpg',
  'prod_cookie_sandwich': 'https://butterfieldcookies.com.au/cdn/shop/files/cookie-sandwich.jpg',
};

function getPrice(p: ApiProduct): number {
  return (p.prices?.[0]?.unit_amount ?? 0) / 100;
}
function getGradient(p: ApiProduct): [string, string] {
  const g = p.metadata?.gradient?.split(',');
  return g?.length === 2 ? [g[0], g[1]] : ['#4B72C4', '#3A5BA8'];
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { addItem, totalItems } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.products.get(id),
    enabled: !!id,
  });

  const product = data?.data;
  const price = product ? getPrice(product) : 0;
  const gradient = product ? getGradient(product) : ['#4B72C4', '#3A5BA8'] as [string, string];
  const imageUrl = product ? PRODUCT_IMAGES[product.id] : undefined;
  const available = product?.metadata?.available !== 'false';

  const handleAdd = () => {
    if (!product || !available) return;
    for (let i = 0; i < qty; i++) {
      addItem({
        id: product.id,
        name: product.name,
        category: (product.metadata?.category ?? 'cookies') as any,
        price,
        description: product.description,
        available: true,
        gradient,
        priceId: product.prices?.[0]?.id,
      });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const totalPrice = (price * qty).toFixed(2);

  return (
    <View style={{ flex: 1, backgroundColor: '#E8F2FB' }}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.circleBtn}>
          <Feather name="arrow-left" size={18} color="#1C1C1E" />
        </Pressable>
        <Pressable onPress={() => router.push('/(customer)/cart')} style={styles.circleBtn}>
          <Feather name="shopping-bag" size={18} color="#1C1C1E" />
          {totalItems > 0 && (
            <View style={styles.badgeDot}>
              <Text style={{ color: '#fff', fontSize: 9, fontFamily: 'Inter_700Bold' }}>{totalItems}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#4B72C4" size="large" />
        </View>
      ) : isError || !product ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Feather name="alert-circle" size={40} color="#ccc" />
          <Text style={{ color: '#999', fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', marginTop: 12 }}>
            Product not found.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.imageArea}>
            <View style={styles.imageCard}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%', borderRadius: 20 }} resizeMode="cover" />
              ) : (
                <LinearGradient colors={gradient} style={[{ flex: 1, borderRadius: 20 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
              )}
              {product.metadata?.isNew === 'true' && (
                <View style={[styles.newBadge, { backgroundColor: '#4B72C4' }]}>
                  <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 10 }}>NEW</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.sheet}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
              <Text style={[styles.productName, { color: '#1C1C1E', fontFamily: 'Inter_700Bold' }]}>{product.name}</Text>
              <Text style={[styles.productDesc, { color: '#6E6E73', fontFamily: 'Inter_400Regular' }]}>{product.description}</Text>

              <View style={[styles.priceRow, { borderColor: '#E5E5EA', borderWidth: 1, borderRadius: 16 }]}>
                <View>
                  <Text style={{ color: '#8E8E93', fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.5 }}>PRICE</Text>
                  <Text style={{ color: '#1C1C1E', fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 2 }}>
                    AUD {totalPrice}
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => { if (qty > 1) { setQty(q => q - 1); Haptics.selectionAsync(); } }}
                    style={[styles.stepBtn, { borderColor: '#E5E5EA', borderWidth: 1 }]}
                  >
                    <Feather name="minus" size={16} color="#1C1C1E" />
                  </Pressable>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#1C1C1E', minWidth: 28, textAlign: 'center' }}>{qty}</Text>
                  <Pressable
                    onPress={() => { setQty(q => q + 1); Haptics.selectionAsync(); }}
                    style={[styles.stepBtnFill, { backgroundColor: '#4B72C4' }]}
                  >
                    <Feather name="plus" size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
              <Pressable
                onPress={handleAdd}
                disabled={!available}
                style={[styles.addBtn, { backgroundColor: added ? '#22C55E' : '#4B72C4', opacity: available ? 1 : 0.5 }]}
              >
                <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 }}>
                  {added ? '✓ Added to bag' : !available ? 'Sold Out' : `Add to bag · AUD ${totalPrice}`}
                </Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8, position: 'absolute', left: 0, right: 0, zIndex: 10 },
  circleBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  badgeDot: { position: 'absolute', top: 6, right: 6, backgroundColor: '#4B72C4', borderRadius: 8, minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  imageArea: { height: 320, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 60 },
  imageCard: { width: '100%', height: 220, borderRadius: 20, backgroundColor: '#fff', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
  newBadge: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  sheet: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 8 },
  productName: { fontSize: 30, lineHeight: 36, marginBottom: 10 },
  productDesc: { fontSize: 15, lineHeight: 22, marginBottom: 24 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepBtnFill: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingTop: 16 },
  addBtn: { borderRadius: 50, padding: 18, alignItems: 'center', justifyContent: 'center' },
});
