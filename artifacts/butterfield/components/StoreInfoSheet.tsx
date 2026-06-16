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

const SPRING_IN = { damping: 34, stiffness: 300, overshootClamping: true } as const;
const BACKDROP_OPACITY = 0.42;

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
  publicNotes: 'Visit us in Merrylands for cookies, coffee and pickup orders.',
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

function computeOpenFromHours(hoursArr: any[]): { isOpen: boolean } {
  const now = new Date();
  const today = hoursArr.find(h => h.dayOfWeek === now.getDay());
  if (!today || today.isClosed || !today.openTime || !today.closeTime) return { isOpen: false };
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = today.openTime.split(':').map(Number);
  const [ch, cm] = today.closeTime.split(':').map(Number);
  return { isOpen: nowMins >= oh * 60 + om && nowMins < ch * 60 + cm };
}

interface Props {
  visible: boolean;
  store: any;
  onClose: () => void;
}

export default function StoreInfoSheet({ visible, store, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: SCREEN_H, width: SCREEN_W } = useWindowDimensions();
  const [modalVisible, setModalVisible] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const closingRef = useRef(false);

  const translateY = useSharedValue(SCREEN_H);
  const backdropO = useSharedValue(0);
  const scrollY = useSharedValue(0);

  const HERO_H = Math.round(SCREEN_W * 0.8);
  const SHEET_H = Math.round(SCREEN_H * 0.88);

  const finishClose = useCallback((notifyParent: boolean) => {
    closingRef.current = false;
    setModalVisible(false);
    if (notifyParent) onClose();
  }, [onClose]);

  const animateOut = useCallback((notifyParent = true) => {
    if (closingRef.current) return;
    closingRef.current = true;
    backdropO.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(SCREEN_H, { duration: 280 }, (done) => {
      if (done) runOnJS(finishClose)(notifyParent);
    });
  }, [backdropO, translateY, SCREEN_H, finishClose]);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      setImageFailed(false);
      translateY.value = SCREEN_H;
      backdropO.value = 0;
      scrollY.value = 0;
      setModalVisible(true);
      requestAnimationFrame(() => {
        translateY.value = withSpring(0, SPRING_IN);
        backdropO.value = withTiming(BACKDROP_OPACITY, { duration: 240 });
      });
    } else if (modalVisible && !closingRef.current) {
      animateOut(false);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollNativeGesture = useMemo(() => Gesture.Native(), []);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetY([-8, 8])
      .simultaneousWithExternalGesture(scrollNativeGesture)
      .onUpdate((e) => {
        if (e.translationY > 0 && scrollY.value <= 2) {
          translateY.value = e.translationY;
          backdropO.value = interpolate(
            e.translationY,
            [0, 300],
            [BACKDROP_OPACITY, 0],
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
          backdropO.value = withTiming(BACKDROP_OPACITY, { duration: 180 });
        }
      }),
  [scrollY, translateY, backdropO, animateOut, scrollNativeGesture]);

  const sheetAnimStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropAnimStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));

  const activeStore = store ?? FALLBACK_STORE;
  const hours = activeStore.openingHours ?? [];
  const todayHours =
    activeStore.todayHours ??
    hours.find((h: any) => h.dayOfWeek === new Date().getDay()) ??
    null;
  const fallbackOpen = computeOpenFromHours(
    hours.length > 0 ? hours : (FALLBACK_STORE.openingHours ?? []),
  );
  const isOpen =
    activeStore.openStatus === 'open' ||
    activeStore.openStatus === 'closing_soon' ||
    (!store && fallbackOpen.isOpen);

  const address = [
    activeStore.address,
    activeStore.suburb,
    activeStore.state,
    activeStore.postcode,
  ]
    .filter(Boolean)
    .join(', ');

  const heroSource = activeStore.imageUrl && !imageFailed ? { uri: activeStore.imageUrl } : null;

  const todayDisplay = todayHours?.isClosed
    ? 'Closed today'
    : todayHours?.openTime && todayHours?.closeTime
      ? `${fmt12(todayHours.openTime)} – ${fmt12(todayHours.closeTime)}`
      : null;

  const storeStatusText = activeStore.openLabel ?? (isOpen ? 'Open Now' : 'Closed');

  const handleDirections = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const q = address || activeStore.name || 'Butterfield Cookies';
    const coords =
      activeStore.latitude && activeStore.longitude
        ? `&ll=${activeStore.latitude},${activeStore.longitude}`
        : '';
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(q)}${coords}`).catch(() => {});
  };

  const handleCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const phone = activeStore.phone ?? FALLBACK_STORE.phone;
    Linking.openURL(`tel:${String(phone).replace(/\s/g, '')}`).catch(() => {});
  };

  const handleOrder = () => {
    animateOut();
    setTimeout(() => router.push('/(customer)/menu'), 300);
  };

  const handleAllStores = () => {
    animateOut();
    setTimeout(() => router.push('/(customer)/stores'), 300);
  };

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
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdropAnimStyle]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={animateOut} />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.sheet,
              { height: SHEET_H },
              sheetAnimStyle,
            ]}
          >
              {/* Hero — outside ScrollView so swipe-down always dismisses */}
            <Pressable
              style={[styles.hero, { height: HERO_H }]}
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
                  colors={isOpen ? ['#1493FF', '#3CBBEE'] : ['#8E8E93', '#6B6B6B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.6)']}
                start={{ x: 0.5, y: 0.3 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              {/* Drag handle overlaid at top of hero */}
              <View style={styles.handleOverlay}>
                <View style={styles.handle} />
              </View>
              <View style={styles.heroTopRow}>
                <View style={styles.heroPill}>
                  <Feather name="navigation" size={11} color="#1493FF" />
                  <Text style={styles.heroPillText}>Tap for directions</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: isOpen
                        ? 'rgba(22,163,74,0.9)'
                        : 'rgba(100,100,100,0.8)',
                    },
                  ]}
                >
                  <View style={styles.dot} />
                  <Text style={styles.statusText}>{storeStatusText}</Text>
                </View>
              </View>
              <View style={styles.heroBottom}>
                <Text style={styles.headerLabel}>IN-STORE PICKUP</Text>
                <Text style={styles.headerName} numberOfLines={2}>
                  {activeStore.name ?? FALLBACK_STORE.name}
                </Text>
              </View>
            </Pressable>

            <GestureDetector gesture={scrollNativeGesture}>
            <GHScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
              bounces
              onScroll={(e) => {
                scrollY.value = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
            >
              <View style={styles.body}>
                <Pressable style={styles.infoRow} onPress={handleDirections}>
                  <Feather name="map-pin" size={16} color="#1493FF" style={styles.infoIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoVal, { color: colors.foreground }]}>{address}</Text>
                    <Text style={styles.infoLink}>Tap for directions</Text>
                  </View>
                  <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
                </Pressable>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {todayDisplay ? (
                  <>
                    <View style={styles.infoRow}>
                      <Feather name="clock" size={16} color="#1493FF" style={styles.infoIcon} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                          Today&apos;s hours
                        </Text>
                        <Text style={[styles.infoVal, { color: colors.foreground }]}>
                          {todayDisplay}
                        </Text>
                        {formatBreakNote(todayHours?.notes) ? (
                          <Text style={[styles.infoBreakNote, { color: colors.mutedForeground }]}>
                            {formatBreakNote(todayHours?.notes)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  </>
                ) : null}

                <Pressable style={styles.infoRow} onPress={handleCall}>
                  <Feather name="phone" size={16} color="#1493FF" style={styles.infoIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Phone</Text>
                    <Text style={[styles.infoVal, { color: colors.foreground }]}>
                      {activeStore.phone ?? FALLBACK_STORE.phone}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
                </Pressable>

                {activeStore.website ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <Pressable
                      style={styles.infoRow}
                      onPress={() =>
                        Linking.openURL(activeStore.website).catch(() => {})
                      }
                    >
                      <Feather name="globe" size={16} color="#1493FF" style={styles.infoIcon} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                          Website
                        </Text>
                        <Text
                          style={[styles.infoVal, { color: '#1493FF' }]}
                          numberOfLines={1}
                        >
                          {activeStore.website.replace(/^https?:\/\//, '')}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
                    </Pressable>
                  </>
                ) : null}

                {activeStore.pickupAvailable || activeStore.deliveryAvailable ? (
                  <View style={styles.chipRow}>
                    {activeStore.pickupAvailable ? (
                      <View style={styles.chip}>
                        <Feather name="shopping-bag" size={11} color="#1493FF" />
                        <Text style={[styles.chipText, { color: '#1493FF' }]}>
                          Pickup available
                        </Text>
                      </View>
                    ) : null}
                    {activeStore.deliveryAvailable ? (
                      <View style={[styles.chip, { backgroundColor: '#F5F3FF' }]}>
                        <Feather name="truck" size={11} color="#7C3AED" />
                        <Text style={[styles.chipText, { color: '#7C3AED' }]}>
                          Delivery available
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {activeStore.publicNotes ? (
                  <Text style={[styles.notes, { color: colors.mutedForeground }]}>
                    {activeStore.publicNotes}
                  </Text>
                ) : null}

                {hours.length > 0 ? (
                  <View style={[styles.hoursCard, { backgroundColor: '#F5F6FA' }]}>
                    <Text style={[styles.hoursTitle, { color: colors.foreground }]}>
                      Opening Hours
                    </Text>
                    {hours.map((h: any) => {
                      const dayName = DAYS_LONG[h.dayOfWeek] ?? '';
                      const hoursStr = h.isClosed
                        ? 'Closed'
                        : h.openTime && h.closeTime
                          ? `${fmt12(h.openTime)} – ${fmt12(h.closeTime)}`
                          : '—';
                      const isToday = new Date().getDay() === h.dayOfWeek;
                      return (
                        <View
                          key={String(h.dayOfWeek)}
                          style={[
                            styles.hoursRowWrap,
                            isToday && styles.hoursTodayRow,
                          ]}
                        >
                          <View style={styles.hoursRow}>
                            <Text
                              style={[
                                styles.hoursDay,
                                {
                                  color: isToday ? '#1493FF' : colors.foreground,
                                  fontWeight: isToday ? '700' : '400',
                                },
                              ]}
                            >
                              {dayName}
                            </Text>
                            <Text
                              style={[
                                styles.hoursTime,
                                {
                                  color: h.isClosed
                                    ? colors.mutedForeground
                                    : isToday
                                      ? '#1493FF'
                                      : colors.foreground,
                                  fontWeight: isToday ? '600' : '500',
                                },
                              ]}
                            >
                              {hoursStr}
                            </Text>
                          </View>
                          {formatBreakNote(h.notes) && !h.isClosed ? (
                            <Text
                              style={[styles.hoursBreakNote, { color: colors.mutedForeground }]}
                            >
                              {formatBreakNote(h.notes)}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                <Pressable style={styles.allStores} onPress={handleAllStores}>
                  <Text style={styles.allStoresText}>View all stores</Text>
                  <Feather name="chevron-right" size={13} color="#1493FF" />
                </Pressable>
              </View>
            </GHScrollView>
            </GestureDetector>

            <View
              style={[
                styles.footerBar,
                {
                  borderTopColor: colors.border,
                  paddingBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              {address ? (
                <Pressable
                  style={[styles.footerBtn, styles.footerSecondary, { borderColor: colors.border }]}
                  onPress={handleDirections}
                >
                  <Feather name="map" size={15} color="#1493FF" />
                  <Text style={styles.footerBtnText}>Directions</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.footerBtn, styles.footerSecondary, { borderColor: colors.border }]}
                onPress={handleCall}
              >
                <Feather name="phone" size={15} color="#16A34A" />
                <Text style={[styles.footerBtnText, { color: '#16A34A' }]}>Call</Text>
              </Pressable>
              <Pressable style={[styles.footerBtn, styles.footerPrimary, { flex: 1 }]} onPress={handleOrder}>
                <Feather name="shopping-bag" size={15} color="#fff" />
                <Text style={styles.footerPrimaryText}>Order Pickup</Text>
              </Pressable>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  handleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 10,
    zIndex: 10,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  hero: {
    width: '100%',
    justifyContent: 'space-between',
    padding: 14,
    paddingTop: 32,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1493FF',
  },
  heroBottom: {
    gap: 2,
  },
  headerLabel: {
    fontWeight: '600',
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  headerName: {
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 24,
    color: '#fff',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  statusText: {
    fontWeight: '700',
    fontSize: 11,
    color: '#fff',
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 0,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  infoIcon: {
    width: 20,
    textAlign: 'center',
  },
  infoLabel: {
    fontWeight: '400',
    fontSize: 11,
    marginBottom: 2,
  },
  infoVal: {
    fontWeight: '500',
    fontSize: 14,
  },
  infoLink: {
    fontWeight: '400',
    fontSize: 11,
    color: '#1493FF',
    marginTop: 2,
  },
  infoBreakNote: {
    fontWeight: '400',
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 32,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
    marginBottom: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  chipText: {
    fontWeight: '500',
    fontSize: 12,
  },
  notes: {
    fontWeight: '400',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 4,
  },
  hoursCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 14,
    marginBottom: 4,
  },
  hoursTitle: {
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 10,
  },
  hoursRowWrap: {
    paddingVertical: 5,
    borderRadius: 8,
  },
  hoursTodayRow: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  hoursDay: {
    fontSize: 13,
  },
  hoursTime: {
    fontSize: 13,
  },
  hoursBreakNote: {
    fontSize: 11,
    marginTop: 2,
  },
  allStores: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 18,
    paddingBottom: 8,
  },
  allStoresText: {
    fontWeight: '500',
    fontSize: 13,
    color: '#1493FF',
  },
  footerBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#fff',
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  footerSecondary: {
    borderWidth: 1,
    minWidth: 100,
  },
  footerPrimary: {
    backgroundColor: '#1493FF',
  },
  footerBtnText: {
    fontWeight: '600',
    fontSize: 13,
    color: '#1493FF',
  },
  footerPrimaryText: {
    fontWeight: '700',
    fontSize: 14,
    color: '#fff',
  },
});
