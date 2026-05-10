import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.min(SCREEN_H * 0.72, 560);

const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function statusColor(status: string) {
  if (status === 'open')               return '#16A34A';
  if (status === 'closing_soon')       return '#F59E0B';
  if (status === 'opens_soon')         return '#3B82F6';
  if (status === 'coming_soon')        return '#8B5CF6';
  if (status === 'temporarily_closed') return '#F59E0B';
  return '#8E8E93';
}

interface Props {
  visible: boolean;
  store: any;          // store object from api.stores.list()
  onClose: () => void;
}

export default function StoreInfoSheet({ visible, store, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SHEET_H)).current;
  const backdropO  = useRef(new Animated.Value(0)).current;

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

  if (!store) return null;

  const sc = statusColor(store.openStatus ?? '');
  const isOpen = store.openStatus === 'open' || store.openStatus === 'closing_soon';

  const todayHours = store.todayHours;
  const todayDisplay = todayHours?.isClosed
    ? 'Closed today'
    : todayHours?.openTime && todayHours?.closeTime
      ? `${fmt12(todayHours.openTime)} – ${fmt12(todayHours.closeTime)}`
      : null;

  const address = [store.address, store.suburb, store.state, store.postcode]
    .filter(Boolean).join(', ');

  const handleDirections = () => {
    if (!store.latitude || !store.longitude) return;
    const q = address || `${store.latitude},${store.longitude}`;
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(q)}&ll=${store.latitude},${store.longitude}`);
  };

  const handleCall = () => {
    if (!store.phone) return;
    Linking.openURL(`tel:${store.phone.replace(/\s/g, '')}`);
  };

  const handleOrder = () => {
    onClose();
    setTimeout(() => router.push('/(customer)/menu'), 300);
  };

  const handleAllStores = () => {
    onClose();
    setTimeout(() => router.push('/(customer)/stores'), 300);
  };

  const weekHours: any[] = store.openingHours ?? [];

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

        {/* Blue gradient header */}
        <LinearGradient
          colors={isOpen ? ['#4B72C4', '#3058A8'] : ['#8E8E93', '#6B6B6B']}
          style={s.header}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.headerLabel}>IN-STORE PICKUP</Text>
            <Text style={s.headerName} numberOfLines={1}>{store.name}</Text>
          </View>
          <View style={s.statusBadge}>
            <View style={[s.dot, { backgroundColor: sc }]} />
            <Text style={s.statusText}>{store.openLabel ?? (isOpen ? 'Open' : 'Closed')}</Text>
          </View>
        </LinearGradient>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 18, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Address */}
          {address ? (
            <Pressable style={s.infoRow} onPress={handleDirections}>
              <View style={s.infoIcon}>
                <Feather name="map-pin" size={15} color="#3058A8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoVal, { color: colors.foreground }]}>{address}</Text>
                <Text style={s.infoLink}>Tap for directions</Text>
              </View>
              <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
            </Pressable>
          ) : null}

          {/* Today's hours */}
          {todayDisplay ? (
            <View style={s.infoRow}>
              <View style={s.infoIcon}>
                <Feather name="clock" size={15} color="#3058A8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>Today's hours</Text>
                <Text style={[s.infoVal, { color: colors.foreground }]}>{todayDisplay}</Text>
              </View>
            </View>
          ) : null}

          {/* Phone */}
          {store.phone ? (
            <Pressable style={s.infoRow} onPress={handleCall}>
              <View style={s.infoIcon}>
                <Feather name="phone" size={15} color="#3058A8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>Phone</Text>
                <Text style={[s.infoVal, { color: colors.foreground }]}>{store.phone}</Text>
              </View>
              <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
            </Pressable>
          ) : null}

          {/* Services */}
          {(store.pickupAvailable || store.deliveryAvailable) ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {store.pickupAvailable   && <View style={s.chip}><Feather name="shopping-bag" size={11} color="#3058A8" /><Text style={[s.chipText, { color: '#3058A8' }]}>Pickup available</Text></View>}
              {store.deliveryAvailable && <View style={[s.chip, { backgroundColor: '#F5F3FF' }]}><Feather name="truck" size={11} color="#7C3AED" /><Text style={[s.chipText, { color: '#7C3AED' }]}>Delivery available</Text></View>}
            </View>
          ) : null}

          {/* Public notes */}
          {store.publicNotes ? (
            <Text style={[s.notes, { color: colors.mutedForeground }]}>{store.publicNotes}</Text>
          ) : null}

          {/* Full week hours */}
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
                    <Text style={[s.hoursDay, { color: isToday ? '#3058A8' : colors.foreground, fontFamily: isToday ? 'Inter_700Bold' : 'Inter_400Regular' }]}>{dayName}</Text>
                    <Text style={[s.hoursTime, { color: h.isClosed ? colors.mutedForeground : isToday ? '#3058A8' : colors.foreground }]}>{hoursStr}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>

        {/* Bottom action row */}
        <View style={s.footer}>
          {store.latitude && store.longitude ? (
            <Pressable style={[s.actionBtn, { borderColor: colors.border }]} onPress={handleDirections}>
              <Feather name="map" size={15} color="#3058A8" />
              <Text style={s.actionBtnText}>Directions</Text>
            </Pressable>
          ) : null}
          {store.phone ? (
            <Pressable style={[s.actionBtn, { borderColor: colors.border }]} onPress={handleCall}>
              <Feather name="phone" size={15} color="#16A34A" />
              <Text style={[s.actionBtnText, { color: '#16A34A' }]}>Call</Text>
            </Pressable>
          ) : null}
          <Pressable style={[s.orderBtn, { flex: 1 }]} onPress={handleOrder}>
            <Feather name="shopping-bag" size={15} color="#fff" />
            <Text style={s.orderBtnText}>Order Pickup</Text>
          </Pressable>
        </View>

        {/* All stores link */}
        <Pressable style={s.allStores} onPress={handleAllStores}>
          <Text style={s.allStoresText}>View all stores</Text>
          <Feather name="chevron-right" size={13} color="#3058A8" />
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 24 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 10, marginBottom: 6 },

  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 16, gap: 12 },
  headerLabel:{ fontFamily: 'Inter_600SemiBold', fontSize: 10, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.8, marginBottom: 2 },
  headerName: { fontFamily: 'Inter_700Bold', fontSize: 17, color: '#fff' },
  statusBadge:{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  dot:        { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#fff' },

  infoRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  infoIcon:   { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  infoLabel:  { fontFamily: 'Inter_400Regular', fontSize: 11, marginBottom: 1 },
  infoVal:    { fontFamily: 'Inter_500Medium', fontSize: 14 },
  infoLink:   { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#3058A8', marginTop: 2 },

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
  actionBtnText:{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#3058A8' },
  orderBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#3058A8' },
  orderBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' },

  allStores:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 10, paddingBottom: 4 },
  allStoresText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#3058A8' },
});
