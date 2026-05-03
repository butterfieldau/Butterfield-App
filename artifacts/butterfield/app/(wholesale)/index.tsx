import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { MOCK_WHOLESALE_ORDERS } from '@/data/mockData';
import { WholesaleStatusBadge } from '@/components/OrderStatusBadge';
import { useColors } from '@/hooks/useColors';

export default function WholesaleDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const u = user as any;

  const creditUsed = u?.creditUsed ?? 0;
  const creditLimit = u?.creditLimit ?? 10000;
  const creditAvailable = creditLimit - creditUsed;
  const creditPct = (creditUsed / creditLimit) * 100;

  const recentOrders = MOCK_WHOLESALE_ORDERS.slice(0, 3);
  const ytdSpend = 24680;
  const ordersThisMonth = 8;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F2F8F5' }}
      contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <LinearGradient
        colors={['#1A3A2A', '#2A6A4A']}
        style={[styles.header, { paddingTop: Platform.OS === 'web' ? 80 : insets.top + 20 }]}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.portalLabel, { fontFamily: 'Inter_400Regular' }]}>Wholesale Portal</Text>
            <Text style={[styles.companyName, { fontFamily: 'Inter_700Bold' }]}>{u?.companyName}</Text>
            <Text style={[styles.accountNum, { fontFamily: 'Inter_400Regular' }]}>Account: {u?.accountNumber}</Text>
          </View>
          <View style={styles.verifiedBadge}>
            <Feather name="shield" size={14} color="#4ADE80" />
            <Text style={[styles.verifiedText, { fontFamily: 'Inter_500Medium' }]}>Verified</Text>
          </View>
        </View>

        {/* Credit */}
        <View style={styles.creditCard}>
          <View style={styles.creditRow}>
            <View>
              <Text style={[styles.creditLabel, { fontFamily: 'Inter_400Regular' }]}>Available Credit</Text>
              <Text style={[styles.creditAmount, { fontFamily: 'Inter_700Bold' }]}>
                ${creditAvailable.toLocaleString()}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.creditLabel, { fontFamily: 'Inter_400Regular' }]}>Credit Limit</Text>
              <Text style={[styles.creditLimit, { fontFamily: 'Inter_600SemiBold' }]}>
                ${creditLimit.toLocaleString()}
              </Text>
            </View>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${creditPct}%` }]} />
          </View>
          <Text style={[styles.creditUsed, { fontFamily: 'Inter_400Regular' }]}>
            ${creditUsed.toLocaleString()} used of ${creditLimit.toLocaleString()}
          </Text>
        </View>
      </LinearGradient>

      {/* Stats */}
      <View style={styles.statsSection}>
        {[
          { label: 'YTD Spend', value: `$${ytdSpend.toLocaleString()}`, icon: 'trending-up' },
          { label: 'Orders / Month', value: `${ordersThisMonth}`, icon: 'package' },
          { label: 'Avg. Order', value: `$${Math.floor(ytdSpend / (ordersThisMonth * 5))}`, icon: 'bar-chart-2' },
          { label: 'Payment Terms', value: '30 days', icon: 'clock' },
        ].map((stat) => (
          <View
            key={stat.label}
            style={[styles.statCard, { backgroundColor: '#fff', borderRadius: colors.radius, borderColor: '#C8DDD4' }]}
          >
            <View style={[styles.statIcon, { backgroundColor: '#E8F4EE' }]}>
              <Feather name={stat.icon as any} size={16} color="#2A6A4A" />
            </View>
            <Text style={[styles.statValue, { color: '#1A3A2A', fontFamily: 'Inter_700Bold' }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: '#6A9A7A' }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Recent Orders */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: '#1A3A2A', fontFamily: 'Inter_700Bold' }]}>
          Recent Orders
        </Text>
        {recentOrders.map((order) => (
          <View
            key={order.id}
            style={[styles.orderCard, { backgroundColor: '#fff', borderRadius: colors.radius, borderColor: '#C8DDD4' }]}
          >
            <View style={styles.orderHeader}>
              <View>
                <Text style={[styles.orderNum, { color: '#1A3A2A', fontFamily: 'Inter_600SemiBold' }]}>
                  {order.orderNumber}
                </Text>
                <Text style={[styles.orderDate, { color: '#6A9A7A' }]}>{order.date}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <WholesaleStatusBadge status={order.status} />
                <Text style={[styles.orderTotal, { color: '#1A3A2A', fontFamily: 'Inter_700Bold' }]}>
                  ${order.total.toFixed(2)}
                </Text>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: '#E8F4EE' }]} />
            {order.items.slice(0, 2).map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <Text style={[styles.itemQty, { color: '#2A6A4A', fontFamily: 'Inter_600SemiBold' }]}>
                  {item.quantity}×
                </Text>
                <Text style={[styles.itemName, { color: '#3A5A4A' }]} numberOfLines={1}>
                  {item.productName}
                </Text>
                <Text style={[styles.itemPrice, { color: '#6A9A7A' }]}>
                  ${(item.quantity * item.unitPrice).toFixed(2)}
                </Text>
              </View>
            ))}
            {order.items.length > 2 && (
              <Text style={[styles.moreItems, { color: '#6A9A7A' }]}>
                +{order.items.length - 2} more items
              </Text>
            )}
          </View>
        ))}
      </View>

      {/* Quick contacts */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: '#1A3A2A', fontFamily: 'Inter_700Bold' }]}>
          Your Account Manager
        </Text>
        <View style={[styles.contactCard, { backgroundColor: '#fff', borderRadius: colors.radius, borderColor: '#C8DDD4' }]}>
          <View style={styles.contactAvatar}>
            <Text style={[styles.contactInitials, { fontFamily: 'Inter_700Bold' }]}>JB</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.contactName, { color: '#1A3A2A', fontFamily: 'Inter_600SemiBold' }]}>
              James Butterfield
            </Text>
            <Text style={[styles.contactRole, { color: '#6A9A7A' }]}>Wholesale Director</Text>
          </View>
          <View style={styles.contactActions}>
            <View style={[styles.contactBtn, { backgroundColor: '#E8F4EE' }]}>
              <Feather name="phone" size={16} color="#2A6A4A" />
            </View>
            <View style={[styles.contactBtn, { backgroundColor: '#E8F4EE' }]}>
              <Feather name="mail" size={16} color="#2A6A4A" />
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  portalLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 4,
  },
  companyName: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 24,
  },
  accountNum: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(74,222,128,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  verifiedText: {
    color: '#4ADE80',
    fontSize: 12,
  },
  creditCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  creditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  creditLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginBottom: 3,
  },
  creditAmount: {
    color: '#fff',
    fontSize: 28,
  },
  creditLimit: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
  progressBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ADE80',
    borderRadius: 2,
  },
  creditUsed: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
  },
  statsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 10,
  },
  statCard: {
    width: '47%',
    padding: 14,
    gap: 6,
    borderWidth: 1,
    shadowColor: '#1A3A2A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 20,
  },
  statLabel: {
    fontSize: 11,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
  },
  orderCard: {
    padding: 14,
    gap: 10,
    borderWidth: 1,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNum: {
    fontSize: 14,
    marginBottom: 2,
  },
  orderDate: {
    fontSize: 12,
  },
  orderTotal: {
    fontSize: 15,
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
  moreItems: {
    fontSize: 12,
    marginTop: -4,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
    borderWidth: 1,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2A6A4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitials: {
    color: '#fff',
    fontSize: 15,
  },
  contactName: {
    fontSize: 14,
    marginBottom: 2,
  },
  contactRole: {
    fontSize: 12,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  contactBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
