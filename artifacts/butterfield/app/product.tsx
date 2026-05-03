import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Dimensions, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCart } from '@/context/CartContext';
import { getPalette, getOptions } from '@/constants/categoryColors';
import { getSelectedProduct } from '@/lib/selectedProduct';
import { api } from '@/lib/api';

const { width: W, height: H } = Dimensions.get('window');
const HERO_H = Math.round(H * 0.42);

const BLUE   = '#40C0F2';
const RED    = '#F40009';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#F0F0F0';
const BG     = '#F5F6FA';

function priceDollars(cents?: number | null): string {
  if (!cents) return '';
  return `$${(cents / 100).toFixed(2)}`;
}

function parseArr(val: any): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { const r = JSON.parse(val); if (Array.isArray(r)) return r; } catch {}
    return val.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  return [];
}

// ── Dietary chip ──────────────────────────────────────────────────────────────
const DIETARY_ICONS: Record<string, string> = {
  Vegan: '🌱', Vegetarian: '🥦', 'Gluten-Free': '🌾', 'Dairy-Free': '🥛',
  'Nut-Free': '🥜', Halal: '☪️', Kosher: '✡️', 'Low-Sugar': '🍬',
};

function DietaryChip({ label }: { label: string }) {
  const icon = DIETARY_ICONS[label] ?? '✓';
  return (
    <View style={chip.dietary}>
      <Text style={chip.dietaryIcon}>{icon}</Text>
      <Text style={[chip.dietaryText, { fontFamily: 'Inter_600SemiBold' }]}>{label}</Text>
    </View>
  );
}

function AllergenChip({ label }: { label: string }) {
  return (
    <View style={chip.allergen}>
      <Text style={[chip.allergenText, { fontFamily: 'Inter_500Medium' }]}>{label}</Text>
    </View>
  );
}

