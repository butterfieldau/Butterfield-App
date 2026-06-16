import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

/* ─── constants ─────────────────────────────────────────────────── */
const BLUE    = '#1493FF';
const GREEN   = '#16A34A';
const AMBER   = '#F59E0B';
const MUTED   = '#8E8E93';
const TEXT    = '#1C1C1E';
const SUBTEXT = '#6B7280';
const BORDER  = '#E5E7EB';
const BG      = '#F5F6FA';
const WHITE   = '#FFFFFF';

const SPRING_IN        = { damping: 34, stiffness: 300, overshootClamping: true } as const;
const BACKDROP_OPACITY = 0.42;

/* ─── fallback data ─────────────────────────────────────────────── */
const FALLBACK_STORE = {
  name: 'Butterfield Cookies — Merrylands',
  address: '2 Main Lane',
  suburb: 'Merrylands',
  state: 'NSW',
  postcode: '2160',
  phone: '0480 769 995',
  website: null as string | null,
  imageUrl: null as string | null,
  openLabel: 'Open Now',
  openStatus: 'open',
  pickupAvailable: true,
  deliveryAvailable: false,
  publicNotes: null as string | null,
  todayHours: null as any,
  openingHours: [] as any[],
};

const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
function formatBreakNote(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/^Break (\d{2}:\d{2}) [–-] (\d{2}:\d{2})$/);
  if (match) return `Break ${fmt12(match[1])} – ${fmt12(match[2])}`;
  return notes;
}
function openStatusColor(status: string): string {
  if (status === 'open')               return GREEN;
  if (status === 'closing_soon')       return AMBER;
  if (status === 'opens_soon')         return BLUE;
  if (status === 'coming_soon')        return '#8B5CF6';
  if (status === 'temporarily_closed') return AMBER;
  return MUTED;
}

/* ─── props ─────────────────────────────────────────────────────── */
interface Props {
  visible: boolean;
  store: any;
  onClose: () => void;
}

