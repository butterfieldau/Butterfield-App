import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { LoggedOutAccountPrompt } from '@/components/LoggedOutAccountPrompt';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const STATUS_LABEL: Record<string, string> = {
  received:         'Pending',
  being_prepared:   'Preparing',
  ready_for_pickup: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed:        'Collected',
  cancelled:        'Cancelled',
  refunded:         'Refunded',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received:         { bg: '#FEF9C3', text: '#854D0E' },
  being_prepared:   { bg: '#EDE9FE', text: '#5B21B6' },
  ready_for_pickup: { bg: '#DCFCE7', text: '#166534' },
  out_for_delivery: { bg: '#DBEAFE', text: '#1E40AF' },
  completed:        { bg: '#F3F4F6', text: '#6B7280' },
  cancelled:        { bg: '#FEE2E2', text: '#991B1B' },
  refunded:         { bg: '#FEE2E2', text: '#991B1B' },
};

const STAGE_COLOR: Record<string, string> = {
  received:         '#F59E0B',
  being_prepared:   '#8B5CF6',
  ready_for_pickup: '#22C55E',
  completed:        '#6B7280',
  cancelled:        '#EF4444',
  refunded:         '#EF4444',
};

const STAGES_PICKUP = [
  { key: 'received',          label: 'Received',         icon: 'check-circle' as const, desc: 'Your order has been placed successfully.' },
  { key: 'being_prepared',    label: 'In Preparation',   icon: 'package'      as const, desc: 'Our team is freshly baking your order right now.' },
  { key: 'ready_for_pickup',  label: 'Ready for Pickup', icon: 'shopping-bag' as const, desc: 'Your order is ready at the counter. Come grab it!' },
  { key: 'completed',         label: 'Collected',        icon: 'star'         as const, desc: 'Enjoy your Butterfield goodies! See you next time.' },
];

const STAGES_DELIVERY = [
  { key: 'ready_for_pickup',  label: 'Packed & Ready',   icon: 'box'          as const, desc: 'Your order is packed and ready to leave the kitchen.' },
  { key: 'out_for_delivery',  label: 'Out for Delivery', icon: 'truck'        as const, desc: 'Your order is on its way to you!' },
  { key: 'completed',         label: 'Delivered',        icon: 'star'         as const, desc: 'Your order has been delivered. Enjoy!' },
];

const ACTIVE_STATUSES = ['received', 'being_prepared', 'ready_for_pickup', 'out_for_delivery'];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtShort(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

type StageItem = typeof STAGES_PICKUP[0] | typeof STAGES_DELIVERY[0];

// ── Animated progress step ───────────────────────────────────────────────────
function StageStep({ stage, index, currentIndex, totalStages }: { stage: StageItem; index: number; currentIndex: number; totalStages: number }) {
  const isCompleted = index < currentIndex;
  const isActive    = index === currentIndex;
  const isPending   = index > currentIndex;
  const scaleAnim   = useRef(new Animated.Value(isActive ? 0.9 : 1)).current;
  const opacityAnim = useRef(new Animated.Value(isPending ? 0.35 : 1)).current;
  useEffect(() => {
    if (isActive) {
      Animated.loop(Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.1, duration: 700, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.92, duration: 700, useNativeDriver: true }),
      ])).start();
    } else {
      scaleAnim.setValue(1);
    }
    Animated.timing(opacityAnim, { toValue: isPending ? 0.35 : 1, duration: 300, useNativeDriver: true }).start();
  }, [isActive, isPending]);
  const color = isCompleted || isActive ? (STAGE_COLOR[stage.key] ?? BLUE) : BORDER;
  return (
    <View style={d.stageRow}>
      <View style={{ alignItems: 'center' }}>
        <Animated.View style={[d.stageCircle, {
          backgroundColor: isCompleted || isActive ? color : '#F3F4F6',
          borderColor:     isActive ? color : 'transparent',
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        }]}>
          <Feather name={stage.icon} size={16} color={isCompleted || isActive ? '#fff' : MUTED} />
        </Animated.View>
        {index < totalStages - 1 && (
          <View style={[d.stageLine, { backgroundColor: isCompleted ? color : BORDER }]} />
        )}
      </View>
      <Animated.View style={[{ flex: 1, paddingTop: 6, paddingBottom: 10 }, { opacity: opacityAnim }]}>
        <Text style={{ fontSize: 14, fontWeight: isActive ? '700' : '500', color: isActive || isCompleted ? TEXT : MUTED }}>
          {stage.label}{isActive ? <Text style={{ color, fontWeight: '600' }}> · Now</Text> : ''}
        </Text>
        {(isActive || isCompleted) && (
          <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED, lineHeight: 17, marginTop: 2 }}>{stage.desc}</Text>
        )}
      </Animated.View>
    </View>
  );
}