// ── Detail section ────────────────────────────────────────────────────────────
function DetailSection({ icon, title, content }: { icon: string; title: string; content: string }) {
  if (!content?.trim()) return null;
  return (
    <View style={detail.wrap}>
      <View style={detail.header}>
        <Feather name={icon as any} size={14} color={MUTED} />
        <Text style={[detail.title, { fontFamily: 'Inter_700Bold', color: TEXT }]}>{title}</Text>
      </View>
      <Text style={[detail.body, { fontFamily: 'Inter_400Regular', color: MUTED }]}>{content}</Text>
    </View>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[badge.wrap, { backgroundColor: color }]}>
      <Text style={[badge.text, { fontFamily: 'Inter_700Bold' }]}>{label}</Text>
    </View>
  );
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

  if (!product) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <Text style={{ fontFamily: 'Inter_400Regular', color: MUTED }}>No product selected</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16, padding: 12 }}>
          <Text style={{ color: BLUE, fontFamily: 'Inter_600SemiBold' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const category     = (product as any).category ?? product.metadata?.category ?? 'cookies';
  const palette      = getPalette(category);
  const options      = getOptions(category);
  const photoUrl     = product.images?.[0] ?? null;

  const priceCents   = (product as any).priceCents      ?? product.prices?.[0]?.unit_amount ?? 0;
  const saleCents    = (product as any).salePriceCents;
  const displayCents = saleCents ?? priceCents;
  const pricePerItem = displayCents / 100;
  const total        = pricePerItem * qty;

  const allergens    = parseArr((product as any).allergens  ?? product.metadata?.allergens);
  const dietaryTags  = parseArr((product as any).dietaryTags ?? product.metadata?.dietaryTags);
  const tags         = parseArr((product as any).tags       ?? product.metadata?.tags);
  const shortDesc    = (product as any).shortDescription   ?? product.metadata?.shortDescription ?? '';
  const ingredients  = (product as any).ingredients        ?? product.metadata?.ingredients ?? '';
  const storage      = (product as any).storageInstructions ?? product.metadata?.storageInstructions ?? '';
  const serving      = (product as any).servingInstructions ?? product.metadata?.servingInstructions ?? '';
  const available    = product.metadata?.available !== 'false';
  const isNew        = product.metadata?.isNew === 'true'         || (product as any).isNew;
  const isLimited    = product.metadata?.isLimitedDrop === 'true' || (product as any).isLimitedDrop;
  const isSoldOut    = product.metadata?.available === 'false'    || (product as any).isSoldOut;
  const isComingSoon = product.metadata?.isComingSoon === 'true'  || (product as any).isComingSoon;
  const gst          = (product as any).gstIncluded !== false;

  const minQty = (product as any).minOrderQty ?? 1;
  const maxQty = (product as any).maxOrderQty ?? 99;

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

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <View style={[s.hero, { height: HERO_H }]}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={s.heroImage}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={[s.heroFallback, { backgroundColor: palette.bg }]}>
            {product.name.toUpperCase().split(' ').map((word, i) => (
              <Text key={i} style={[s.watermark, { color: palette.banner }]}>{word}</Text>
            ))}
            <Text style={s.heroEmoji}>{palette.emoji}</Text>
          </View>
        )}

        {/* Gradient overlay at bottom */}
        <View style={s.heroGradient} />

        {/* Back button */}
        <Pressable onPress={() => router.back()} style={[s.overlayBtn, { top: insets.top + 12, left: 16 }]} hitSlop={12}>
          <Feather name="arrow-left" size={20} color="#1C1C1E" />
        </Pressable>

        {/* Favourite button */}
        <Pressable onPress={handleFavouriteToggle} disabled={togglingFav}
          style={[s.overlayBtn, { top: insets.top + 12, right: 16 }]} hitSlop={12}>
          <Feather name="heart" size={18} color={isFavourited ? RED : '#1C1C1E'}
            style={{ opacity: togglingFav ? 0.5 : 1 }} />
        </Pressable>

        {/* Badges strip */}
        <View style={s.badgeStrip}>
          {isNew       && <Badge label="NEW"         color="#1C1C1E" />}
          {isLimited   && <Badge label="LIMITED DROP" color={RED}    />}
          {isComingSoon&& <Badge label="COMING SOON"  color={AMBER}  />}
          {isSoldOut   && <Badge label="SOLD OUT"     color="#6B7280" />}
        </View>
      </View>

      {/* ── SCROLLABLE CONTENT ────────────────────────────────────────── */}
      <View style={s.sheet}>
        {/* Name + price */}
        <View style={s.nameRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.productName, { fontFamily: 'Inter_700Bold' }]}>{product.name}</Text>
            {shortDesc ? (
              <Text style={[s.shortDesc, { fontFamily: 'Inter_400Regular' }]}>{shortDesc}</Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
            <Text style={[s.price, { fontFamily: 'Inter_700Bold' }]}>{priceDollars(displayCents)}</Text>
            {saleCents && priceCents !== saleCents ? (
              <Text style={[s.wasPrice, { fontFamily: 'Inter_400Regular' }]}>{priceDollars(priceCents)}</Text>
            ) : null}
            {gst && <Text style={[s.gstNote, { fontFamily: 'Inter_400Regular' }]}>inc. GST</Text>}
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 20, paddingBottom: 32 }}>

          {/* Dietary tags */}
          {dietaryTags.length > 0 && (
            <View style={s.chipRow}>
              {dietaryTags.map(t => <DietaryChip key={t} label={t} />)}
            </View>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <View style={s.chipRow}>
              {tags.map(t => (
                <View key={t} style={chip.tag}>
                  <Text style={[chip.tagText, { fontFamily: 'Inter_500Medium' }]}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Full description */}
          {product.description ? (
            <View style={s.descBlock}>
              <View style={s.sectionHeaderRow}>
                <Feather name="info" size={13} color={MUTED} />
                <Text style={[s.sectionHeaderText, { fontFamily: 'Inter_700Bold' }]}>About this product</Text>
              </View>
              <Text style={[s.descText, { fontFamily: 'Inter_400Regular' }]}>{product.description}</Text>
            </View>
          ) : null}

          {/* Allergens */}
          {allergens.length > 0 && (
            <View style={s.allergenBlock}>
              <View style={s.sectionHeaderRow}>
                <Feather name="alert-triangle" size={13} color={AMBER} />
                <Text style={[s.sectionHeaderText, { fontFamily: 'Inter_700Bold', color: '#92400E' }]}>Contains</Text>
              </View>
              <View style={s.chipRow}>
                {allergens.map(a => <AllergenChip key={a} label={a} />)}
              </View>
            </View>
          )}

          {/* Ingredients */}
          <DetailSection icon="list"     title="Ingredients"           content={ingredients} />
          <DetailSection icon="archive"  title="Storage"               content={storage} />
          <DetailSection icon="coffee"   title="Best Enjoyed"          content={serving} />

          {/* Divider */}
          <View style={s.divider} />

          {/* Quantity */}
          <View>
            <Text style={[s.sectionLabel, { fontFamily: 'Inter_700Bold' }]}>Quantity</Text>
            <View style={s.qtyRow}>
              <Pressable
                onPress={() => { if (qty > minQty) { setQty(q => q - 1); Haptics.selectionAsync(); } }}
                style={[s.qtyBtn, { borderColor: qty <= minQty ? BORDER : '#D1D5DB' }]}
              >
                <Feather name="minus" size={16} color={qty <= minQty ? BORDER : TEXT} />
              </Pressable>
              <Text style={[s.qtyNum, { fontFamily: 'Inter_700Bold' }]}>{qty}</Text>
              <Pressable
                onPress={() => { if (qty < maxQty) { setQty(q => q + 1); Haptics.selectionAsync(); } }}
                style={[s.qtyBtn, { borderColor: BLUE, backgroundColor: BLUE }]}
              >
                <Feather name="plus" size={16} color="#fff" />
              </Pressable>
            </View>
            {maxQty < 99 && (
              <Text style={[{ fontFamily: 'Inter_400Regular', color: MUTED, fontSize: 12, marginTop: 6 }]}>Max {maxQty} per order</Text>
            )}
          </View>

          {/* Customise options */}
          {options.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { fontFamily: 'Inter_700Bold' }]}>Customise</Text>
              {options.map((section: any) => (
                <View key={section.label} style={s.sectionBlock}>
                  <Text style={[s.optionLabel, { fontFamily: 'Inter_600SemiBold' }]}>{section.label}</Text>
                  <View style={s.chipsWrap}>
                    {section.choices.map((choice: string) => {
                      const sel = (selections[section.label] ?? []).includes(choice);
                      return (
                        <Pressable key={choice} onPress={() => toggle(section.label, choice)}
                          style={[s.chip, sel ? { backgroundColor: palette.banner, borderColor: palette.banner } : { backgroundColor: '#fff', borderColor: '#E5E7EB' }]}>
                          <Text style={[s.chipText, { fontFamily: sel ? 'Inter_600SemiBold' : 'Inter_400Regular', color: sel ? '#fff' : TEXT }]}>
                            {choice}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </>
          )}

        </ScrollView>
      </View>

      {/* ── FIXED FOOTER ──────────────────────────────────────────────── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {isSoldOut ? (
          <View style={s.soldOutBtn}>
            <Text style={[s.soldOutText, { fontFamily: 'Inter_700Bold' }]}>Currently Sold Out</Text>
          </View>
        ) : (
          <Pressable onPress={handleAddToCart} style={[s.addBtn, { backgroundColor: '#1C1C1E' }]}>
            <Feather name="shopping-bag" size={18} color="#fff" />
            <Text style={[s.addBtnText, { fontFamily: 'Inter_700Bold' }]}>
              Add to Order{qty > 1 ? ` (${qty})` : ''} — ${total.toFixed(2)}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#fff' },
  hero:       { position: 'relative', width: W, overflow: 'hidden', backgroundColor: '#F0EDE8' },
  heroImage:  { width: '100%', height: '100%' },
  heroFallback:{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  watermark:  { fontSize: 56, lineHeight: 60, opacity: 0.18, fontWeight: '900', letterSpacing: 2, position: 'absolute' },
  heroEmoji:  { fontSize: 80, lineHeight: 100, zIndex: 2 },
  heroGradient:{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, backgroundColor: 'rgba(0,0,0,0.0)' },
  overlayBtn: { position: 'absolute', zIndex: 10, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, width: 38, height: 38, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  badgeStrip: { position: 'absolute', bottom: 14, left: 16, flexDirection: 'row', gap: 8, zIndex: 5 },
  sheet:      { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -20, paddingHorizontal: 20, paddingTop: 20 },
  nameRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  productName:{ fontSize: 22, color: TEXT, lineHeight: 28, flex: 1 },
  shortDesc:  { fontSize: 13, color: MUTED, lineHeight: 18, marginTop: 2 },
  price:      { fontSize: 24, color: TEXT },
  wasPrice:   { fontSize: 14, color: MUTED, textDecorationLine: 'line-through' },
  gstNote:    { fontSize: 11, color: MUTED },
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionHeaderRow:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionHeaderText:{ fontSize: 13, color: TEXT },
  descBlock:  { gap: 0 },
  descText:   { fontSize: 14, color: MUTED, lineHeight: 21 },
  allergenBlock:{ backgroundColor: '#FFFBEB', padding: 14, borderRadius: 12, gap: 10 },
  divider:    { height: 1, backgroundColor: BORDER },
  sectionLabel:{ fontSize: 17, color: TEXT, marginBottom: 12 },
  optionLabel: { fontSize: 14, color: TEXT, marginBottom: 8 },
  sectionBlock:{ gap: 0 },
  qtyRow:     { flexDirection: 'row', alignItems: 'center', gap: 18 },
  qtyBtn:     { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  qtyNum:     { fontSize: 22, color: TEXT, minWidth: 32, textAlign: 'center' },
  chipsWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 30, borderWidth: 1.5 },
  chipText:   { fontSize: 14 },
  footer:     { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER },
  addBtn:     { borderRadius: 30, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  addBtnText: { color: '#fff', fontSize: 16 },
  soldOutBtn: { borderRadius: 30, padding: 18, alignItems: 'center', backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: BORDER },
  soldOutText:{ color: MUTED, fontSize: 16 },
});

const badge = StyleSheet.create({
  wrap: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  text: { color: '#fff', fontSize: 10, letterSpacing: 1 },
});

const chip = StyleSheet.create({
  dietary:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  dietaryIcon: { fontSize: 13 },
  dietaryText: { fontSize: 12, color: '#166534' },
  allergen:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' },
  allergenText:{ fontSize: 12, color: '#92400E' },
  tag:         { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: '#F3F4F6' },
  tagText:     { fontSize: 12, color: MUTED },
});

const detail = StyleSheet.create({
  wrap:   { gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title:  { fontSize: 13, letterSpacing: 0.3 },
  body:   { fontSize: 14, lineHeight: 21 },
});
