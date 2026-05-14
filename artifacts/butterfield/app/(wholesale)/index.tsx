import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: 'Pending',    color: '#3B82F6', bg: '#DBEAFE' },
  processing: { label: 'Processing', color: '#F59E0B', bg: '#FEF3C7' },
  dispatched: { label: 'Dispatched', color: '#8B5CF6', bg: '#EDE9FE' },
  delivered:  { label: 'Delivered',  color: '#22C55E', bg: '#DCFCE7' },
  cancelled:  { label: 'Cancelled',  color: '#EF4444', bg: '#FEE2E2' },
};

export default function WholesaleDashboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: accountData }       = useQuery({ queryKey: ['wholesale-account'], queryFn: () => api.wholesale.account(), retry: 1 });
  const { data: ordersData, refetch, isRefetching } = useQuery({ queryKey: ['wholesale-orders'], queryFn: () => api.wholesale.orders(), retry: 1 });
  const { data: announcementsData } = useQuery({ queryKey: ['announcements'], queryFn: () => api.misc.announcements(), retry: 1 });

  const account       = accountData?.data;
  const orders        = ordersData?.data ?? [];
  const announcements = announcementsData?.data ?? [];
  const recentOrders  = orders.slice(0, 3);
  const pendingCount  = orders.filter((o: any) => !['delivered', 'cancelled'].includes(o.status)).length;

  const tierName = account?.tier?.name ?? account?.pricingTier ?? 'Standard';
  const firstName = user?.name?.split(' ')[0] ?? 'Partner';
  const isPending = account?.status === 'pending';

  const goCatalog = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(wholesale)/catalog' as any); };
  const goOrders  = () => { Haptics.selectionAsync(); router.push('/(wholesale)/orders' as any); };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── HERO (frozen/sticky — outside ScrollView) ────────────────────── */}
      <LinearGradient
        colors={['#1493FF', '#3CBBEE']}
        style={[s.hero, { paddingTop: insets.top + 18 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <Image
          source={require('@/assets/images/logo-white.png')}
          style={{ width: 130, height: 42, alignSelf: 'center', marginBottom: 14 }}
          resizeMode="contain"
        />
        <Text style={s.heroGreeting}>Good day, {firstName}</Text>
        {account?.companyName && <Text style={s.heroCompany}>{account.companyName}</Text>}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' }}>
          <View style={s.tierBadge}>
            <Feather name="award" size={11} color="#fff" />
            <Text style={s.tierBadgeText}>{tierName.toUpperCase()} TIER</Text>
          </View>
          {isPending && (
            <View style={[s.tierBadge, { backgroundColor: 'rgba(255,200,0,0.3)' }]}>
              <Text style={s.tierBadgeText}>PENDING APPROVAL</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
      >
      <View style={{ paddingHorizontal: 16, gap: 14, paddingTop: 16 }}>

        {/* ── PRIMARY CTA ────────────────────────────────────────────────── */}
        <Pressable onPress={goCatalog} style={s.ctaWrap}>
          <LinearGradient
            colors={['#1493FF', '#3CBBEE']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.cta}
          >
            <View style={s.ctaIcon}>
              <Feather name="shopping-bag" size={20} color={BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.ctaTitle}>Place a New Order</Text>
              <Text style={s.ctaSub}>Browse catalog · {tierName} pricing applied</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>

        {/* ── KEY METRICS (2 only) ───────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={goOrders} style={[s.metric, { borderLeftColor: BLUE }]}>
            <Text style={s.metricLabel}>Active orders</Text>
            <Text style={[s.metricValue, { color: pendingCount > 0 ? BLUE : TEXT }]}>{pendingCount}</Text>
            <Text style={s.metricHint}>{pendingCount === 0 ? 'All caught up' : 'In progress'}</Text>
          </Pressable>
          <Pressable onPress={goOrders} style={[s.metric, { borderLeftColor: '#22C55E' }]}>
            <Text style={s.metricLabel}>Total orders</Text>
            <Text style={[s.metricValue, { color: TEXT }]}>{orders.length}</Text>
            <Text style={s.metricHint}>All-time</Text>
          </Pressable>
        </View>

        {/* ── ANNOUNCEMENTS (only if present) ────────────────────────────── */}
        {announcements.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Feather name="bell" size={14} color={AMBER} />
              <Text style={s.sectionTitle}>Latest News</Text>
            </View>
            {announcements.slice(0, 2).map((a: any, i: number) => (
              <View key={a.id} style={[s.announce, i > 0 && { borderTopWidth: 1, borderTopColor: BORDER, marginTop: 8, paddingTop: 10 }]}>
                <Text style={s.announceTitle}>{a.title}</Text>
                <Text style={s.announceBody} numberOfLines={3}>{a.body}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── RECENT ORDERS ──────────────────────────────────────────────── */}
        {recentOrders.length > 0 ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Recent Orders</Text>
              <Pressable onPress={goOrders} hitSlop={8}>
                <Text style={s.linkText}>See all</Text>
              </Pressable>
            </View>
            {recentOrders.map((order: any, i: number) => {
              const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
              return (
                <Pressable
                  key={order.id}
                  onPress={goOrders}
                  style={[s.orderRow, i < recentOrders.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.orderNum}>#{order.poReference ?? order.id.slice(0, 8).toUpperCase()}</Text>
                    <Text style={s.orderDate}>
                      {new Date(order.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      {Array.isArray(order.items) ? ` · ${order.items.length} item${order.items.length !== 1 ? 's' : ''}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[s.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
                      <Text style={[s.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    <Text style={s.orderAmount}>${(order.totalCents / 100).toFixed(2)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={[s.section, { alignItems: 'center', paddingVertical: 28 }]}>
            <View style={s.emptyIcon}>
              <Feather name="package" size={22} color={MUTED} />
            </View>
            <Text style={s.emptyTitle}>No orders yet</Text>
            <Text style={s.emptySub}>Place your first wholesale order from the catalog.</Text>
          </View>
        )}

        {/* ── SUBTLE FOOTER ──────────────────────────────────────────────── */}
        <Pressable
          onPress={() => router.push('/(wholesale)/profile' as any)}
          style={s.footer}
        >
          <Feather name="info" size={12} color={MUTED} />
          <Text style={s.footerText}>Account details, payment methods & support in the Account tab</Text>
        </Pressable>
      </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  hero:            { paddingHorizontal: 20, paddingBottom: 22 },
  heroGreeting:    { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '400' },
  heroCompany:     { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 2 },
  tierBadge:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tierBadgeText:   { color: '#fff', fontWeight: '700', fontSize: 10, letterSpacing: 0.5 },

  ctaWrap:         { borderRadius: 16, shadowColor: BLUE, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 6 },
  cta:             { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16 },
  ctaIcon:         { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ctaTitle:        { color: '#fff', fontWeight: '700', fontSize: 16 },
  ctaSub:          { color: 'rgba(255,255,255,0.85)', fontWeight: '400', fontSize: 12, marginTop: 2 },

  metric:          { flex: 1, backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, borderLeftWidth: 3, gap: 4 },
  metricLabel:     { color: MUTED, fontWeight: '500', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue:     { fontWeight: '700', fontSize: 28 },
  metricHint:      { color: MUTED, fontWeight: '400', fontSize: 11 },

  section:         { backgroundColor: CARD, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, justifyContent: 'space-between' },
  sectionTitle:    { color: TEXT, fontWeight: '700', fontSize: 15, flex: 1 },
  linkText:        { color: BLUE, fontWeight: '600', fontSize: 13 },

  announce:        { gap: 4 },
  announceTitle:   { color: TEXT, fontWeight: '600', fontSize: 13 },
  announceBody:    { color: MUTED, fontWeight: '400', fontSize: 12, lineHeight: 17 },

  orderRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  orderNum:        { color: TEXT, fontWeight: '700', fontSize: 14 },
  orderDate:       { color: MUTED, fontWeight: '400', fontSize: 11 },
  orderAmount:     { color: BLUE, fontWeight: '700', fontSize: 14 },
  statusPill:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  statusPillText:  { fontWeight: '600', fontSize: 10 },

  emptyIcon:       { width: 52, height: 52, borderRadius: 26, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyTitle:      { color: TEXT, fontWeight: '600', fontSize: 14 },
  emptySub:        { color: MUTED, fontWeight: '400', fontSize: 12, marginTop: 3, textAlign: 'center' },

  footer:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, marginTop: 4 },
  footerText:      { color: MUTED, fontWeight: '400', fontSize: 11, textAlign: 'center' },
});
