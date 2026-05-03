import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  draft: '#6B7280', submitted: '#3B82F6', approved: '#22C55E', processing: '#F59E0B',
  dispatched: '#8B5CF6', delivered: '#22C55E', cancelled: '#EF4444',
};

export default function WholesaleDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: accountData } = useQuery({ queryKey: ['wholesale-account'], queryFn: () => api.wholesale.account(), retry: 1 });
  const { data: ordersData, refetch, isRefetching } = useQuery({ queryKey: ['wholesale-orders'], queryFn: () => api.wholesale.orders(), retry: 1 });
  const { data: announcementsData } = useQuery({ queryKey: ['announcements'], queryFn: () => api.announcements(), retry: 1 });

  const account = accountData?.data;
  const orders = ordersData?.data ?? [];
  const announcements = announcementsData?.data ?? [];
  const recentOrders = orders.slice(0, 3);
  const pendingOrders = orders.filter((o: any) => !['delivered', 'cancelled'].includes(o.status)).length;
  const firstName = user?.name?.split(' ')[0] ?? 'Partner';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}>
      <LinearGradient colors={['#EBF0FA', '#F5F6FA']} style={[styles.header, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={[{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }]}>Welcome back,</Text>
        <Text style={[{ color: colors.foreground, fontSize: 24, fontFamily: 'Inter_700Bold' }]}>{firstName}</Text>
        {account && <Text style={[{ color: colors.primary, fontSize: 13, fontFamily: 'Inter_500Medium' }]}>{account.companyName} · {account.tier?.toUpperCase() ?? 'STANDARD'}</Text>}
      </LinearGradient>

      <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 16 }}>
        {account && (
          <View style={[styles.card, { backgroundColor: colors.card, borderRadius: 16, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginBottom: 12 }]}>Account Overview</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {[
                { label: 'Credit Limit', value: `$${((account.creditLimitCents ?? 0) / 100).toFixed(0)}` },
                { label: 'Used', value: `$${((account.creditUsedCents ?? 0) / 100).toFixed(0)}` },
                { label: 'Orders', value: String(orders.length) },
                { label: 'Pending', value: String(pendingOrders) },
              ].map((s) => (
                <View key={s.label} style={[styles.miniStat, { backgroundColor: colors.muted, borderRadius: 10 }]}>
                  <Text style={[{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 16 }]}>{s.value}</Text>
                  <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10 }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: 16, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }]}>Order Cut-Off Times</Text>
          {[
            { day: 'Monday delivery', cutOff: 'Friday 12pm' },
            { day: 'Thursday delivery', cutOff: 'Tuesday 12pm' },
          ].map((c) => (
            <View key={c.day} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }]}>{c.day}</Text>
              <Text style={[{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>{c.cutOff}</Text>
            </View>
          ))}
          <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }]}>
            Minimum order: $50 · Contact your rep for urgent orders
          </Text>
        </View>

        {announcements.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderRadius: 16, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }]}>Announcements</Text>
            {announcements.slice(0, 3).map((a: any) => (
              <View key={a.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }}>
                <Text style={[{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>{a.title}</Text>
                <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 }]}>{a.body}</Text>
              </View>
            ))}
          </View>
        )}

        {recentOrders.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginBottom: 12 }]}>Recent Orders</Text>
            {recentOrders.map((order: any) => {
              const statusColor = STATUS_COLORS[order.status] ?? '#6B7280';
              return (
                <View key={order.id} style={[styles.orderRow, { backgroundColor: colors.card, borderRadius: 14, borderLeftColor: statusColor, borderLeftWidth: 3, borderColor: colors.border, borderWidth: 1 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>#{order.poReference ?? order.id.slice(0, 8).toUpperCase()}</Text>
                    <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }]}>
                      {new Date(order.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>${(order.totalCents / 100).toFixed(2)}</Text>
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
            <Feather name="package" size={36} color={colors.muted} />
            <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center' }]}>No orders yet. Head to the catalog to place your first order.</Text>
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
