import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG = '#0A1A0A';
const CARD = '#122012';
const ACCENT = '#3A8A3A';

const STATUS_COLORS: Record<string, string> = {
  draft: '#6B7280', submitted: '#3B82F6', approved: ACCENT, processing: '#F59E0B',
  dispatched: '#8B5CF6', delivered: '#22C55E', cancelled: '#EF4444',
};

export default function WholesaleDashboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: accountData, isLoading: acctLoading } = useQuery({ queryKey: ['wholesale-account'], queryFn: () => api.wholesale.account(), retry: 1 });
  const { data: ordersData, refetch, isRefetching } = useQuery({ queryKey: ['wholesale-orders'], queryFn: () => api.wholesale.orders(), retry: 1 });
  const { data: announcementsData } = useQuery({ queryKey: ['announcements'], queryFn: () => api.announcements(), retry: 1 });

  const account = accountData?.data;
  const orders = ordersData?.data ?? [];
  const announcements = announcementsData?.data ?? [];
  const recentOrders = orders.slice(0, 3);
  const pendingOrders = orders.filter((o: any) => !['delivered', 'cancelled'].includes(o.status)).length;

  const firstName = user?.name?.split(' ')[0] ?? 'Partner';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={ACCENT} />}>
      <LinearGradient colors={['#1A3A1A', BG]} style={[styles.header, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={[{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontFamily: 'Inter_400Regular' }]}>Welcome back,</Text>
        <Text style={[{ color: '#fff', fontSize: 24, fontFamily: 'Inter_700Bold' }]}>{firstName}</Text>
        {account && <Text style={[{ color: ACCENT, fontSize: 13, fontFamily: 'Inter_500Medium' }]}>{account.companyName} · {account.tier?.toUpperCase() ?? 'STANDARD'}</Text>}
      </LinearGradient>

      <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 16 }}>
        {/* Account Summary */}
        {account && (
          <View style={[styles.card, { backgroundColor: CARD, borderRadius: 16 }]}>
            <Text style={[styles.sectionTitle, { color: '#fff', fontFamily: 'Inter_600SemiBold', marginBottom: 12 }]}>Account Overview</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {[
                { label: 'Credit Limit', value: `$${((account.creditLimitCents ?? 0) / 100).toFixed(0)}` },
                { label: 'Used', value: `$${((account.creditUsedCents ?? 0) / 100).toFixed(0)}` },
                { label: 'Orders', value: String(orders.length) },
                { label: 'Pending', value: String(pendingOrders) },
              ].map((s) => (
                <View key={s.label} style={[styles.miniStat, { backgroundColor: BG, borderRadius: 10 }]}>
                  <Text style={[{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 16 }]}>{s.value}</Text>
                  <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 10 }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Cut-off Times */}
        <View style={[styles.card, { backgroundColor: CARD, borderRadius: 16 }]}>
          <Text style={[styles.sectionTitle, { color: '#fff', fontFamily: 'Inter_600SemiBold', marginBottom: 8 }]}>Order Cut-Off Times</Text>
          {[
            { day: 'Monday delivery', cutOff: 'Friday 12pm' },
            { day: 'Thursday delivery', cutOff: 'Tuesday 12pm' },
          ].map((c) => (
            <View key={c.day} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
              <Text style={[{ color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', fontSize: 13 }]}>{c.day}</Text>
              <Text style={[{ color: ACCENT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>{c.cutOff}</Text>
            </View>
          ))}
          <Text style={[{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }]}>
            Minimum order: $50 · Contact your rep for urgent orders
          </Text>
        </View>

        {/* Announcements */}
        {announcements.length > 0 && (
          <View style={[styles.card, { backgroundColor: CARD, borderRadius: 16 }]}>
            <Text style={[styles.sectionTitle, { color: '#fff', fontFamily: 'Inter_600SemiBold', marginBottom: 8 }]}>Announcements</Text>
            {announcements.slice(0, 3).map((a: any) => (
              <View key={a.id} style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', paddingVertical: 8 }}>
                <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>{a.title}</Text>
                <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 }]}>{a.body}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recent Orders */}
        {recentOrders.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: '#fff', fontFamily: 'Inter_600SemiBold', marginBottom: 12 }]}>Recent Orders</Text>
            {recentOrders.map((order: any) => {
              const statusColor = STATUS_COLORS[order.status] ?? '#6B7280';
              return (
                <View key={order.id} style={[styles.orderRow, { backgroundColor: CARD, borderRadius: 14, borderLeftColor: statusColor, borderLeftWidth: 3 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 }]}>#{order.poReference ?? order.id.slice(0, 8).toUpperCase()}</Text>
                    <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }]}>
                      {new Date(order.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>${(order.totalCents / 100).toFixed(2)}</Text>
                    <View style={[{ backgroundColor: `${statusColor}20`, borderColor: statusColor, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }]}>
                      <Text style={[{ color: statusColor, fontFamily: 'Inter_600SemiBold', fontSize: 10, textTransform: 'capitalize' }]}>{order.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {orders.length === 0 && !isRefetching && (
          <View style={{ alignItems: 'center', marginTop: 40, gap: 12 }}>
            <Feather name="package" size={36} color="rgba(255,255,255,0.2)" />
            <Text style={[{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center' }]}>No orders yet. Head to the catalog to place your first order.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 24, gap: 4 },
  card: { padding: 16 },
  sectionTitle: { fontSize: 15 },
  miniStat: { flex: 1, padding: 10, alignItems: 'center', gap: 3 },
  orderRow: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10 },
});
