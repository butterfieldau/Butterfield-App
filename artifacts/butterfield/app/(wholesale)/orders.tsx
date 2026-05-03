import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const STATUS_COLORS: Record<string, string> = {
  draft: '#6B7280', submitted: '#3B82F6', approved: '#40C0F2', processing: '#F59E0B',
  dispatched: '#8B5CF6', delivered: '#22C55E', cancelled: '#EF4444',
};

export default function WholesaleOrdersScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ['wholesale-orders'], queryFn: () => api.wholesale.orders(), retry: 1 });
  const orders = data?.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }]}>
        <Text style={[{ color: TEXT, fontSize: 26, fontFamily: 'Inter_700Bold' }]}>My Orders</Text>
        <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }]}>{orders.length} total orders</Text>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={BLUE} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o: any) => o.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="file-text" size={36} color={BORDER} />
              <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center' }]}>
                No orders yet. Browse the catalog to place your first order.
              </Text>
            </View>
          }
          renderItem={({ item: order }: { item: any }) => {
            const statusColor = STATUS_COLORS[order.status] ?? '#6B7280';
            const items = Array.isArray(order.items) ? order.items : [];
            return (
              <View style={[styles.orderCard, { backgroundColor: CARD, borderRadius: 14, borderLeftColor: statusColor, borderLeftWidth: 3, borderWidth: 1, borderColor: BORDER }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <View>
                    <Text style={[{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 15 }]}>#{order.poReference ?? order.id.slice(0, 8).toUpperCase()}</Text>
                    <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }]}>
                      {new Date(order.createdAt).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={[{ backgroundColor: `${statusColor}15`, borderColor: statusColor, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }]}>
                    <Text style={[{ color: statusColor, fontFamily: 'Inter_600SemiBold', fontSize: 11, textTransform: 'capitalize' }]}>{order.status}</Text>
                  </View>
                </View>
                <View style={{ gap: 3, marginBottom: 10 }}>
                  {items.slice(0, 3).map((item: any, i: number) => (
                    <Text key={i} style={[{ color: TEXT, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>
                      {item.quantity}× {item.productName} — ${((item.unitPriceCents ?? 0) / 100 * item.quantity).toFixed(2)}
                    </Text>
                  ))}
                  {items.length > 3 && <Text style={[{ color: BLUE, fontFamily: 'Inter_400Regular', fontSize: 11 }]}>+{items.length - 3} more items</Text>}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 15 }]}>${(order.totalCents / 100).toFixed(2)}</Text>
                  {order.scheduledDate && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Feather name="truck" size={12} color={MUTED} />
                      <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11 }]}>
                        {new Date(order.scheduledDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 14, gap: 4 },
  orderCard: { padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
});
