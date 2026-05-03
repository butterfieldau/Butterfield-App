import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [rating, setRating] = useState(5);
  const [showFeedback, setShowFeedback] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: loyaltyData } = useQuery({ queryKey: ['loyalty-profile'], queryFn: () => api.loyalty.profile() });
  const { data: ordersData } = useQuery({ queryKey: ['orders'], queryFn: () => api.orders.list() });

  const profile = loyaltyData?.data;
  const orders = ordersData?.data ?? [];

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await logout();
        qc.clear();
        router.replace('/(auth)/login');
      }},
    ]);
  };

  const handleFeedback = async () => {
    if (!feedbackMsg.trim()) return;
    setSubmitting(true);
    try {
      await api.feedback({ category: 'general', message: feedbackMsg.trim(), rating });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFeedbackMsg('');
      setShowFeedback(false);
      Alert.alert('Thank you!', 'Your feedback has been received.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSubmitting(false); }
  };

  const hasBirthday = !!profile?.birthday;

  const MENU_ITEMS = [
    { icon: 'edit-2', label: 'Edit Details', action: () => router.push('/(customer)/edit-details') },
    { icon: 'gift', label: hasBirthday ? `Birthday: ${profile?.birthday}` : 'Add your birthday 🎂', action: () => router.push('/(customer)/edit-details') },
    { icon: 'package', label: 'My Orders', action: () => router.push('/(customer)/orders') },
    { icon: 'heart', label: 'Favourites', action: () => router.push('/(customer)/favourites') },
    { icon: 'map-pin', label: 'Store Location & Hours', action: () => router.push('/(customer)/store') },
    { icon: 'bell', label: 'Notifications', action: () => Alert.alert('Notifications', 'You have no new notifications.\n\nWe\'ll notify you when your order is ready for pickup.') },
    { icon: 'message-circle', label: 'Send Feedback', action: () => setShowFeedback(true) },
    { icon: 'help-circle', label: 'Help & Support', action: () => Alert.alert('Help & Support', 'Email: hello@butterfield.com.au\nPhone: (02) 9000 0000\nHours: Mon–Fri 7am–5pm') },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#4B72C4', '#3058A8']} style={[styles.header, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Text style={[styles.avatarText, { fontFamily: 'Inter_700Bold' }]}>{user?.name?.charAt(0).toUpperCase() ?? 'B'}</Text>
        </View>
        <Text style={[styles.name, { fontFamily: 'Inter_700Bold' }]}>{user?.name}</Text>
        <Text style={[styles.email, { fontFamily: 'Inter_400Regular' }]}>{user?.email}</Text>
      </LinearGradient>

      <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 16 }}>
        <View style={styles.statsRow}>
          {[
            { label: 'Loyalty Points', value: String(profile?.loyaltyPoints ?? 0) },
            { label: 'Orders', value: String(orders.length) },
            { label: 'Total Visits', value: String(profile?.totalVisits ?? 0) },
          ].map((stat) => (
            <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
              <Text style={[styles.statValue, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {showFeedback && (
          <View style={[styles.feedbackCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }]}>Send Feedback</Text>
            <View style={styles.starsRow}>
              {[1,2,3,4,5].map((s) => (
                <Pressable key={s} onPress={() => setRating(s)}>
                  <Feather name="star" size={24} color={s <= rating ? '#F59E0B' : colors.muted} />
                </Pressable>
              ))}
            </View>
            <View style={[styles.feedbackInput, { borderColor: colors.border, backgroundColor: colors.background, borderRadius: 10 }]}>
              <TextInput style={[{ fontFamily: 'Inter_400Regular', color: colors.foreground, fontSize: 14 }]}
                placeholder="Tell us what you think..." placeholderTextColor={colors.mutedForeground}
                value={feedbackMsg} onChangeText={setFeedbackMsg} multiline numberOfLines={4} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setShowFeedback(false)} style={[styles.feedbackBtn, { backgroundColor: colors.muted, borderRadius: 10 }]}>
                <Text style={[{ fontFamily: 'Inter_500Medium', color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleFeedback} disabled={submitting} style={[styles.feedbackBtn, { flex: 1, backgroundColor: colors.primary, borderRadius: 10 }]}>
                <Text style={[{ fontFamily: 'Inter_600SemiBold', color: '#fff' }]}>{submitting ? 'Sending...' : 'Submit'}</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={[styles.menuCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          {MENU_ITEMS.map((item, i) => (
            <Pressable key={item.label} onPress={() => { Haptics.selectionAsync(); item.action(); }}
              style={[styles.menuRow, i < MENU_ITEMS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <View style={[styles.menuIcon, { backgroundColor: colors.muted }]}>
                <Feather name={item.icon as any} size={16} color={colors.primary} />
              </View>
              <Text style={[styles.menuLabel, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>{item.label}</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>

        <Pressable onPress={handleLogout} style={[styles.signOutBtn, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: '#DC2626', borderWidth: 1 }]}>
          <Feather name="log-out" size={16} color="#DC2626" />
          <Text style={[styles.signOutText, { fontFamily: 'Inter_600SemiBold' }]}>Sign Out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 28, gap: 8, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 28 },
  name: { color: '#fff', fontSize: 22 },
  email: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 22 },
  statLabel: { fontSize: 11, textAlign: 'center' },
  feedbackCard: { padding: 16, gap: 12 },
  cardTitle: { fontSize: 15 },
  starsRow: { flexDirection: 'row', gap: 8 },
  feedbackInput: { borderWidth: 1, padding: 12, minHeight: 80 },
  feedbackBtn: { padding: 12, alignItems: 'center' },
  menuCard: { overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  menuIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 15 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 },
  signOutText: { color: '#DC2626', fontSize: 15 },
});