export default function StoreInfoSheet({ visible, store, onClose }: Props) {
  const colors    = useColors();
  const insets    = useSafeAreaInsets();
  const { height: SCREEN_H, width: SCREEN_W } = useWindowDimensions();

  const [modalVisible, setModalVisible] = useState(false);
  const [imageFailed, setImageFailed]   = useState(false);
  const closingRef = useRef(false);

  const translateY = useSharedValue(SCREEN_H);
  const backdropO  = useSharedValue(0);
  /* scrollY tracked via plain RN ScrollView's onScroll — no RNGH needed */
  const scrollY    = useSharedValue(0);

  const HERO_H  = Math.round(SCREEN_W * 0.72);
  const SHEET_H = Math.round(SCREEN_H * 0.88);

  /* ── animation helpers ── */
  const finishClose = useCallback((notifyParent: boolean) => {
    closingRef.current = false;
    setModalVisible(false);
    if (notifyParent) onClose();
  }, [onClose]);

  const animateOut = useCallback((notifyParent = true) => {
    if (closingRef.current) return;
    closingRef.current = true;
    backdropO.value  = withTiming(0, { duration: 200 });
    translateY.value = withTiming(SCREEN_H, { duration: 280 }, (done) => {
      if (done) runOnJS(finishClose)(notifyParent);
    });
  }, [backdropO, translateY, SCREEN_H, finishClose]);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      setImageFailed(false);
      translateY.value = SCREEN_H;
      backdropO.value  = 0;
      scrollY.value    = 0;
      setModalVisible(true);
      requestAnimationFrame(() => {
        translateY.value = withSpring(0, SPRING_IN);
        backdropO.value  = withTiming(BACKDROP_OPACITY, { duration: 240 });
      });
    } else if (modalVisible && !closingRef.current) {
      animateOut(false);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── pan gesture — only activates when at the very top of scroll ── */
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetY([-8, 8])
      .onUpdate((e) => {
        if (e.translationY > 0 && scrollY.value <= 2) {
          translateY.value = e.translationY;
          backdropO.value  = interpolate(
            e.translationY, [0, 300], [BACKDROP_OPACITY, 0],
            { extrapolateRight: 'clamp' },
          );
        }
      })
      .onEnd((e) => {
        const shouldDismiss =
          translateY.value > 110 ||
          (e.velocityY > 600 && translateY.value > 20);
        if (shouldDismiss) {
          runOnJS(animateOut)();
        } else {
          translateY.value = withSpring(0, SPRING_IN);
          backdropO.value  = withTiming(BACKDROP_OPACITY, { duration: 180 });
        }
      }),
  [scrollY, translateY, backdropO, animateOut, SCREEN_H]); // eslint-disable-line react-hooks/exhaustive-deps

  const sheetAnimStyle   = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropAnimStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));

  /* ── data ── */
  const activeStore  = store ?? FALLBACK_STORE;
  const hours        = activeStore.openingHours ?? [];
  const todayHours   = activeStore.todayHours ?? hours.find((h: any) => h.dayOfWeek === new Date().getDay()) ?? null;
  const isOpen       = activeStore.openStatus === 'open' || activeStore.openStatus === 'closing_soon';
  const storeStatus  = activeStore.openLabel ?? (isOpen ? 'Open Now' : 'Closed');
  const statusColor  = openStatusColor(activeStore.openStatus ?? 'closed');

  const address = [activeStore.address, activeStore.suburb, activeStore.state, activeStore.postcode]
    .filter(Boolean).join(', ');

  const todayDisplay = todayHours?.isClosed
    ? 'Closed today'
    : todayHours?.openTime && todayHours?.closeTime
      ? `${fmt12(todayHours.openTime)} – ${fmt12(todayHours.closeTime)}`
      : null;

  const heroSource = activeStore.imageUrl && !imageFailed ? { uri: activeStore.imageUrl } : null;

  /* ── action handlers ── */
  const handleDirections = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const q = address || activeStore.name || 'Butterfield Cookies';
    const coords = activeStore.latitude && activeStore.longitude
      ? `&ll=${activeStore.latitude},${activeStore.longitude}` : '';
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(q)}${coords}`).catch(() => {});
  };
  const handleCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const phone = activeStore.phone ?? FALLBACK_STORE.phone;
    Linking.openURL(`tel:${String(phone).replace(/\s/g, '')}`).catch(() => {});
  };
  const handleOrder = () => { animateOut(); setTimeout(() => router.push('/(customer)/menu'), 300); };
  const handleAllStores = () => { animateOut(); setTimeout(() => router.push('/(customer)/stores'), 300); };

  if (!modalVisible) return null;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={animateOut}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdropAnimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={animateOut} />
        </Animated.View>

        {/* Sheet */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[cs.sheet, { height: SHEET_H }, sheetAnimStyle]}>

            {/* ── Hero (outside ScrollView → swipe-down always dismisses) ── */}
            <Pressable
              style={[cs.hero, { height: HERO_H }]}
              onPress={handleDirections}
              accessibilityLabel="Tap for directions"
            >
              {heroSource ? (
                <Image
                  source={heroSource}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  transition={220}
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <LinearGradient
                  colors={isOpen ? [BLUE, '#3CBBEE'] : ['#6B7280', '#9CA3AF']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              )}
              {/* Bottom gradient overlay for text legibility */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.55)']}
                start={{ x: 0.5, y: 0.25 }} end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              {/* Drag handle overlaid at very top */}
              <View style={cs.handleOverlay}>
                <View style={cs.handle} />
              </View>
              {/* Top row: directions pill + status badge */}
              <View style={cs.heroTopRow}>
                <View style={cs.heroPill}>
                  <Feather name="navigation" size={11} color={BLUE} />
                  <Text style={cs.heroPillText}>Tap for directions</Text>
                </View>
                <View style={[cs.statusBadge, { backgroundColor: statusColor + 'CC' }]}>
                  <View style={cs.statusDot} />
                  <Text style={cs.statusBadgeText}>{storeStatus}</Text>
                </View>
              </View>
              {/* Bottom: name */}
              <View style={cs.heroBottom}>
                <Text style={cs.heroLabel}>IN-STORE PICKUP</Text>
                <Text style={cs.heroName} numberOfLines={2}>{activeStore.name ?? FALLBACK_STORE.name}</Text>
              </View>
            </Pressable>

            {/* ── Scrollable body — GHScrollView matches product sheet smoothness ── */}
            <GHScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
              bounces={false}
              onScroll={(e) => { scrollY.value = e.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
            >
              {/* Info card */}
              <View style={cs.card}>
                {/* Address */}
                <Pressable style={cs.row} onPress={handleDirections}>
                  <View style={[cs.rowIcon, { backgroundColor: BLUE + '15' }]}>
                    <Feather name="map-pin" size={15} color={BLUE} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={cs.rowLabel}>Address</Text>
                    <Text style={cs.rowVal} numberOfLines={2}>{address || '—'}</Text>
                    <Text style={cs.rowLink}>Tap for directions</Text>
                  </View>
                  <Feather name="chevron-right" size={15} color={MUTED} />
                </Pressable>

                <View style={[cs.divider, { backgroundColor: colors.border }]} />

                {/* Today's hours */}
                {todayDisplay ? (
                  <>
                    <View style={cs.row}>
                      <View style={[cs.rowIcon, { backgroundColor: AMBER + '20' }]}>
                        <Feather name="clock" size={15} color={AMBER} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={cs.rowLabel}>Today&apos;s hours</Text>
                        <Text style={cs.rowVal}>{todayDisplay}</Text>
                        {formatBreakNote(todayHours?.notes) ? (
                          <Text style={cs.rowNote}>{formatBreakNote(todayHours?.notes)}</Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={[cs.divider, { backgroundColor: colors.border }]} />
                  </>
                ) : null}

                {/* Phone */}
                {activeStore.phone ? (
                  <>
                    <Pressable style={cs.row} onPress={handleCall}>
                      <View style={[cs.rowIcon, { backgroundColor: GREEN + '18' }]}>
                        <Feather name="phone" size={15} color={GREEN} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={cs.rowLabel}>Phone</Text>
                        <Text style={cs.rowVal}>{activeStore.phone}</Text>
                      </View>
                      <Feather name="chevron-right" size={15} color={MUTED} />
                    </Pressable>
                    {activeStore.website ? (
                      <View style={[cs.divider, { backgroundColor: colors.border }]} />
                    ) : null}
                  </>
                ) : null}

                {/* Website */}
                {activeStore.website ? (
                  <Pressable
                    style={cs.row}
                    onPress={() => Linking.openURL(activeStore.website).catch(() => {})}
                  >
                    <View style={[cs.rowIcon, { backgroundColor: BLUE + '15' }]}>
                      <Feather name="globe" size={15} color={BLUE} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={cs.rowLabel}>Website</Text>
                      <Text style={[cs.rowVal, { color: BLUE }]} numberOfLines={1}>
                        {activeStore.website.replace(/^https?:\/\//, '')}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={15} color={MUTED} />
                  </Pressable>
                ) : null}
              </View>

              {/* Service chips */}
              {(activeStore.pickupAvailable || activeStore.deliveryAvailable) ? (
                <View style={cs.chipRow}>
                  {activeStore.pickupAvailable ? (
                    <View style={[cs.chip, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                      <Feather name="shopping-bag" size={11} color={BLUE} />
                      <Text style={[cs.chipText, { color: BLUE }]}>Pickup available</Text>
                    </View>
                  ) : null}
                  {activeStore.deliveryAvailable ? (
                    <View style={[cs.chip, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
                      <Feather name="truck" size={11} color="#7C3AED" />
                      <Text style={[cs.chipText, { color: '#7C3AED' }]}>Delivery available</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Public notes */}
              {activeStore.publicNotes ? (
                <Text style={cs.notes}>{activeStore.publicNotes}</Text>
              ) : null}

              {/* Opening hours table */}
              {hours.length > 0 ? (
                <View style={cs.hoursCard}>
                  <Text style={cs.hoursTitle}>Opening Hours</Text>
                  {hours.map((h: any) => {
                    const dayName  = DAYS_LONG[h.dayOfWeek] ?? '';
                    const hoursStr = h.isClosed
                      ? 'Closed'
                      : h.openTime && h.closeTime
                        ? `${fmt12(h.openTime)} – ${fmt12(h.closeTime)}`
                        : '—';
                    const isToday = new Date().getDay() === h.dayOfWeek;
                    return (
                      <View key={String(h.dayOfWeek)} style={[cs.hoursRow, isToday && cs.hoursTodayRow]}>
                        <Text style={[cs.hoursDay, isToday && cs.hoursTodayText]}>{dayName}</Text>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[cs.hoursTime, h.isClosed && { color: MUTED }, isToday && cs.hoursTodayText]}>
                            {hoursStr}
                          </Text>
                          {formatBreakNote(h.notes) && !h.isClosed ? (
                            <Text style={cs.hoursBreak}>{formatBreakNote(h.notes)}</Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {/* View all stores link */}
              <Pressable style={cs.allStores} onPress={handleAllStores}>
                <Feather name="map-pin" size={13} color={BLUE} />
                <Text style={cs.allStoresText}>View all stores</Text>
                <Feather name="chevron-right" size={13} color={BLUE} />
              </Pressable>
            </GHScrollView>

            {/* ── Sticky footer ── */}
            <View style={[cs.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
              {address ? (
                <Pressable style={[cs.footerBtn, cs.footerSecondary, { borderColor: colors.border }]} onPress={handleDirections}>
                  <Feather name="map" size={15} color={BLUE} />
                  <Text style={cs.footerBtnText}>Directions</Text>
                </Pressable>
              ) : null}
              {activeStore.phone ? (
                <Pressable style={[cs.footerBtn, cs.footerSecondary, { borderColor: colors.border }]} onPress={handleCall}>
                  <Feather name="phone" size={15} color={GREEN} />
                  <Text style={[cs.footerBtnText, { color: GREEN }]}>Call</Text>
                </Pressable>
              ) : null}
              {activeStore.pickupAvailable ? (
                <Pressable style={[cs.footerBtn, cs.footerPrimary, { flex: 1 }]} onPress={handleOrder}>
                  <Feather name="shopping-bag" size={15} color={WHITE} />
                  <Text style={cs.footerPrimaryText}>Order Pickup</Text>
                </Pressable>
              ) : null}
            </View>

          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

/* ─── styles ─────────────────────────────────────────────────────── */
const cs = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: WHITE,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: 'hidden',
  },

  /* hero */
  hero:        { width: '100%', justifyContent: 'space-between', padding: 14, paddingTop: 30 },
  handleOverlay: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 10, zIndex: 10 },
  handle:      { width: 42, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)' },
  heroTopRow:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: WHITE, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6 },
  heroPillText: { fontSize: 11, fontWeight: '700', color: BLUE },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18 },
  statusDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: WHITE },
  statusBadgeText: { fontWeight: '700', fontSize: 11, color: WHITE },
  heroBottom:  { gap: 3 },
  heroLabel:   { fontWeight: '600', fontSize: 10, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.8 },
  heroName:    { fontWeight: '800', fontSize: 21, lineHeight: 26, color: WHITE },

  /* info card */
  card:    { marginHorizontal: 16, marginTop: 16, backgroundColor: WHITE, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, overflow: 'hidden' },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowLabel: { fontSize: 11, fontWeight: '400', color: SUBTEXT, marginBottom: 1 },
  rowVal:   { fontSize: 14, fontWeight: '500', color: TEXT },
  rowLink:  { fontSize: 11, fontWeight: '400', color: BLUE, marginTop: 2 },
  rowNote:  { fontSize: 11, fontWeight: '400', color: MUTED, marginTop: 2 },
  divider:  { height: StyleSheet.hairlineWidth, marginLeft: 60 },

  /* chips */
  chipRow:  { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '600' },

  /* notes */
  notes: { fontSize: 13, color: MUTED, fontStyle: 'italic', marginHorizontal: 16, marginTop: 10, lineHeight: 18 },

  /* hours table */
  hoursCard:      { marginHorizontal: 16, marginTop: 14, backgroundColor: BG, borderRadius: 14, padding: 14 },
  hoursTitle:     { fontSize: 13, fontWeight: '700', color: TEXT, marginBottom: 10 },
  hoursRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 5 },
  hoursTodayRow:  { backgroundColor: '#EFF6FF', marginHorizontal: -4, paddingHorizontal: 4, borderRadius: 8 },
  hoursDay:       { fontSize: 13, fontWeight: '400', color: SUBTEXT },
  hoursTodayText: { color: BLUE, fontWeight: '700' },
  hoursTime:      { fontSize: 13, fontWeight: '500', color: TEXT, textAlign: 'right' },
  hoursBreak:     { fontSize: 11, color: MUTED, textAlign: 'right', marginTop: 1 },

  /* all stores link */
  allStores:     { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 16, paddingVertical: 8 },
  allStoresText: { fontSize: 13, fontWeight: '600', color: BLUE },

  /* footer */
  footer:         { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, backgroundColor: WHITE },
  footerBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 13 },
  footerSecondary:{ borderWidth: 1, paddingHorizontal: 14 },
  footerBtnText:  { fontSize: 14, fontWeight: '600', color: BLUE },
  footerPrimary:  { backgroundColor: BLUE },
  footerPrimaryText: { fontSize: 15, fontWeight: '700', color: WHITE },
});
