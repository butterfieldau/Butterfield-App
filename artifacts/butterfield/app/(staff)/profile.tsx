import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG = '#0D0604';
const CARD = '#1A0A04';
const ACCENT = '#C8833A';

export default function StaffProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const { data: shiftsData } = useQuery({ queryKey: ['staff-shifts'], queryFn: () => api.staff.shifts(), retry: 1 });
  const { data: profileData } = useQuery({ queryKey: ['staff-profile'], queryFn: () => api.staff.profile(), retry: 1 });

  const shifts = shiftsData?.data ?? [];
  const recentShifts = shifts.slice(0, 5);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await logout(); qc.clear(); router.replace('/(auth)/login'); } },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#2A1408', BG]} style={[styles.header, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={[styles.avatar, { backgroundColor: 'rgba(200,131,58,0.2)', borderColor: ACCENT, borderWidth: 2 }]}>
          <Text style={[{ color: '#fff', fontSize: 28, fontFamily: 'Inter_700Bold' }]}>{user?.name?.charAt(0).toUpperCase() ?? 'S'}</Text>
        </View>
        <Text style={[{ color: '#fff', fontSize: 22, fontFamily: 'Inter_700Bold' }]}>{user?.name}</Text>
        <Text style={[{ color: ACCENT, fontSize: 13, fontFamily: 'Inter_500Medium' }]}>Staff Member · Butterfield</Text>
      </LinearGradient>

      <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 20 }}>
        <View style={styles.statsRow}>
          {[
            { label: 'Shifts', value: String(shifts.length) },
            { label: 'Email', value: user?.email?.split('@')[0] ?? '—' },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: CARD, borderRadius: 14 }]}>
              <Text style={[{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 20 }]}>{s.value}</Text>
              <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 12 }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {recentShifts.length > 0 && (
          <View style={[{ backgroundColor: CARD, borderRadius: 16, padding: 16, gap: 12 }]}>
            <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>Recent Shifts</Text>
            {recentShifts.map((shift) => (
              <View key={shift.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={[{ color: '#fff', fontFamily: 'Inter_500Medium', fontSize: 13 }]}>
                    {new Date(shift.clockIn).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                  <Text style={[{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }]}>
                    {new Date(shift.clockIn).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                    {shift.clockOut ? ` → ${new Date(shift.clockOut).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}` : ' (Active)'}
                  </Text>
                </View>
                {shift.hoursWorked && <Text style={[{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>{shift.hoursWorked}</Text>}
              </View>
            ))}
          </View>
        )}

        <View style={[{ backgroundColor: CARD, borderRadius: 16, overflow: 'hidden' }]}>
          {[
            { icon: 'calendar', label: 'Request Leave', onPress: () => router.push({ pathname: '/(staff)/tasks', params: { initialTab: 'leave' } }) },
            { icon: 'message-circle', label: 'Team Announcements', onPress: () => Alert.alert('Team Announcements', 'No new announcements from management.\n\nCheck back before your next shift.') },
            { icon: 'help-circle', label: 'Help & Support', onPress: () => Alert.alert('Help & Support', 'Manager on duty: (02) 9000 0001\nEmail: staff@butterfield.com.au\nPayroll: payroll@butterfield.com.au') },
          ].map((item, i, arr) => (
            <Pressable key={item.label} onPress={item.onPress}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }]}>
              <View style={[{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${ACCENT}20` }]}>
                <Feather name={item.icon as any} size={16} color={ACCENT} />
              </View>
              <Text style={[{ flex: 1, color: '#fff', fontFamily: 'Inter_500Medium', fontSize: 15 }]}>{item.label}</Text>
              <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.3)" />
            </Pressable>
          ))}
        </View>

        <Pressable onPress={handleLogout} style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, backgroundColor: CARD, borderRadius: 16, borderColor: '#DC2626', borderWidth: 1 }]}>
          <Feather name="log-out" size={16} color="#DC2626" />
          <Text style={[{ color: '#DC2626', fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>Sign Out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 28, gap: 8, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, padding: 16, alignItems: 'center', gap: 4 },
});
