import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';
const PURPLE = '#8B5CF6';

const STATUS_LABEL: Record<string, string> = {
  received: 'Pending', being_prepared: 'Preparing',
  ready_for_pickup: 'Ready', out_for_delivery: 'Delivering',
  completed: 'Completed', cancelled: 'Cancelled',
};
const STATUS_COLOR: Record<string, string> = {
  received: AMBER, being_prepared: PURPLE,
  ready_for_pickup: GREEN, out_for_delivery: BLUE,
  completed: MUTED, cancelled: RED,
};

function StatCard({ icon, label, value, sub, color }: { icon: string; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <View style={[styles.statCard, { backgroundColor: CARD, borderColor: BORDER }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export default function DirectorDashboard() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-stats'],
    queryFn: () => api.director.stats(),
    refetchInterval: 30000,
  });

  const { data: recentData } = useQuery({
    queryKey: ['director-orders'],
    queryFn: () => api.director.orders(),
    refetchInterval: 30000,
  });

  const stats = data?.data;
  const recent = (recentData?.data ?? []).slice(0, 8);

  const fmtAUD = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 20 }}>

        {isLoading ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <ActivityIndicator color={BLUE} size="large" />
          </View>
        ) : (
          <>
            {/* Revenue strip */}
            <View style={[styles.revenueCard, { backgroundColor: NAVY }]}>
              <Text style={styles.revenueLabel}>REVENUE</Text>
              <View style={styles.revenueRow}>
                {[
                  { label: 'Today', value: fmtAUD(stats?.revenue.today ?? 0) },
                  { label: 'This week', value: fmtAUD(stats?.revenue.week ?? 0) },
                  { label: 'This month', value: fmtAUD(stats?.revenue.month ?? 0) },
                ].map((r, i) => (
                  <View key={r.label} style={[styles.revenueItem, i > 0 && { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.15)' }]}>
                    <Text style={styles.revenueAmount}>{r.value}</Text>
                    <Text style={styles.revenueItemLabel}>{r.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Stats grid */}
            <View style={styles.statsGrid}>
              <StatCard icon="shopping-bag" label="Orders today" value={stats?.orders.today ?? 0}   color={BLUE}   />
              <StatCard icon="zap"          label="Active"        value={stats?.orders.active ?? 0}   color={GREEN}  />
              <StatCard icon="users"        label="Total users"   value={stats?.users.total ?? 0}     color={PURPLE} />
              <StatCard icon="package"      label="Products"      value={stats?.users.totalProducts ?? 0} color={AMBER} />
            </View>

            {/* Pending approvals */}
            {((stats?.users.pendingStaff ?? 0) > 0 || (stats?.users.pendingWholesale ?? 0) > 0) && (
              <View style={[styles.alertCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <Feather name="alert-circle" size={16} color={AMBER} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertTitle, { color: '#92400E' }]}>Pending approvals</Text>
                  {(stats?.users.pendingStaff ?? 0) > 0 && (
                    <Text style={[styles.alertSub, { color: '#92400E' }]}>{stats?.users.pendingStaff} staff account{stats?.users.pendingStaff !== 1 ? 's' : ''} awaiting approval</Text>
                  )}
                  {(stats?.users.pendingWholesale ?? 0) > 0 && (
                    <Text style={[styles.alertSub, { color: '#92400E' }]}>{stats?.users.pendingWholesale} wholesale application{stats?.users.pendingWholesale !== 1 ? 's' : ''} pending</Text>
                  )}
                </View>
                <Pressable onPress={() => router.push('/(director)/users' as any)}>
                  <Text style={{ color: AMBER, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Review →</Text>
                </Pressable>
              </View>
            )}

            {/* Recent orders */}
            <Text style={styles.sectionTitle}>Recent orders</Text>
            {recent.map((order: any) => {
              const color = STATUS_COLOR[order.status] ?? MUTED;
              const label = STATUS_LABEL[order.status] ?? order.status;
              return (
                <View key={order.id} style={[styles.orderRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.orderId}>#BC-{order.id.slice(-6).toUpperCase()}</Text>
                    <Text style={styles.orderMeta}>
                      {new Date(order.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} · AUD ${((order.totalCents ?? 0) / 100).toFixed(2)}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: color + '20' }]}>
                    <Text style={[styles.statusPillText, { color }]}>{label}</Text>
                  </View>
                </View>
              );
            })}
            {recent.length === 0 && (
              <View style={[styles.emptyCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                <Feather name="inbox" size={28} color={MUTED} />
                <Text style={[styles.emptyText, { color: MUTED }]}>No orders yet</Text>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  revenueCard:       { borderRadius: 18, padding: 20, gap: 14 },
  revenueLabel:      { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  revenueRow:        { flexDirection: 'row' },
  revenueItem:       { flex: 1, alignItems: 'center', paddingVertical: 4 },
  revenueAmount:     { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
  revenueItemLabel:  { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  statsGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard:          { width: '47.5%', borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  statIcon:          { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue:         { fontSize: 26, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  statLabel:         { fontSize: 12, fontFamily: 'Inter_500Medium', color: '#8E8E93' },
  statSub:           { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  alertCard:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  alertTitle:        { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  alertSub:          { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  sectionTitle:      { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  orderRow:          { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  orderId:           { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  orderMeta:         { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  statusPill:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillText:    { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  emptyCard:         { alignItems: 'center', gap: 10, padding: 32, borderRadius: 14, borderWidth: 1 },
  emptyText:         { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
