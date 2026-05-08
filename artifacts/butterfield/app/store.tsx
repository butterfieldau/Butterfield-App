import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';

const STORE_LAT = -33.8360;
const STORE_LNG = 150.9878;
const ADDRESS = '2 Main Lane, Merrylands NSW 2160';
const MAP_URL = `https://staticmap.openstreetmap.de/staticmap.php?center=${STORE_LAT},${STORE_LNG}&zoom=16&size=800x400&markers=${STORE_LAT},${STORE_LNG},red-pushpin`;

const HOURS = [
  { day: 'Sunday',    hours: '8:00 AM – 10:00 PM' },
  { day: 'Mon – Wed', hours: '6:30 AM – 3:00 PM · 5:00 – 9:00 PM' },
  { day: 'Thu – Sat', hours: '6:30 AM – 10:00 PM' },
];

function openDirections() {
  const encoded = encodeURIComponent(ADDRESS);
  const url = Platform.select({
    ios:     `maps:0,0?q=${encoded}`,
    android: `geo:0,0?q=${encoded}`,
    default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
  })!;
  Linking.openURL(url);
}

function openInMaps() {
  const encoded = encodeURIComponent(ADDRESS);
  Linking.openURL(`https://maps.apple.com/?q=${encoded}&ll=${STORE_LAT},${STORE_LNG}`);
}

export default function StoreScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { data: storeStatusData } = useQuery({
    queryKey: ['store-status'],
    queryFn: () => api.misc.storeStatus(),
    refetchInterval: 60000,
    retry: 1,
  });
  const storeStatus = storeStatusData?.data;
  const storeOpen = storeStatus?.isOpen ?? false;
  const storeHint = storeOpen
    ? (storeStatus?.openUntil ? `Open until ${storeStatus.openUntil}` : 'Open now')
    : (storeStatus?.opensAt ? `Closed · Opens ${storeStatus.opensAt}` : 'Closed · See hours below');

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          hitSlop={12}
        >
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { fontFamily: 'Inter_700Bold', color: colors.foreground }]}>Our store</Text>
          <Text style={[styles.headerSub, { fontFamily: 'Inter_400Regular', color: colors.mutedForeground }]}>Merrylands NSW 2160</Text>
        </View>
        <Text style={[styles.brandText, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>Butterfield</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <Pressable onPress={openInMaps} style={styles.mapWrapper}>
          <Image
            source={{ uri: MAP_URL }}
            style={styles.mapImage}
            resizeMode="cover"
          />
          <View style={[styles.mapBadge, { backgroundColor: colors.card }]}>
            <Feather name="external-link" size={12} color={colors.mutedForeground} />
            <Text style={[styles.mapBadgeText, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>Open in Maps</Text>
          </View>
        </Pressable>

        <View style={styles.body}>
          <Text style={[styles.visitLabel, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>VISIT US</Text>
          <Text style={[styles.storeName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Butterfield Cookies</Text>
          <Text style={[styles.storeAddress, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{ADDRESS}</Text>
          <View style={[styles.openBadge, { backgroundColor: storeOpen ? '#DCFCE7' : '#FEE2E2' }]}>
            <View style={[styles.openDot, { backgroundColor: storeOpen ? '#22C55E' : '#EF4444' }]} />
            <Text style={[styles.openText, { color: storeOpen ? '#15803D' : '#DC2626', fontFamily: 'Inter_600SemiBold' }]}>
              {storeHint}
            </Text>
          </View>

          <View style={[styles.addressCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={[styles.addrIconWrap, { backgroundColor: '#E6F4FF' }]}>
              <Feather name="map-pin" size={18} color={colors.primary} />
            </View>
            <View>
              <Text style={[styles.addrLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>ADDRESS</Text>
              <Text style={[styles.addrText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{ADDRESS}</Text>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>OPENING HOURS</Text>

          <View style={[styles.hoursCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.hoursHeader}>
              <View style={[styles.clockWrap, { backgroundColor: '#E6F4FF' }]}>
                <Feather name="clock" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.hoursTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Trading hours</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            {HOURS.map(({ day, hours }, i) => (
              <View key={day} style={[styles.hoursRow, i < HOURS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <Text style={[styles.hoursDay, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>{day}</Text>
                <Text style={[
                  styles.hoursTime,
                  { color: hours === 'Closed' ? colors.mutedForeground : colors.foreground,
                    fontFamily: hours === 'Closed' ? 'Inter_400Regular' : 'Inter_500Medium' }
                ]}>{hours}</Text>
              </View>
            ))}
          </View>

          <View style={styles.btns}>
            <Pressable
              style={[styles.dirBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openDirections(); }}
            >
              <Feather name="navigation" size={16} color="#fff" />
              <Text style={[styles.dirBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Directions</Text>
            </Pressable>
            <Pressable
              style={[styles.mapsBtn, { borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openInMaps(); }}
            >
              <Feather name="external-link" size={16} color={colors.foreground} />
              <Text style={[styles.mapsBtnText, { fontFamily: 'Inter_600SemiBold', color: colors.foreground }]}>Open in Maps</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17 },
  headerSub: { fontSize: 12, marginTop: 1 },
  brandText: { fontSize: 18, fontStyle: 'italic' },

  scroll: { flexGrow: 1 },

  mapWrapper: { width: '100%', height: 220, overflow: 'hidden' },
  mapImage: { width: '100%', height: '100%' },
  mapBadge: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  mapBadgeText: { fontSize: 12 },

  body: { padding: 20, gap: 16 },

  visitLabel: { fontSize: 12, letterSpacing: 1 },
  storeName: { fontSize: 30, lineHeight: 34, marginTop: -4 },
  storeAddress: { fontSize: 14, marginTop: 2 },
  openBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignSelf: 'flex-start' },
  openDot: { width: 8, height: 8, borderRadius: 4 },
  openText: { fontSize: 13 },

  addressCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, marginTop: 4 },
  addrIconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  addrLabel: { fontSize: 11, letterSpacing: 0.7, marginBottom: 2 },
  addrText: { fontSize: 14 },

  sectionLabel: { fontSize: 12, letterSpacing: 0.8, marginTop: 4 },

  hoursCard: { borderWidth: 1, overflow: 'hidden' },
  hoursHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  clockWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  hoursTitle: { fontSize: 15 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  hoursDay: { fontSize: 14 },
  hoursTime: { fontSize: 14 },

  btns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dirBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  dirBtnText: { color: '#fff', fontSize: 15 },
  mapsBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderWidth: 1 },
  mapsBtnText: { fontSize: 15 },
});
