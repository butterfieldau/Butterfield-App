import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  type DimensionValue,
  Dimensions,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SHEET_H  = Math.min(SCREEN_H * 0.82, 640);
const MAP_H    = 190;

function staticMapUrl(lat: number, lng: number, w: number): string {
  const px = Math.round(w);
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=${px}x${MAP_H}&markers=${lat},${lng},red-pushpin`;
}

const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FALLBACK_HOURS = [
  { dayOfWeek: 0, isClosed: true,  openTime: null,    closeTime: null    },
  { dayOfWeek: 1, isClosed: false, openTime: '09:00', closeTime: '17:00' },
  { dayOfWeek: 2, isClosed: false, openTime: '09:00', closeTime: '17:00' },
  { dayOfWeek: 3, isClosed: false, openTime: '09:00', closeTime: '17:00' },
  { dayOfWeek: 4, isClosed: false, openTime: '09:00', closeTime: '17:00' },
  { dayOfWeek: 5, isClosed: false, openTime: '09:00', closeTime: '17:00' },
  { dayOfWeek: 6, isClosed: false, openTime: '09:00', closeTime: '17:00' },
];

function computeOpenFromHours(hoursArr: typeof FALLBACK_HOURS): { isOpen: boolean; sc: string } {
  const now = new Date();
  const dow = now.getDay();
  const today = hoursArr.find(h => h.dayOfWeek === dow);
  if (!today || today.isClosed || !today.openTime || !today.closeTime) {
    return { isOpen: false, sc: '#8E8E93' };
  }
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = today.openTime.split(':').map(Number);
  const [ch, cm] = today.closeTime.split(':').map(Number);
  const openMins  = oh * 60 + om;
  const closeMins = ch * 60 + cm;
  if (nowMins >= openMins && nowMins < closeMins - 30) return { isOpen: true, sc: '#16A34A' };
  if (nowMins >= closeMins - 30 && nowMins < closeMins) return { isOpen: true, sc: '#F59E0B' };
  return { isOpen: false, sc: '#8E8E93' };
}

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const STORE_PHOTOS = [
  { label: 'Red Velvet',   uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Red-Velvet-Chunky-Cookie.png?v=1714983850&width=600' },
  { label: 'Choc Chip',    uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Choc-Chip-Chunky-Cookie.png?v=1714983903&width=600' },
  { label: 'Double Choc',  uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Double-Choc-Chunky-Cookie.png?v=1714983928&width=600' },
  { label: 'Pistachio',    uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Pistachio-Chunky-Cookie.png?v=1714983863&width=600' },
  { label: 'Biscoff',      uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Biscoff-Chunky-Cookie.png?v=1714984042&width=600' },
  { label: 'Cherry Ripe',  uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Cherry-Ripe-Chunky-Cookie.png?v=1714983878&width=600' },
  { label: 'Macadamia',    uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Macademia-chunky-cookie.jpg?v=1714983995&width=600' },
];

function statusColor(status: string) {
  if (status === 'open')               return '#16A34A';
  if (status === 'closing_soon')       return '#F59E0B';
  if (status === 'opens_soon')         return '#3B82F6';
  if (status === 'coming_soon')        return '#8B5CF6';
  if (status === 'temporarily_closed') return '#F59E0B';
  return '#8E8E93';
}

// ── Shimmer primitives ───────────────────────────────────────────────────────

interface ShimmerBoxProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  shimmerProgress: SharedValue<number>;
}

function ShimmerBox({ width = '100%', height = 16, borderRadius = 8, style, shimmerProgress }: ShimmerBoxProps) {
  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmerProgress.value, [0, 1], [0.35, 0.75]),
  }));
  return (
    <Reanimated.View
      style={[
        { width, height, borderRadius, backgroundColor: '#D1D5DB' },
        animStyle,
        style,
      ]}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  store: any;
  onClose: () => void;
}

export default function StoreInfoSheet({ visible, store, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SHEET_H)).current;
  const backdropO  = useRef(new Animated.Value(0)).current;

  // Shimmer loop — runs while store is null
  const shimmerProgress = useSharedValue(0);

  // Fade-in opacity for real store content
  const contentOpacity = useSharedValue(store ? 1 : 0);

  useEffect(() => {
    if (!store) {
      contentOpacity.value = 0;
      shimmerProgress.value = 0;
      shimmerProgress.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(shimmerProgress);
      contentOpacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    }
  }, [store]);

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 260 }),
        Animated.timing(backdropO,  { toValue: 0.45, duration: 260, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SHEET_H, duration: 240, useNativeDriver: true }),
        Animated.timing(backdropO,  { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const FALLBACK_PHONE   = '0480 769 995';
  const FALLBACK_ADDRESS = '2 Main Lane, Merrylands NSW 2160';

  const fallbackOpen = !store ? computeOpenFromHours(FALLBACK_HOURS) : null;

  const sc      = store ? statusColor(store.openStatus ?? '') : (fallbackOpen?.sc ?? '#8E8E93');
  const isOpen  = store
    ? (store.openStatus === 'open' || store.openStatus === 'closing_soon')
    : (fallbackOpen?.isOpen ?? false);

  const now = new Date();
  const todayDow = now.getDay();

  const todayHours   = store?.todayHours ?? FALLBACK_HOURS.find(h => h.dayOfWeek === todayDow);
  const todayDisplay = todayHours?.isClosed
    ? 'Closed today'
    : todayHours?.openTime && todayHours?.closeTime
      ? `${fmt12(todayHours.openTime)} – ${fmt12(todayHours.closeTime)}`
      : null;

  const address = store
    ? [store.address, store.suburb, store.state, store.postcode].filter(Boolean).join(', ')
    : FALLBACK_ADDRESS;

  const handleDirections = () => {
    const fullAddress = `${address}, Australia`;
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent('Butterfield Cookies')}&address=${encodeURIComponent(fullAddress)}`);
  };

  const handleCall = () => {
    const phone = store?.phone ?? FALLBACK_PHONE;
    Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  };

  const handleOrder = () => {
    onClose();
    setTimeout(() => router.push('/(customer)/menu'), 300);
  };

  const handleAllStores = () => {
    onClose();
    setTimeout(() => router.push('/(customer)/stores'), 300);
  };

  const weekHours: any[] = store?.openingHours ?? FALLBACK_HOURS;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: backdropO }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          s.sheet,
          {
            backgroundColor: colors.card,
            transform: [{ translateY }],
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            height: SHEET_H,
          },
        ]}
      >
        {/* Drag handle */}
        <View style={s.handle} />

        {/* ── Map area ─────────────────────────────────────────────── */}
        <Pressable style={s.mapWrap} onPress={store ? handleDirections : undefined}>
          {/* Base layer while loading: muted gradient rendered first (lowest z-order) */}
          {!store && (
            <LinearGradient
              colors={['#C8D8E8', '#B0C4D8']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            />
          )}

          {/* Shimmer overlay — rendered on top of the base gradient while store is null */}
          {!store && (
            <View style={[StyleSheet.absoluteFill, s.mapShimmerContainer]}>
              <ShimmerBox
                width="100%"
                height={MAP_H}
                borderRadius={0}
                shimmerProgress={shimmerProgress}
                style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
              />
              {/* Skeleton rows mirroring the real content layout */}
              <View style={s.mapShimmerOverlay}>
                <View style={{ gap: 6 }}>
                  <ShimmerBox width={80}  height={9}  borderRadius={4} shimmerProgress={shimmerProgress} />
                  <ShimmerBox width={200} height={18} borderRadius={6} shimmerProgress={shimmerProgress} />
                </View>
                <ShimmerBox width={64} height={28} borderRadius={20} shimmerProgress={shimmerProgress} />
              </View>
            </View>
          )}

          {/* Real map content — fades in when store arrives */}
          {store && (
            <Reanimated.View style={[StyleSheet.absoluteFill, contentAnimStyle]}>
              {store.latitude && store.longitude ? (
                <Image
                  source={{ uri: staticMapUrl(store.latitude, store.longitude, SCREEN_W) }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={300}
                />
              ) : (
                <LinearGradient
                  colors={isOpen ? ['#40C0F2', '#2AA8DC'] : ['#8E8E93', '#6B6B6B']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                />
              )}

              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.52)']}
                style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}
              >
                <View style={s.mapOverlay}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.headerLabel}>IN-STORE PICKUP</Text>
                    <Text style={s.headerName} numberOfLines={1}>{store.name ?? 'Butterfield Cookies — Merrylands'}</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: isOpen ? 'rgba(22,163,74,0.85)' : 'rgba(100,100,100,0.75)' }]}>
                    <View style={[s.dot, { backgroundColor: '#fff' }]} />
                    <Text style={s.statusText}>{store.openLabel ?? (isOpen ? 'Open' : 'Closed')}</Text>
                  </View>
                </View>
              </LinearGradient>

              {store.latitude && store.longitude && (
                <View style={s.dirChip}>
                  <Feather name="navigation" size={11} color="#40C0F2" />
                  <Text style={s.dirChipText}>Directions</Text>
                </View>
              )}
            </Reanimated.View>
          )}
        </Pressable>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 18, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Address row ─────────────────────────────────────────── */}
          {!store ? (
            <View style={[s.infoRow, { paddingVertical: 8 }]}>
              <ShimmerBox width={32} height={32} borderRadius={16} shimmerProgress={shimmerProgress} />
              <View style={{ flex: 1, gap: 6 }}>
                <ShimmerBox width="85%" height={13} borderRadius={5} shimmerProgress={shimmerProgress} />
                <ShimmerBox width="55%" height={11} borderRadius={5} shimmerProgress={shimmerProgress} />
              </View>
            </View>
          ) : (
            <Reanimated.View style={contentAnimStyle}>
              <Pressable style={s.infoRow} onPress={handleDirections}>
                <View style={s.infoIcon}>
                  <Feather name="map-pin" size={15} color="#40C0F2" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.infoVal, { color: colors.foreground }]}>{address}</Text>
                  <Text style={s.infoLink}>Tap for directions</Text>
                </View>
                <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
              </Pressable>
            </Reanimated.View>
          )}

          {/* Today's hours — always shown (fallback data ready immediately) */}
          {todayDisplay ? (
            <View style={s.infoRow}>
              <View style={s.infoIcon}>
                <Feather name="clock" size={15} color="#40C0F2" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>Today's hours</Text>
                <Text style={[s.infoVal, { color: colors.foreground }]}>{todayDisplay}</Text>
              </View>
            </View>
          ) : null}

          {/* Phone — always shown (fallback ready) */}
          <Pressable style={s.infoRow} onPress={handleCall}>
            <View style={s.infoIcon}>
              <Feather name="phone" size={15} color="#40C0F2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>Phone</Text>
              <Text style={[s.infoVal, { color: colors.foreground }]}>{store?.phone ?? FALLBACK_PHONE}</Text>
            </View>
            <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
          </Pressable>

          {/* ── Services chips ───────────────────────────────────────── */}
          {!store ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <ShimmerBox width={130} height={30} borderRadius={8} shimmerProgress={shimmerProgress} />
              <ShimmerBox width={140} height={30} borderRadius={8} shimmerProgress={shimmerProgress} />
            </View>
          ) : (store.pickupAvailable || store.deliveryAvailable) ? (
            <Reanimated.View style={[{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, contentAnimStyle]}>
              {store.pickupAvailable   && <View style={s.chip}><Feather name="shopping-bag" size={11} color="#40C0F2" /><Text style={[s.chipText, { color: '#40C0F2' }]}>Pickup available</Text></View>}
              {store.deliveryAvailable && <View style={[s.chip, { backgroundColor: '#F5F3FF' }]}><Feather name="truck" size={11} color="#7C3AED" /><Text style={[s.chipText, { color: '#7C3AED' }]}>Delivery available</Text></View>}
            </Reanimated.View>
          ) : null}

          {/* Photo gallery */}
          <View style={s.gallerySection}>
            <Text style={[s.gallerySectionTitle, { color: colors.foreground }]}>Our Cookies</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
              nestedScrollEnabled
            >
              {STORE_PHOTOS.map((photo) => (
                <View key={photo.label} style={s.galleryItem}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={s.galleryImg}
                    contentFit="cover"
                    transition={250}
                  />
                  <Text style={[s.galleryLabel, { color: colors.foreground }]}>{photo.label}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Public notes */}
          {store?.publicNotes ? (
            <Text style={[s.notes, { color: colors.mutedForeground }]}>{store.publicNotes}</Text>
          ) : null}

          {/* Full week hours — always shown via fallback */}
          {weekHours.length > 0 ? (
            <View style={[s.hoursCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[s.hoursTitle, { color: colors.foreground }]}>Opening Hours</Text>
              {weekHours.map((h: any) => {
                const dayName = DAYS_LONG[h.dayOfWeek] ?? '';
                const hoursStr = h.isClosed
                  ? 'Closed'
                  : h.openTime && h.closeTime
                    ? `${fmt12(h.openTime)} – ${fmt12(h.closeTime)}`
                    : '—';
                const isToday = new Date().getDay() === h.dayOfWeek;
                return (
                  <View key={h.dayOfWeek} style={[s.hoursRow, isToday && { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8 }]}>
                    <Text style={[s.hoursDay, { color: isToday ? '#40C0F2' : colors.foreground, fontFamily: isToday ? 'Inter_700Bold' : 'Inter_400Regular' }]}>{dayName}</Text>
                    <Text style={[s.hoursTime, { color: h.isClosed ? colors.mutedForeground : isToday ? '#40C0F2' : colors.foreground }]}>{hoursStr}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>

        {/* Bottom action row */}
        <View style={s.footer}>
          {store?.latitude && store?.longitude ? (
            <Pressable style={[s.actionBtn, { borderColor: colors.border }]} onPress={handleDirections}>
              <Feather name="map" size={15} color="#40C0F2" />
              <Text style={s.actionBtnText}>Directions</Text>
            </Pressable>
          ) : null}
          <Pressable style={[s.actionBtn, { borderColor: colors.border }]} onPress={handleCall}>
            <Feather name="phone" size={15} color="#16A34A" />
            <Text style={[s.actionBtnText, { color: '#16A34A' }]}>Call</Text>
          </Pressable>
          <Pressable style={[s.orderBtn, { flex: 1 }]} onPress={handleOrder}>
            <Feather name="shopping-bag" size={15} color="#fff" />
            <Text style={s.orderBtnText}>Order Pickup</Text>
          </Pressable>
        </View>

        {/* All stores link */}
        <Pressable style={s.allStores} onPress={handleAllStores}>
          <Text style={s.allStoresText}>View all stores</Text>
          <Feather name="chevron-right" size={13} color="#40C0F2" />
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 24 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 10, marginBottom: 6 },

  mapWrap:             { height: MAP_H, marginHorizontal: 14, marginBottom: 4, borderRadius: 16, overflow: 'hidden', backgroundColor: '#C8D8E8' },
  mapShimmerContainer: { ...StyleSheet.absoluteFillObject },
  mapShimmerOverlay:   { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  mapOverlay:          { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  headerLabel:         { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.8, marginBottom: 2 },
  headerName:          { fontFamily: 'Inter_700Bold', fontSize: 17, color: '#fff' },
  statusBadge:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  dot:                 { width: 7, height: 7, borderRadius: 4 },
  statusText:          { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#fff' },
  dirChip:             { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  dirChipText:         { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#40C0F2' },

  infoRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  infoIcon:   { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  infoLabel:  { fontFamily: 'Inter_400Regular', fontSize: 11, marginBottom: 1 },
  infoVal:    { fontFamily: 'Inter_500Medium', fontSize: 14 },
  infoLink:   { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#40C0F2', marginTop: 2 },

  chip:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  chipText:   { fontFamily: 'Inter_500Medium', fontSize: 12 },

  notes:      { fontFamily: 'Inter_400Regular', fontSize: 12, fontStyle: 'italic', lineHeight: 18 },

  hoursCard:  { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 2 },
  hoursTitle: { fontFamily: 'Inter_700Bold', fontSize: 13, marginBottom: 8 },
  hoursRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  hoursDay:   { fontSize: 13 },
  hoursTime:  { fontFamily: 'Inter_500Medium', fontSize: 13 },

  footer:     { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingTop: 12 },
  actionBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  actionBtnText:{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#40C0F2' },
  orderBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#40C0F2' },
  orderBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' },

  allStores:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 10, paddingBottom: 4 },
  allStoresText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#40C0F2' },

  gallerySection:     { gap: 8 },
  gallerySectionTitle:{ fontFamily: 'Inter_700Bold', fontSize: 13 },
  galleryItem:        { alignItems: 'center', gap: 5 },
  galleryImg:         { width: 100, height: 100, borderRadius: 14 },
  galleryLabel:       { fontFamily: 'Inter_500Medium', fontSize: 11 },
});
