import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
  Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const RED    = '#EF4444';

const PRIVACY_URL = 'https://butterfieldcookies.com.au/pages/privacy-policy';
const TERMS_URL   = 'https://butterfieldcookies.com.au/pages/terms-of-service';

export default function HelpSupportScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const openUrl = async (url: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await WebBrowser.openBrowserAsync(url);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all personal data including loyalty points, stamps, and order history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'Your account and all associated data will be permanently removed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await api.auth.deleteAccount();
                      await logout();
                      qc.clear();
                      router.replace('/(auth)/login');
                    } catch (e: any) {
                      Alert.alert('Error', e.message ?? 'Failed to delete account. Please contact hello@butterfieldcookies.com.au');
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[st.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={st.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={TEXT} />
        </Pressable>
        <Text style={st.headerTitle}>Help & Support</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 16, paddingTop: 20, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Contact ────────────────────────────────────────────────────────── */}
        <View style={st.section}>
          <Text style={st.sectionLabel}>CONTACT US</Text>
          <View style={[st.card, { borderColor: BORDER }]}>
            {([
              { icon: 'phone'  as const, label: 'Phone',   value: '0480 769 995',                     action: () => Linking.openURL('tel:0480769995') },
              { icon: 'mail'   as const, label: 'Email',   value: 'hello@butterfieldcookies.com.au',  action: () => Linking.openURL('mailto:hello@butterfieldcookies.com.au') },
              { icon: 'globe'  as const, label: 'Website', value: 'butterfieldcookies.com.au',        action: () => openUrl('https://butterfieldcookies.com.au') },
            ] as const).map((item, i, arr) => (
              <Pressable
                key={item.label}
                onPress={() => { Haptics.selectionAsync(); item.action(); }}
                style={[st.row, i < arr.length - 1 && st.rowBorder]}
              >
                <View style={[st.rowIcon, { backgroundColor: '#E6F4FF' }]}>
                  <Feather name={item.icon} size={16} color={BLUE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.rowLabel}>{item.label}</Text>
                  <Text style={[st.rowValue, { color: BLUE }]}>{item.value}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={MUTED} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Store ──────────────────────────────────────────────────────────── */}
        <View style={st.section}>
          <Text style={st.sectionLabel}>OUR STORE</Text>
          <View style={[st.card, { borderColor: BORDER }]}>
            <View style={[st.row, st.rowBorder]}>
              <View style={[st.rowIcon, { backgroundColor: '#FFF7E0' }]}>
                <Feather name="map-pin" size={16} color="#C07800" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.rowLabel}>Address</Text>
                <Text style={st.rowValue}>2 Main Lane</Text>
                <Text style={st.rowValue}>Merrylands NSW 2160</Text>
              </View>
            </View>
            <View style={[st.row, st.rowBorder]}>
              <View style={[st.rowIcon, { backgroundColor: '#F0FDF4' }]}>
                <Feather name="clock" size={16} color="#22C55E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.rowLabel}>Opening Hours</Text>
                <Text style={st.rowValue}>Mon – Fri  7:00am – 5:00pm</Text>
                <Text style={[st.rowValue, { marginTop: 2 }]}>Sat – Sun  8:00am – 4:00pm</Text>
              </View>
            </View>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); Linking.openURL('https://maps.apple.com/?q=Butterfield+Cookies+Merrylands'); }}
              style={st.row}
            >
              <View style={[st.rowIcon, { backgroundColor: '#EEF2FB' }]}>
                <Feather name="navigation" size={16} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.rowLabel}>Get Directions</Text>
                <Text style={[st.rowValue, { color: BLUE }]}>Open in Maps</Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </Pressable>
          </View>
        </View>

        {/* ── Legal ──────────────────────────────────────────────────────────── */}
        <View style={st.section}>
          <Text style={st.sectionLabel}>LEGAL</Text>
          <View style={[st.card, { borderColor: BORDER }]}>
            <Pressable onPress={() => openUrl(PRIVACY_URL)} style={[st.row, st.rowBorder]}>
              <View style={[st.rowIcon, { backgroundColor: '#F5F6FA' }]}>
                <Feather name="shield" size={16} color={TEXT} />
              </View>
              <Text style={[st.rowValue, { flex: 1 }]}>Privacy Policy</Text>
              <Feather name="external-link" size={14} color={MUTED} />
            </Pressable>
            <Pressable onPress={() => openUrl(TERMS_URL)} style={st.row}>
              <View style={[st.rowIcon, { backgroundColor: '#F5F6FA' }]}>
                <Feather name="file-text" size={16} color={TEXT} />
              </View>
              <Text style={[st.rowValue, { flex: 1 }]}>Terms of Service</Text>
              <Feather name="external-link" size={14} color={MUTED} />
            </Pressable>
          </View>
        </View>

        {/* ── Account Deletion ───────────────────────────────────────────────── */}
        <View style={st.section}>
          <Text style={st.sectionLabel}>ACCOUNT</Text>
          <View style={[st.card, { borderColor: '#FECACA' }]}>
            <Pressable
              onPress={handleDeleteAccount}
              disabled={deleting}
              style={[st.row, { opacity: deleting ? 0.6 : 1 }]}
            >
              <View style={[st.rowIcon, { backgroundColor: '#FEF2F2' }]}>
                <Feather name="trash-2" size={16} color={RED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.rowValue, { color: RED }]}>Delete My Account</Text>
                <Text style={[st.rowLabel, { marginTop: 2 }]}>Permanently removes all your data</Text>
              </View>
              <Feather name="chevron-right" size={16} color={RED} />
            </Pressable>
          </View>
        </View>

        <Text style={st.version}>Butterfield Cookies · Version 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '600', color: TEXT },
  section:      { gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 1, paddingHorizontal: 4 },
  card:         { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  rowBorder:    { borderBottomWidth: 1, borderBottomColor: BORDER },
  rowIcon:      { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowLabel:     { fontSize: 11, fontWeight: '400', color: MUTED },
  rowValue:     { fontSize: 14, fontWeight: '500', color: TEXT },
  version:      { textAlign: 'center', fontSize: 12, color: MUTED, marginTop: 4 },
});
