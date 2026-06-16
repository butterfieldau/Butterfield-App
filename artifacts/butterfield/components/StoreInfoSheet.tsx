import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking, Modal, Pressable,
  StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Animated, {
  interpolate, runOnJS,
  useAnimatedStyle, useSharedValue,
  withSpring, withTiming,
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

const IMAGE_H          = 220;
const BACKDROP_OPACITY = 0.55;
const SPRING_IN        = { damping: 36, stiffness: 320, overshootClamping: true } as const;

/* ─── fallback data ─────────────────────────────────────────────── */
const FALLBACK_STORE = {
  name: 'Butterfield Cookies — Merrylands',
  address: '2 Main Lane', suburb: 'Merrylands', state: 'NSW', postcode: '2160',
  phone: '0480 769 995', website: null as string | null, imageUrl: null as string | null,
  openLabel: 'Open Now', openStatus: 'open',
  pickupAvailable: true, deliveryAvailable: false,
  publicNotes: null as string | null, todayHours: null as any, openingHours: [] as any[],
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
function statusColor(status: string): string {
  if (status === 'open')               return GREEN;
  if (status === 'closing_soon')       return AMBER;
  if (status === 'opens_soon')         return BLUE;
  if (status === 'coming_soon')        return '#8B5CF6';
  if (status === 'temporarily_closed') return AMBER;
  return MUTED;
}

interface Props { visible: boolean; store: any; onClose: () => void; }

export default function StoreInfoSheet({ visible, store, onClose }: Props) {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const { height: SCREEN_H } = useWindowDimensions();

  const [modalVisible, setModalVisible] = useState(false);
  const [imageFailed,  setImageFailed]  = useState(false);

  const translateY = useSharedValue(SCREEN_H);
  const backdropO  = useSharedValue(0);
  const scrollY    = useSharedValue(0);
  const scrollRef  = useRef(null);

  // ── close helpers ────────────────────────────────────────────────
  const dismiss = useCallback(() => {
    setModalVisible(false);
    onClose();
  }, [onClose]);

  const animateOut = useCallback(() => {
    backdropO.value  = withTiming(0, { duration: 200 });
    translateY.value = withTiming(SCREEN_H, { duration: 280 }, (done) => {
      if (done) runOnJS(dismiss)();
    });
  }, [backdropO, translateY, SCREEN_H, dismiss]);

  // ── entrance animation ───────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      translateY.value = SCREEN_H;
      backdropO.value  = 0;
      scrollY.value    = 0;
      setImageFailed(false);
      setModalVisible(true);
      requestAnimationFrame(() => {
        translateY.value = withSpring(0, SPRING_IN);
        backdropO.value  = withTiming(BACKDROP_OPACITY, { duration: 300 });
      });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── pan gesture (exact product-sheet pattern) ────────────────────
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetY([-8, 8])
      .onUpdate((e) => {
        if (e.translationY > 0 && scrollY.value <= 2) {
          translateY.value = e.translationY;
          backdropO.value  = interpolate(e.translationY, [0, 300], [BACKDROP_OPACITY, 0], { extrapolateRight: 'clamp' });
        }
      })
      .onEnd((e) => {
        const shouldDismiss = translateY.value > 110 || (e.velocityY > 600 && translateY.value > 20);
        if (shouldDismiss) {
          backdropO.value  = withTiming(0, { duration: 200 });
          translateY.value = withTiming(SCREEN_H, { duration: 280 }, (done) => {
            if (done) runOnJS(dismiss)();
          });
        } else {
          translateY.value = withSpring(0, SPRING_IN);
          backdropO.value  = withTiming(BACKDROP_OPACITY, { duration: 180 });
        }
      }),
  [scrollY, translateY, backdropO, dismiss, SCREEN_H]);

  const sheetStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));

  // ── data ─────────────────────────────────────────────────────────
  const s = store ?? FALLBACK_STORE;
  const hours       = s.openingHours ?? [];
  const todayHours  = s.todayHours ?? hours.find((h: any) => h.dayOfWeek === new Date().getDay()) ?? null;
  const isOpen      = s.openStatus === 'open' || s.openStatus === 'closing_soon';
  const storeStatus = s.openLabel ?? (isOpen ? 'Open Now' : 'Closed');
  const badgeColor  = statusColor(s.openStatus ?? 'closed');

  const address = [s.address, s.suburb, s.state, s.postcode].filter(Boolean).join(', ');

  const todayDisplay = todayHours?.isClosed
    ? 'Closed today'
    : todayHours?.openTime && todayHours?.closeTime
      ? `${fmt12(todayHours.openTime)} – ${fmt12(todayHours.closeTime)}`
      : null;

  const heroSource = s.imageUrl && !imageFailed ? { uri: s.imageUrl } : null;

  // ── action handlers ──────────────────────────────────────────────
  const handleDirections = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const q      = address || s.name || 'Butterfield Cookies';
    const coords = s.latitude && s.longitude ? `&ll=${s.latitude},${s.longitude}` : '';
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(q)}${coords}`).catch(() => {});
  };
  const handleCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`tel:${String(s.phone ?? '').replace(/\s/g, '')}`).catch(() => {});
  };
  const handleOrder      = () => { animateOut(); setTimeout(() => router.push('/(customer)/menu'), 300); };
  const handleAllStores  = () => { animateOut(); setTimeout(() => router.push('/(customer)/stores'), 300); };

  if (!modalVisible) return null;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={animateOut}
      statusBarTranslucent
    >
      <View style={st.root}>

        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, st.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={animateOut} />
        </Animated.View>

        {/* Sheet — same structure as ProductCustomizerSheet */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[st.sheet, { height: Math.round(SCREEN_H * 0.88) }, sheetStyle]}>

            {/* ── Image area (fixed height, OUTSIDE scroll — swipe always works) ── */}
            <View style={st.imageArea}>
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
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.58)']}
                start={{ x: 0.5, y: 0.2 }} end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              {/* Handle */}
              <View style={st.handleWrap} pointerEvents="none">
                <View style={st.handle} />
              </View>
              {/* Top row */}
              <View style={st.imageTopRow}>
                <Pressable style={st.dirPill} onPress={handleDirections}>
                  <Feather name="navigation" size={11} color={BLUE} />
                  <Text style={st.dirPillText}>Tap for directions</Text>
                </Pressable>
                <View style={[st.statusBadge, { backgroundColor: badgeColor + 'CC' }]}>
                  <View style={st.statusDot} />
                  <Text style={st.statusText}>{storeStatus}</Text>
                </View>
              </View>
              {/* Store name at bottom of image */}
              <View style={st.imageBottom}>
                <Text style={st.imageLabel}>IN-STORE PICKUP</Text>
                <Text style={st.imageName} numberOfLines={2}>{s.name ?? FALLBACK_STORE.name}</Text>
              </View>
            </View>

            {/* ── White content area — mirrors s.content in product sheet ── */}
            <View style={st.content}>

              {/* GHScrollView — flex:1, constrained by content View */}
              <GHScrollView
                ref={scrollRef}
                style={st.scroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 8 }}
                onScroll={(e) => { scrollY.value = e.nativeEvent.contentOffset.y; }}
                scrollEventThrottle={16}
                bounces={false}
              >
                {/* Info card */}
                <View style={[st.card, { borderColor: colors.border }]}>
                  {/* Address */}
                  <Pressable style={st.row} onPress={handleDirections}>
                    <View style={[st.rowIcon, { backgroundColor: BLUE + '15' }]}>
                      <Feather name="map-pin" size={15} color={BLUE} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.rowLabel}>Address</Text>
                      <Text style={st.rowVal} numberOfLines={2}>{address || '—'}</Text>
                      <Text style={st.rowLink}>Tap for directions</Text>
                    </View>
                    <Feather name="chevron-right" size={15} color={MUTED} />
                  </Pressable>

                  {todayDisplay ? (
                    <>
                      <View style={[st.divider, { backgroundColor: colors.border }]} />
                      <View style={st.row}>
                        <View style={[st.rowIcon, { backgroundColor: AMBER + '20' }]}>
                          <Feather name="clock" size={15} color={AMBER} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.rowLabel}>Today&apos;s hours</Text>
                          <Text style={st.rowVal}>{todayDisplay}</Text>
                          {formatBreakNote(todayHours?.notes) ? (
                            <Text style={st.rowNote}>{formatBreakNote(todayHours?.notes)}</Text>
                          ) : null}
                        </View>
                      </View>
                    </>
                  ) : null}

                  {s.phone ? (
                    <>
                      <View style={[st.divider, { backgroundColor: colors.border }]} />
                      <Pressable style={st.row} onPress={handleCall}>
                        <View style={[st.rowIcon, { backgroundColor: GREEN + '18' }]}>
                          <Feather name="phone" size={15} color={GREEN} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.rowLabel}>Phone</Text>
                          <Text style={st.rowVal}>{s.phone}</Text>
                        </View>
                        <Feather name="chevron-right" size={15} color={MUTED} />
                      </Pressable>
                    </>
                  ) : null}

                  {s.website ? (
                    <>
                      <View style={[st.divider, { backgroundColor: colors.border }]} />
                      <Pressable style={st.row} onPress={() => Linking.openURL(s.website).catch(() => {})}>
                        <View style={[st.rowIcon, { backgroundColor: BLUE + '15' }]}>
                          <Feather name="globe" size={15} color={BLUE} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.rowLabel}>Website</Text>
                          <Text style={[st.rowVal, { color: BLUE }]} numberOfLines={1}>
                            {s.website.replace(/^https?:\/\//, '')}
                          </Text>
                        </View>
                        <Feather name="chevron-right" size={15} color={MUTED} />
                      </Pressable>
                    </>
                  ) : null}
                </View>

                {/* Service chips */}
                {(s.pickupAvailable || s.deliveryAvailable) ? (
                  <View style={st.chipRow}>
                    {s.pickupAvailable ? (
                      <View style={[st.chip, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                        <Feather name="shopping-bag" size={11} color={BLUE} />
                        <Text style={[st.chipText, { color: BLUE }]}>Pickup available</Text>
                      </View>
                    ) : null}
                    {s.deliveryAvailable ? (
                      <View style={[st.chip, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
                        <Feather name="truck" size={11} color="#7C3AED" />
                        <Text style={[st.chipText, { color: '#7C3AED' }]}>Delivery available</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {s.publicNotes ? (
                  <Text style={st.notes}>{s.publicNotes}</Text>
                ) : null}

                {/* Opening hours table */}
                {hours.length > 0 ? (
                  <View style={st.hoursCard}>
                    <Text style={st.hoursTitle}>Opening Hours</Text>
                    {hours.map((h: any) => {
                      const dayName  = DAYS_LONG[h.dayOfWeek] ?? '';
                      const hoursStr = h.isClosed
                        ? 'Closed'
                        : h.openTime && h.closeTime
                          ? `${fmt12(h.openTime)} – ${fmt12(h.closeTime)}`
                          : '—';
                      const isToday = new Date().getDay() === h.dayOfWeek;
                      return (
                        <View key={String(h.dayOfWeek)} style={[st.hoursRow, isToday && st.hoursTodayRow]}>
                          <Text style={[st.hoursDay, isToday && st.hoursTodayText]}>{dayName}</Text>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[st.hoursTime, h.isClosed && { color: MUTED }, isToday && st.hoursTodayText]}>
                              {hoursStr}
                            </Text>
                            {formatBreakNote(h.notes) && !h.isClosed ? (
                              <Text style={st.hoursBreak}>{formatBreakNote(h.notes)}</Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {/* View all stores */}
                <Pressable style={st.allStores} onPress={handleAllStores}>
                  <Feather name="map-pin" size={13} color={BLUE} />
                  <Text style={st.allStoresText}>View all stores</Text>
                  <Feather name="chevron-right" size={13} color={BLUE} />
                </Pressable>
              </GHScrollView>

              {/* ── Footer (fixed, inside content — same as product sheet) ── */}
              <View style={[st.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
                {address ? (
                  <Pressable style={[st.footerBtn, st.footerSecondary, { borderColor: colors.border }]} onPress={handleDirections}>
                    <Feather name="map" size={15} color={BLUE} />
                    <Text style={st.footerBtnText}>Directions</Text>
                  </Pressable>
                ) : null}
                {s.phone ? (
                  <Pressable style={[st.footerBtn, st.footerSecondary, { borderColor: colors.border }]} onPress={handleCall}>
                    <Feather name="phone" size={15} color={GREEN} />
                    <Text style={[st.footerBtnText, { color: GREEN }]}>Call</Text>
                  </Pressable>
                ) : null}
                {s.pickupAvailable ? (
                  <Pressable style={[st.footerBtn, st.footerPrimary, { flex: 1 }]} onPress={handleOrder}>
                    <Feather name="shopping-bag" size={15} color={WHITE} />
                    <Text style={st.footerPrimaryText}>Order Pickup</Text>
                  </Pressable>
                ) : null}
              </View>

            </View>
          </Animated.View>
        </GestureDetector>

      </View>
    </Modal>
  );
}

/* ─── styles ─────────────────────────────────────────────────────── */
const st = StyleSheet.create({
  root:    { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: '#000' },

  sheet: {
    width: '100%',
    backgroundColor: WHITE,
    borderTopLeftRadius:  32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },

  /* image area — fixed height, outside scroll */
  imageArea: {
    height: IMAGE_H,
    overflow: 'hidden',
    borderTopLeftRadius:  32,
    borderTopRightRadius: 32,
    justifyContent: 'space-between',
    padding: 14,
    paddingTop: 0,
  },
  handleWrap:   { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.55)' },
  imageTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  dirPill:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: WHITE, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6 },
  dirPillText:  { fontSize: 11, fontWeight: '700', color: BLUE },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18 },
  statusDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: WHITE },
  statusText:   { fontWeight: '700', fontSize: 11, color: WHITE },
  imageBottom:  { gap: 3 },
  imageLabel:   { fontWeight: '600', fontSize: 10, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.8 },
  imageName:    { fontWeight: '800', fontSize: 21, lineHeight: 26, color: WHITE },

  /* content — flex:1, mirrors s.content */
  content: {
    flex: 1,
    backgroundColor: WHITE,
  },

  /* scroll — flex:1, only the scrollable list */
  scroll: { flex: 1 },

  /* info card */
  card:     { marginHorizontal: 16, marginTop: 16, backgroundColor: WHITE, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowIcon:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
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

  /* all stores */
  allStores:     { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 16, paddingVertical: 8, marginBottom: 4 },
  allStoresText: { fontSize: 13, fontWeight: '600', color: BLUE },

  /* footer — inside content, fixed at bottom */
  footer:          { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, backgroundColor: WHITE },
  footerBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 13 },
  footerSecondary: { borderWidth: 1, paddingHorizontal: 14 },
  footerBtnText:   { fontSize: 14, fontWeight: '600', color: BLUE },
  footerPrimary:   { backgroundColor: BLUE },
  footerPrimaryText: { fontSize: 15, fontWeight: '700', color: WHITE },
});
