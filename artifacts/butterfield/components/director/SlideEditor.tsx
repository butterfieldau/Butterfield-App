import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, Switch, Text, TextInput, View,
} from 'react-native';
import type { DirectorProduct, HomeBannerSlide } from '@/lib/api';
import DateField from './DateField';
import { styles } from './settingsStyles';

const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

const BANNER_ROUTE_OPTIONS = [
  { value: 'menu',    label: 'Menu (order cookies)' },
  { value: 'loyalty', label: 'Rewards / Coffee Club' },
  { value: 'stores',  label: 'Our Stores' },
  { value: 'cart',    label: 'Cart' },
  { value: 'profile', label: 'Account / Profile' },
  { value: 'category:cookies', label: 'Category: Cookies' },
  { value: 'category:coffee', label: 'Category: Coffee / Skip Queue' },
];

function sydneyToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
}
function isScheduledFuture(slide: HomeBannerSlide): boolean {
  if (!slide.isActive || !slide.activeFrom) return false;
  return slide.activeFrom > sydneyToday();
}
function isExpired(slide: HomeBannerSlide): boolean {
  if (!slide.isActive || !slide.activeUntil) return false;
  return slide.activeUntil < sydneyToday();
}

export default function SlideEditor({
  slide, index, total, allProducts, loadingProducts, uploading,
  onChange, onMoveUp, onMoveDown, onRemove, onUploadImage, onProductPickerOpen,
}: {
  slide: HomeBannerSlide; index: number; total: number;
  allProducts: DirectorProduct[]; loadingProducts: boolean; uploading: boolean;
  onChange: (updated: HomeBannerSlide) => void;
  onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void;
  onUploadImage: (slideId: string) => void;
  onProductPickerOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const [showProductPicker, setShowProductPicker] = useState(slide.buttonRoute?.startsWith('product:') ?? false);
  const [productSearch, setProductSearch] = useState('');

  const set = (patch: Partial<HomeBannerSlide>) => onChange({ ...slide, ...patch });

  return (
    <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
      <Pressable
        onPress={() => { setExpanded(v => !v); Haptics.selectionAsync(); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 }}
      >
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: slide.isActive ? GREEN : BORDER, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '600', fontSize: 14, color: TEXT }} numberOfLines={1}>
            {slide.headline?.trim() || `Slide ${index + 1}`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 1 }}>
            {isScheduledFuture(slide) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: AMBER + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Feather name="clock" size={10} color={AMBER} />
                <Text style={{ fontSize: 11, color: AMBER, fontWeight: '600' }}>Scheduled</Text>
              </View>
            ) : isExpired(slide) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: MUTED + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Feather name="clock" size={10} color={MUTED} />
                <Text style={{ fontSize: 11, color: MUTED, fontWeight: '600' }}>Expired</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: slide.isActive ? GREEN : MUTED, fontWeight: '500' }}>
                {slide.isActive ? 'Active' : 'Hidden'}
              </Text>
            )}
            <Text style={{ fontSize: 12, color: MUTED }}>{slide.imageUrl ? '· Has image' : '· Gradient'}</Text>
          </View>
        </View>
        <Switch
          value={slide.isActive}
          onValueChange={v => { set({ isActive: v }); Haptics.selectionAsync(); }}
          trackColor={{ false: '#D1D5DB', true: GREEN }}
          thumbColor="#fff"
          ios_backgroundColor="#D1D5DB"
        />
        <Pressable onPress={e => { e.stopPropagation(); onMoveUp(); }} disabled={index === 0} hitSlop={8} style={{ opacity: index === 0 ? 0.3 : 1 }}>
          <Feather name="chevron-up" size={18} color={MUTED} />
        </Pressable>
        <Pressable onPress={e => { e.stopPropagation(); onMoveDown(); }} disabled={index === total - 1} hitSlop={8} style={{ opacity: index === total - 1 ? 0.3 : 1 }}>
          <Feather name="chevron-down" size={18} color={MUTED} />
        </Pressable>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={BLUE} />
      </Pressable>

      {expanded && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 14 }}>
          <View style={[styles.divider, { backgroundColor: BORDER, marginBottom: 0 }]} />

          {/* Background image */}
          <View style={{ gap: 8 }}>
            <Text style={styles.section}>BACKGROUND IMAGE</Text>
            <Pressable onPress={() => onUploadImage(slide.id)} disabled={uploading}
              style={[styles.addBtn, { backgroundColor: uploading ? MUTED : BLUE, opacity: uploading ? 0.8 : 1 }]}>
              {uploading
                ? <ActivityIndicator color="#fff" size="small" />
                : (<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Feather name="upload" size={15} color="#fff" /><Text style={styles.addBtnText}>Upload from Camera Roll</Text></View>)}
            </Pressable>
            {slide.imageUrl ? (<Image source={{ uri: slide.imageUrl }} style={{ width: '100%', height: 100, borderRadius: 10, resizeMode: 'cover' }} />) : null}
            <TextInput
              style={[styles.input, { borderColor: BORDER, color: TEXT }]}
              value={slide.imageUrl ?? ''}
              onChangeText={v => set({ imageUrl: v })}
              placeholder="https://... (leave blank for gradient)"
              placeholderTextColor={MUTED}
              autoCapitalize="none" autoCorrect={false} keyboardType="url"
            />
            <Text style={[styles.hint, { color: MUTED }]}>Best at 1600×900px (16:9 landscape).</Text>
          </View>

          {/* Headline text */}
          <View style={{ gap: 8 }}>
            <Text style={styles.section}>HEADLINE TEXT</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={slide.headline ?? ''} onChangeText={v => set({ headline: v })} placeholder="e.g. Summer Cookie Drop" placeholderTextColor={MUTED} />
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={slide.headlineAccent ?? ''} onChangeText={v => set({ headlineAccent: v })} placeholder="Accent word (optional)" placeholderTextColor={MUTED} />
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={slide.subtext ?? ''} onChangeText={v => set({ subtext: v })} placeholder="Subtext (optional)" placeholderTextColor={MUTED} />
          </View>

          {/* CTA button */}
          <View style={{ gap: 8 }}>
            <Text style={styles.section}>BUTTON</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={slide.buttonText ?? ''} onChangeText={v => set({ buttonText: v })} placeholder="Order Now" placeholderTextColor={MUTED} />
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={slide.buttonUrl ?? ''} onChangeText={v => set({ buttonUrl: v })} placeholder="External URL (optional)" placeholderTextColor={MUTED} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { marginBottom: 2 }]}>In-app destination</Text>
              {BANNER_ROUTE_OPTIONS.map(opt => (
                <Pressable key={opt.value}
                  onPress={() => { set({ buttonRoute: opt.value }); setShowProductPicker(false); Haptics.selectionAsync(); }}
                  style={[styles.row, { padding: 9, borderRadius: 9, borderWidth: 1, borderColor: slide.buttonRoute === opt.value ? BLUE : BORDER, backgroundColor: slide.buttonRoute === opt.value ? '#EBF8FF' : '#FAFAFA' }]}
                >
                  <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: slide.buttonRoute === opt.value ? BLUE : BORDER, backgroundColor: slide.buttonRoute === opt.value ? BLUE : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {slide.buttonRoute === opt.value && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />}
                  </View>
                  <Text style={{ fontWeight: '500', fontSize: 13, color: slide.buttonRoute === opt.value ? BLUE : TEXT }}>{opt.label}</Text>
                </Pressable>
              ))}
              {(() => {
                const isProd = slide.buttonRoute?.startsWith('product:') || slide.buttonRoute === '__product__';
                const linkedPid = slide.buttonRoute?.startsWith('product:') ? slide.buttonRoute.replace('product:', '').trim() : '';
                const linkedProduct = linkedPid ? allProducts.find(p => p.id === linkedPid) : null;
                return (
                  <Pressable
                    onPress={() => { setShowProductPicker(true); onProductPickerOpen(); if (!slide.buttonRoute?.startsWith('product:')) set({ buttonRoute: '__product__' }); Haptics.selectionAsync(); }}
                    style={[styles.row, { padding: 9, borderRadius: 9, borderWidth: 1, borderColor: isProd ? BLUE : BORDER, backgroundColor: isProd ? '#EBF8FF' : '#FAFAFA', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }]}
                  >
                    <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, marginTop: 2, borderColor: isProd ? BLUE : BORDER, backgroundColor: isProd ? BLUE : 'transparent', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isProd && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '500', fontSize: 13, color: isProd ? BLUE : TEXT }}>Specific product</Text>
                      {linkedProduct ? (
                        <Text style={{ fontSize: 11, color: GREEN, marginTop: 1, fontWeight: '500' }}>✓ {linkedProduct.name}</Text>
                      ) : isProd ? (
                        <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>Select below</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })()}
              {showProductPicker && (
                <View style={{ gap: 6, paddingTop: 2 }}>
                  <TextInput style={[styles.input, { borderColor: BLUE + '60', color: TEXT }]} value={productSearch} onChangeText={setProductSearch} placeholder="Search products…" placeholderTextColor={MUTED} autoCapitalize="none" autoCorrect={false} />
                  {loadingProducts && <ActivityIndicator color={BLUE} size="small" style={{ marginVertical: 4 }} />}
                  {allProducts.filter(p => !productSearch.trim() || p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 8).map(p => {
                    const isSel = slide.buttonRoute === `product:${p.id}`;
                    return (
                      <Pressable key={p.id} onPress={() => { set({ buttonRoute: `product:${p.id}` }); setProductSearch(''); Haptics.selectionAsync(); }}
                        style={[styles.row, { padding: 9, borderRadius: 8, borderWidth: 1, borderColor: isSel ? GREEN : BORDER, backgroundColor: isSel ? '#F0FFF4' : '#FAFAFA' }]}>
                        <Feather name={isSel ? 'check-circle' : 'circle'} size={14} color={isSel ? GREEN : BORDER} />
                        <Text style={{ fontWeight: '500', fontSize: 13, color: isSel ? GREEN : TEXT, flex: 1 }} numberOfLines={1}>{p.name}</Text>
                        {p.priceCents ? <Text style={{ fontSize: 11, color: MUTED }}>${(p.priceCents / 100).toFixed(2)}</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <TextInput
                style={[styles.input, { borderColor: BORDER, color: TEXT, marginTop: 4 }]}
                value={slide.buttonRoute === '__product__' ? '' : (slide.buttonRoute ?? '')}
                onChangeText={v => { set({ buttonRoute: v }); setShowProductPicker(v.startsWith('product:')); }}
                placeholder="Custom: category:cookies, product:abc123"
                placeholderTextColor={MUTED} autoCapitalize="none" autoCorrect={false}
              />
            </View>
          </View>

          {/* Schedule window */}
          <View style={{ gap: 8 }}>
            <Text style={styles.section}>SCHEDULE (OPTIONAL)</Text>
            <View style={[styles.card, { backgroundColor: '#FFFBEB', borderColor: AMBER + '40', padding: 10, gap: 4 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                <Feather name="info" size={12} color={AMBER} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 }}>
                  Leave both dates blank to show this slide whenever it is active.
                </Text>
              </View>
            </View>
            <DateField label="Show from" value={slide.activeFrom} onChange={v => set({ activeFrom: v })} placeholder="Any time" />
            <DateField label="Show until" value={slide.activeUntil} onChange={v => set({ activeUntil: v })} placeholder="No end date" />
          </View>

          {total > 1 && (
            <Pressable onPress={() => { Alert.alert('Remove slide', 'Remove this slide from the banner?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: onRemove }]); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', padding: 8 }}>
              <Feather name="trash-2" size={14} color={RED} />
              <Text style={{ color: RED, fontSize: 13, fontWeight: '600' }}>Remove slide</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
