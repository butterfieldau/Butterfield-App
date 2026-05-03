import { Feather } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WholesaleStatusBadge } from '@/components/OrderStatusBadge';
import { MOCK_WHOLESALE_ORDERS } from '@/data/mockData';
import { useColors } from '@/hooks/useColors';

export default function WholesaleOrders() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#F2F8F5' }}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 80 : insets.top + 20 }]}>
        <Text style={[styles.title, { color: '#1A3A2A', fontFamily: 'Inter_700Bold' }]}>Orders</Text>
        <Text style={[styles.subtitle, { color: '#6A9A7A' }]}>{MOCK_WHOLESALE_ORDERS.length} total orders</Text>
      </View>

      <FlatList
        data={MOCK_WHOLESALE_ORDERS}
        keyExtractor={(i) => i.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: order }) => (
          <View style={[styles.orderCard, { backgroundColor: '#fff', borderRadius: colors.radius, borderColor: '#C8DDD4' }]}>
            <View style={styles.orderTop}>
              <View>
                <Text style={[styles.orderNum, { color: '#1A3A2A', fontFamily: 'Inter_700Bold' }]}>
                  {order.orderNumber}
                </Text>
                <Text style={[styles.orderDate, { color: '#6A9A7A' }]}>Placed: {order.date}</Text>
                {order.deliveryDate && (
                  <Text style={[styles.deliveryDate, { color: '#6A9A7A' }]}>Delivery: {order.deliveryDate}</Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <WholesaleStatusBadge status={order.status} />
                <Text style={[styles.orderTotal, { color: '#1A3A2A', fontFamily: 'Inter_700Bold' }]}>
                  ${order.total.toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: '#E8F4EE' }]} />

            {order.items.map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <Text style={[styles.itemQty, { color: '#2A6A4A', fontFamily: 'Inter_600SemiBold' }]}>
                  {item.quantity}×
                </Text>
                <Text style={[styles.itemName, { color: '#1A3A2A' }]} numberOfLines={1}>
                  {item.productName}
                </Text>
                <Text style={[styles.itemPrice, { color: '#6A9A7A' }]}>
                  @${item.unitPrice.toFixed(2)}/ea
                </Text>
              </View>
            ))}

            <View style={[styles.divider, { backgroundColor: '#E8F4EE' }]} />

            <View style={styles.orderFooter}>
              <Text style={[styles.itemsCount, { color: '#6A9A7A' }]}>
                {order.items.reduce((s, i) => s + i.quantity, 0)} units total
              </Text>
              <View style={styles.footerActions}>
                <View style={[styles.actionBtn, { backgroundColor: '#E8F4EE', borderRadius: 8 }]}>
                  <Feather name="download" size={14} color="#2A6A4A" />
                  <Text style={[styles.actionText, { color: '#2A6A4A', fontFamily: 'Inter_500Medium' }]}>
                    Invoice
                  </Text>
                </View>
                <View style={[styles.actionBtn, { backgroundColor: '#E8F4EE', borderRadius: 8 }]}>
                  <Feather name="repeat" size={14} color="#2A6A4A" />
                  <Text style={[styles.actionText, { color: '#2A6A4A', fontFamily: 'Inter_500Medium' }]}>
                    Reorder
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#C8DDD4',
    gap: 2,
    backgroundColor: '#F2F8F5',
  },
  title: {
    fontSize: 26,
  },
  subtitle: {
    fontSize: 14,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  orderCard: {
    padding: 16,
    gap: 10,
    borderWidth: 1,
    marginBottom: 10,
    shadowColor: '#1A3A2A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  orderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNum: {
    fontSize: 15,
    marginBottom: 3,
  },
  orderDate: {
    fontSize: 12,
    marginBottom: 1,
  },
  deliveryDate: {
    fontSize: 12,
  },
  orderTotal: {
    fontSize: 16,
    marginTop: 4,
  },
  divider: {
    height: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemQty: {
    fontSize: 13,
    minWidth: 32,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
  },
  itemPrice: {
    fontSize: 12,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemsCount: {
    fontSize: 12,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionText: {
    fontSize: 12,
  },
});
