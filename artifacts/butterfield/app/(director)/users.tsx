import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable,
  RefreshControl, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';

const TABS = ['All', 'Staff', 'Wholesale', 'Customers'];

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  customer:  { bg: '#EBF8FF', text: '#0369A1' },
  staff:     { bg: '#EDE9FE', text: '#5B21B6' },
  wholesale: { bg: '#DCFCE7', text: '#166534' },
  director:  { bg: '#FEF9C3', text: '#854D0E' },
};

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function DirectorUsersScreen() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('All');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-users'],
    queryFn: () => api.director.users(),
  });

  const allUsers: any[] = data?.data ?? [];

  const filtered = allUsers.filter((u) => {
    if (tab === 'All')        return true;
    if (tab === 'Staff')      return u.role === 'staff';
    if (tab === 'Wholesale')  return u.role === 'wholesale';
    if (tab === 'Customers')  return u.role === 'customer';
    return true;
  });

  const approveStaff = async (userId: string, approved: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.approveStaff(userId, approved);
      await qc.invalidateQueries({ queryKey: ['director-users'] });
      await qc.invalidateQueries({ queryKey: ['director-stats'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const setWholesaleStatus = async (accountId: string, status: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.setWholesaleStatus(accountId, status);
      await qc.invalidateQueries({ queryKey: ['director-users'] });
      await qc.invalidateQueries({ queryKey: ['director-stats'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const wholesalePrompt = (u: any) => {
    const wa = u.wholesaleAccount;
    if (!wa) return;
    Alert.alert(wa.companyName, `Current status: ${wa.status}`, [
      { text: 'Approve', onPress: () => setWholesaleStatus(wa.id, 'approved') },
      { text: 'Pending', onPress: () => setWholesaleStatus(wa.id, 'pending') },
      { text: 'Reject',  style: 'destructive', onPress: () => setWholesaleStatus(wa.id, 'rejected') },
      { text: 'Cancel',  style: 'cancel' },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Tab bar */}
      <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
          {TABS.map((t) => {
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => { setTab(t); Haptics.selectionAsync(); }}
                style={[styles.tabChip, { backgroundColor: active ? BLUE : BG, borderColor: active ? BLUE : BORDER }]}
              >
                <Text style={[styles.tabChipText, { color: active ? '#fff' : MUTED }]}>{t}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="users" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular' }}>No users in this category</Text>
            </View>
          }
          renderItem={({ item: u }) => {
            const roleColors = ROLE_COLORS[u.role] ?? { bg: BG, text: MUTED };
            const sp = u.staffProfile;
            const wa = u.wholesaleAccount;
            return (
              <View style={[styles.userCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                <View style={styles.userTop}>
                  <View style={[styles.avatar, { backgroundColor: roleColors.bg }]}>
                    <Text style={[styles.avatarText, { color: roleColors.text }]}>{initials(u.name)}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.userName}>{u.name}</Text>
                      <View style={[styles.rolePill, { backgroundColor: roleColors.bg }]}>
                        <Text style={[styles.rolePillText, { color: roleColors.text }]}>{u.role}</Text>
                      </View>
                    </View>
                    <Text style={styles.userEmail}>{u.email}</Text>
                    <Text style={styles.userDate}>Joined {new Date(u.createdAt).toLocaleDateString('en-AU')}</Text>
                  </View>
                </View>

                {/* Staff approval toggle */}
                {sp && (
                  <View style={[styles.subRow, { borderTopColor: BORDER }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.subTitle}>{sp.position} · {sp.department}</Text>
                      <Text style={[styles.subSub, { color: sp.approvedByAdmin ? GREEN : AMBER }]}>
                        {sp.approvedByAdmin ? '✓ Approved' : '⏳ Pending approval'}
                      </Text>
                    </View>
                    <Switch
                      value={sp.approvedByAdmin}
                      onValueChange={(v) => approveStaff(u.id, v)}
                      trackColor={{ false: '#D1D5DB', true: GREEN }}
                      thumbColor="#fff"
                      ios_backgroundColor="#D1D5DB"
                    />
                  </View>
                )}

                {/* Wholesale status */}
                {wa && (
                  <Pressable onPress={() => wholesalePrompt(u)} style={[styles.subRow, { borderTopColor: BORDER }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.subTitle}>{wa.companyName}</Text>
                      <Text style={[styles.subSub, {
                        color: wa.status === 'approved' ? GREEN : wa.status === 'rejected' ? RED : AMBER,
                      }]}>
                        {wa.status === 'approved' ? '✓ Approved' : wa.status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                      </Text>
                    </View>
                    <Text style={{ color: BLUE, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Change →</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  tabChipText:   { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  userCard:      { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  userTop:       { flexDirection: 'row', gap: 12, padding: 14 },
  avatar:        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:    { fontSize: 16, fontFamily: 'Inter_700Bold' },
  nameRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName:      { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  rolePill:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  rolePillText:  { fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  userEmail:     { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  userDate:      { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  subRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, padding: 12, paddingHorizontal: 14 },
  subTitle:      { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  subSub:        { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
