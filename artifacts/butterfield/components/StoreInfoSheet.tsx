import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
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
  withTiming,
  Easing,
  interpolate,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';

// Lazy-load react-native-maps — native only, unavailable in web/Expo Go web preview
let RNMapsModule: typeof import('react-native-maps') | null = null;
try { RNMapsModule = require('react-native-maps'); } catch {}
const MapView  = RNMapsModule?.default   ?? null;
const RNMarker = RNMapsModule?.Marker    ?? null;

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H  = Math.min(SCREEN_H * 0.82, 640);
const MAP_H    = 190;

const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STORE_NAME     = 'Butterfield Cookies — Merrylands';
const STORE_ADDRESS  = '2 Main Lane';
const STORE_SUBURB   = 'Merrylands';
const STORE_STATE    = 'NSW';
const STORE_POSTCODE = '2160';
const STORE_PHONE    = '0480 769 995';

const FALLBACK_HOURS = [
  { dayOfWeek: 0, isClosed: true,  openTime: null,    closeTime: null,    notes: null },
  { dayOfWeek: 1, isClosed: false, openTime: '06:30', closeTime: '21:00', notes: 'Break 3:00 – 4:30 pm' },
  { dayOfWeek: 2, isClosed: false, openTime: '06:30', closeTime: '21:00', notes: 'Break 3:00 – 4:30 pm' },
  { dayOfWeek: 3, isClosed: false, openTime: '06:30', closeTime: '21:00', notes: 'Break 3:00 – 4:30 pm' },
  { dayOfWeek: 4, isClosed: false, openTime: '06:30', closeTime: '21:00', notes: null },
  { dayOfWeek: 5, isClosed: false, openTime: '06:30', closeTime: '21:00', notes: null },
  { dayOfWeek: 6, isClosed: false, openTime: '06:30', closeTime: '21:00', notes: null },
];

const FALLBACK_STORE = {
  name: STORE_NAME,
  address: STORE_ADDRESS,
  suburb: STORE_SUBURB,
  state: STORE_STATE,
  postcode: STORE_POSTCODE,
  phone: STORE_PHONE,
  website: null,
  latitude: null,
  longitude: null,
  status: 'open',
  openStatus: 'open',
  openLabel: 'Open Now',
  pickupAvailable: true,
  deliveryAvailable: false,
  todayHours: FALLBACK_HOURS[new Date().getDay()],
  openingHours: FALLBACK_HOURS,
  publicNotes: 'Visit us in Merrylands for cookies, coffee and pickup orders.',
};

function computeOpenFromHours(hoursArr: typeof FALLBACK_HOURS): { isOpen: boolean } {
  const now = new Date();
  const dow = now.getDay();
  const today = hoursArr.find(h => h.dayOfWeek === dow);
  if (!today || today.isClosed || !today.openTime || !today.closeTime) return { isOpen: false };
  const nowMins   = now.getHours() * 60 + now.getMinutes();
  const [oh, om]  = today.openTime.split(':').map(Number);
  const [ch, cm]  = today.closeTime.split(':').map(Number);
  const openMins  = oh * 60 + om;
  const closeMins = ch * 60 + cm;
  return { isOpen: nowMins >= openMins && nowMins < closeMins };
}

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12  = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatBreakNote(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/^Break (\d{2}:\d{2}) [–-] (\d{2}:\d{2})$/);
  if (m) return `Break ${fmt12(m[1])} – ${fmt12(m[2])}`;
  return notes;
}

