import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useRef } from 'react';
import { useScrollToTopCompat as useScrollToTop } from '@/hooks/useScrollToTopCompat';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { AvatarPicker } from '@/components/AvatarPicker';
import { LoggedOutAccountPrompt } from '@/components/LoggedOutAccountPrompt';
import { BUTTERFIELD_PRIVACY_URL, BUTTERFIELD_TERMS_URL } from '@/constants/legal';
import { getTierConfig } from '@/constants/tierConfig';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const CHERRY = '#D0312D';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const RED    = '#EF4444';

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn:  () => api.auth.me(),
    enabled: !!user,
    retry: 1,
  });
  const { data: loyaltyData } = useQuery({
    queryKey: ['loyalty-profile'],
    queryFn:  () => api.loyalty.profile(),
    enabled: !!user,
    retry: 1,
  });
  const { data: addressesData } = useQuery({
    queryKey: ['addresses'],
    queryFn:  () => api.addresses.list(),
    enabled: !!user,
    retry: 1,
  });

  // Always use fresh data from API; fall back to auth context while loading
  const currentUser = meData?.user as any;
  const displayName  = currentUser?.name  ?? user?.name  ?? 'Guest';
  const displayEmail = currentUser?.email ?? user?.email ?? '';
  const displayPhone = currentUser?.phone ?? '';
  const addressCount = addressesData?.data?.length ?? 0;
  const profile      = loyaltyData?.data;
  const tierLabel    = getTierConfig(profile?.loyaltyTier ?? 'blue', profile?.loyaltyTierSettings).label;
  const initial      = displayName.charAt(0).toUpperCase();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          await logout();
          qc.clear();
          router.replace('/(tabs)');
        },
      },
    ]);
  };

  if (!user) {
    return <LoggedOutAccountPrompt redirectTo="/(customer)/profile" />;
  }

  const menuItems = [
    { icon: 'clipboard'   as const, label: 'My orders',       onPress: () => router.push('/orders') },
    { icon: 'bell'        as const, label: 'Notifications',   onPress: () => router.push('/notifications') },
    { icon: 'map-pin'     as const, label: 'Saved addresses', onPress: () => router.push('/addresses') },
    { icon: 'navigation'  as const, label: 'Find a store',    onPress: () => router.push('/(customer)/stores' as any) },
    { icon: 'help-circle' as const, label: 'Help & support',  onPress: () => router.push('/help-support') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── Frozen blue gradient header ────────────────────────────────────── */}
      <LinearGradient
        colors={['#1493FF', '#3CBBEE']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + 14, paddingBottom: 22, paddingHorizontal: 20 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <AvatarPicker
            initial={initial}
            size={56}
            bgColor="rgba(255,255,255,0.25)"
            textColor="#fff"
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.userCardName}>{displayName}</Text>
            <Text style={styles.userCardEmail}>{displayEmail}</Text>
            {displayPhone ? (
              <Text style={styles.userCardPhone}>{displayPhone}</Text>
            ) : (
              <Text style={[styles.userCardPhone, { opacity: 0.6 }]}>No phone saved</Text>
            )}
          </View>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/edit-details'); }}
            style={styles.editBtn}
          >
            <Feather name="edit-2" size={15} color={BLUE} />
          </Pressable>
        </View>
      </LinearGradient>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: BG }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
      >
      <View style={{ paddingTop: 16, paddingHorizontal: 16, gap: 16 }}>

        {/* ── Quick actions ────────────────────────────────────────────────── */}
        <View style={styles.quickRow}>
          <Pressable
            style={[styles.quickCard, { backgroundColor: CARD, borderColor: BORDER }]}
            onPress={() => { Haptics.selectionAsync(); router.push('/(customer)/loyalty'); }}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#FFF7E0' }]}>
              <Feather name="star" size={20} color="#C07800" />
            </View>
            <Text style={[styles.quickTitle, { color: TEXT }]}>Rewards Club</Text>
            <Text style={[styles.quickSub, { color: MUTED }]}>View stamps & rewards</Text>
          </Pressable>

          <Pressable
            style={[styles.quickCard, { backgroundColor: CARD, borderColor: BORDER }]}
            onPress={() => { Haptics.selectionAsync(); router.push('/addresses'); }}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#E0F5FE' }]}>
              <Feather name="map-pin" size={20} color={BLUE} />
            </View>
            <Text style={[styles.quickTitle, { color: TEXT }]}>
              {addressCount === 0 ? 'No addresses' : `${addressCount} address${addressCount > 1 ? 'es' : ''}`}
            </Text>
            <Text style={[styles.quickSub, { color: MUTED }]}>Manage saved addresses</Text>
          </Pressable>
        </View>

        {/* ── Stats row ────────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          {[
            { label: 'Points', value: String(profile?.loyaltyPoints ?? 0) },
            { label: 'Tier',   value: tierLabel },
            { label: 'Stamps', value: `${profile?.stampCount ?? 0}/6` },
          ].map((stat, i, arr) => (
            <View
              key={stat.label}
              style={[styles.statItem, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: BORDER }]}
            >
              <Text style={[styles.statValue, { color: BLUE }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: MUTED }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Menu list ────────────────────────────────────────────────────── */}
        <View style={[styles.menuCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          {menuItems.map((item, i) => (
            <Pressable
              key={item.label}
              onPress={() => { Haptics.selectionAsync(); item.onPress(); }}
              style={[styles.menuRow, i < menuItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#F0FAFF' }]}>
                <Feather name={item.icon} size={16} color={BLUE} />
              </View>
              <Text style={[styles.menuLabel, { color: TEXT }]}>{item.label}</Text>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </Pressable>
          ))}
        </View>

        {/* ── Sign out ─────────────────────────────────────────────────────── */}
        <Pressable
          onPress={handleLogout}
          style={[styles.signOutBtn, { backgroundColor: CARD, borderColor: '#FECACA' }]}
        >
          <Feather name="log-out" size={16} color={RED} />
          <Text style={[styles.signOutText, { color: RED }]}>Sign Out</Text>
        </Pressable>

        {/* ── Legal links ──────────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
          <Pressable onPress={() => { const WebBrowser = require('expo-web-browser'); WebBrowser.openBrowserAsync(BUTTERFIELD_PRIVACY_URL); }}>
            <Text style={[styles.legalLink, { color: MUTED }]}>Privacy Policy</Text>
          </Pressable>
          <Pressable onPress={() => { const WebBrowser = require('expo-web-browser'); WebBrowser.openBrowserAsync(BUTTERFIELD_TERMS_URL); }}>
            <Text style={[styles.legalLink, { color: MUTED }]}>Terms of Use</Text>
          </Pressable>
        </View>
        <Text style={[styles.version, { color: MUTED }]}>Butterfield Cookies · Version 1.0.0</Text>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  userCard:       { borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  userCardAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  userCardName:   { color: '#fff', fontSize: 18, fontWeight: '700' },
  userCardEmail:  { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '400' },
  userCardPhone:  { color: 'rgba(255,255,255,0.7)',  fontSize: 12, fontWeight: '400' },
  editBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  quickRow:   { flexDirection: 'row', gap: 12 },
  quickCard:  { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  quickIcon:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  quickTitle: { fontSize: 15, fontWeight: '700' },
  quickSub:   { fontSize: 12, fontWeight: '400' },

  statsRow:   { flexDirection: 'row', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  statItem:   { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 3 },
  statValue:  { fontSize: 20, fontWeight: '700' },
  statLabel:  { fontSize: 11, fontWeight: '400' },

  menuCard:     { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  menuIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel:    { flex: 1, fontSize: 15, fontWeight: '500' },

  signOutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 999, borderWidth: 1 },
  signOutText: { fontSize: 15, fontWeight: '600' },
  legalLink:   { fontSize: 12, fontWeight: '400', textDecorationLine: 'underline' },
  version:     { textAlign: 'center', fontSize: 12, fontWeight: '400' },
});
