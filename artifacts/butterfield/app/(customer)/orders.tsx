import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';

const STATUS_COLOR: Record<string, string> = {
  received:         '#F59E0B',
  being_prepared:   '#8B5CF6',
  ready_for_pickup: '#22C55E',
  completed:        '#6B7280',
  cancelled:        '#EF4444',
  refunded:         '#EF4444',
};

const STATUS_LABEL: Record<string, string> = {
  received:         'Received',
  being_prepared:   'In Preparation',
  ready_for_pickup: 'Ready for Pickup',
  completed:        'Collected',
  cancelled:        'Cancelled',
  refunded:         'Refunded',
};

const ACTIVE_STATUSES = ['received', 'being_prepared', 'ready_for_pickup'];

export default function CustomerOrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.orders.list(),
    retry: 1,
  });

  const orders = data?.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>My Orders</Text>
        <View style={{ width: 38 }} />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 14 }}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
                <Feather name="package" size={32} color={colors.mutedForeground} />
              </View>
              <Text style={[{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 17 }]}>No orders yet</Text>
              <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 21 }]}>
                Your order history will appear here once you place your first order.
              </Text>
              <Pressable
                onPress={() => router.push('/(customer)/menu')}
                style={[styles.shopBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>Browse Menu</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: order }) => {
            const statusColor = STATUS_COLOR[order.status] ?? '#6B7280';
            const statusLabel = STATUS_LABEL[order.status] ?? order.status.replace(/_/g, ' ');
            const isActive = ACTIVE_STATUSES.includes(order.status);
            const total = (order.totalCents ?? 0) / 100;
            const itemCount = order.items?.length ?? 0;
            const date = new Date(order.createdAt);

            return (
              <Pressable
                onPress={() => router.push(`/(customer)/track/${order.id}` as any)}
                style={[styles.orderCard, {
                  backgroundColor: colors.card,
                  borderRadius: colors.radius,
                  borderLeftColor: statusColor,
                  borderLeftWidth: 3,
                }]}
              >
                <View style={styles.orderTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>
                      Order #{order.id.slice(-6).toUpperCase()}
                    </Text>
                    <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 }]}>
                      {date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 16 }]}>
                      ${total.toFixed(2)}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                      {isActive && <View style={[styles.statusDot, { backgroundColor: statusColor }]} />}
                      <Text style={[{ color: statusColor, fontFamily: 'Inter_600SemiBold', fontSize: 11 }]}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>
                </View>

                {order.items && order.items.length > 0 && (
                  <View style={[styles.itemsList, { borderTopColor: colors.border }]}>
                    {order.items.slice(0, 3).map((item: any, i: number) => (
                      <Text key={i} style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }]}>
                        {item.quantity}× {item.productName ?? 'Item'}
                      </Text>
                    ))}
                    {order.items.length > 3 && (
                      <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>
                        +{order.items.length - 3} more
                      </Text>
                    )}
                  </View>
                )}

                {order.scheduledFor && (
                  <View style={[styles.pickupRow, { borderTopColor: colors.border }]}>
                    <Feather name="clock" size={12} color={colors.mutedForeground} />
                    <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>
                      Pickup: {new Date(order.scheduledFor).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                )}

                <View style={[styles.trackRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.trackText, { color: isActive ? colors.primary : colors.mutedForeground }]}>
                    {isActive ? 'Tap to track live' : 'View details'}
                  </Text>
                  <Feather name="chevron-right" size={13} color={isActive ? colors.primary : colors.mutedForeground} />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  shopBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 4 },
  orderCard: { padding: 16, gap: 0, borderWidth: 1, borderColor: '#F0F0F0' },
  orderTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  itemsList: { borderTopWidth: 1, marginTop: 12, paddingTop: 10, gap: 4 },
  pickupRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  trackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  trackText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});
