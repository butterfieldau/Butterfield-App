import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';

export default function DirectorSettingsScreen() {
  const insets = useSafeAreaInsets();
  const qc     = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['director-settings'],
    queryFn: () => api.director.settings(),
  });

  const settings = data?.data ?? {};

  const [geoRadius, setGeoRadius]     = useState('');
  const [storeOpen, setStoreOpen]     = useState(true);
  const [dailySpecial, setDailySpecial] = useState('');
  const [shopLat, setShopLat]         = useState('');
  const [shopLng, setShopLng]         = useState('');
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (settings) {
      setGeoRadius(settings.geo_radius_meters ?? '20');
      setStoreOpen(settings.store_open !== 'false');
      setDailySpecial(settings.daily_special ?? '');
      setShopLat(settings.shop_lat ?? '-33.8349');
      setShopLng(settings.shop_lng ?? '150.9942');
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.updateSettings({
        geo_radius_meters: geoRadius,
        store_open:        String(storeOpen),
        daily_special:     dailySpecial,
        shop_lat:          shopLat,
        shop_lng:          shopLng,
      });
      await qc.invalidateQueries({ queryKey: ['director-settings'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Settings updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG }}>
        <ActivityIndicator color={BLUE} />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

      {/* Store status */}
      <Text style={styles.section}>STORE</Text>
      <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Store open</Text>
            <Text style={styles.rowSub}>Controls the "Open now" status shown to customers</Text>
          </View>
          <Switch
            value={storeOpen}
            onValueChange={(v) => { setStoreOpen(v); Haptics.selectionAsync(); }}
            trackColor={{ false: '#D1D5DB', true: GREEN }}
            thumbColor="#fff"
            ios_backgroundColor="#D1D5DB"
          />
        </View>

        <View style={[styles.divider, { backgroundColor: BORDER }]} />

        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Daily special</Text>
          <TextInput
            style={[styles.input, { borderColor: BORDER, color: TEXT }]}
            value={dailySpecial}
            onChangeText={setDailySpecial}
            placeholder="e.g. Cookie & Cream Sandwich"
            placeholderTextColor={MUTED}
          />
        </View>
      </View>

      {/* Geo settings */}
      <Text style={styles.section}>STAFF GEO-FENCE</Text>
      <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={[styles.infoBanner, { backgroundColor: '#EBF8FF', borderColor: BLUE + '40' }]}>
          <Feather name="map-pin" size={13} color={BLUE} />
          <Text style={[styles.infoBannerText, { color: BLUE }]}>
            Staff must be within this radius of the store coordinates to clock in.
          </Text>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Check-in radius (metres)</Text>
          <TextInput
            style={[styles.input, { borderColor: BORDER, color: TEXT }]}
            value={geoRadius}
            onChangeText={setGeoRadius}
            keyboardType="number-pad"
            placeholder="20"
            placeholderTextColor={MUTED}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: BORDER }]} />

        <View style={styles.coordRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.fieldLabel}>Shop latitude</Text>
            <TextInput
              style={[styles.input, { borderColor: BORDER, color: TEXT }]}
              value={shopLat}
              onChangeText={setShopLat}
              keyboardType="decimal-pad"
              placeholder="-33.8349"
              placeholderTextColor={MUTED}
            />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.fieldLabel}>Shop longitude</Text>
            <TextInput
              style={[styles.input, { borderColor: BORDER, color: TEXT }]}
              value={shopLng}
              onChangeText={setShopLng}
              keyboardType="decimal-pad"
              placeholder="150.9942"
              placeholderTextColor={MUTED}
            />
          </View>
        </View>
        <Text style={[styles.hint, { color: MUTED }]}>
          Butterfield Merrylands: –33.8349, 150.9942
        </Text>
      </View>

      {/* Demo credentials */}
      <Text style={styles.section}>DEMO ACCOUNTS</Text>
      <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER, gap: 10 }]}>
        {[
          { role: 'Customer',  email: 'customer@demo.com',  color: '#0369A1', bg: '#EBF8FF' },
          { role: 'Staff',     email: 'staff@demo.com',     color: '#5B21B6', bg: '#EDE9FE' },
          { role: 'Wholesale', email: 'wholesale@demo.com', color: '#166534', bg: '#DCFCE7' },
          { role: 'Director',  email: 'director@demo.com',  color: '#854D0E', bg: '#FEF9C3' },
        ].map((d) => (
          <View key={d.role} style={[styles.demoRow, { borderColor: BORDER }]}>
            <View style={[styles.demoPill, { backgroundColor: d.bg }]}>
              <Text style={[styles.demoPillText, { color: d.color }]}>{d.role}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.demoEmail}>{d.email}</Text>
              <Text style={[styles.demoPw, { color: MUTED }]}>Demo1234!</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Save */}
      <Pressable
        onPress={save}
        disabled={saving}
        style={[styles.saveBtn, { backgroundColor: BLUE, opacity: saving ? 0.8 : 1 }]}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>Save Settings</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section:       { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#8E8E93', letterSpacing: 1.5, marginTop: 4 },
  card:          { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle:      { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  rowSub:        { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93', marginTop: 2, lineHeight: 17 },
  divider:       { height: 1 },
  fieldLabel:    { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#1C1C1E' },
  input:         { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', backgroundColor: '#FAFAFA' },
  coordRow:      { flexDirection: 'row', gap: 10 },
  hint:          { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: -6 },
  infoBanner:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  infoBannerText:{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  demoRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottomWidth: 1 },
  demoPill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  demoPillText:  { fontSize: 11, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  demoEmail:     { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  demoPw:        { fontSize: 12, fontFamily: 'Inter_400Regular' },
  saveBtn:       { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:   { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
