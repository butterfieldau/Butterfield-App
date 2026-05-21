import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SwipeDownSheet } from '@/components/SwipeDownSheet';
import { useColors } from '@/hooks/useColors';

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
  const m = notes.match(/^Break (\d{2}:\d{2}) [–-] (\d{2}:\d{2})$/);
  if (m) return `Break ${fmt12(m[1])} – ${fmt12(m[2])}`;
  return notes;
}

function computeOpenFromHours(hoursArr: any[]): { isOpen: boolean } {
  const now = new Date();
  const today = hoursArr.find(h => h.dayOfWeek === now.getDay());
  if (!today || today.isClosed || !today.openTime || !today.closeTime) return { isOpen: false };
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = today.openTime.split(':').map(Number);
  const [ch, cm] = today.closeTime.split(':').map(Number);
  const openMins = oh * 60 + om;
  const closeMins = ch * 60 + cm;
  return { isOpen: nowMins >= openMins && nowMins < closeMins };
}

interface Props {
  visible: boolean;
  store: any;
  onClose: () => void;
}

export default function StoreInfoSheet({ visible, store, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (visible) setImageFailed(false);
  }, [visible, store?.id]);

  const activeStore = store ?? FALLBACK_STORE;
  const hours = activeStore.openingHours ?? [];
  const todayHours = activeStore.todayHours ?? hours.find((h: any) => h.dayOfWeek === new Date().getDay()) ?? null;
  const fallbackOpen = computeOpenFromHours(hours.length > 0 ? hours : (FALLBACK_STORE.openingHours ?? []));
  const isOpen = activeStore.openStatus === 'open' || activeStore.openStatus === 'closing_soon' || (!store && fallbackOpen.isOpen);

  const address = [activeStore.address, activeStore.suburb, activeStore.state, activeStore.postcode].filter(Boolean).join(', ');
  const heroSource = activeStore.imageUrl ? { uri: activeStore.imageUrl } : null;

  const handleDirections = () => {
    const q = address || activeStore.name || 'Butterfield Cookies';
    const coords = activeStore.latitude && activeStore.longitude ? `&ll=${activeStore.latitude},${activeStore.longitude}` : '';
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(q)}${coords}`).catch(() => {});
  };

  const handleCall = () => {
    const phone = activeStore.phone ?? FALLBACK_STORE.phone;
    Linking.openURL(`tel:${String(phone).replace(/\s/g, '')}`).catch(() => {});
  };

  const handleOrder = () => {
    onClose();
    setTimeout(() => router.push('/(customer)/menu'), 250);
  };

  const handleAllStores = () => {
    onClose();
    setTimeout(() => router.push('/(customer)/stores'), 250);
  };

  const todayDisplay = todayHours?.isClosed
    ? 'Closed today'
    : todayHours?.openTime && todayHours?.closeTime
      ? `${fmt12(todayHours.openTime)} – ${fmt12(todayHours.closeTime)}`
      : null;

  const storeStatusText = activeStore.openLabel ?? (isOpen ? 'Open Now' : 'Closed');
  const compactHours = hours.length > 0
    ? hours
        .map((h: any) => {
          const dayName = DAYS_LONG[h.dayOfWeek]?.slice(0, 3) ?? '';
          const hoursStr = h.isClosed
            ? 'Closed'
            : h.openTime && h.closeTime
              ? `${fmt12(h.openTime)} – ${fmt12(h.closeTime)}`
              : '—';
          return `${dayName} ${hoursStr}`;
        })
        .join('  •  ')
    : null;
  const resolvedSheetHeight = Math.min(Math.max(510, Math.round(screenHeight * 0.58)), 620);

  return (
    <SwipeDownSheet
      visible={visible}
      onClose={onClose}
      backdropOpacity={0.42}
      sheetHeight={resolvedSheetHeight}
      contentStyle={{ paddingBottom: Math.max(insets.bottom, 14) + 6 }}
      sheetStyle={styles.sheet}
    >
      <View style={styles.contentWrap}>
        <Pressable style={styles.hero} onPress={handleDirections}>
          {heroSource && !imageFailed ? (
            <Image source={heroSource} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={220} onError={() => setImageFailed(true)} />
          ) : (
            <LinearGradient colors={isOpen ? ['#1493FF', '#3CBBEE'] : ['#8E8E93', '#6B6B6B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.54)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroTopRow}>
            <View style={styles.heroPill}>
              <Feather name="navigation" size={11} color="#1493FF" />
              <Text style={styles.heroPillText}>Tap for directions</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: isOpen ? 'rgba(22,163,74,0.9)' : 'rgba(100,100,100,0.8)' }]}>
              <View style={styles.dot} />
              <Text style={styles.statusText}>{storeStatusText}</Text>
            </View>
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.headerLabel}>IN-STORE PICKUP</Text>
            <Text style={styles.headerName} numberOfLines={2}>{activeStore.name ?? FALLBACK_STORE.name}</Text>
          </View>
        </Pressable>

        <View style={styles.body}>
          <Pressable style={styles.infoRow} onPress={handleDirections}>
            <View style={styles.infoIcon}><Feather name="map-pin" size={15} color="#1493FF" /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoVal, { color: colors.foreground }]} numberOfLines={2}>{address}</Text>
              <Text style={styles.infoLink}>Tap for directions</Text>
            </View>
            <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
          </Pressable>

          {todayDisplay ? (
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}><Feather name="clock" size={15} color="#1493FF" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Today&apos;s hours</Text>
                <Text style={[styles.infoVal, { color: colors.foreground }]}>{todayDisplay}</Text>
                {formatBreakNote(todayHours?.notes) ? (
                  <Text style={[styles.infoBreakNote, { color: colors.mutedForeground }]}>{formatBreakNote(todayHours?.notes)}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <Pressable style={styles.infoRow} onPress={handleCall}>
            <View style={styles.infoIcon}><Feather name="phone" size={15} color="#1493FF" /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Phone</Text>
              <Text style={[styles.infoVal, { color: colors.foreground }]}>{activeStore.phone ?? FALLBACK_STORE.phone}</Text>
            </View>
            <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
          </Pressable>

          {activeStore.website ? (
            <Pressable style={styles.infoRow} onPress={() => Linking.openURL(activeStore.website).catch(() => {})}>
              <View style={styles.infoIcon}><Feather name="globe" size={15} color="#1493FF" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Website</Text>
                <Text style={[styles.infoVal, { color: '#1493FF' }]} numberOfLines={1}>
                  {activeStore.website.replace(/^https?:\/\//, '')}
                </Text>
              </View>
              <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
            </Pressable>
          ) : null}

          {(activeStore.pickupAvailable || activeStore.deliveryAvailable) ? (
            <View style={styles.chipRow}>
              {activeStore.pickupAvailable ? <View style={styles.chip}><Feather name="shopping-bag" size={11} color="#1493FF" /><Text style={[styles.chipText, { color: '#1493FF' }]}>Pickup available</Text></View> : null}
              {activeStore.deliveryAvailable ? <View style={[styles.chip, { backgroundColor: '#F5F3FF' }]}><Feather name="truck" size={11} color="#7C3AED" /><Text style={[styles.chipText, { color: '#7C3AED' }]}>Delivery available</Text></View> : null}
            </View>
          ) : null}

          {activeStore.publicNotes ? (
            <Text style={[styles.notes, { color: colors.mutedForeground }]} numberOfLines={2}>{activeStore.publicNotes}</Text>
          ) : null}

          {compactHours ? (
            <View style={[styles.hoursCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.hoursTitle, { color: colors.foreground }]}>Opening Hours</Text>
              <Text style={[styles.hoursCompactText, { color: colors.mutedForeground }]} numberOfLines={3}>
                {compactHours}
              </Text>
            </View>
          ) : null}

          <View style={styles.footer}>
            {address ? (
              <Pressable style={[styles.actionBtn, styles.secondaryActionBtn, { borderColor: colors.border }]} onPress={handleDirections}>
                <Feather name="map" size={15} color="#1493FF" />
                <Text style={styles.actionBtnText}>Directions</Text>
              </Pressable>
            ) : null}
            <Pressable style={[styles.actionBtn, styles.secondaryActionBtn, { borderColor: colors.border }]} onPress={handleCall}>
              <Feather name="phone" size={15} color="#16A34A" />
              <Text style={[styles.actionBtnText, { color: '#16A34A' }]}>Call</Text>
            </Pressable>
            <Pressable style={[styles.orderBtn, { flex: 1 }]} onPress={handleOrder}>
              <Feather name="shopping-bag" size={15} color="#fff" />
              <Text style={styles.orderBtnText}>Order Pickup</Text>
            </Pressable>
          </View>

          <Pressable style={styles.allStores} onPress={handleAllStores}>
            <Text style={styles.allStoresText}>View all stores</Text>
            <Feather name="chevron-right" size={13} color="#1493FF" />
          </Pressable>
        </View>
      </View>
    </SwipeDownSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  contentWrap: { flex: 1 },
  hero: { height: 150, marginHorizontal: 14, marginTop: 2, borderRadius: 16, overflow: 'hidden', justifyContent: 'space-between', padding: 14 },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6 },
  heroPillText: { fontSize: 11, fontWeight: '700', color: '#1493FF' },
  heroBottom: { gap: 2 },
  headerLabel: { fontWeight: '600', fontSize: 10, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.8, marginBottom: 2 },
  headerName: { fontWeight: '700', fontSize: 17, lineHeight: 21, color: '#fff' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  statusText: { fontWeight: '700', fontSize: 11, color: '#fff' },
  body: { flex: 1, paddingHorizontal: 18, paddingTop: 12, gap: 10, justifyContent: 'space-between' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  infoIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontWeight: '400', fontSize: 11, marginBottom: 1 },
  infoVal: { fontWeight: '500', fontSize: 14 },
  infoLink: { fontWeight: '400', fontSize: 11, color: '#1493FF', marginTop: 2 },
  infoBreakNote: { fontWeight: '400', fontSize: 11, marginTop: 2 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  chipText: { fontWeight: '500', fontSize: 12 },
  notes: { fontWeight: '400', fontSize: 12, fontStyle: 'italic', lineHeight: 17 },
  hoursCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  hoursTitle: { fontWeight: '700', fontSize: 12 },
  hoursCompactText: { fontSize: 11, lineHeight: 16 },
  footer: { flexDirection: 'row', gap: 8, paddingTop: 2, alignItems: 'stretch' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  secondaryActionBtn: { minWidth: 96, flex: 0.8 },
  actionBtnText: { fontWeight: '600', fontSize: 13, color: '#1493FF' },
  orderBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: '#1493FF' },
  orderBtnText: { fontWeight: '700', fontSize: 14, color: '#fff' },
  allStores: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 4, paddingBottom: 2 },
  allStoresText: { fontWeight: '500', fontSize: 13, color: '#1493FF' },
});
