import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  api,
  type DirectorAnnouncement,
  type DirectorProduct,
  type DirectorReward,
  type DirectorUserSummary,
  type HomeBannerConfig,
  type HomeBannerSlide,
  type HomeBannerCarouselConfig,
  type StoreHour,
  type StoreSummary,
} from '@/lib/api';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { sendTestPrint } from '@/lib/printer';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
import TimeWheelPicker from '@/components/TimeWheelPicker';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const BLUE_DARK = '#3CBBEE';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER      = '#E5E7EB';
const GLASS_BG    = 'rgba(255,255,255,0.6)';
const GLASS_BORDER= 'rgba(255,255,255,0.85)';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

type TabKey = 'Store' | 'Banner' | 'Rewards' | 'Notify' | 'Managers' | 'Directors' | 'Delivery';

const REWARD_CATEGORIES = ['food', 'drink', 'discount', 'experience', 'merchandise'];
const TARGET_ROLES      = ['customer', 'staff', 'wholesale'];

type FeatherIconName = ComponentProps<typeof Feather>['name'];
type RewardType = DirectorReward['rewardType'];

function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

// ─── Banner Tab ───────────────────────────────────────────────────────────────
const BANNER_ROUTE_OPTIONS = [
  { value: 'menu',    label: 'Menu (order cookies)' },
  { value: 'loyalty', label: 'Rewards / Coffee Club' },
  { value: 'stores',  label: 'Our Stores' },
  { value: 'cart',    label: 'Cart' },
  { value: 'profile', label: 'Account / Profile' },
  { value: 'category:cookies', label: 'Category: Cookies' },
  { value: 'category:coffee', label: 'Category: Coffee / Skip Queue' },
];

export function SettingsStandaloneScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <DirectorStandaloneScreen title={title}>
      {children}
    </DirectorStandaloneScreen>
  );
}

// ─── Slide Editor (used inside BannerTab for each slide) ──────────────────────

const MAX_SLIDES = 5;

function makeBlankSlide(sortOrder: number): HomeBannerSlide {
  return {
    id: `new-${Date.now()}-${sortOrder}`,
    sortOrder,
    isActive: true,
    imageUrl: '',
    headline: '',
    headlineAccent: '',
    subtext: '',
    buttonText: 'Order Now',
    buttonRoute: 'menu',
    buttonUrl: '',
  };
}

/** Format ISO date string YYYY-MM-DD → DD/MM/YYYY for display */
function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Parse DD/MM/YYYY or YYYY-MM-DD input → YYYY-MM-DD, or null if invalid */
function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : trimmed;
  }
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [dd, mm, yyyy] = trimmed.split('/');
    const iso = `${yyyy}-${mm}-${dd}`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : iso;
  }
  return null;
}

/** Today's date in Australia/Sydney timezone as YYYY-MM-DD, matching the server filter */
function sydneyToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
}

/** Returns true if a slide with isActive=true is scheduled but not yet in window */
function isScheduledFuture(slide: HomeBannerSlide): boolean {
  if (!slide.isActive || !slide.activeFrom) return false;
  return slide.activeFrom > sydneyToday();
}

/** Returns true if a slide with isActive=true has passed its activeUntil date */
function isExpired(slide: HomeBannerSlide): boolean {
  if (!slide.isActive || !slide.activeUntil) return false;
  return slide.activeUntil < sydneyToday();
}

