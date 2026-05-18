import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions, FlatList, Pressable, ScrollView,
  StyleSheet, Text, View, ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCart } from '@/context/CartContext';
import { getPalette } from '@/constants/categoryColors';
import { getSelectedProduct, setSelectedProduct } from '@/lib/selectedProduct';
import { api } from '@/lib/api';

const { width: W, height: H } = Dimensions.get('window');
const HERO_H = Math.round(H * 0.46);
const PHOTO_SIZE = Math.round(W * 0.62);

const BLUE   = '#1493FF';
const RED    = '#D20001';
const AMBER  = '#F59E0B';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E8E8E8';

function priceDollars(cents?: number | null): string {
  if (!cents) return '';
  return `AUD ${(cents / 100).toFixed(2)}`;
}

function parseArr(val: any): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { const r = JSON.parse(val); if (Array.isArray(r)) return r; } catch {}
    return val.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  return [];
}

const DIETARY_ICONS: Record<string, string> = {
  Vegan: '🌱', Vegetarian: '🥦', 'Gluten-Free': '🌾', 'Dairy-Free': '🥛',
  'Nut-Free': '🥜', Halal: '☪️', Kosher: '✡️', 'Low-Sugar': '🍬',
};

function DietaryChip({ label }: { label: string }) {
  const icon = DIETARY_ICONS[label] ?? '✓';
  return (
    <View style={chip.dietary}>
      <Text style={chip.dietaryIcon}>{icon}</Text>
      <Text style={[chip.dietaryText, { fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

function AllergenChip({ label }: { label: string }) {
  return (
    <View style={chip.allergen}>
      <Text style={[chip.allergenText, { fontWeight: '500' }]}>{label}</Text>
    </View>
  );
}

function DetailSection({ icon, title, content }: { icon: string; title: string; content: string }) {
  if (!content?.trim()) return null;
  return (
    <View style={detail.wrap}>
      <Text style={[detail.title, { fontWeight: '600' }]}>{title}</Text>
      <Text style={[detail.body, { fontWeight: '400' }]}>{content}</Text>
    </View>
  );
}

function StatusPill({ label, color, textColor }: { label: string; color: string; textColor?: string }) {
  return (
    <View style={[pill.wrap, { backgroundColor: color }]}>
      <Text style={[pill.text, { fontWeight: '700', color: textColor ?? '#fff' }]}>{label}</Text>
    </View>
  );
}

export default function ProductDetailScreen() {
  const insets = useSafeAreaInsets();
  const { addItem } = useCart();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const routeProductId = Array.isArray(params.id) ? params.id[0] : params.id;
  const selectedProduct = getSelectedProduct();
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [togglingFav, setTogglingFav] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const heroListRef = useRef<FlatList<string>>(null);
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setPhotoIndex(viewableItems[0].index);
      }
    },
    [],
  );
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const { data: routeProductData, isLoading: isRouteProductLoading } = useQuery({
    queryKey: ['product-detail-route', routeProductId],
    queryFn: () => api.products.get(String(routeProductId)),
    enabled: !selectedProduct && !!routeProductId,
    retry: 1,
    staleTime: 60_000,
  });

  const product = selectedProduct && (!routeProductId || selectedProduct.id === routeProductId)
    ? selectedProduct
    : (routeProductData?.data as any) ?? null;

  React.useEffect(() => {
    return () => setSelectedProduct(null);
  }, []);

  const { data: favsData } = useQuery({
    queryKey: ['favourites'],
    queryFn:  () => api.favourites.list(),
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
      if (isFavourited) await api.favourites.remove(product.id);
      else              await api.favourites.add(product.id);
      qc.invalidateQueries({ queryKey: ['favourites'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      qc.invalidateQueries({ queryKey: ['favourites'] });
    } finally { setTogglingFav(false); }
  };

  const category     = (product as any)?.category ?? product?.metadata?.category ?? 'cookies';
  const palette      = getPalette(category);
  const galleryUrls  = useMemo(() => {
    const combined = [
      ...((product?.images ?? []) as string[]),
      ...parseArr((product as any)?.galleryUrls),
    ].filter(Boolean);
    return Array.from(new Set(combined));
  }, [product]);
  const photoUrl     = galleryUrls[0] ?? null;

  const priceCents   = (product as any)?.priceCents ?? product?.prices?.[0]?.unit_amount ?? 0;
  const saleCents    = (product as any)?.salePriceCents;
  const displayCents = saleCents ?? priceCents;
  const pricePerItem = displayCents / 100;
  const total        = pricePerItem * qty;

  const allergens    = parseArr((product as any)?.allergens  ?? product?.metadata?.allergens);
  const dietaryTags  = parseArr((product as any)?.dietaryTags ?? product?.metadata?.dietaryTags);
  const tags         = parseArr((product as any)?.tags       ?? product?.metadata?.tags);
  const shortDesc    = (product as any)?.shortDescription   ?? product?.metadata?.shortDescription ?? '';
  const ingredients  = (product as any)?.ingredients        ?? product?.metadata?.ingredients ?? '';
  const storage      = (product as any)?.storageInstructions ?? product?.metadata?.storageInstructions ?? '';
  const serving      = (product as any)?.servingInstructions ?? product?.metadata?.servingInstructions ?? '';
  const nutrition    = (product as any)?.nutritionInfo      ?? product?.metadata?.nutritionInfo ?? '';
  const productUrl   = (product as any)?.productUrl         ?? null;
  const isNew        = product?.metadata?.isNew === 'true'         || (product as any)?.isNew;
  const isLimited    = product?.metadata?.isLimitedDrop === 'true' || (product as any)?.isLimitedDrop;
  const isSoldOut    = product?.metadata?.available === 'false'    || (product as any)?.isSoldOut;
  const isComingSoon = product?.metadata?.isComingSoon === 'true'  || (product as any)?.isComingSoon;
  const available    = !isSoldOut && !isComingSoon;
  const gst          = (product as any)?.gstIncluded !== false;

  const minQty = (product as any)?.minOrderQty ?? 1;
  const maxQty = (product as any)?.maxOrderQty ?? 99;

  if (!product && isRouteProductLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator color={BLUE} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <Text style={{ fontWeight: '400', color: MUTED }}>We could not open that product.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16, padding: 12 }}>
          <Text style={{ color: BLUE, fontWeight: '600' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const toggle = (section: string, choice: string) => {
    Haptics.selectionAsync();
    setSelections(prev => {
      const cur = prev[section] ?? [];
      const already = cur.includes(choice);
      return { ...prev, [section]: already ? cur.filter(c => c !== choice) : [...cur, choice] };
    });
  };

  const handleAddToCart = () => {
    if (!available) return;
    const customParts: string[] = [];
    Object.entries(selections).forEach(([sec, choices]) => {
      if (choices.length > 0) customParts.push(`${sec}: ${choices.join(', ')}`);
    });
    const customDesc = customParts.length > 0
      ? `${product.description} · ${customParts.join(' · ')}`
      : product.description;

    for (let i = 0; i < qty; i++) {
      addItem({
        id:          product.id,
        name:        product.name,
        imageUrl:    photoUrl ?? undefined,
        images:      photoUrl ? [photoUrl] : [],
        category:    category as any,
        price:       pricePerItem,
        description: customDesc,
        available:   true,
        gradient:    [palette.bg, palette.banner] as [string, string],
        priceId:     product.prices?.[0]?.id,
      });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  return (
    <View style={s.root}>

      {/* ── HERO: swipeable gallery ──────────────────────────────────────── */}
      <View style={[s.hero, { height: HERO_H }]}>

        {/* Horizontal pager — FlatList avoids gesture conflicts with the vertical sheet below */}
        {galleryUrls.length > 0 ? (
          <FlatList
            ref={heroListRef}
            data={galleryUrls}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item }}
                style={{ width: W, height: HERO_H }}
                contentFit="cover"
                transition={200}
              />
            )}
            horizontal
            snapToInterval={W}
            snapToAlignment="start"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            bounces={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={(_, index) => ({ length: W, offset: W * index, index })}
            style={{ width: W, height: HERO_H }}
            scrollEnabled={galleryUrls.length > 1}
          />
        ) : (
          <View style={[s.photoFallback, { backgroundColor: palette.bg }]}>
            <Text style={s.fallbackEmoji}>{palette.emoji}</Text>
          </View>
        )}

        {/* Page dots — only when there's more than one image */}
        {galleryUrls.length > 1 && (
          <View style={s.dotRow} pointerEvents="none">
            {galleryUrls.map((_, i) => (
              <View
                key={i}
                style={[s.dot, i === photoIndex ? s.dotActive : s.dotInactive]}
              />
            ))}
          </View>
        )}

        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          style={[s.navBtn, { top: insets.top + 10, left: 16 }]}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={20} color={TEXT} />
        </Pressable>

        {/* Favourite button */}
        <Pressable
          onPress={handleFavouriteToggle}
          disabled={togglingFav}
          style={[s.navBtn, { top: insets.top + 10, right: 16 }]}
          hitSlop={12}
        >
          <Feather
            name="heart"
            size={18}
            color={isFavourited ? RED : TEXT}
            style={{ opacity: togglingFav ? 0.5 : 1 }}
          />
        </Pressable>

        {/* Status pills */}
        {(isNew || isLimited || isComingSoon || isSoldOut) && (
          <View style={s.pillRow}>
            {isNew       && <StatusPill label="NEW"          color="#1C1C1E" />}
            {isLimited   && <StatusPill label="LIMITED"      color={RED} />}
            {isComingSoon&& <StatusPill label="COMING SOON"  color={AMBER} textColor={TEXT} />}
            {isSoldOut   && <StatusPill label="SOLD OUT"     color="#6B7280" />}
          </View>
        )}
      </View>

      {/* ── WHITE SHEET ───────────────────────────────────────────────── */}
      <View style={s.sheet}>
        <View style={s.sheetInner}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={s.scroll}
            contentContainerStyle={{ paddingBottom: 18 }}
          >
            {/* Name */}
            <Text style={[s.name, { fontWeight: '700' }]}>{product.name}</Text>

            {/* Short description / about */}
            {(shortDesc || product.description) ? (
              <Text style={[s.desc, { fontWeight: '400' }]}>
                {shortDesc || product.description}
              </Text>
            ) : null}

            {productUrl ? (
              <Pressable
                onPress={() => Linking.openURL(productUrl).catch(() => {})}
                style={s.websiteLink}
              >
                <Text style={[s.websiteLinkText, { fontWeight: '600' }]}>View on Website</Text>
                <Text style={{ fontSize: 11, color: BLUE, fontWeight: '400', marginLeft: 2 }}>↗</Text>
              </Pressable>
            ) : null}

            {/* Dietary tags */}
            {dietaryTags.length > 0 && (
              <View style={[s.chipRow, { marginTop: 14 }]}>
                {dietaryTags.map(t => <DietaryChip key={t} label={t} />)}
              </View>
            )}

            {/* Flavour tags */}
            {tags.length > 0 && (
              <View style={[s.chipRow, { marginTop: 8 }]}>
                {tags.map(t => (
                  <View key={t} style={chip.tag}>
                    <Text style={[chip.tagText, { fontWeight: '500' }]}>{t}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Price + Quantity row ───────────────────────────────────── */}
            <View style={s.priceQtyCard}>
              <View style={{ flex: 1 }}>
                <Text style={[s.priceLabel, { fontWeight: '600' }]}>PRICE</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text style={[s.priceValue, { fontWeight: '700' }]}>
                    {priceDollars(displayCents)}
                  </Text>
                  {saleCents && priceCents !== saleCents && (
                    <Text style={[s.wasPrice, { fontWeight: '400' }]}>
                      {priceDollars(priceCents)}
                    </Text>
                  )}
                </View>
                {gst && <Text style={[s.gstNote, { fontWeight: '400' }]}>inc. GST</Text>}
              </View>

              {/* Qty stepper */}
              <View style={s.stepper}>
                <Pressable
                  onPress={() => { if (qty > minQty) { setQty(q => q - 1); Haptics.selectionAsync(); } }}
                  style={[s.stepBtn, { borderColor: BORDER, backgroundColor: qty <= minQty ? '#F3F4F6' : '#fff' }]}
                >
                  <Feather name="minus" size={16} color={qty <= minQty ? MUTED : TEXT} />
                </Pressable>
                <Text style={[s.stepNum, { fontWeight: '700' }]}>{qty}</Text>
                <Pressable
                  onPress={() => { if (qty < maxQty) { setQty(q => q + 1); Haptics.selectionAsync(); } }}
                  style={[s.stepBtn, { backgroundColor: BLUE, borderColor: BLUE }]}
                >
                  <Feather name="plus" size={16} color="#fff" />
                </Pressable>
              </View>
            </View>

            {maxQty < 99 && (
              <Text style={[{ fontWeight: '400', color: MUTED, fontSize: 12, marginTop: 6, marginLeft: 2 }]}>
                Max {maxQty} per order
              </Text>
            )}

            {/* Customise options — only shown when director has configured them on this product */}
            {(() => {
              const productCustomizations = parseArr((product as any)?.customizations ?? product?.metadata?.customizations);
              const parsedSections: { label: string; choices: string[] }[] = [];
              for (const item of productCustomizations) {
                try {
                  const parsed = typeof item === 'string' ? JSON.parse(item) : item;
                  if (parsed?.label && Array.isArray(parsed?.choices)) parsedSections.push(parsed);
                } catch {}
              }
              if (parsedSections.length === 0) return null;
              return (
                <View style={{ marginTop: 20, gap: 14 }}>
                  <Text style={[s.sectionTitle, { fontWeight: '700' }]}>Customise</Text>
                  {parsedSections.map((section) => (
                    <View key={section.label} style={{ gap: 8 }}>
                      <Text style={[s.optLabel, { fontWeight: '600' }]}>{section.label}</Text>
                      <View style={s.chipRow}>
                        {section.choices.map((choice: string) => {
                          const sel = (selections[section.label] ?? []).includes(choice);
                          return (
                            <Pressable
                              key={choice}
                              onPress={() => toggle(section.label, choice)}
                              style={[s.selChip, sel
                                ? { backgroundColor: palette.banner, borderColor: palette.banner }
                                : { backgroundColor: '#fff', borderColor: BORDER }
                              ]}
                            >
                              <Text style={[s.selChipText, {
                                fontWeight: sel ? '600' : '400',
                                color: sel ? '#fff' : TEXT,
                              }]}>
                                {choice}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })()}

            {/* Allergens */}
            {allergens.length > 0 && (
              <View style={[s.allergenCard, { marginTop: 20 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Feather name="alert-triangle" size={13} color={AMBER} />
                  <Text style={[s.sectionTitle, { fontWeight: '700', color: '#92400E' }]}>Contains</Text>
                </View>
                <View style={s.chipRow}>
                  {allergens.map(a => <AllergenChip key={a} label={a} />)}
                </View>
              </View>
            )}

            {/* Extra details */}
            {(ingredients || storage || serving || nutrition) ? (
              <View style={{ marginTop: 20, gap: 16 }}>
                <DetailSection icon="list"    title="Ingredients"  content={ingredients} />
                <DetailSection icon="bar-chart-2" title="Nutrition"  content={nutrition} />
                <DetailSection icon="archive" title="Storage"      content={storage} />
                <DetailSection icon="coffee"  title="Best Enjoyed" content={serving} />
              </View>
            ) : null}

            {/* Full description (if different from shortDesc) */}
            {product.description && shortDesc && product.description !== shortDesc ? (
              <View style={{ marginTop: 16 }}>
                <Text style={[s.sectionTitle, { fontWeight: '700', marginBottom: 6 }]}>About</Text>
                <Text style={[s.desc, { fontWeight: '400' }]}>{product.description}</Text>
              </View>
            ) : null}

          </ScrollView>

          {/* ── FOOTER ────────────────────────────────────────────────────── */}
          <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
            {isSoldOut ? (
              <View style={s.soldOutBtn}>
                <Text style={[s.soldOutText, { fontWeight: '700' }]}>Currently Sold Out</Text>
              </View>
            ) : isComingSoon ? (
              <View style={[s.soldOutBtn, { backgroundColor: '#FFF7ED', borderColor: AMBER }]}>
                <Text style={[s.soldOutText, { fontWeight: '700', color: '#92400E' }]}>Coming Soon</Text>
              </View>
            ) : (
              <Pressable onPress={handleAddToCart} style={[s.addBtn, { backgroundColor: BLUE }]}>
                <Text style={[s.addBtnText, { fontWeight: '700' }]}>
                  Add to bag · AUD {total.toFixed(2)}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#F5F6FA' },

  // Hero
  hero:         { position: 'relative', width: W, overflow: 'hidden' },
  navBtn:       { position: 'absolute', zIndex: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, width: 38, height: 38, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  photo:        { ...StyleSheet.absoluteFillObject },
  photoFallback:{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  fallbackEmoji:{ fontSize: 96 },
  pillRow:      { position: 'absolute', top: 12, right: 16, flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', zIndex: 5 },
  dotRow:       { position: 'absolute', bottom: 14, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, zIndex: 6 },
  dot:          { borderRadius: 4, height: 6 },
  dotActive:    { width: 18, backgroundColor: 'rgba(255,255,255,0.95)' },
  dotInactive:  { width: 6,  backgroundColor: 'rgba(255,255,255,0.45)' },

  // Sheet
  sheet:        { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -20, overflow: 'hidden' },
  sheetInner:   { flex: 1, paddingHorizontal: 22, paddingTop: 22 },

  // Text
  name:         { fontSize: 26, color: TEXT, lineHeight: 32, marginBottom: 8 },
  desc:         { fontSize: 14, color: MUTED, lineHeight: 22 },
  sectionTitle: { fontSize: 14, color: TEXT },
  optLabel:     { fontSize: 13, color: MUTED },
  websiteLink:     { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 2 },
  websiteLinkText: { fontSize: 13, color: BLUE },

  // Price + Qty card
  priceQtyCard: { flexDirection: 'row', alignItems: 'center', marginTop: 18, borderWidth: 1, borderColor: BORDER, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#FAFAFA' },
  priceLabel:   { fontSize: 11, color: MUTED, letterSpacing: 0.8, marginBottom: 2 },
  priceValue:   { fontSize: 22, color: TEXT },
  wasPrice:     { fontSize: 14, color: MUTED, textDecorationLine: 'line-through' },
  gstNote:      { fontSize: 11, color: MUTED, marginTop: 2 },

  // Stepper
  stepper:      { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn:      { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepNum:      { fontSize: 20, color: TEXT, minWidth: 28, textAlign: 'center' },

  // Chips
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selChip:      { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 30, borderWidth: 1.5 },
  selChipText:  { fontSize: 13 },
  scroll:       { flex: 1 },
  galleryContent:{ gap: 8, paddingRight: 4 },
  galleryThumbWrap:{ width: 58, height: 58, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, backgroundColor: '#F3F4F6' },
  galleryThumb:  { width: '100%', height: '100%' },

  // Allergens
  allergenCard: { backgroundColor: '#FFFBEB', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A' },

  // Footer
  footer:       { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER },
  addBtn:       { borderRadius: 30, paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  addBtnText:   { color: '#fff', fontSize: 16 },
  soldOutBtn:   { borderRadius: 30, paddingVertical: 17, alignItems: 'center', backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: BORDER },
  soldOutText:  { color: MUTED, fontSize: 16 },
});

const pill = StyleSheet.create({
  wrap: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  text: { fontSize: 10, letterSpacing: 0.8 },
});

const chip = StyleSheet.create({
  dietary:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  dietaryIcon: { fontSize: 13 },
  dietaryText: { fontSize: 12, color: '#166534' },
  allergen:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' },
  allergenText:{ fontSize: 12, color: '#92400E' },
  tag:         { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: '#F0F0F0' },
  tagText:     { fontSize: 12, color: MUTED },
});

const detail = StyleSheet.create({
  wrap:  { gap: 4 },
  title: { fontSize: 13, color: TEXT, letterSpacing: 0.3 },
  body:  { fontSize: 13, lineHeight: 20, color: MUTED },
});
