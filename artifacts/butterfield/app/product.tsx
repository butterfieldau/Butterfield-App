import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Dimensions, Platform, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCart } from '@/context/CartContext';
import { getPalette, getOptions } from '@/constants/categoryColors';
import { getSelectedProduct } from '@/lib/selectedProduct';
import { api } from '@/lib/api';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HERO_H = SCREEN_H * 0.40;

function getPrice(p: any): number {
  return (p.prices?.[0]?.unit_amount ?? 0) / 100;
}

export default function ProductDetailScreen() {
  const insets = useSafeAreaInsets();
  const { addItem } = useCart();
  const qc = useQueryClient();
  const product = getSelectedProduct();
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [togglingFav, setTogglingFav] = useState(false);

  const { data: favsData } = useQuery({
    queryKey: ['favourites'],
    queryFn: () => api.favourites.list(),
    retry: 1,
    enabled: !!product,
  });

  const isFavourited = product
    ? (favsData?.data ?? []).some((f: any) => f.productStripeId === product.id)
    : false;

  const handleFavouriteToggle = async () => {
    if (!product || togglingFav) return;
    setTogglingFav(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (isFavourited) {
        await api.favourites.remove(product.id);
      } else {
        await api.favourites.add(product.id);
      }
      qc.invalidateQueries({ queryKey: ['favourites'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Already favourited or already removed — still refresh
      qc.invalidateQueries({ queryKey: ['favourites'] });
    } finally {
      setTogglingFav(false);
    }
  };

  if (!product) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <Text style={{ fontFamily: 'Inter_400Regular', color: '#8E8E93' }}>No product selected</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16, padding: 12 }}>
          <Text style={{ color: '#40C0F2', fontFamily: 'Inter_600SemiBold' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const category = product.metadata?.category ?? 'default';
  const palette = getPalette(category);
  const options = getOptions(category);
  const price = getPrice(product);
  const total = price * qty;

  const toggle = (section: string, choice: string) => {
    Haptics.selectionAsync();
    setSelections((prev) => {
      const current = prev[section] ?? [];
      const already = current.includes(choice);
      return { ...prev, [section]: already ? current.filter((c) => c !== choice) : [...current, choice] };
    });
  };

  const isSelected = (section: string, choice: string) => (selections[section] ?? []).includes(choice);

  const handleAddToCart = () => {
    const customParts: string[] = [];
    Object.entries(selections).forEach(([sec, choices]) => {
      if (choices.length > 0) customParts.push(`${sec}: ${choices.join(', ')}`);
    });
    const customDesc = customParts.length > 0 ? `${product.description} · ${customParts.join(' · ')}` : product.description;

    for (let i = 0; i < qty; i++) {
      addItem({
        id: product.id,
        name: product.name,
        category: category as any,
        price,
        description: customDesc,
        available: product.metadata?.available !== 'false',
        gradient: (() => {
          const g = product.metadata?.gradient?.split(',');
          return g?.length === 2 ? [g[0], g[1]] as [string, string] : [palette.bg, palette.banner] as [string, string];
        })(),
        priceId: product.prices?.[0]?.id,
      });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const wmWords = product.name.toUpperCase().split(' ');

  return (
    <View style={styles.root}>
      {/* HERO */}
      <View style={[styles.hero, { height: HERO_H, backgroundColor: palette.bg }]}>
        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          style={[styles.overlayBtn, { top: insets.top + 12, left: 16 }]}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={22} color="#1C1C1E" />
        </Pressable>

        {/* Favourite button */}
        <Pressable
          onPress={handleFavouriteToggle}
          disabled={togglingFav}
          style={[styles.overlayBtn, { top: insets.top + 12, right: 16 }]}
          hitSlop={12}
        >
          <Feather
            name="heart"
            size={20}
            color={isFavourited ? '#EF4444' : '#1C1C1E'}
            style={{ opacity: togglingFav ? 0.5 : 1 }}
          />
        </Pressable>

        {/* Watermark */}
        <View style={styles.watermarkWrap} pointerEvents="none">
          {wmWords.map((word, i) => (
            <Text key={i} style={[styles.watermark, { color: palette.banner }]} numberOfLines={1}>{word}</Text>
          ))}
        </View>

        {/* Product emoji */}
        <Text style={styles.heroEmoji}>{palette.emoji}</Text>
      </View>

      {/* BOTTOM SHEET */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 100 }]}>
        {/* Name + price row */}
        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.productName, { fontFamily: 'Inter_700Bold' }]}>{product.name}</Text>
            <Text style={[styles.productDesc, { fontFamily: 'Inter_400Regular', color: '#8E8E93' }]} numberOfLines={2}>
              {product.description}
            </Text>
          </View>
          <Text style={[styles.priceTag, { fontFamily: 'Inter_700Bold', color: '#1C1C1E' }]}>${price.toFixed(2)}</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 22, paddingBottom: 24 }}>
          {/* Quantity */}
          <View>
            <Text style={[styles.sectionLabel, { fontFamily: 'Inter_700Bold' }]}>Quantity</Text>
            <View style={styles.qtyRow}>
              <Pressable
                onPress={() => { if (qty > 1) { setQty(q => q - 1); Haptics.selectionAsync(); } }}
                style={[styles.qtyBtn, { borderColor: '#E5E7EB' }]}
              >
                <Feather name="minus" size={16} color="#1C1C1E" />
              </Pressable>
              <Text style={[styles.qtyNum, { fontFamily: 'Inter_700Bold' }]}>{qty}</Text>
              <Pressable
                onPress={() => { setQty(q => q + 1); Haptics.selectionAsync(); }}
                style={[styles.qtyBtn, { borderColor: '#E5E7EB', backgroundColor: palette.banner }]}
              >
                <Feather name="plus" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>

          <Text style={[styles.customizeTitle, { fontFamily: 'Inter_700Bold' }]}>Customize</Text>

          {options.map((section) => (
            <View key={section.label} style={styles.sectionBlock}>
              <Text style={[styles.sectionLabel, { fontFamily: 'Inter_700Bold' }]}>{section.label}</Text>
              <View style={styles.chipsWrap}>
                {section.choices.map((choice) => {
                  const sel = isSelected(section.label, choice);
                  return (
                    <Pressable
                      key={choice}
                      onPress={() => toggle(section.label, choice)}
                      style={[
                        styles.chip,
                        sel
                          ? { backgroundColor: palette.banner, borderColor: palette.banner }
                          : { backgroundColor: '#fff', borderColor: '#E5E7EB' },
                      ]}
                    >
                      <Text style={[styles.chipText, { fontFamily: sel ? 'Inter_600SemiBold' : 'Inter_400Regular', color: sel ? '#fff' : '#1C1C1E' }]}>
                        {choice}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Fixed footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable onPress={handleAddToCart} style={styles.continueBtn}>
          <Text style={[styles.continueBtnText, { fontFamily: 'Inter_700Bold' }]}>
            Add to Order{qty > 1 ? ` (${qty})` : ''} — ${total.toFixed(2)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  hero: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  overlayBtn: {
    position: 'absolute', zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 20,
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
  },
  watermarkWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 0 },
  watermark: { fontSize: 64, lineHeight: 68, opacity: 0.18, letterSpacing: 2, fontWeight: '900' },
  heroEmoji: { fontSize: 90, lineHeight: 110, zIndex: 2 },
  sheet: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -24, paddingHorizontal: 24, paddingTop: 24 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
  productName: { fontSize: 22, color: '#1C1C1E', lineHeight: 28 },
  productDesc: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  priceTag: { fontSize: 22, lineHeight: 28 },
  customizeTitle: { fontSize: 22, color: '#1C1C1E' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  qtyBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  qtyNum: { fontSize: 20, color: '#1C1C1E', minWidth: 30, textAlign: 'center' },
  sectionBlock: { gap: 10 },
  sectionLabel: { fontSize: 16, color: '#1C1C1E' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 30, borderWidth: 1.5 },
  chipText: { fontSize: 14 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  continueBtn: { backgroundColor: '#1C1C1E', borderRadius: 30, padding: 18, alignItems: 'center' },
  continueBtnText: { color: '#fff', fontSize: 16 },
});