/** Date picker field — shows formatted date, opens an InlineCalendarPicker modal on press */
function DateField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (iso: string | undefined) => void;
  placeholder?: string;
}) {
  const [showCal, setShowCal] = useState(false);

  const selectedDate = value ? new Date(value + 'T12:00:00') : null;

  const clear = () => { onChange(undefined); Haptics.selectionAsync(); };

  return (
    <View style={{ gap: 4 }}>
      <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={() => { setShowCal(true); Haptics.selectionAsync(); }}
          style={[styles.input, {
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingVertical: 10, borderColor: BORDER,
          }]}
        >
          <Text style={{ fontSize: 14, color: value ? TEXT : MUTED }}>
            {value ? fmtDate(value) : (placeholder ?? 'No date set')}
          </Text>
          <Feather name="calendar" size={14} color={BLUE} />
        </Pressable>
        {value && (
          <Pressable onPress={clear} hitSlop={8}>
            <Feather name="x-circle" size={16} color={MUTED} />
          </Pressable>
        )}
      </View>

      <Modal visible={showCal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD }}>
            <Pressable onPress={() => setShowCal(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="x" size={20} color={TEXT} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT }}>{label}</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
            <InlineCalendarPicker
              selectedDate={selectedDate}
              onSelectDate={d => {
                const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                onChange(iso);
                setShowCal(false);
                Haptics.selectionAsync();
              }}
              accentColor={BLUE}
            />
            {value && (
              <Pressable
                onPress={clear}
                style={{ marginTop: 12, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: BORDER }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: MUTED }}>Clear Date</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function SlideEditor({
  slide,
  index,
  total,
  allProducts,
  loadingProducts,
  uploading,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  onUploadImage,
  onProductPickerOpen,
}: {
  slide: HomeBannerSlide;
  index: number;
  total: number;
  allProducts: DirectorProduct[];
  loadingProducts: boolean;
  uploading: boolean;
  onChange: (updated: HomeBannerSlide) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onUploadImage: (slideId: string) => void;
  onProductPickerOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const [showProductPicker, setShowProductPicker] = useState(slide.buttonRoute?.startsWith('product:') ?? false);
  const [productSearch, setProductSearch] = useState('');

  const set = (patch: Partial<HomeBannerSlide>) => onChange({ ...slide, ...patch });

  return (
    <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
      {/* Header row */}
      <Pressable
        onPress={() => { setExpanded(v => !v); Haptics.selectionAsync(); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 }}
      >
        <View style={{
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: slide.isActive ? GREEN : BORDER,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '600', fontSize: 14, color: TEXT }} numberOfLines={1}>
            {slide.headline?.trim() || `Slide ${index + 1}`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 1 }}>
            {isScheduledFuture(slide) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                backgroundColor: AMBER + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Feather name="clock" size={10} color={AMBER} />
                <Text style={{ fontSize: 11, color: AMBER, fontWeight: '600' }}>Scheduled</Text>
              </View>
            ) : isExpired(slide) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                backgroundColor: MUTED + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Feather name="clock" size={10} color={MUTED} />
                <Text style={{ fontSize: 11, color: MUTED, fontWeight: '600' }}>Expired</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: slide.isActive ? GREEN : MUTED, fontWeight: '500' }}>
                {slide.isActive ? 'Active' : 'Hidden'}
              </Text>
            )}
            <Text style={{ fontSize: 12, color: MUTED }}>
              {slide.imageUrl ? '· Has image' : '· Gradient'}
            </Text>
          </View>
        </View>
        {/* Active toggle */}
        <Switch
          value={slide.isActive}
          onValueChange={v => { set({ isActive: v }); Haptics.selectionAsync(); }}
          trackColor={{ false: '#D1D5DB', true: GREEN }}
          thumbColor="#fff"
          ios_backgroundColor="#D1D5DB"
        />
        {/* Move up/down */}
        <Pressable
          onPress={e => { e.stopPropagation(); onMoveUp(); }}
          disabled={index === 0}
          hitSlop={8}
          style={{ opacity: index === 0 ? 0.3 : 1 }}
        >
          <Feather name="chevron-up" size={18} color={MUTED} />
        </Pressable>
        <Pressable
          onPress={e => { e.stopPropagation(); onMoveDown(); }}
          disabled={index === total - 1}
          hitSlop={8}
          style={{ opacity: index === total - 1 ? 0.3 : 1 }}
        >
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
            <Pressable
              onPress={() => onUploadImage(slide.id)}
              disabled={uploading}
              style={[styles.addBtn, { backgroundColor: uploading ? MUTED : BLUE, opacity: uploading ? 0.8 : 1 }]}
            >
              {uploading
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="upload" size={15} color="#fff" />
                    <Text style={styles.addBtnText}>Upload from Camera Roll</Text>
                  </View>
                )}
            </Pressable>
            {slide.imageUrl ? (
              <Image
                source={{ uri: slide.imageUrl }}
                style={{ width: '100%', height: 100, borderRadius: 10, resizeMode: 'cover' }}
              />
            ) : null}
            <TextInput
              style={[styles.input, { borderColor: BORDER, color: TEXT }]}
              value={slide.imageUrl ?? ''}
              onChangeText={v => set({ imageUrl: v })}
              placeholder="https://... (leave blank for gradient)"
              placeholderTextColor={MUTED}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={[styles.hint, { color: MUTED }]}>Best at 1600×900px (16:9 landscape).</Text>
          </View>

          {/* Headline text */}
          <View style={{ gap: 8 }}>
            <Text style={styles.section}>HEADLINE TEXT</Text>
            <TextInput
              style={[styles.input, { borderColor: BORDER, color: TEXT }]}
              value={slide.headline ?? ''}
              onChangeText={v => set({ headline: v })}
              placeholder="e.g. Summer Cookie Drop"
              placeholderTextColor={MUTED}
            />
            <TextInput
              style={[styles.input, { borderColor: BORDER, color: TEXT }]}
              value={slide.headlineAccent ?? ''}
              onChangeText={v => set({ headlineAccent: v })}
              placeholder="Accent word (optional)"
              placeholderTextColor={MUTED}
            />
            <TextInput
              style={[styles.input, { borderColor: BORDER, color: TEXT }]}
              value={slide.subtext ?? ''}
              onChangeText={v => set({ subtext: v })}
              placeholder="Subtext (optional)"
              placeholderTextColor={MUTED}
            />
          </View>

          {/* CTA button */}
          <View style={{ gap: 8 }}>
            <Text style={styles.section}>BUTTON</Text>
            <TextInput
              style={[styles.input, { borderColor: BORDER, color: TEXT }]}
              value={slide.buttonText ?? ''}
              onChangeText={v => set({ buttonText: v })}
              placeholder="Order Now"
              placeholderTextColor={MUTED}
            />
            <TextInput
              style={[styles.input, { borderColor: BORDER, color: TEXT }]}
              value={slide.buttonUrl ?? ''}
              onChangeText={v => set({ buttonUrl: v })}
              placeholder="External URL (optional)"
              placeholderTextColor={MUTED}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { marginBottom: 2 }]}>In-app destination</Text>
              {BANNER_ROUTE_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  onPress={() => { set({ buttonRoute: opt.value }); setShowProductPicker(false); Haptics.selectionAsync(); }}
                  style={[
                    styles.row,
                    { padding: 9, borderRadius: 9, borderWidth: 1,
                      borderColor: slide.buttonRoute === opt.value ? BLUE : BORDER,
                      backgroundColor: slide.buttonRoute === opt.value ? '#EBF8FF' : '#FAFAFA' }
                  ]}
                >
                  <View style={{
                    width: 16, height: 16, borderRadius: 8, borderWidth: 2,
                    borderColor: slide.buttonRoute === opt.value ? BLUE : BORDER,
                    backgroundColor: slide.buttonRoute === opt.value ? BLUE : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {slide.buttonRoute === opt.value && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />}
                  </View>
                  <Text style={{ fontWeight: '500', fontSize: 13, color: slide.buttonRoute === opt.value ? BLUE : TEXT }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
              {/* Specific product */}
              {(() => {
                const isProd = slide.buttonRoute?.startsWith('product:') || slide.buttonRoute === '__product__';
                const linkedPid = slide.buttonRoute?.startsWith('product:') ? slide.buttonRoute.replace('product:', '').trim() : '';
                const linkedProduct = linkedPid ? allProducts.find(p => p.id === linkedPid) : null;
                return (
                  <Pressable
                    onPress={() => {
                      setShowProductPicker(true);
                      onProductPickerOpen();
                      if (!slide.buttonRoute?.startsWith('product:')) set({ buttonRoute: '__product__' });
                      Haptics.selectionAsync();
                    }}
                    style={[
                      styles.row,
                      { padding: 9, borderRadius: 9, borderWidth: 1,
                        borderColor: isProd ? BLUE : BORDER,
                        backgroundColor: isProd ? '#EBF8FF' : '#FAFAFA',
                        flexDirection: 'row', alignItems: 'flex-start', gap: 10 }
                    ]}
                  >
                    <View style={{
                      width: 16, height: 16, borderRadius: 8, borderWidth: 2, marginTop: 2,
                      borderColor: isProd ? BLUE : BORDER,
                      backgroundColor: isProd ? BLUE : 'transparent',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
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
                  <TextInput
                    style={[styles.input, { borderColor: BLUE + '60', color: TEXT }]}
                    value={productSearch}
                    onChangeText={setProductSearch}
                    placeholder="Search products…"
                    placeholderTextColor={MUTED}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {loadingProducts && <ActivityIndicator color={BLUE} size="small" style={{ marginVertical: 4 }} />}
                  {allProducts
                    .filter(p => !productSearch.trim() || p.name.toLowerCase().includes(productSearch.toLowerCase()))
                    .slice(0, 8)
                    .map(p => {
                      const isSel = slide.buttonRoute === `product:${p.id}`;
                      return (
                        <Pressable
                          key={p.id}
                          onPress={() => { set({ buttonRoute: `product:${p.id}` }); setProductSearch(''); Haptics.selectionAsync(); }}
                          style={[
                            styles.row,
                            { padding: 9, borderRadius: 8, borderWidth: 1,
                              borderColor: isSel ? GREEN : BORDER,
                              backgroundColor: isSel ? '#F0FFF4' : '#FAFAFA' }
                          ]}
                        >
                          <Feather name={isSel ? 'check-circle' : 'circle'} size={14} color={isSel ? GREEN : BORDER} />
                          <Text style={{ fontWeight: '500', fontSize: 13, color: isSel ? GREEN : TEXT, flex: 1 }} numberOfLines={1}>
                            {p.name}
                          </Text>
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
                placeholderTextColor={MUTED}
                autoCapitalize="none"
                autoCorrect={false}
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
                  Leave both dates blank to show this slide whenever it is active. Set "Show from" to pre-schedule a campaign, or "Show until" to auto-hide it after a date.
                </Text>
              </View>
            </View>
            <DateField
              label="Show from"
              value={slide.activeFrom}
              onChange={v => set({ activeFrom: v })}
              placeholder="Any time"
            />
            <DateField
              label="Show until"
              value={slide.activeUntil}
              onChange={v => set({ activeUntil: v })}
              placeholder="No end date"
            />
          </View>

          {/* Remove */}
          {total > 1 && (
            <Pressable
              onPress={() => { Alert.alert('Remove slide', 'Remove this slide from the banner?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: onRemove },
              ]); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', padding: 8 }}
            >
              <Feather name="trash-2" size={14} color={RED} />
              <Text style={{ color: RED, fontSize: 13, fontWeight: '600' }}>Remove slide</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

export function BannerTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['director-home-banner'],
    queryFn:  () => api.director.homeBanner(),
  });

  const [slides, setSlides] = useState<HomeBannerSlide[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingSlideId, setUploadingSlideId] = useState<string | null>(null);
  const [showProductPickerForSlide, setShowProductPickerForSlide] = useState<string | null>(null);
  const [productFetchEnabled, setProductFetchEnabled] = useState(false);

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['director-all-products-banner'],
    queryFn:  () => api.director.products(),
    enabled:  productFetchEnabled,
    staleTime: 60_000,
  });
  const allProducts: DirectorProduct[] = productsData?.data ?? [];

  // Populate from server on load
  useEffect(() => {
    const serverSlides = data?.data?.slides;
    if (serverSlides) {
      setSlides(serverSlides.length > 0
        ? serverSlides
        : [makeBlankSlide(0)]);
    }
  }, [data]);

  const updateSlide = (id: string, updated: HomeBannerSlide) => {
    setSlides(prev => prev.map(s => s.id === id ? updated : s));
  };

  const moveSlide = (idx: number, dir: 'up' | 'down') => {
    setSlides(prev => {
      const next = [...prev];
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((s, i) => ({ ...s, sortOrder: i }));
    });
    Haptics.selectionAsync();
  };

  const removeSlide = (id: string) => {
    setSlides(prev => {
      const filtered = prev.filter(s => s.id !== id);
      return filtered.length > 0
        ? filtered.map((s, i) => ({ ...s, sortOrder: i }))
        : [makeBlankSlide(0)];
    });
  };

  const addSlide = () => {
    setSlides(prev => {
      if (prev.length >= MAX_SLIDES) return prev;
      return [...prev, makeBlankSlide(prev.length)];
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const uploadImageForSlide = async (slideId: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to upload a banner image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const ext  = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const name = `banner-${Date.now()}.${ext}`;
    setUploadingSlideId(slideId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { servingUrl } = await api.storage.uploadFile(asset.uri, name, mime);
      setSlides(prev => prev.map(s => s.id === slideId ? { ...s, imageUrl: servingUrl } : s));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Upload failed', getErrorMessage(e, 'Could not upload image.'));
    } finally { setUploadingSlideId(null); }
  };

  const save = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const payload: HomeBannerCarouselConfig = {
        slides: slides.map((s, i) => ({
          ...s,
          sortOrder: i,
          imageUrl:       s.imageUrl?.trim()       || undefined,
          headline:       s.headline?.trim()        || undefined,
          headlineAccent: s.headlineAccent?.trim()  || undefined,
          subtext:        s.subtext?.trim()         || undefined,
          buttonText:     s.buttonText?.trim()      || 'Order Now',
          buttonRoute:    (s.buttonRoute === '__product__' || !s.buttonRoute) ? 'menu' : s.buttonRoute,
          buttonUrl:      s.buttonUrl?.trim()       || undefined,
        })),
      };
      await api.director.updateHomeBanner(payload);
      await qc.invalidateQueries({ queryKey: ['director-home-banner'] });
      await qc.invalidateQueries({ queryKey: ['home-banner'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const activeCount = slides.filter(s => s.isActive).length;
      Alert.alert('Saved', `Banner updated. ${activeCount} slide${activeCount !== 1 ? 's' : ''} now showing to customers.`);
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally { setSaving(false); }
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

      <View style={[styles.card, { backgroundColor: '#EBF8FF', borderColor: BLUE + '40' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Feather name="layers" size={14} color={BLUE} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '400', color: BLUE, lineHeight: 18 }}>
            The hero banner is a full-screen carousel at the top of the customer home screen. Add up to {MAX_SLIDES} slides — each with its own image, headline, and call-to-action. Slides auto-advance every 5 seconds.
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }}>
        <Text style={[styles.section, { marginBottom: 0 }]}>SLIDES ({slides.length}/{MAX_SLIDES})</Text>
        {slides.length < MAX_SLIDES && (
          <Pressable
            onPress={addSlide}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: BLUE, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 }}
          >
            <Feather name="plus" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Add Slide</Text>
          </Pressable>
        )}
      </View>

      {slides.map((slide, index) => (
        <SlideEditor
          key={slide.id}
          slide={slide}
          index={index}
          total={slides.length}
          allProducts={allProducts}
          loadingProducts={loadingProducts}
          uploading={uploadingSlideId === slide.id}
          onChange={updated => updateSlide(slide.id, updated)}
          onMoveUp={() => moveSlide(index, 'up')}
          onMoveDown={() => moveSlide(index, 'down')}
          onRemove={() => removeSlide(slide.id)}
          onUploadImage={id => { setShowProductPickerForSlide(id); uploadImageForSlide(id); }}
          onProductPickerOpen={() => setProductFetchEnabled(true)}
        />
      ))}

      <Pressable onPress={save} disabled={saving}
        style={[styles.saveBtn, { backgroundColor: BLUE, opacity: saving ? 0.8 : 1 }]}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Banner</Text>}
      </Pressable>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Store Settings ──────────────────────────────────────────────────────────
export function StoreTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['director-settings'],
    queryFn: () => api.director.settings(),
  });
  const settings = data?.data ?? {};
  const [saving,          setSaving]          = useState(false);
  const [welcomeBg,       setWelcomeBg]       = useState('');
  const [uploadingWelcome,setUploadingWelcome]= useState(false);

  useEffect(() => {
    if (settings) {
      setWelcomeBg(settings.welcome_background ?? '');
    }
  }, [data]);

  const pickWelcomeBg = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo library access to upload a welcome background.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9, allowsEditing: true, aspect: [9, 16] });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const filename = `welcome-bg-${Date.now()}.jpg`;
    setUploadingWelcome(true);
    try {
      const upload = await api.storage.uploadFile(asset.uri, filename, asset.mimeType ?? 'image/jpeg');
      const url = upload.servingUrl;
      setWelcomeBg(url);
      await api.director.updateSettings({ welcome_background: url });
      await qc.invalidateQueries({ queryKey: ['director-settings', 'welcome-config'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Uploaded', 'Welcome screen background updated.');
    } catch (e) {
      Alert.alert('Upload failed', getErrorMessage(e));
    } finally { setUploadingWelcome(false); }
  };

  const save = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.updateSettings({
        welcome_background: welcomeBg.trim(),
      });
      await qc.invalidateQueries({ queryKey: ['director-settings'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Settings updated successfully.');
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally { setSaving(false); }
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.section}>STORE</Text>
      <View style={styles.card}>
        <View style={[styles.infoBanner, { backgroundColor: '#F8FAFC', borderColor: BORDER }]}>
          <Feather name="map-pin" size={13} color={BLUE} />
          <Text style={[styles.infoBannerText, { color: TEXT }]}>
            Store printers, opening hours, pickup settings, geofence, notes, and contact details now live inside each individual store editor.
          </Text>
        </View>
      </View>

      <Text style={styles.section}>WELCOME SCREEN</Text>
      <View style={styles.card}>
        <View style={[styles.infoBanner, { backgroundColor: '#F0F4FF', borderColor: BLUE + '30' }]}>
          <Feather name="smartphone" size={13} color={BLUE} />
          <Text style={[styles.infoBannerText, { color: BLUE }]}>
            The background image shown on the welcome/launch screen before customers log in.
          </Text>
        </View>
        {welcomeBg ? (
          <Image source={{ uri: welcomeBg }} style={{ width: '100%', height: 160, borderRadius: 10 }} resizeMode="cover" />
        ) : null}
        <Pressable
          onPress={pickWelcomeBg}
          disabled={uploadingWelcome}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: BLUE, backgroundColor: BLUE + '08' }}
        >
          {uploadingWelcome
            ? <ActivityIndicator size="small" color={BLUE} />
            : <Feather name="upload" size={15} color={BLUE} />
          }
          <Text style={{ fontWeight: '600', fontSize: 14, color: BLUE }}>
            {uploadingWelcome ? 'Uploading…' : welcomeBg ? 'Replace Background' : 'Upload Background Photo'}
          </Text>
        </Pressable>
        {welcomeBg ? (
          <Pressable
            onPress={() => { setWelcomeBg(''); api.director.updateSettings({ welcome_background: '' }).catch(() => {}); }}
            style={{ alignItems: 'center', paddingVertical: 6 }}
          >
            <Text style={{ fontWeight: '400', fontSize: 13, color: RED }}>Remove background image</Text>
          </Pressable>
        ) : null}
        <View style={{ gap: 4 }}>
          <Text style={styles.fieldLabel}>Or paste an image URL</Text>
          <TextInput
            style={[styles.input, { borderColor: BORDER, color: TEXT }]}
            value={welcomeBg}
            onChangeText={setWelcomeBg}
            placeholder="https://... (optional — leave blank for gradient)"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>
      </View>

      <Pressable onPress={save} disabled={saving}
        style={[styles.saveBtn, { backgroundColor: BLUE, opacity: saving ? 0.8 : 1 }]}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Settings</Text>}
      </Pressable>
    </ScrollView>
  );
}

// ─── Store Hours Section ──────────────────────────────────────────────────────

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun

interface HourRow extends StoreHour {
  dayOfWeek: number;
  openTime:  string;
  closeTime: string;
  isClosed:  boolean;
  notes:     string;
}

function defaultHours(): HourRow[] {
  return [0, 1, 2, 3, 4, 5, 6].map(d => ({
    dayOfWeek: d,
    openTime:  '08:00',
    closeTime: '17:00',
    isClosed:  d === 0,
    notes:     '',
  }));
}

function formatTime12(t: string): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? '0', 10);
  if (isNaN(h)) return t;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const suf  = h < 12 ? 'am' : 'pm';
  const ms   = m > 0 ? `:${String(m).padStart(2, '0')}` : '';
  return `${h12}${ms}${suf}`;
}

// Parse "HH:MM" → total minutes from midnight, returns NaN if invalid
function timeToMins(t: string): number {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

// Normalise user input: "8:0" → "08:00", "930" → invalid
function normaliseTime(raw: string): string {
  const trimmed = raw.trim();
  // Already correct format
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  // "H:MM" or "HH:MM" with single-digit hour
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    return `${colonMatch[1].padStart(2, '0')}:${colonMatch[2]}`;
  }
  // "HHMM" four digits, no colon
  const fourDigit = trimmed.match(/^(\d{2})(\d{2})$/);
  if (fourDigit) {
    return `${fourDigit[1]}:${fourDigit[2]}`;
  }
  return trimmed; // return as-is; will fail validation
}

function rowHasError(row: HourRow): string | null {
  if (row.isClosed) return null;
  const openMins  = timeToMins(row.openTime);
  const closeMins = timeToMins(row.closeTime);
  if (isNaN(openMins))  return 'Opens time is invalid — use HH:MM (e.g. 08:00)';
  if (isNaN(closeMins)) return 'Closes time is invalid — use HH:MM (e.g. 17:00)';
  if (closeMins <= openMins) return 'Closes time must be after Opens time';
  return null;
}

function StoreHoursSection() {
  const qc = useQueryClient();

  const { data: storesData, isLoading: loadingStores } = useQuery({
    queryKey: ['director-stores-list'],
    queryFn:  () => api.director.storesList(),
  });
  const stores: StoreSummary[] = storesData?.data ?? [];

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [hours,  setHours]  = useState<HourRow[]>(defaultHours());
  const [saving, setSaving] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<{ dayIndex: number; field: 'openTime' | 'closeTime' } | null>(null);

  const activeStoreId = selectedStoreId ?? (stores.length > 0 ? stores[0].id : null);

  const { data: hoursData, isLoading: loadingHours } = useQuery({
    queryKey: ['director-store-hours', activeStoreId],
    queryFn:  () => (activeStoreId ? api.director.storeHours(activeStoreId) : Promise.resolve({ data: [] })),
    enabled:  !!activeStoreId,
  });

  useEffect(() => {
    if (hoursData?.data && hoursData.data.length > 0) {
      const fetched: HourRow[] = hoursData.data.map((r: StoreHour) => ({
        dayOfWeek: r.dayOfWeek,
        openTime:  r.openTime  ?? '08:00',
        closeTime: r.closeTime ?? '17:00',
        isClosed:  r.isClosed  ?? false,
        notes:     r.notes     ?? '',
      }));
      const merged = [0, 1, 2, 3, 4, 5, 6].map(d => {
        const found = fetched.find(r => r.dayOfWeek === d);
        return found ?? { dayOfWeek: d, openTime: '08:00', closeTime: '17:00', isClosed: d === 0, notes: '' };
      });
      setHours(merged);
    } else if (hoursData?.data && hoursData.data.length === 0) {
      setHours(defaultHours());
    }
  }, [hoursData]);

  const updateRow = (dayOfWeek: number, patch: Partial<HourRow>) => {
    setHours(prev => prev.map(r => r.dayOfWeek === dayOfWeek ? { ...r, ...patch } : r));
  };

  const normaliseRowTime = (dayOfWeek: number, field: 'openTime' | 'closeTime') => {
    setHours(prev => prev.map(r => {
      if (r.dayOfWeek !== dayOfWeek) return r;
      return { ...r, [field]: normaliseTime(r[field]) };
    }));
  };

  const rowErrors: Record<number, string> = {};
  for (const row of hours) {
    const err = rowHasError(row);
    if (err) rowErrors[row.dayOfWeek] = err;
  }
  const hasErrors = Object.keys(rowErrors).length > 0;

  const saveHours = async () => {
    if (!activeStoreId || hasErrors) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.setStoreHours(activeStoreId, hours);
      await qc.invalidateQueries({ queryKey: ['director-store-hours', activeStoreId] });
      await qc.invalidateQueries({ queryKey: ['stores'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Trading hours updated. The store info sheet will reflect these changes immediately.');
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e, 'Failed to save trading hours.'));
    } finally { setSaving(false); }
  };

  if (loadingStores) {
    return (
      <>
        <Text style={styles.section}>TRADING HOURS</Text>
        <View style={styles.center}><ActivityIndicator color={BLUE} /></View>
      </>
    );
  }

  if (stores.length === 0) return null;

  return (
    <>
      <Text style={styles.section}>TRADING HOURS</Text>

      <View style={[styles.card, { backgroundColor: '#EBF8FF', borderColor: BLUE + '40' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Feather name="clock" size={14} color={BLUE} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '400', color: BLUE, lineHeight: 18 }}>
            Set opening and closing times per day. Use 24-hour format (e.g. 08:00, 17:30). Changes are reflected immediately for customers.
          </Text>
        </View>
      </View>

      {stores.length > 1 && (
        <>
          <Text style={[styles.fieldLabel, { marginBottom: 4 }]}>Select store</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4, alignItems: 'flex-start' }}>
            {stores.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => { setSelectedStoreId(s.id); Haptics.selectionAsync(); }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: activeStoreId === s.id ? BLUE : CARD,
                    borderColor:     activeStoreId === s.id ? BLUE : BORDER,
                    paddingHorizontal: 14, paddingVertical: 8,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: activeStoreId === s.id ? '#fff' : TEXT, fontSize: 13 }]}>
                  {s.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {loadingHours ? (
        <View style={styles.center}><ActivityIndicator color={BLUE} /></View>
      ) : (
        <View style={[styles.card, { gap: 0 }]}>
          {WEEK_ORDER.map((dayIndex, i) => {
            const row = hours.find(r => r.dayOfWeek === dayIndex) ?? {
              dayOfWeek: dayIndex, openTime: '08:00', closeTime: '17:00', isClosed: false, notes: '',
            };
            const isLast = i === WEEK_ORDER.length - 1;
            const rowErr = rowErrors[dayIndex];
            const openBorder  = rowErr && rowErr.includes('Opens')  ? RED : BORDER;
            const closeBorder = rowErr && rowErr.includes('Closes') ? RED : BORDER;
            return (
              <View key={dayIndex}>
                <View style={{ paddingVertical: 12, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{
                        width: 36, height: 36, borderRadius: 10,
                        backgroundColor: row.isClosed ? '#F3F4F6' : (rowErr ? '#FEF2F2' : BLUE + '15'),
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{
                          fontSize: 11, fontWeight: '700',
                          color: row.isClosed ? MUTED : (rowErr ? RED : BLUE),
                        }}>
                          {DAY_SHORT[dayIndex]}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: row.isClosed ? MUTED : TEXT }}>
                          {DAY_LABELS[dayIndex]}
                        </Text>
                        {!row.isClosed && !rowErr && (row.openTime || row.closeTime) ? (
                          <Text style={{ fontSize: 11, fontWeight: '400', color: MUTED, marginTop: 1 }}>
                            {formatTime12(row.openTime)} – {formatTime12(row.closeTime)}
                          </Text>
                        ) : row.isClosed ? (
                          <Text style={{ fontSize: 11, fontWeight: '400', color: RED, marginTop: 1 }}>Closed</Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '400', color: row.isClosed ? RED : MUTED }}>
                        {row.isClosed ? 'Closed' : 'Open'}
                      </Text>
                      <Switch
                        value={!row.isClosed}
                        onValueChange={v => { updateRow(dayIndex, { isClosed: !v }); Haptics.selectionAsync(); }}
                        trackColor={{ false: '#D1D5DB', true: GREEN }}
                        thumbColor="#fff"
                        ios_backgroundColor="#D1D5DB"
                      />
                    </View>
                  </View>

                  {!row.isClosed && (
                    <>
                      <View style={{ flexDirection: 'row', gap: 10, paddingLeft: 44 }}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={[styles.fieldLabel, { fontSize: 11 }]}>Opens</Text>
                          <Pressable
                            onPress={() => { setTimePickerTarget({ dayIndex, field: 'openTime' }); Haptics.selectionAsync(); }}
                            style={[styles.input, { borderColor: openBorder, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                          >
                            <Text style={{ fontSize: 14, color: row.openTime ? TEXT : MUTED }}>
                              {row.openTime ? formatTime12(row.openTime) : '—'}
                            </Text>
                            <Feather name="clock" size={13} color={BLUE} />
                          </Pressable>
                        </View>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={[styles.fieldLabel, { fontSize: 11 }]}>Closes</Text>
                          <Pressable
                            onPress={() => { setTimePickerTarget({ dayIndex, field: 'closeTime' }); Haptics.selectionAsync(); }}
                            style={[styles.input, { borderColor: closeBorder, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                          >
                            <Text style={{ fontSize: 14, color: row.closeTime ? TEXT : MUTED }}>
                              {row.closeTime ? formatTime12(row.closeTime) : '—'}
                            </Text>
                            <Feather name="clock" size={13} color={BLUE} />
                          </Pressable>
                        </View>
                      </View>
                      {rowErr && (
                        <Text style={{ fontSize: 11, fontWeight: '400', color: RED, paddingLeft: 44 }}>
                          {rowErr}
                        </Text>
                      )}
                    </>
                  )}
                </View>
                {!isLast && <View style={[styles.divider, { backgroundColor: BORDER }]} />}
              </View>
            );
          })}
        </View>
      )}

      {hasErrors && (
        <View style={[styles.card, { backgroundColor: '#FEF2F2', borderColor: RED + '40' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="alert-circle" size={14} color={RED} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: RED }}>
              Fix the highlighted rows before saving.
            </Text>
          </View>
        </View>
      )}

      <Pressable onPress={saveHours} disabled={saving || !activeStoreId || hasErrors}
        style={[styles.saveBtn, { backgroundColor: hasErrors ? '#D1D5DB' : GREEN, opacity: saving ? 0.8 : 1 }]}>
        {saving
          ? <ActivityIndicator color="#fff" />
          : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="clock" size={16} color="#fff" />
              <Text style={styles.saveBtnText}>Save Trading Hours</Text>
            </View>
          )}
      </Pressable>

      {timePickerTarget && (
        <TimeWheelPicker
          visible
          initialHHMM={hours.find(r => r.dayOfWeek === timePickerTarget.dayIndex)?.[timePickerTarget.field] ?? '08:00'}
          onConfirm={hhmm => {
            updateRow(timePickerTarget.dayIndex, { [timePickerTarget.field]: hhmm });
            setTimePickerTarget(null);
          }}
          onClose={() => setTimePickerTarget(null)}
          accentColor={BLUE}
          title={timePickerTarget.field === 'openTime' ? 'Opens At' : 'Closes At'}
        />
      )}
    </>
  );
}

// ─── Product Picker (used inside RewardModal for item rewards) ────────────────
function ProductPicker({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['director-products-picker'],
    queryFn:  () => api.director.products(),
    staleTime: 60_000,
  });
  const products: DirectorProduct[] = (data?.data ?? []).filter((p: DirectorProduct) => p.isActive);
  const hasQuery = search.trim().length > 0;
  const filtered = hasQuery
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase().trim()))
    : [];
  const selectedProduct = products.find(p => p.id === selectedId);

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.fieldLabel}>Linked product (optional)</Text>
      {isLoading ? (
        <ActivityIndicator color={BLUE} size="small" style={{ alignSelf: 'flex-start' }} />
      ) : (
        <>
          {selectedProduct ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#F0F7FF', borderRadius: 10, borderWidth: 1, borderColor: '#BAD8F7' }}>
              <Feather name="check-circle" size={16} color={BLUE} />
              <Text style={{ flex: 1, fontSize: 14, color: TEXT, fontWeight: '500' }} numberOfLines={1}>{selectedProduct.name}</Text>
              <Pressable onPress={() => { onSelect(''); setSearch(''); Haptics.selectionAsync(); }}>
                <Feather name="x" size={16} color={MUTED} />
              </Pressable>
            </View>
          ) : null}
          <TextInput
            style={[styles.input, { borderColor: BORDER, color: TEXT }]}
            value={search}
            onChangeText={setSearch}
            placeholder={selectedProduct ? 'Search to change product…' : 'Search products…'}
            placeholderTextColor={MUTED}
          />
          {hasQuery && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {filtered.map((p: DirectorProduct) => (
                <Pressable
                  key={p.id}
                  onPress={() => { onSelect(p.id); setSearch(''); Haptics.selectionAsync(); }}
                  style={[styles.chip, {
                    backgroundColor: selectedId === p.id ? BLUE : '#F3F4F6',
                    borderColor: selectedId === p.id ? BLUE : BORDER,
                  }]}>
                  <Text style={[styles.chipText, { color: selectedId === p.id ? '#fff' : TEXT }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </Pressable>
              ))}
              {filtered.length === 0 && (
                <Text style={{ fontSize: 12, color: MUTED, paddingVertical: 4 }}>No products match "{search}"</Text>
              )}
            </View>
          )}
          {!hasQuery && !selectedProduct && (
            <Text style={{ fontSize: 12, color: MUTED }}>Type above to search all products.</Text>
          )}
        </>
      )}
    </View>
  );
}

// ─── Reward Form Modal ────────────────────────────────────────────────────────
function RewardModal({ visible, reward, onClose, onSuccess }: {
  visible: boolean; reward: DirectorReward | null; onClose: () => void; onSuccess: () => void;
}) {
  const [name,              setName]              = useState('');
  const [desc,              setDesc]              = useState('');
  const [pts,               setPts]               = useState('');
  const [category,          setCategory]          = useState('food');
  const [stock,             setStock]             = useState('');
  const [isAppOnly,         setIsAppOnly]         = useState(false);
  const [isActive,          setIsActive]          = useState(true);
  const [rewardType,        setRewardType]        = useState<'item_reward' | 'money_voucher' | 'cookie_any'>('item_reward');
  const [voucherDollars,    setVoucherDollars]    = useState('');
  const [linkedProductId,   setLinkedProductId]   = useState('');
  const [customerRedeemable,setCustomerRedeemable]= useState(true);
  const [claimExpiryDays,   setClaimExpiryDays]   = useState('');
  const [tierRestriction,   setTierRestriction]   = useState<string[]>([]);
  const [minOrderDollars,   setMinOrderDollars]   = useState('');
  const [autoGrantThreshold,setAutoGrantThreshold]= useState('');
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState('');

  useEffect(() => {
    if (reward) {
      setName(reward.name); setDesc(reward.description); setPts(String(reward.pointsCost));
      setCategory(reward.category); setStock(reward.stock != null ? String(reward.stock) : '');
      setIsAppOnly(reward.isAppOnly); setIsActive(reward.isActive);
      const rt = reward.rewardType;
      setRewardType(rt === 'money_voucher' ? 'money_voucher' : rt === 'cookie_any' ? 'cookie_any' : 'item_reward');
      setVoucherDollars(reward.voucherValueCents ? String(reward.voucherValueCents / 100) : '');
      setLinkedProductId(reward.linkedProductId ?? '');
      setCustomerRedeemable(reward.customerRedeemable !== false);
      setClaimExpiryDays(reward.claimExpiryDays != null ? String(reward.claimExpiryDays) : '');
      try {
        const tiers = reward.tierRestriction ? JSON.parse(reward.tierRestriction) : [];
        setTierRestriction(Array.isArray(tiers) ? tiers : []);
      } catch { setTierRestriction([]); }
      setMinOrderDollars(reward.minOrderValueCents ? String(reward.minOrderValueCents / 100) : '');
      setAutoGrantThreshold(reward.autoGrantPointsThreshold ? String(reward.autoGrantPointsThreshold) : '');
    } else {
      setName(''); setDesc(''); setPts(''); setCategory('food'); setStock('');
      setIsAppOnly(false); setIsActive(true); setRewardType('item_reward');
      setVoucherDollars(''); setLinkedProductId(''); setCustomerRedeemable(true);
      setClaimExpiryDays(''); setTierRestriction([]); setMinOrderDollars(''); setAutoGrantThreshold('');
    }
    setError('');
  }, [reward, visible]);

  const submit = async () => {
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    const pointsCost = parseInt(pts, 10);
    if (isNaN(pointsCost) || pointsCost < 1) { setError('Points cost must be a positive number.'); return; }
    if (rewardType === 'money_voucher') {
      const dollars = parseFloat(voucherDollars);
      if (isNaN(dollars) || dollars < 0.01) { setError('Voucher value must be at least $0.01.'); return; }
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const voucherValueCents = rewardType === 'money_voucher'
        ? Math.round(parseFloat(voucherDollars) * 100)
        : null;
      const parsedExpiryDays = claimExpiryDays.trim() ? parseInt(claimExpiryDays.trim(), 10) : null;
      const minOrderValueCents = minOrderDollars.trim() ? Math.round(parseFloat(minOrderDollars) * 100) : null;
      const autoGrantPointsThreshold = autoGrantThreshold.trim() ? parseInt(autoGrantThreshold.trim(), 10) : null;
      const tierRestrictionJson = tierRestriction.length > 0 ? JSON.stringify(tierRestriction) : null;
      const payload = {
        name: name.trim(), description: desc.trim(), pointsCost, category,
        stock: stock ? parseInt(stock, 10) : null, isAppOnly, isActive,
        rewardType,
        voucherValueCents,
        linkedProductId: linkedProductId.trim() || null,
        customerRedeemable,
        claimExpiryDays: parsedExpiryDays && parsedExpiryDays > 0 ? parsedExpiryDays : null,
        tierRestriction: tierRestrictionJson,
        minOrderValueCents: minOrderValueCents && minOrderValueCents > 0 ? minOrderValueCents : null,
        autoGrantPointsThreshold: autoGrantPointsThreshold && autoGrantPointsThreshold > 0 ? autoGrantPointsThreshold : null,
      };
      if (reward?.id) await api.director.updateReward(reward.id, payload);
      else            await api.director.createReward(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose}><Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>{reward ? 'Edit Reward' : 'New Reward'}</Text>
          <Pressable onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={BLUE} /> : <Text style={[styles.modalSave, { color: BLUE }]}>Save</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 56, gap: 16 }} keyboardShouldPersistTaps="handled">
          {error ? <Text style={[styles.errorText, { color: RED }]}>{error}</Text> : null}

          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>Reward type *</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { value: 'item_reward',  label: 'Free item' },
                { value: 'money_voucher', label: 'Money off' },
                { value: 'cookie_any',   label: 'Free cookie' },
              ] as const).map(({ value: rt, label }) => (
                <Pressable key={rt} onPress={() => { setRewardType(rt); Haptics.selectionAsync(); }}
                  style={[styles.chip, { flex: 1, justifyContent: 'center', backgroundColor: rewardType === rt ? BLUE : '#F3F4F6', borderColor: rewardType === rt ? BLUE : BORDER }]}>
                  <Text style={[styles.chipText, { color: rewardType === rt ? '#fff' : TEXT }]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 11, color: MUTED, lineHeight: 15 }}>
              {rewardType === 'money_voucher'
                ? 'Deducts a fixed dollar amount from the cart total at checkout.'
                : rewardType === 'cookie_any'
                  ? 'Makes the cheapest cookie in the cart free. No linked product needed.'
                  : 'Adds one free linked product to the customer\'s cart at checkout.'}
            </Text>
          </View>

          {rewardType === 'money_voucher' && (
            <View style={{ gap: 6 }}>
              <Text style={styles.fieldLabel}>Voucher value (AUD) *</Text>
              <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={voucherDollars}
                onChangeText={setVoucherDollars} keyboardType="decimal-pad" placeholder="e.g. 5.00"
                placeholderTextColor={MUTED} />
              <Text style={{ fontSize: 11, color: MUTED }}>Customer gets this amount off their cart total.</Text>
            </View>
          )}

          {rewardType === 'item_reward' && (
            <ProductPicker
              selectedId={linkedProductId}
              onSelect={setLinkedProductId}
            />
          )}

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={name}
              onChangeText={setName} placeholder="e.g. Free Flat White" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT, minHeight: 72 }]}
              value={desc} onChangeText={setDesc} multiline placeholder="What does the customer get?"
              placeholderTextColor={MUTED} textAlignVertical="top" />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Points cost *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={pts}
              onChangeText={setPts} keyboardType="number-pad" placeholder="e.g. 500" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {REWARD_CATEGORIES.map(c => (
                <Pressable key={c} onPress={() => setCategory(c)}
                  style={[styles.chip, { backgroundColor: category === c ? BLUE : '#F3F4F6', borderColor: category === c ? BLUE : BORDER }]}>
                  <Text style={[styles.chipText, { color: category === c ? '#fff' : TEXT }]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Stock limit (leave blank for unlimited)</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={stock}
              onChangeText={setStock} keyboardType="number-pad" placeholder="Unlimited" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Claim expiry (days, leave blank for default 30)</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={claimExpiryDays}
              onChangeText={setClaimExpiryDays} keyboardType="number-pad" placeholder="30" placeholderTextColor={MUTED} />
            <Text style={{ fontSize: 11, color: MUTED, lineHeight: 15 }}>
              How many days after claiming before the reward expires and points are restored. Default is 30 days.
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>Tier restriction (leave empty = all tiers)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['blue', 'silver', 'gold', 'black'] as const).map(tier => {
                const labels: Record<string, string> = { blue: 'Blue', silver: 'Silver', gold: 'Gold', black: 'Black' };
                const selected = tierRestriction.includes(tier);
                return (
                  <Pressable key={tier} onPress={() => {
                    Haptics.selectionAsync();
                    setTierRestriction(prev => selected ? prev.filter(t => t !== tier) : [...prev, tier]);
                  }} style={[styles.chip, { backgroundColor: selected ? BLUE : '#F3F4F6', borderColor: selected ? BLUE : BORDER }]}>
                    <Text style={[styles.chipText, { color: selected ? '#fff' : TEXT }]}>{labels[tier]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: 11, color: MUTED, lineHeight: 15 }}>
              Only selected tier members can claim this reward. Leave empty to allow all tiers.
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Minimum order value (AUD, optional)</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={minOrderDollars}
              onChangeText={setMinOrderDollars} keyboardType="decimal-pad" placeholder="e.g. 20.00"
              placeholderTextColor={MUTED} />
            <Text style={{ fontSize: 11, color: MUTED, lineHeight: 15 }}>
              Cart subtotal must reach this amount before the reward can be applied at checkout.
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Auto-grant points threshold (optional)</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={autoGrantThreshold}
              onChangeText={setAutoGrantThreshold} keyboardType="number-pad" placeholder="e.g. 1000"
              placeholderTextColor={MUTED} />
            <Text style={{ fontSize: 11, color: MUTED, lineHeight: 15 }}>
              Reward is automatically added to the customer's wallet once they reach this points total. Set points cost to 0 for a free milestone grant.
            </Text>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Claimable by customers in app</Text>
            <Switch value={customerRedeemable} onValueChange={v => { setCustomerRedeemable(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: GREEN }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>App-only reward</Text>
            <Switch value={isAppOnly} onValueChange={v => { setIsAppOnly(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: BLUE }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Active</Text>
            <Switch value={isActive} onValueChange={v => { setIsActive(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: GREEN }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Rewards Tab ──────────────────────────────────────────────────────────────
const REWARD_TABS = ['Active', 'Deactivated', 'Deleted'] as const;
type RewardTabKey = typeof REWARD_TABS[number];

function daysUntilPurge(deletedAt: string): number {
  const deletedMs = new Date(deletedAt).getTime();
  const purgeMs   = deletedMs + 14 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeMs - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function RewardsTab() {
  const qc = useQueryClient();
  const [modal,   setModal]   = useState(false);
  const [editing, setEditing] = useState<DirectorReward | null>(null);
  const [rTab,    setRTab]    = useState<RewardTabKey>('Active');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-rewards'],
    queryFn:  () => api.director.rewards(),
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const allRewards = data?.data ?? [];

  const activeRewards      = allRewards.filter(r => !r.deletedAt && r.isActive);
  const deactivatedRewards = allRewards.filter(r => !r.deletedAt && !r.isActive);
  const deletedRewards     = allRewards.filter(r => !!r.deletedAt);

  const visibleRewards =
    rTab === 'Active'      ? activeRewards :
    rTab === 'Deactivated' ? deactivatedRewards :
                             deletedRewards;

  const deactivateMut = useMutation({
    mutationFn: (id: string) => api.director.updateReward(id, { isActive: false }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['director-rewards'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.director.deleteReward(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['director-rewards'] }); setRTab('Deleted'); },
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => api.director.restoreReward(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['director-rewards'] }); setRTab('Active'); },
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => api.director.updateReward(id, { isActive: true }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['director-rewards'] }); setRTab('Active'); },
  });

  const confirmDeactivate = (r: DirectorReward) =>
    Alert.alert('Deactivate Reward', `"${r.name}" will be hidden from customers but kept in your system.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        deactivateMut.mutate(r.id);
      }},
    ]);

  const confirmDelete = (r: DirectorReward) =>
    Alert.alert('Delete Reward', `"${r.name}" will be moved to the Deleted tab and permanently removed after 14 days.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        deleteMut.mutate(r.id);
      }},
    ]);

  const confirmRestore = (r: DirectorReward) =>
    Alert.alert('Restore Reward', `"${r.name}" will be restored and made active again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', onPress: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        restoreMut.mutate(r.id);
      }},
    ]);

  const openEdit = (r: DirectorReward) => { setEditing(r); setModal(true); };
  const openNew  = ()                   => { setEditing(null); setModal(true); };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  const tabCounts: Record<RewardTabKey, number> = {
    Active:      activeRewards.length,
    Deactivated: deactivatedRewards.length,
    Deleted:     deletedRewards.length,
  };

  return (
    <>
      {/* Sub-tabs */}
      <View style={[rwStyles.subTabBar, { borderBottomColor: BORDER }]}>
        {REWARD_TABS.map(t => (
          <Pressable key={t} onPress={() => { setRTab(t); Haptics.selectionAsync(); }}
            style={[rwStyles.subTab, rTab === t && { borderBottomColor: BLUE, borderBottomWidth: 2 }]}>
            <Text style={[rwStyles.subTabText, { color: rTab === t ? BLUE : MUTED }]}>{t}</Text>
            <View style={[rwStyles.subTabBadge, {
              backgroundColor: t === 'Deleted' ? (tabCounts[t] > 0 ? '#FEE2E2' : '#F3F4F6')
                             : t === 'Deactivated' ? (tabCounts[t] > 0 ? '#FEF9C3' : '#F3F4F6')
                             : (tabCounts[t] > 0 ? '#DCFCE7' : '#F3F4F6'),
            }]}>
              <Text style={[rwStyles.subTabBadgeText, {
                color: t === 'Deleted'      ? (tabCounts[t] > 0 ? '#991B1B' : MUTED)
                     : t === 'Deactivated'  ? (tabCounts[t] > 0 ? '#854D0E' : MUTED)
                     : (tabCounts[t] > 0 ? '#166534' : MUTED),
              }]}>{tabCounts[t]}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={visibleRewards}
        keyExtractor={r => r.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        ListHeaderComponent={rTab === 'Active' ? (
          <Pressable style={[styles.addBtn, { backgroundColor: BLUE }]} onPress={openNew}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.addBtnText}>New Reward</Text>
          </Pressable>
        ) : rTab === 'Deleted' && deletedRewards.length > 0 ? (
          <View style={[rwStyles.purgeNote, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
            <Feather name="clock" size={14} color={RED} />
            <Text style={[rwStyles.purgeNoteText, { color: '#991B1B' }]}>
              Deleted rewards are permanently removed after 14 days.
            </Text>
          </View>
        ) : null}
        ListEmptyComponent={
          <View style={styles.center}>
            <Feather name={rTab === 'Deleted' ? 'trash-2' : rTab === 'Deactivated' ? 'eye-off' : 'star'} size={32} color={MUTED} />
            <Text style={styles.emptyText}>
              {rTab === 'Deleted' ? 'No deleted rewards' : rTab === 'Deactivated' ? 'No deactivated rewards' : 'No active rewards'}
            </Text>
          </View>
        }
        renderItem={({ item: r }: { item: DirectorReward }) => {
          const isDeleted = !!r.deletedAt;
          const days      = isDeleted ? daysUntilPurge(r.deletedAt!) : null;
          return (
            <View style={[styles.card, {
              backgroundColor: isDeleted ? '#FFF5F5' : CARD,
              borderColor: isDeleted ? '#FCA5A5' : !r.isActive ? '#FDE68A' : BORDER,
              opacity: isDeleted ? 0.9 : 1,
            }]}>
              {isDeleted && (
                <View style={[rwStyles.deletedBanner, { backgroundColor: '#FEE2E2' }]}>
                  <Feather name="clock" size={12} color={RED} />
                  <Text style={[rwStyles.deletedBannerText, { color: '#991B1B' }]}>
                    Permanently deleted in {days} day{days !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              <View style={styles.rewardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rewardName, isDeleted && { color: MUTED, textDecorationLine: 'line-through' }]}>{r.name}</Text>
                  <Text style={styles.rewardDesc} numberOfLines={1}>{r.description}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[styles.rewardPts, { color: isDeleted ? MUTED : BLUE }]}>{r.pointsCost.toLocaleString()} pts</Text>
                  <View style={[styles.chip, { backgroundColor: isDeleted ? '#FEE2E2' : r.isActive ? '#DCFCE7' : '#FEF9C3', borderColor: 'transparent' }]}>
                    <Text style={[styles.chipText, { color: isDeleted ? '#991B1B' : r.isActive ? '#166534' : '#854D0E', fontSize: 10 }]}>
                      {isDeleted ? 'DELETED' : r.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.rewardMeta}>
                <Text style={styles.rewardMetaText}>#{r.category}</Text>
                <Text style={styles.rewardMetaText}>
                  · {r.rewardType === 'money_voucher' ? `Voucher $${((r.voucherValueCents ?? 0) / 100).toFixed(2)}` : r.rewardType === 'cookie_any' ? 'Free cookie' : r.rewardType === 'birthday_cookie' ? 'Birthday cookie' : 'Free item'}
                </Text>
                {r.isAppOnly     && <Text style={styles.rewardMetaText}>· App only</Text>}
                {r.stock != null && <Text style={styles.rewardMetaText}>· Stock: {r.stock}</Text>}
                {(r.claimCount ?? 0) > 0 && (
                  <Text style={styles.rewardMetaText}>· {r.claimCount} redeemed</Text>
                )}
              </View>
              <View style={styles.rewardActions}>
                {isDeleted ? (
                  <Pressable onPress={() => confirmRestore(r)}
                    style={[styles.actionBtn, { borderColor: GREEN + '60', backgroundColor: '#F0FDF4', flex: 1 }]}>
                    <Feather name="rotate-ccw" size={13} color={GREEN} />
                    <Text style={[styles.actionBtnText, { color: GREEN }]}>Restore</Text>
                  </Pressable>
                ) : (
                  <>
                    <Pressable onPress={() => openEdit(r)}
                      style={[styles.actionBtn, { borderColor: BLUE + '40', backgroundColor: '#EBF8FF' }]}>
                      <Feather name="edit-2" size={13} color={BLUE} />
                      <Text style={[styles.actionBtnText, { color: BLUE }]}>Edit</Text>
                    </Pressable>
                    {r.isActive ? (
                      <Pressable onPress={() => confirmDeactivate(r)}
                        style={[styles.actionBtn, { borderColor: AMBER + '60', backgroundColor: '#FFFBEB' }]}>
                        <Feather name="eye-off" size={13} color={AMBER} />
                        <Text style={[styles.actionBtnText, { color: AMBER }]}>Deactivate</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => { Haptics.selectionAsync(); activateMut.mutate(r.id); }}
                        style={[styles.actionBtn, { borderColor: GREEN + '60', backgroundColor: '#F0FDF4' }]}>
                        <Feather name="eye" size={13} color={GREEN} />
                        <Text style={[styles.actionBtnText, { color: GREEN }]}>Activate</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => confirmDelete(r)}
                      style={[styles.actionBtn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
                      <Feather name="trash-2" size={13} color={RED} />
                      <Text style={[styles.actionBtnText, { color: RED }]}>Delete</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          );
        }}
      />
      <RewardModal
        visible={modal} reward={editing}
        onClose={() => setModal(false)}
        onSuccess={() => { setModal(false); qc.invalidateQueries({ queryKey: ['director-rewards'] }); }}
      />
    </>
  );
}

const rwStyles = StyleSheet.create({
  subTabBar:       { flexDirection: 'row', borderBottomWidth: 1 },
  subTab:          { flex: 1, alignItems: 'center', paddingVertical: 10, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  subTabText:      { fontSize: 13, fontWeight: '600' },
  subTabBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  subTabBadgeText: { fontSize: 11, fontWeight: '700' },
  purgeNote:       { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 4 },
  purgeNoteText:   { fontSize: 12, fontWeight: '500', flex: 1 },
  deletedBanner:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#FCA5A520' },
  deletedBannerText: { fontSize: 12, fontWeight: '500' },
});

// ─── Notification Form Modal ──────────────────────────────────────────────────
function AnnouncementModal({ visible, announcement, onClose, onSuccess }: {
  visible: boolean; announcement: DirectorAnnouncement | null; onClose: () => void; onSuccess: () => void;
}) {
  const [title,       setTitle]       = useState('');
  const [body,        setBody]        = useState('');
  const [isPinned,    setIsPinned]    = useState(false);
  const [isActive,    setIsActive]    = useState(true);
  const [targetRoles, setTargetRoles] = useState<string[]>(['customer']);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    if (announcement) {
      setTitle(announcement.title); setBody(announcement.body);
      setIsPinned(announcement.isPinned); setIsActive(announcement.isActive);
      setTargetRoles(announcement.targetRoles);
    } else {
      setTitle(''); setBody(''); setIsPinned(false); setIsActive(true); setTargetRoles(['customer']);
    }
    setError('');
  }, [announcement, visible]);

  const toggleRole = (role: string) => {
    setTargetRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
    Haptics.selectionAsync();
  };

  const submit = async () => {
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!body.trim())  { setError('Body is required.'); return; }
    if (targetRoles.length === 0) { setError('Select at least one audience.'); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const payload = { title: title.trim(), body: body.trim(), isPinned, isActive, targetRoles };
      if (announcement?.id) await api.director.updateAnnouncement(announcement.id, payload);
      else                   await api.director.createAnnouncement(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose}><Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>{announcement ? 'Edit Announcement' : 'New Announcement'}</Text>
          <Pressable onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={BLUE} /> : <Text style={[styles.modalSave, { color: BLUE }]}>Publish</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {error ? <Text style={[styles.errorText, { color: RED }]}>{error}</Text> : null}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={title}
              onChangeText={setTitle} placeholder="e.g. New Summer Menu!" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Message *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT, minHeight: 100 }]}
              value={body} onChangeText={setBody} multiline
              placeholder="What do you want to tell your customers?"
              placeholderTextColor={MUTED} textAlignVertical="top" />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>Audience</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TARGET_ROLES.map(role => (
                <Pressable key={role} onPress={() => toggleRole(role)}
                  style={[styles.chip, { backgroundColor: targetRoles.includes(role) ? BLUE : '#F3F4F6', borderColor: targetRoles.includes(role) ? BLUE : BORDER }]}>
                  <Text style={[styles.chipText, { color: targetRoles.includes(role) ? '#fff' : TEXT }]}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Pin to top of feed</Text>
            <Switch value={isPinned} onValueChange={v => { setIsPinned(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: AMBER }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Active (visible to users)</Text>
            <Switch value={isActive} onValueChange={v => { setIsActive(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: GREEN }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────
export function NotifyTab() {
  const qc = useQueryClient();
  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState<DirectorAnnouncement | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-announcements'],
    queryFn: () => api.director.allAnnouncements(),
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const announcements = data?.data ?? [];

  const deleteAnn = useMutation({
    mutationFn: (id: string) => api.director.deleteAnnouncement(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director-announcements'] }),
  });

  const confirmDelete = (a: DirectorAnnouncement) => {
    Alert.alert('Delete Announcement', `"${a.title}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        deleteAnn.mutate(a.id);
      }},
    ]);
  };

  const openEdit = (a: DirectorAnnouncement) => { setEditing(a); setModal(true); };
  const openNew  = ()                          => { setEditing(null); setModal(true); };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <>
      <FlatList
        data={announcements}
        keyExtractor={a => a.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        ListHeaderComponent={
          <>
            <View style={[styles.infoBanner, { backgroundColor: '#EBF8FF', borderColor: BLUE + '40', marginBottom: 10 }]}>
              <Feather name="bell" size={13} color={BLUE} />
              <Text style={[styles.infoBannerText, { color: BLUE }]}>
                Announcements appear in the home feed for the selected audience. Pinned items appear at the top.
              </Text>
            </View>
            <Pressable style={[styles.addBtn, { backgroundColor: BLUE }]} onPress={openNew}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.addBtnText}>New Announcement</Text>
            </Pressable>
          </>
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Feather name="bell-off" size={32} color={MUTED} />
            <Text style={styles.emptyText}>No announcements yet</Text>
          </View>
        }
        renderItem={({ item: a }: { item: DirectorAnnouncement }) => (
          <View style={[styles.card, { borderColor: a.isActive ? GLASS_BORDER : '#FEE2E2' }]}>
            <View style={styles.annHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {a.isPinned && <Feather name="bookmark" size={12} color={AMBER} />}
                  <Text style={styles.annTitle}>{a.title}</Text>
                </View>
                <Text style={styles.annBody} numberOfLines={2}>{a.body}</Text>
              </View>
              <View style={[styles.chip, { backgroundColor: a.isActive ? '#DCFCE7' : '#FEE2E2', borderColor: 'transparent', marginLeft: 8 }]}>
                <Text style={[styles.chipText, { color: a.isActive ? '#166534' : '#991B1B', fontSize: 10 }]}>
                  {a.isActive ? 'LIVE' : 'OFF'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {a.targetRoles.map(r => (
                <View key={r} style={[styles.chip, { backgroundColor: '#F3F4F6', borderColor: BORDER, paddingVertical: 2 }]}>
                  <Text style={[styles.chipText, { color: MUTED, fontSize: 10 }]}>{r}</Text>
                </View>
              ))}
              <Text style={styles.annDate}>{new Date(a.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
            </View>
            <View style={styles.rewardActions}>
              <Pressable onPress={() => openEdit(a)} style={[styles.actionBtn, { borderColor: BLUE + '40', backgroundColor: '#EBF8FF' }]}>
                <Feather name="edit-2" size={13} color={BLUE} />
                <Text style={[styles.actionBtnText, { color: BLUE }]}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(a)} style={[styles.actionBtn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
                <Feather name="trash-2" size={13} color={RED} />
                <Text style={[styles.actionBtnText, { color: RED }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
      <AnnouncementModal
        visible={modal} announcement={editing}
        onClose={() => setModal(false)}
        onSuccess={() => { setModal(false); qc.invalidateQueries({ queryKey: ['director-announcements'] }); }}
      />
    </>
  );
}

// ─── Managers Tab ─────────────────────────────────────────────────────────────
const ALL_PERMISSIONS = [
  { key: 'dashboard',     label: 'Dashboard',     icon: 'grid'        },
  { key: 'orders',        label: 'Orders',        icon: 'shopping-bag'},
  { key: 'users',         label: 'Users',         icon: 'users'       },
  { key: 'timesheets',    label: 'Timesheets',    icon: 'clock'       },
  { key: 'tasks',         label: 'Tasks',         icon: 'clipboard'   },
  { key: 'products',      label: 'Products',      icon: 'package'     },
  { key: 'reports',       label: 'Reports',       icon: 'bar-chart-2' },
  { key: 'rewards',       label: 'Rewards',       icon: 'gift'        },
  { key: 'announcements', label: 'Announcements', icon: 'bell'        },
  { key: 'settings',      label: 'Settings',      icon: 'settings'    },
  { key: 'pricing',       label: 'Pricing',       icon: 'dollar-sign' },
  { key: 'banners',       label: 'Banner',        icon: 'image'       },
  { key: 'stock',         label: 'Stock',         icon: 'archive'     },
] as const;

const INDIGO = '#3730A3';

interface ManagerFormData { name: string; email: string; password: string; notes: string }
type ManagerFormFieldKey = keyof ManagerFormData;
type DirectorFormData = { name: string; email: string; password: string };
type DirectorFormFieldKey = keyof DirectorFormData;

export function ManagersTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-managers'],
    queryFn: () => api.director.managers.list(),
  });

  const managers: DirectorUserSummary[] = data?.data ?? [];

  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState<ManagerFormData>({ name: '', email: '', password: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [formPerms, setFormPerms] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  function togglePerm(set: string[], key: string, setter: (v: string[]) => void) {
    Haptics.selectionAsync();
    setter(set.includes(key) ? set.filter(p => p !== key) : [...set, key]);
  }

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      Alert.alert('Missing fields', 'Name, email and password are required.'); return;
    }
    setCreating(true);
    try {
      await api.director.managers.create({ ...form, permissions: formPerms });
      await qc.invalidateQueries({ queryKey: ['director-managers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateModal(false);
      setForm({ name: '', email: '', password: '', notes: '' });
      setFormPerms([]);
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally { setCreating(false); }
  };

  const handleSavePerms = async (id: string) => {
    setSavingPerms(true);
    try {
      await api.director.managers.updatePermissions(id, { permissions: editPerms });
      await qc.invalidateQueries({ queryKey: ['director-managers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingId(null);
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally { setSavingPerms(false); }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Remove Manager', `Remove ${name}'s manager access? Their account will become a staff account.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.director.managers.delete(id);
          await qc.invalidateQueries({ queryKey: ['director-managers'] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch (e) { Alert.alert('Error', getErrorMessage(e)); }
      }},
    ]);
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => { Haptics.selectionAsync(); setCreateModal(true); }}
          style={[styles.addBtn, { backgroundColor: INDIGO }]}>
          <Feather name="user-plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add Manager</Text>
        </Pressable>

        {managers.length === 0 ? (
          <View style={styles.center}>
            <Feather name="users" size={40} color={BORDER} />
            <Text style={styles.emptyText}>No managers yet. Add one above.</Text>
          </View>
        ) : (
          managers.map((m) => (
            <View key={m.id} style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{m.name}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 }}>{m.email}</Text>
                </View>
                <Pressable onPress={() => handleDelete(m.id, m.name)} style={{ padding: 6 }}>
                  <Feather name="trash-2" size={18} color={RED} />
                </Pressable>
              </View>

              {m.notes ? <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED }}>{m.notes}</Text> : null}

              <View style={{ height: 1, backgroundColor: BORDER }} />

              {/* Permission toggles */}
              {editingId === m.id ? (
                <>
                  {ALL_PERMISSIONS.map(p => (
                    <View key={p.key} style={styles.switchRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Feather name={p.icon as FeatherIconName} size={14} color={INDIGO} />
                        <Text style={{ fontSize: 14, fontWeight: '500', color: TEXT }}>{p.label}</Text>
                      </View>
                      <Switch
                        value={editPerms.includes(p.key)}
                        onValueChange={() => togglePerm(editPerms, p.key, setEditPerms)}
                        trackColor={{ false: BORDER, true: INDIGO }}
                        thumbColor="#fff"
                        ios_backgroundColor={BORDER}
                      />
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={() => setEditingId(null)}
                      style={[styles.actionBtn, { flex: 1, borderColor: BORDER, justifyContent: 'center' }]}>
                      <Text style={[styles.actionBtnText, { color: MUTED }]}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={() => handleSavePerms(m.id)} disabled={savingPerms}
                      style={[styles.actionBtn, { flex: 1, backgroundColor: INDIGO, borderColor: INDIGO, justifyContent: 'center' }]}>
                      {savingPerms ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.actionBtnText, { color: '#fff' }]}>Save permissions</Text>}
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {(m.permissions as string[]).length === 0 ? (
                      <Text style={{ fontSize: 12, fontWeight: '400', color: AMBER }}>No permissions — manager cannot see any tabs</Text>
                    ) : (m.permissions as string[]).map((p: string) => (
                      <View key={p} style={[styles.chip, { backgroundColor: INDIGO + '18', borderColor: INDIGO + '40' }]}>
                        <Text style={[styles.chipText, { color: INDIGO }]}>{p}</Text>
                      </View>
                    ))}
                  </View>
                  <Pressable onPress={() => { setEditingId(m.id); setEditPerms([...(m.permissions as string[])]); }}
                    style={[styles.actionBtn, { borderColor: INDIGO, alignSelf: 'flex-start' }]}>
                    <Feather name="edit-2" size={12} color={INDIGO} />
                    <Text style={[styles.actionBtnText, { color: INDIGO }]}>Edit permissions</Text>
                  </Pressable>
                </>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Create Manager Modal */}
      <Modal visible={createModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setCreateModal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
            <Pressable onPress={() => setCreateModal(false)}>
              <Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>New Manager</Text>
            <Pressable onPress={handleCreate} disabled={creating}>
              {creating ? <ActivityIndicator color={BLUE} size="small" /> :
                <Text style={[styles.modalSave, { color: BLUE }]}>Create</Text>}
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
              {[
                { label: 'Full Name', key: 'name', placeholder: 'Jane Smith' },
                { label: 'Email', key: 'email', placeholder: 'jane@butterfield.com.au' },
                { label: 'Password', key: 'password', placeholder: 'Min 8 characters' },
                { label: 'Notes (optional)', key: 'notes', placeholder: 'e.g. Sydney store manager' },
              ].map(field => (
                <View key={field.key} style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    value={form[field.key as ManagerFormFieldKey]}
                    onChangeText={v => setForm(p => ({ ...p, [field.key]: v }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={MUTED}
                    secureTextEntry={field.key === 'password'}
                    style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                  />
                </View>
              ))}

              <Text style={[styles.section, { marginTop: 8 }]}>INITIAL PERMISSIONS</Text>
              {ALL_PERMISSIONS.map(p => (
                <View key={p.key} style={styles.switchRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name={p.icon as FeatherIconName} size={14} color={INDIGO} />
                    <Text style={{ fontSize: 14, fontWeight: '500', color: TEXT }}>{p.label}</Text>
                  </View>
                  <Switch
                    value={formPerms.includes(p.key)}
                    onValueChange={() => togglePerm(formPerms, p.key, setFormPerms)}
                    trackColor={{ false: BORDER, true: INDIGO }}
                    thumbColor="#fff"
                    ios_backgroundColor={BORDER}
                  />
                </View>
              ))}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

// ─── Directors Tab (master only) ──────────────────────────────────────────────
const PURPLE = '#7C3AED';

export function DirectorsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['master-directors'],
    queryFn: () => api.director.directors.list(),
  });
  const directors: DirectorUserSummary[] = data?.data ?? [];

  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState<DirectorFormData>({ name: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      Alert.alert('Missing fields', 'Name, email and password are required.'); return;
    }
    if (form.password.length < 8) {
      Alert.alert('Password too short', 'Password must be at least 8 characters.'); return;
    }
    setCreating(true);
    try {
      await api.director.directors.create(form);
      await qc.invalidateQueries({ queryKey: ['master-directors'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateModal(false);
      setForm({ name: '', email: '', password: '' });
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally { setCreating(false); }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Remove Director', `Remove ${name}'s director access? This will permanently delete their account.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.director.directors.delete(id);
          await qc.invalidateQueries({ queryKey: ['master-directors'] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch (e) { Alert.alert('Error', getErrorMessage(e)); }
      }},
    ]);
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: '#F5F3FF', borderColor: PURPLE + '30' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="shield" size={16} color={PURPLE} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: PURPLE }}>Master Account Controls</Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '400', color: '#6D28D9', lineHeight: 18 }}>
            Directors have full access to all store management features, but cannot add or remove other directors. Only the master account can manage directors.
          </Text>
        </View>

        <Pressable onPress={() => { Haptics.selectionAsync(); setCreateModal(true); }}
          style={[styles.addBtn, { backgroundColor: PURPLE }]}>
          <Feather name="user-plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add Director</Text>
        </Pressable>

        {directors.length === 0 ? (
          <View style={styles.center}>
            <Feather name="users" size={40} color={BORDER} />
            <Text style={styles.emptyText}>No directors yet. Add one above.</Text>
          </View>
        ) : (
          directors.map((d) => (
            <View key={d.id} style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{d.name}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 }}>{d.email}</Text>
                  <View style={[styles.chip, { backgroundColor: PURPLE + '18', borderColor: PURPLE + '40', alignSelf: 'flex-start', marginTop: 6 }]}>
                    <Text style={[styles.chipText, { color: PURPLE }]}>DIRECTOR</Text>
                  </View>
                </View>
                <Pressable onPress={() => handleDelete(d.id, d.name)} style={{ padding: 6 }}>
                  <Feather name="trash-2" size={18} color="#EF4444" />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={createModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setCreateModal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
            <Pressable onPress={() => setCreateModal(false)}>
              <Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>New Director</Text>
            <Pressable onPress={handleCreate} disabled={creating}>
              {creating ? <ActivityIndicator color={BLUE} size="small" /> :
                <Text style={[styles.modalSave, { color: BLUE }]}>Create</Text>}
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
              <View style={[styles.card, { backgroundColor: '#F5F3FF', borderColor: PURPLE + '30' }]}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#6D28D9', lineHeight: 18 }}>
                  Directors have the same access as this master account, except they cannot manage other directors.
                </Text>
              </View>
              {[
                { label: 'Full Name', key: 'name',     placeholder: 'Jane Smith' },
                { label: 'Email',     key: 'email',    placeholder: 'jane@butterfield.com.au' },
                { label: 'Password',  key: 'password', placeholder: 'Min 8 characters' },
              ].map(field => (
                <View key={field.key} style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    value={form[field.key as DirectorFormFieldKey]}
                    onChangeText={v => setForm(p => ({ ...p, [field.key]: v }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={MUTED}
                    secureTextEntry={field.key === 'password'}
                    style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                  />
                </View>
              ))}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DirectorSettingsScreen() {
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const tab = (tabParam ?? '').toString() as TabKey | '';

  if (tab === 'Store') {
    return <Redirect href="/(director)/stores" />;
  }
  if (tab === 'Banner') {
    return <Redirect href="/director-settings-banner" />;
  }
  if (tab === 'Rewards') {
    return <Redirect href="/director-settings-rewards" />;
  }
  if (tab === 'Notify') {
    return <Redirect href="/director-settings-notify" />;
  }
  if (tab === 'Managers') {
    return <Redirect href="/director-settings-managers" />;
  }
  if (tab === 'Directors') {
    return <Redirect href="/director-settings-directors" />;
  }
  if (tab === 'Delivery') {
    return <Redirect href="/director-settings-delivery" />;
  }

  return <Redirect href="/(director)/more" />;
}

const styles = StyleSheet.create({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText:     { fontSize: 14, fontWeight: '400', color: '#8E8E93' },
  tabBar:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1 },
  tabBtn:        { flex: 1, paddingHorizontal: 4, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:       { fontSize: 11, fontWeight: '600' },
  section:       { fontSize: 11, fontWeight: '700', color: '#8E8E93', letterSpacing: 1.5, marginTop: 4 },
  card:          { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10, backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle:      { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  rowSub:        { fontSize: 12, fontWeight: '400', color: '#8E8E93', marginTop: 2, lineHeight: 17 },
  divider:       { height: 1 },
  fieldLabel:    { fontSize: 13, fontWeight: '500', color: '#1C1C1E' },
  input:         { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '400', backgroundColor: '#FAFAFA' },
  coordRow:      { flexDirection: 'row', gap: 10 },
  hint:          { fontSize: 12, fontWeight: '400', marginTop: -6 },
  infoBanner:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  infoBannerText:{ flex: 1, fontSize: 12, fontWeight: '400', lineHeight: 17 },
  demoRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottomWidth: 1 },
  demoPill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  demoPillText:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  demoEmail:     { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  demoPw:        { fontSize: 12, fontWeight: '400' },
  saveBtn:       { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:   { color: '#fff', fontSize: 16, fontWeight: '600' },
  addBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 4 },
  addBtnText:    { color: '#fff', fontSize: 15, fontWeight: '600' },
  chip:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  chipText:      { fontSize: 12, fontWeight: '500' },
  switchRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalTitle:    { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  modalCancel:   { fontSize: 15, fontWeight: '400' },
  modalSave:     { fontSize: 15, fontWeight: '700' },
  errorText:     { fontSize: 13, fontWeight: '400', textAlign: 'center' },
  rewardHeader:  { flexDirection: 'row', alignItems: 'flex-start' },
  rewardName:    { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  rewardDesc:    { fontSize: 12, fontWeight: '400', color: '#8E8E93' },
  rewardPts:     { fontSize: 14, fontWeight: '700' },
  rewardMeta:    { flexDirection: 'row', gap: 6 },
  rewardMetaText:{ fontSize: 11, fontWeight: '400', color: '#8E8E93' },
  rewardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontWeight: '600' },
  annHeader:     { flexDirection: 'row', alignItems: 'flex-start' },
  annTitle:      { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  annBody:       { fontSize: 13, fontWeight: '400', color: '#6B7280', lineHeight: 18 },
  annDate:       { fontSize: 11, fontWeight: '400', color: '#8E8E93', marginLeft: 'auto' },
});