// ── Order detail modal ───────────────────────────────────────────────────────
function OrderDetailModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.orders.get(orderId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return ACTIVE_STATUSES.includes(status ?? '') ? 10000 : false;
    },
    retry: 1,
  });
  const order        = data?.data;
  const status       = order?.status ?? 'received';
  const isDelivery   = order?.type === 'delivery';
  const STAGES       = isDelivery ? STAGES_DELIVERY : STAGES_PICKUP;
  const stageIndex   = STAGES.findIndex(s => s.key === status);
  const isCancelled  = status === 'cancelled' || status === 'refunded';
  const isActive     = ACTIVE_STATUSES.includes(status);
  const statusColor  = STAGE_COLOR[status] ?? BLUE;
  const currentStage = STAGES[stageIndex];
  const items: any[] = Array.isArray(order?.items) ? order!.items : [];
  const total        = (order?.totalCents ?? 0) / 100;
  const pointsEarned = order?.loyaltyPointsEarned ?? 0;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Header */}
        <View style={[d.header, { paddingTop: insets.top > 0 ? insets.top + 4 : 20, borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={d.closeBtn}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
          <Text style={d.headerTitle}>
            {isLoading ? 'Loading…' : `Order #${(order?.id ?? '').slice(-6).toUpperCase()}`}
          </Text>
          <View style={{ width: 36 }} />
        </View>
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={BLUE} size="large" />
          </View>
        ) : !order ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Feather name="alert-circle" size={40} color={MUTED} />
            <Text style={{ color: MUTED, fontWeight: '500' }}>Order not found</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
            {/* ── Status card ──────────────────────────────────────────── */}
            <View style={[d.card, { backgroundColor: CARD, borderColor: BORDER }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ gap: 3 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>
                    Order #{order.id.slice(-6).toUpperCase()}
                  </Text>
                  <Text style={{ fontSize: 12, color: MUTED, fontWeight: '400' }}>
                    {fmtDate(order.createdAt)}
                  </Text>
                  <Text style={{ fontSize: 12, color: MUTED, fontWeight: '400', textTransform: 'capitalize' }}>
                    {order.type === 'delivery' ? '🚗 Delivery' : '🛍️ Pickup'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>
                    AUD ${total.toFixed(2)}
                  </Text>
                  <View style={[d.statusBadge, { backgroundColor: statusColor + '18' }]}>
                    {isActive && <View style={[d.statusDot, { backgroundColor: statusColor }]} />}
                    <Text style={{ fontSize: 12, fontWeight: '600', color: statusColor }}>
                      {STATUS_LABEL[status] ?? status}
                    </Text>
                  </View>
                </View>
              </View>
              {order.scheduledFor && (
                <View style={[d.metaRow, { borderTopColor: BORDER, marginTop: 12, paddingTop: 12 }]}>
                  <Feather name="clock" size={13} color={BLUE} />
                  <Text style={{ fontSize: 13, fontWeight: '500', color: TEXT }}>
                    {order.type === 'delivery' ? 'Delivery' : 'Pickup'}: {fmtShort(order.scheduledFor).date} · {fmtShort(order.scheduledFor).time}
                  </Text>
                </View>
              )}
            </View>
            {/* ── Live status message ───────────────────────────────────── */}
            {isActive && currentStage && (
              <View style={[d.liveCard, { backgroundColor: statusColor + '12', borderColor: statusColor + '30' }]}>
                <Feather name="zap" size={14} color={statusColor} />
                <Text style={{ fontSize: 13, fontWeight: '500', color: statusColor, flex: 1, lineHeight: 18 }}>
                  {currentStage.desc}
                </Text>
              </View>
            )}
            {/* ── Order items ───────────────────────────────────────────── */}
            {items.length > 0 && (
              <View style={[d.card, { backgroundColor: CARD, borderColor: BORDER }]}>
                <Text style={d.sectionTitle}>Items ordered</Text>
                <View style={{ gap: 0 }}>
                  {items.map((item: any, i: number) => {
                    const unitCents   = item.unitPriceCents ?? item.finalItemPriceCents ?? item.priceCents ?? 0;
                    const qty         = item.quantity ?? item.qty ?? 1;
                    const lineCents   = item.totalCents ?? item.totalPriceCents ?? (unitCents * qty);
                    const variant     = item.variantNameSnapshot ?? item.variantName;
                    const opts        = (item.selectedOptionsSnapshot ?? item.selectedOptions ?? []) as any[];
                    const notable     = opts.filter((o: any) => {
                      const n = o.optionName ?? o.name ?? '';
                      return n && !['No Sugar','No Honey','No Syrup','Regular Coffee','Regular','Normal','Full Cream'].includes(n);
                    });
                    const baristaNote = opts.find((o: any) => o.textValue)?.textValue;
                    return (
                      <View key={i} style={[d.itemRow, { borderBottomColor: BORDER, borderBottomWidth: i < items.length - 1 ? 1 : 0 }]}>
                        <View style={[d.qtyBadge, { backgroundColor: BLUE }]}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{qty}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 14, fontWeight: '500', color: TEXT }}>
                              {item.productName ?? item.productNameSnapshot ?? item.name ?? 'Item'}
                              {variant ? <Text style={{ fontWeight: '400', color: MUTED }}>{` · ${variant}`}</Text> : null}
                            </Text>
                            {item.isFreeReward && (
                              <View style={{ backgroundColor: '#DCFCE7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#166534', letterSpacing: 0.5 }}>FREE</Text>
                              </View>
                            )}
                          </View>
                          {unitCents > 0 && (
                            <Text style={{ fontSize: 12, color: MUTED, fontWeight: '400' }}>
                              ${(unitCents / 100).toFixed(2)} each
                            </Text>
                          )}
                          {notable.length > 0 && (
                            <Text style={{ fontSize: 12, color: BLUE, fontWeight: '400' }}>
                              {notable.map((o: any) => o.optionName ?? o.name).join(' · ')}
                            </Text>
                          )}
                          {baristaNote ? (
                            <Text style={{ fontSize: 11, color: MUTED, fontWeight: '400', fontStyle: 'italic' }}>
                              "{baristaNote}"
                            </Text>
                          ) : null}
                        </View>
                        {lineCents > 0 && (
                          <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>
                            ${(lineCents / 100).toFixed(2)}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
                {/* Totals */}
                <View style={{ borderTopWidth: 1, borderTopColor: BORDER, marginTop: 12, paddingTop: 12, gap: 6 }}>
                  {(order.loyaltyPointsUsed ?? 0) > 0 && (
                    <View style={d.totalRow}>
                      <Text style={[d.totalLabel, { color: MUTED }]}>Points redeemed</Text>
                      <Text style={[d.totalVal, { color: '#22C55E' }]}>−{order.loyaltyPointsUsed} pts</Text>
                    </View>
                  )}
                  <View style={d.totalRow}>
                    <Text style={[d.totalLabel, { fontWeight: '700', color: TEXT }]}>Total paid</Text>
                    <Text style={[d.totalVal, { fontWeight: '700', color: TEXT, fontSize: 16 }]}>
                      AUD ${total.toFixed(2)}
                    </Text>
                  </View>
                  {pointsEarned > 0 && (
                    <View style={[d.pointsEarned, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                      <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '600' }}>
                        🏅 +{pointsEarned} loyalty points earned
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            {/* ── Progress pipeline ─────────────────────────────────────── */}
            {!isCancelled ? (
              <View style={[d.card, { backgroundColor: CARD, borderColor: BORDER }]}>
                <Text style={d.sectionTitle}>Order progress</Text>
                <View style={{ marginTop: 8 }}>
                  {STAGES.map((stage, i) => (
                    <StageStep key={stage.key} stage={stage} index={i} currentIndex={stageIndex} totalStages={STAGES.length} />
                  ))}
                </View>
                {isActive && (
                  <Text style={{ textAlign: 'center', fontSize: 11, color: MUTED, fontWeight: '400', marginTop: 8 }}>
                    Updates automatically every 10 seconds
                  </Text>
                )}
              </View>
            ) : (
              <View style={[d.card, { backgroundColor: '#FFF1F0', borderColor: '#FECACA' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="x-circle" size={20} color="#EF4444" />
                  <Text style={[d.sectionTitle, { color: '#EF4444' }]}>Order {status === 'refunded' ? 'Refunded' : 'Cancelled'}</Text>
                </View>
                <Text style={{ fontSize: 13, color: '#EF4444', opacity: 0.8, marginTop: 6, fontWeight: '400', lineHeight: 18 }}>
                  This order was {status === 'refunded' ? 'refunded' : 'cancelled'}. Contact us at hello@butterfieldcookies.com.au if you need help.
                </Text>
              </View>
            )}
            {/* ── Delivery address (if applicable) ─────────────────────── */}
            {order.type === 'delivery' && order.deliveryAddress && (
              <View style={[d.card, { backgroundColor: CARD, borderColor: BORDER }]}>
                <Text style={d.sectionTitle}>Delivery address</Text>
                <View style={[d.metaRow, { marginTop: 6 }]}>
                  <Feather name="map-pin" size={14} color={MUTED} />
                  <Text style={{ fontSize: 14, color: TEXT, fontWeight: '400', flex: 1 }}>
                    {typeof order.deliveryAddress === 'string' ? order.deliveryAddress : JSON.stringify(order.deliveryAddress)}
                  </Text>
                </View>
              </View>
            )}
            {/* ── Notes ────────────────────────────────────────────────── */}
            {order.notes && (
              <View style={[d.card, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <View style={d.metaRow}>
                  <Feather name="message-circle" size={14} color="#92400E" />
                  <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '500', flex: 1 }}>{order.notes}</Text>
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Order list card ──────────────────────────────────────────────────────────
function OrderCard({ order, onPress }: { order: any; onPress: () => void }) {
  const col       = STATUS_COLORS[order.status] ?? STATUS_COLORS.completed;
  const label     = STATUS_LABEL[order.status] ?? order.status.replace(/_/g, ' ');
  const total     = (order.totalCents ?? 0) / 100;
  const scheduled = order.scheduledFor ? fmtShort(order.scheduledFor) : null;
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const progress  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const to = order.status === 'completed' ? 1
             : order.status === 'cancelled' || order.status === 'refunded' ? 0.15
             : order.status === 'ready_for_pickup' ? 0.85
             : order.status === 'being_prepared' ? 0.55 : 0.25;
    Animated.timing(progress, { toValue: to, duration: 700, useNativeDriver: false }).start();
  }, [order.status]);
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['16%', '100%'] });
  return (
    <Pressable onPress={onPress} style={[s.card, { backgroundColor: CARD, borderColor: BORDER }]}>
      <View style={s.topRow}>
        <View>
          <Text style={s.orderId}>#{order.id.slice(-6).toUpperCase()}</Text>
          <Text style={s.orderDate}>{new Date(order.createdAt).toLocaleDateString('en-AU')}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: col.bg }]}>
          <Text style={[s.badgeText, { color: col.text }]}>{label}</Text>
        </View>
      </View>
      <View style={s.progressTrack}>
        <Animated.View style={[s.progressFill, { width, backgroundColor: col.text }]} />
      </View>
      {items.length > 0 && (
        <Text style={s.itemSummary} numberOfLines={1}>
          {items.slice(0, 3).map((it: any) => `${it.quantity ?? 1}× ${it.productName ?? it.productNameSnapshot ?? it.name ?? 'Item'}`).join(' · ')}
          {items.length > 3 ? ` +${items.length - 3} more` : ''}
        </Text>
      )}
      {scheduled && (
        <View style={s.row}>
          <Feather name="clock" size={12} color={MUTED} />
          <Text style={s.meta}>{scheduled.date} · {scheduled.time}</Text>
        </View>
      )}
      <View style={s.bottomRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={s.meta}>Tap for details</Text>
          <Feather name="chevron-right" size={13} color={MUTED} />
        </View>
        <Text style={s.total}>AUD ${total.toFixed(2)}</Text>
      </View>
    </Pressable>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function CustomerOrdersScreen() {
  const { user } = useAuth();
  if (!user) return <LoggedOutAccountPrompt redirectTo="/orders" compact />;
  return <CustomerOrdersContent />;
}

function CustomerOrdersContent() {
  const insets = useSafeAreaInsets();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.orders.list(),
    refetchInterval: 15000,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const orders = data?.data ?? [];
  const handleExit = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/profile');
  };
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { paddingTop: insets.top + 14, backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <Pressable onPress={handleExit} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={TEXT} />
        </Pressable>
        <Text style={s.headerTitle}>My orders</Text>
        <Text style={[s.headerBrand, { color: BLUE }]}>Butterfield</Text>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 100, gap: 12 }}>
              <Feather name="package" size={30} color={BLUE} />
              <Text style={s.emptyTitle}>No orders yet</Text>
              <Text style={s.emptySub}>Your order history will appear here once you place your first order.</Text>
              <Pressable onPress={() => router.push('/(customer)/menu')} style={[s.shopBtn, { backgroundColor: BLUE }]}>
                <Text style={s.shopBtnText}>Browse Menu</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <OrderCard order={item} onPress={() => setSelectedOrderId(item.id)} />
          )}
        />
      )}
      {selectedOrderId && (
        <OrderDetailModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}
    </View>
  );
}

// ── Order list styles ────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn:      { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 18, fontWeight: '700', color: TEXT },
  headerBrand:  { fontSize: 18, fontWeight: '700', fontStyle: 'italic' },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: TEXT },
  emptySub:     { fontSize: 14, fontWeight: '400', color: MUTED, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 },
  shopBtn:      { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  shopBtnText:  { color: '#fff', fontWeight: '600', fontSize: 15 },
  card:         { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  topRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderId:      { fontSize: 16, fontWeight: '700', color: TEXT },
  orderDate:    { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 3 },
  badge:        { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText:    { fontSize: 13, fontWeight: '600' },
  progressTrack:{ height: 8, borderRadius: 999, backgroundColor: '#EEF2F7', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  itemSummary:  { fontSize: 13, fontWeight: '400', color: MUTED },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta:         { fontSize: 13, fontWeight: '400', color: MUTED },
  bottomRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total:        { fontSize: 16, fontWeight: '700', color: TEXT },
});

// ── Detail modal styles ──────────────────────────────────────────────────────
const d = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, backgroundColor: CARD },
  closeBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { flex: 1, fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' },
  card:         { borderRadius: 16, padding: 16, borderWidth: 1, backgroundColor: CARD },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 10 },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveCard:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 14, borderWidth: 1 },
  itemRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  qtyBadge:     { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  totalRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel:   { fontSize: 14, fontWeight: '500', color: MUTED },
  totalVal:     { fontSize: 14, fontWeight: '600', color: TEXT },
  pointsEarned: { borderRadius: 10, padding: 10, borderWidth: 1, alignItems: 'center', marginTop: 4 },
  stageRow:     { flexDirection: 'row', gap: 14, minHeight: 56 },
  stageCircle:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  stageLine:    { width: 2, flex: 1, minHeight: 20, borderRadius: 1, marginVertical: 3 },
});
