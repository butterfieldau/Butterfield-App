import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const STORE_NAME = 'Butterfield Cookies';
const STORE_ADDRESS = '2 Main Lane, Merrylands NSW 2160';
const MAPS_QUERY = encodeURIComponent(`${STORE_NAME} ${STORE_ADDRESS}`);

const HOURS = [
  { day: 'Mon–Fri', hours: '10:00 AM – 6:00 PM', closed: false },
  { day: 'Saturday', hours: '10:00 AM – 6:00 PM', closed: false },
  { day: 'Sunday', hours: 'Closed', closed: true },
];

export default function StoreScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const handleDirections = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'ios') {
      Linking.openURL(`maps://0,0?q=${MAPS_QUERY}`).catch(() =>
        Linking.openURL(`https://maps.apple.com/?q=${MAPS_QUERY}`)
      );
    } else {
      Linking.openURL(`comgooglemaps://?q=${MAPS_QUERY}`).catch(() =>
        Linking.openURL(`https://maps.google.com/?q=${MAPS_QUERY}`)
      );
    }
  };

  const handleOpenInMaps = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`https://maps.google.com/?q=${MAPS_QUERY}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.muted }]}>
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Our store</Text>
          <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>Merrylands NSW 2160</Text>
        </View>
        <Text style={[styles.brandText, { color: colors.primary, fontFamily: 'Inter_700Bold', fontStyle: 'italic' }]}>Butterfield</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.mapContainer}>
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <iframe
              src={`https://maps.google.com/maps?q=${MAPS_QUERY}&output=embed`}
              style={{ width: '100%', height: 220, border: 0 }}
              allowFullScreen
              title="Store location"
            />
          ) : (
            <View style={[styles.mapPlaceholder, { backgroundColor: '#C8DFF5' }]}>
              <View style={styles.mapGrid}>
                {[0,1,2,3,4].map(i => (
                  <View key={`h${i}`} style={[styles.mapLineH, { top: `${i * 25}%`, borderColor: 'rgba(255,255,255,0.5)' }]} />
                ))}
                {[0,1,2,3,4].map(i => (
                  <View key={`v${i}`} style={[styles.mapLineV, { left: `${i * 25}%`, borderColor: 'rgba(255,255,255,0.5)' }]} />
                ))}
              </View>
              <View style={[styles.pinOuter, { backgroundColor: '#EA4335' }]}>
                <Feather name="map-pin" size={20} color="#fff" />
              </View>
              <Pressable onPress={handleOpenInMaps} style={[styles.openMapBtn, { backgroundColor: '#fff' }]}>
                <Feather name="external-link" size={12} color={colors.primary} />
                <Text style={{ color: colors.primary, fontFamily: 'Inter_500Medium', fontSize: 12 }}>Open in Maps</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 20 }}>
          <View>
            <Text style={[styles.visitLabel, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>VISIT US</Text>
            <Text style={[styles.storeName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{STORE_NAME}</Text>
            <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 4 }]}>{STORE_ADDRESS}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}18` }]}>
                <Feather name="map-pin" size={16} color={colors.primary} />
              </View>
              <View>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>ADDRESS</Text>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 14 }}>{STORE_ADDRESS}</Text>
              </View>
            </View>
          </View>

          <View>
            <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>OPENING HOURS</Text>
            <View style={[styles.hoursCard, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border, borderWidth: 1, marginTop: 8 }]}>
              <View style={[styles.hoursHeader, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
                <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}18` }]}>
                  <Feather name="clock" size={16} color={colors.primary} />
                </View>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Trading hours</Text>
              </View>
              {HOURS.map((h, i) => (
                <View key={h.day} style={[styles.hoursRow, i < HOURS.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>{h.day}</Text>
                  <Text style={{ color: h.closed ? colors.mutedForeground : colors.foreground, fontFamily: h.closed ? 'Inter_400Regular' : 'Inter_500Medium', fontSize: 14 }}>{h.hours}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.btnRow}>
            <Pressable onPress={handleDirections} style={[styles.directionsBtn, { backgroundColor: colors.primary }]}>
              <Feather name="navigation" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Directions</Text>
            </Pressable>
            <Pressable onPress={handleOpenInMaps} style={[styles.mapsBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <Feather name="external-link" size={16} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 15 }}>Open in Maps</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17 },
  brandText: { fontSize: 18 },
  mapContainer: { width: '100%', height: 220, overflow: 'hidden' },
  mapPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  mapGrid: { position: 'absolute', inset: 0 },
  mapLineH: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1 },
  mapLineV: { position: 'absolute', top: 0, bottom: 0, borderLeftWidth: 1 },
  pinOuter: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', zIndex: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  openMapBtn: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  visitLabel: { fontSize: 12, letterSpacing: 0.8, marginBottom: 6 },
  storeName: { fontSize: 28 },
  card: { padding: 16 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 13, letterSpacing: 0.5 },
  hoursCard: { overflow: 'hidden' },
  hoursHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  btnRow: { flexDirection: 'row', gap: 12 },
  directionsBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14 },
  mapsBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14 },
});
