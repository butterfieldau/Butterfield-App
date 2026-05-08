import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Pending',    color: '#3B82F6' },
  processing: { label: 'Processing', color: '#F59E0B' },
  dispatched: { label: 'Dispatched', color: '#8B5CF6' },
  delivered:  { label: 'Delivered',  color: '#22C55E' },
  cancelled:  { label: 'Cancelled',  color: '#EF4444' },
};

export default function WholesaleDashboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: accountData } = useQuery({ queryKey: ['wholesale-account'], queryFn: () => api.wholesale.account(), retry: 1 });
  const { data: ordersData, refetch, isRefetching } = useQuery({ queryKey: ['wholesale-orders'], queryFn: () => api.wholesale.orders(), retry: 1 });
  const { data: announcementsData } = useQuery({ queryKey: ['announcements'], queryFn: () => api.misc.announcements(), retry: 1 });

  const account = accountData?.data;
  const orders = ordersData?.data ?? [];
  const announcements = announcementsData?.data ?? [];
  const recentOrders = orders.slice(0, 3);
  const pendingOrders = orders.filter((o: any) => !['delivered', 'cancelled'].includes(o.status)).length;

  const tierName = account?.tier?.name ?? account?.pricingTier ?? null;
  const firstName = user?.name?.split(' ')[0] ?? 'Partner';

  const handleContactPhone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('tel:0290001234').catch(() =>
      Alert.alert('Wholesale Support', 'Phone: (02) 9000 1234\nEmail: wholesale@butterfield.com.au')
    );
  };

  const handleContactEmail = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('mailto:wholesale@butterfield.com.au?subject=Wholesale Enquiry').catch(() =>
      Alert.alert('Email', 'wholesale@butterfield.com.au')
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
    >
      <LinearGradient colors={['#40C0F2', '#2AA8DC']} style={[styles.header, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={[{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'Inter_400Regular' }]}>Welcome back,</Text>
        <Text style={[{ color: '#fff', fontSize: 24, fontFamily: 'Inter_700Bold' }]}>{firstName}</Text>
        {account && (
          <Text style={[{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'Inter_500Medium' }]}>
            {account.companyName}{tierName ? ` · ${tierName.toUpperCase()}` : ''}
          </Text>
        )}
        {account?.status === 'pending' && (
          <View style={{ backgroundColor: 'rgba(255,255,0,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 4, alignSelf: 'flex-start' }}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Account Pending Approval</Text>
          </View>
        )}
      </LinearGradient>

      <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 16 }}>

        {/* Account overview stats */}
        {account && (
          <View style={[styles.card, { backgroundColor: CARD }]}>
            <Text style={[styles.sectionTitle, { color: TEXT, fontFamily: 'Inter_600SemiBold', marginBottom: 12 }]}>Account Overview</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                { label: 'Credit Limit',   value: `$${((account.creditLimitCents ?? 0) / 100).toFixed(0)}` },
                { label: 'Used',           value: `$${((account.creditUsedCents ?? 0) / 100).toFixed(0)}` },
                { label: 'Total Orders',   value: String(orders.length) },
                { label: 'In Progress',    value: String(pendingOrders) },
              ].map((s) => (
                <View key={s.label} style={[styles.miniStat, { backgroundColor: BG, borderRadius: 10 }]}>
                  <Text style={[{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 16 }]}>{s.value}</Text>
                  <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 10, textAlign: 'center' }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Pricing tier card */}
        {account && (
          <View style={[styles.card, { backgroundColor: CARD }]}>
            <Text style={[styles.sectionTitle, { color: TEXT, fontFamily: 'Inter_600SemiBold', marginBottom: 10 }]}>Pricing Tier</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 18 }}>
                  {account.tier?.name ?? tierName ?? 'Standard'}
                </Text>
                {account.tier?.discountPercent != null && (
                  <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 2 }}>
                    {account.tier.discountPercent}% discount on all products
                  </Text>
                )}
                {account.tier?.minOrderCents != null && (
                  <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 }}>
                    Min. order: ${(account.tier.minOrderCents / 100).toFixed(0)}
                  </Text>
                )}
                {account.tier?.paymentTermsDays != null && (
                  <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 }}>
                    Payment terms: {account.tier.paymentTermsDays} days
                  </Text>
                )}
              </View>
              <View style={{ backgroundColor: `${BLUE}15`, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
                  {account.tier?.name ? account.tier.name.toUpperCase() : 'STANDARD'}
                </Text>
              </View>
            </View>

            {/* Credit utilisation bar */}
            {account.creditLimitCents > 0 && (
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11 }}>Credit used</Text>
                  <Text style={{ color: BLUE, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
                    ${((account.creditUsedCents ?? 0) / 100).toFixed(0)} / ${(account.creditLimitCents / 100).toFixed(0)}
                  </Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: BG, overflow: 'hidden' }}>
                  <View style={{
                    height: '100%', borderRadius: 3,
                    backgroundColor: (account.creditUsedCents ?? 0) / account.creditLimitCents > 0.8 ? '#EF4444' : BLUE,
                    width: `${Math.min(100, ((account.creditUsedCents ?? 0) / account.creditLimitCents) * 100)}%`,
                  }} />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Order cut-off times */}
        <View style={[styles.card, { backgroundColor: CARD }]}>
          <Text style={[styles.sectionTitle, { color: TEXT, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }]}>Order Cut-Off Times</Text>
          {[
            { day: 'Monday delivery',   cutOff: 'Friday 12pm AEST',  icon: 'calendar' as const },
            { day: 'Thursday delivery', cutOff: 'Tuesday 12pm AEST', icon: 'calendar' as const },
          ].map((c) => (
            <View key={c.day} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name={c.icon} size={14} color={MUTED} />
                <Text style={[{ color: TEXT, fontFamily: 'Inter_400Regular', fontSize: 13 }]}>{c.day}</Text>
              </View>
              <Text style={[{ color: BLUE, fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>{c.cutOff}</Text>
            </View>
          ))}
          <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 10 }]}>
            Minimum order: $50 · Lead time: 2 business days
          </Text>
        </View>

        {/* Announcements */}
        {announcements.length > 0 && (
          <View style={[styles.card, { backgroundColor: CARD }]}>
            <Text style={[styles.sectionTitle, { color: TEXT, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }]}>
              <Feather name="bell" size={14} color={TEXT} /> Announcements
            </Text>
            {announcements.map((a: any) => (
              <View key={a.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <Text style={[{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>{a.title}</Text>
                <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3, lineHeight: 18 }]}>{a.body}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recent orders */}
        {recentOrders.length > 0 && (
          <View style={[styles.card, { backgroundColor: CARD }]}>
            <Text style={[styles.sectionTitle, { color: TEXT, fontFamily: 'Inter_600SemiBold', marginBottom: 12 }]}>Recent Orders</Text>
            {recentOrders.map((order: any) => {
              const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: '#6B7280' };
              return (
                <View key={order.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>
                      #{order.poReference ?? order.id.slice(0, 8).toUpperCase()}
                    </Text>
                    <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }]}>
                      {new Date(order.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{Array.isArray(order.items) ? `${order.items.length} items` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[{ backgroundColor: `${cfg.color}15`, borderColor: cfg.color, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }]}>
                      <Text style={[{ color: cfg.color, fontFamily: 'Inter_600SemiBold', fontSize: 10 }]}>{cfg.label}</Text>
                    </View>
                    <Text style={[{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>${(order.totalCents / 100).toFixed(2)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Contact Butterfield */}
        <View style={[styles.card, { backgroundColor: CARD }]}>
          <Text style={[styles.sectionTitle, { color: TEXT, fontFamily: 'Inter_600SemiBold', marginBottom: 10 }]}>Contact Butterfield</Text>
          <View style={{ gap: 8 }}>
            <Pressable
              onPress={handleContactPhone}
              style={[styles.contactBtn, { backgroundColor: '#E0F5FE', borderColor: `${BLUE}30` }]}
            >
              <View style={[{ width: 36, height: 36, borderRadius: 10, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }]}>
                <Feather name="phone" size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>Call Wholesale Team</Text>
                <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>(02) 9000 1234 · Mon–Fri 8am–4pm</Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </Pressable>
            <Pressable
              onPress={handleContactEmail}
              style={[styles.contactBtn, { backgroundColor: BG, borderColor: BORDER }]}
            >
              <View style={[{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E0F5FE', alignItems: 'center', justifyContent: 'center' }]}>
                <Feather name="mail" size={16} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>Email Support</Text>
                <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>wholesale@butterfield.com.au</Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </Pressable>
          </View>
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header:     { paddingHorizontal: 20, paddingBottom: 24, gap: 6 },
  card:       { borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  sectionTitle: { fontSize: 15 },
  miniStat:   { flex: 1, padding: 10, alignItems: 'center', gap: 3 },
  contactBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
});