const STORE_PHOTOS = [
  { label: 'Red Velvet',  uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Red-Velvet-Chunky-Cookie.png?v=1714983850&width=600' },
  { label: 'Choc Chip',   uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Choc-Chip-Chunky-Cookie.png?v=1714983903&width=600' },
  { label: 'Double Choc', uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Double-Choc-Chunky-Cookie.png?v=1714983928&width=600' },
  { label: 'Pistachio',   uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Pistachio-Chunky-Cookie.png?v=1714983863&width=600' },
  { label: 'Biscoff',     uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Biscoff-Chunky-Cookie.png?v=1714984042&width=600' },
  { label: 'Cherry Ripe', uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Cherry-Ripe-Chunky-Cookie.png?v=1714983878&width=600' },
  { label: 'Macadamia',   uri: 'https://butterfieldcookies.com.au/cdn/shop/files/Macademia-chunky-cookie.jpg?v=1714983995&width=600' },
];

// ── Shimmer ───────────────────────────────────────────────────────────────────

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
    <Reanimated.View style={[{ width, height, borderRadius, backgroundColor: '#D1D5DB' }, animStyle, style]} />
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

  // Map geocoding
  const [mapCoords, setMapCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  const shimmerProgress = useSharedValue(0);
  const contentOpacity  = useSharedValue(1);

  useEffect(() => {
    if (!store) {
      cancelAnimation(shimmerProgress);
      contentOpacity.value = 1;
      return;
    }
    cancelAnimation(shimmerProgress);
    contentOpacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
  }, [store]);

  const contentAnimStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  // Sheet slide-in / slide-out
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

  // Geocode address when sheet opens
  useEffect(() => {
    if (!visible) {
      setMapCoords(null);
      return;
    }
    const s = store ?? FALLBACK_STORE;

    // Priority 1 — use explicit coords from the store record
    if (s.latitude && s.longitude) {
      setMapCoords({ latitude: s.latitude, longitude: s.longitude });
      return;
    }

    // Priority 2 — geocode from address string
    const parts = [s.address, s.suburb, s.state, s.postcode, 'Australia'].filter(Boolean);
    if (parts.length < 2) return;

    setGeocoding(true);
    Location.geocodeAsync(parts.join(', '))
      .then(results => {
        if (results.length > 0) {
          setMapCoords({ latitude: results[0].latitude, longitude: results[0].longitude });
        }
      })
      .catch(() => {})
      .finally(() => setGeocoding(false));
  }, [visible, store?.address, store?.suburb, store?.state, store?.postcode, store?.latitude, store?.longitude]);

  const activeStore   = store ?? FALLBACK_STORE;
  const fallbackOpen  = computeOpenFromHours(FALLBACK_HOURS);
  const isOpen        = activeStore.openStatus === 'open' || activeStore.openStatus === 'closing_soon' || (!store && fallbackOpen.isOpen);

  const todayDow    = new Date().getDay();
  const todayHours  = activeStore.todayHours ?? FALLBACK_HOURS.find((h: any) => h.dayOfWeek === todayDow);
  const todayDisplay = todayHours?.isClosed
    ? 'Closed today'
    : todayHours?.openTime && todayHours?.closeTime
      ? `${fmt12(todayHours.openTime)} – ${fmt12(todayHours.closeTime)}`
      : null;

  const address = [activeStore.address, activeStore.suburb, activeStore.state, activeStore.postcode].filter(Boolean).join(', ');

  const handleDirections = () => {
    const coords = mapCoords ? `&ll=${mapCoords.latitude},${mapCoords.longitude}` : '';
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent('Butterfield Cookies')}&address=${encodeURIComponent(address + ', Australia')}${coords}`);
  };

  const handleCall = () => {
    const phone = activeStore.phone ?? STORE_PHONE;
    Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  };

  const handleOrder = () => { onClose(); setTimeout(() => router.push('/(customer)/menu'), 300); };
  const handleAllStores = () => { onClose(); setTimeout(() => router.push('/(customer)/stores'), 300); };

  const weekHours: any[] = activeStore.openingHours ?? FALLBACK_HOURS;

  return (
    <Modal visible={visible} transparent animationType="none" allowSwipeDismissal onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: backdropO }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[s.sheet, { backgroundColor: colors.card, transform: [{ translateY }], paddingBottom: Math.max(insets.bottom, 16) + 8, height: SHEET_H }]}>
        <View style={s.handle} />

        {/* ── Map ── */}
        <Pressable style={s.mapWrap} onPress={handleDirections}>
          {MapView && RNMarker && mapCoords ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <MapView
                style={StyleSheet.absoluteFill}
                region={{ latitude: mapCoords.latitude, longitude: mapCoords.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                showsUserLocation={false}
                showsMyLocationButton={false}
                showsCompass={false}
                showsScale={false}
                toolbarEnabled={false}
              >
                <RNMarker coordinate={mapCoords} />
              </MapView>
            </View>
          ) : geocoding ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#C8D8E8' }]} />
          ) : (
            <LinearGradient
              colors={isOpen ? ['#1493FF', '#3CBBEE'] : ['#8E8E93', '#6B6B6B']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            />
          )}

          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.52)']}
            style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}
            pointerEvents="none"
          >
            <View style={s.mapOverlay}>
              <View style={{ flex: 1 }}>
                <Text style={s.headerLabel}>IN-STORE PICKUP</Text>
                <Text style={s.headerName} numberOfLines={1}>{activeStore.name ?? STORE_NAME}</Text>
              </View>
              <View style={[s.statusBadge, { backgroundColor: isOpen ? 'rgba(22,163,74,0.85)' : 'rgba(100,100,100,0.75)' }]}>
                <View style={[s.dot, { backgroundColor: '#fff' }]} />
                <Text style={s.statusText}>{activeStore.openLabel ?? (isOpen ? 'Open' : 'Closed')}</Text>
              </View>
            </View>
          </LinearGradient>

          {(mapCoords || address) ? (
            <View style={s.dirChip} pointerEvents="none">
              <Feather name="navigation" size={11} color="#1493FF" />
              <Text style={s.dirChipText}>Tap for maps</Text>
            </View>
          ) : null}
        </Pressable>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 12 }} showsVerticalScrollIndicator={false}>

          {/* Address */}
          <Reanimated.View style={contentAnimStyle}>
            <Pressable style={s.infoRow} onPress={handleDirections}>
              <View style={s.infoIcon}><Feather name="map-pin" size={15} color="#1493FF" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoVal, { color: colors.foreground }]}>{address}</Text>
                <Text style={s.infoLink}>Tap for directions</Text>
              </View>
              <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
            </Pressable>
          </Reanimated.View>

          {/* Today's hours */}
          {todayDisplay ? (
            <View style={s.infoRow}>
              <View style={s.infoIcon}><Feather name="clock" size={15} color="#1493FF" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>Today's hours</Text>
                <Text style={[s.infoVal, { color: colors.foreground }]}>{todayDisplay}</Text>
                {formatBreakNote(todayHours?.notes) ? (
                  <Text style={[s.infoBreakNote, { color: colors.mutedForeground }]}>{formatBreakNote(todayHours?.notes)}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Phone */}
          <Pressable style={s.infoRow} onPress={handleCall}>
            <View style={s.infoIcon}><Feather name="phone" size={15} color="#1493FF" /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>Phone</Text>
              <Text style={[s.infoVal, { color: colors.foreground }]}>{activeStore.phone ?? STORE_PHONE}</Text>
            </View>
            <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
          </Pressable>

          {/* Website — only shown when set */}
          {activeStore.website ? (
            <Pressable style={s.infoRow} onPress={() => Linking.openURL(activeStore.website)}>
              <View style={s.infoIcon}><Feather name="globe" size={15} color="#1493FF" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>Website</Text>
                <Text style={[s.infoVal, { color: '#1493FF' }]} numberOfLines={1}>
                  {activeStore.website.replace(/^https?:\/\//, '')}
                </Text>
              </View>
              <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
            </Pressable>
          ) : null}

          {/* Services chips */}
          {(activeStore.pickupAvailable || activeStore.deliveryAvailable) ? (
            <Reanimated.View style={[{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, contentAnimStyle]}>
              {activeStore.pickupAvailable   && <View style={s.chip}><Feather name="shopping-bag" size={11} color="#1493FF" /><Text style={[s.chipText, { color: '#1493FF' }]}>Pickup available</Text></View>}
              {activeStore.deliveryAvailable && <View style={[s.chip, { backgroundColor: '#F5F3FF' }]}><Feather name="truck" size={11} color="#7C3AED" /><Text style={[s.chipText, { color: '#7C3AED' }]}>Delivery available</Text></View>}
            </Reanimated.View>
          ) : null}

          {/* Cookie gallery */}
          <View style={s.gallerySection}>
            <Text style={[s.gallerySectionTitle, { color: colors.foreground }]}>Our Cookies</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }} nestedScrollEnabled>
              {STORE_PHOTOS.map((photo) => (
                <View key={photo.label} style={s.galleryItem}>
                  <Image source={{ uri: photo.uri }} style={s.galleryImg} contentFit="cover" transition={250} />
                  <Text style={[s.galleryLabel, { color: colors.foreground }]}>{photo.label}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Public notes */}
          {activeStore.publicNotes ? (
            <Text style={[s.notes, { color: colors.mutedForeground }]}>{activeStore.publicNotes}</Text>
          ) : null}

          {/* Full week hours */}
          {weekHours.length > 0 ? (
            <View style={[s.hoursCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[s.hoursTitle, { color: colors.foreground }]}>Opening Hours</Text>
              {weekHours.map((h: any) => {
                const dayName  = DAYS_LONG[h.dayOfWeek] ?? '';
                const hoursStr = h.isClosed
                  ? 'Closed'
                  : h.openTime && h.closeTime
                    ? `${fmt12(h.openTime)} – ${fmt12(h.closeTime)}`
                    : '—';
                const isToday = new Date().getDay() === h.dayOfWeek;
                return (
                  <View key={h.dayOfWeek} style={[s.hoursRowWrap, isToday && { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8 }]}>
                    <View style={s.hoursRow}>
                      <Text style={[s.hoursDay, { color: isToday ? '#1493FF' : colors.foreground, fontWeight: isToday ? '700' : '400' }]}>{dayName}</Text>
                      <Text style={[s.hoursTime, { color: h.isClosed ? colors.mutedForeground : isToday ? '#1493FF' : colors.foreground }]}>{hoursStr}</Text>
                    </View>
                    {formatBreakNote(h.notes) && !h.isClosed ? (
                      <Text style={[s.hoursBreakNote, { color: colors.mutedForeground }]}>{formatBreakNote(h.notes)}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>

        {/* Footer actions */}
        <View style={s.footer}>
          {address ? (
            <Pressable style={[s.actionBtn, { borderColor: colors.border }]} onPress={handleDirections}>
              <Feather name="map" size={15} color="#1493FF" />
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

        <Pressable style={s.allStores} onPress={handleAllStores}>
          <Text style={s.allStoresText}>View all stores</Text>
          <Feather name="chevron-right" size={13} color="#1493FF" />
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 24 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 10, marginBottom: 6 },

  mapWrap:    { height: MAP_H, marginHorizontal: 14, marginBottom: 4, borderRadius: 16, overflow: 'hidden', backgroundColor: '#C8D8E8' },
  mapOverlay: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  headerLabel:{ fontWeight: '600', fontSize: 10, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.8, marginBottom: 2 },
  headerName: { fontWeight: '700', fontSize: 17, color: '#fff' },
  statusBadge:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  dot:        { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontWeight: '600', fontSize: 11, color: '#fff' },
  dirChip:    { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  dirChipText:{ fontWeight: '600', fontSize: 11, color: '#1493FF' },

  infoRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  infoIcon:      { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  infoLabel:     { fontWeight: '400', fontSize: 11, marginBottom: 1 },
  infoVal:       { fontWeight: '500', fontSize: 14 },
  infoLink:      { fontWeight: '400', fontSize: 11, color: '#1493FF', marginTop: 2 },
  infoBreakNote: { fontWeight: '400', fontSize: 11, marginTop: 2 },

  chip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  chipText: { fontWeight: '500', fontSize: 12 },

  notes: { fontWeight: '400', fontSize: 12, fontStyle: 'italic', lineHeight: 18 },

  hoursCard:      { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 2 },
  hoursTitle:     { fontWeight: '700', fontSize: 13, marginBottom: 8 },
  hoursRowWrap:   { paddingVertical: 4 },
  hoursRow:       { flexDirection: 'row', justifyContent: 'space-between' },
  hoursDay:       { fontSize: 13 },
  hoursTime:      { fontWeight: '500', fontSize: 13 },
  hoursBreakNote: { fontSize: 11, marginTop: 2 },

  footer:       { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingTop: 12 },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  actionBtnText:{ fontWeight: '600', fontSize: 13, color: '#1493FF' },
  orderBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#1493FF' },
  orderBtnText: { fontWeight: '700', fontSize: 14, color: '#fff' },

  allStores:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 10, paddingBottom: 4 },
  allStoresText: { fontWeight: '500', fontSize: 13, color: '#1493FF' },

  gallerySection:      { gap: 8 },
  gallerySectionTitle: { fontWeight: '700', fontSize: 13 },
  galleryItem:         { alignItems: 'center', gap: 5 },
  galleryImg:          { width: 100, height: 100, borderRadius: 14 },
  galleryLabel:        { fontWeight: '500', fontSize: 11 },
});
