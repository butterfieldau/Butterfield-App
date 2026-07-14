import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusStatusBar } from '@/hooks/useScrollStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ApiOrder } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { LoggedOutAccountPrompt } from '@/components/LoggedOutAccountPrompt';
import { normalizeOrderItems, summarizeOrderItems } from '@/lib/orderItems';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const BLUE_DARK = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#D20001';

const STATUS_LABEL: Record<string, string> = {
  received:         'Pending',
  being_prepared:   'Preparing',
  ready_for_pickup: 'Ready to pick up',
  out_for_delivery: 'Out for delivery',
  completed:        'Collected',
  cancelled:        'Cancelled',
  refunded:         'Refunded',
  scheduled:        'Awaiting Confirmation',
  accepted:         'Order Confirmed',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  received:         { bg: '#FEF9C3', text: '#854D0E', dot: '#F59E0B' },
  being_prepared:   { bg: '#EDE9FE', text: '#5B21B6', dot: '#8B5CF6' },
  ready_for_pickup: { bg: '#DCFCE7', text: '#166534', dot: '#22C55E' },
  out_for_delivery: { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },
  completed:        { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
  cancelled:        { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
  refunded:         { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
  scheduled:        { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },
  accepted:         { bg: '#DCFCE7', text: '#166534', dot: '#22C55E' },
};

const ACTIVE_STATUSES = ['received', 'being_prepared', 'ready_for_pickup', 'out_for_delivery', 'scheduled', 'accepted'];
const TERMINAL_STATUSES = ['completed', 'cancelled', 'refunded'];

const STAGES_QUICK_PICKUP = [
  { key: 'received',          label: 'Received',    icon: 'check-circle' as const, desc: 'Your order is in the queue — we\'ll start making it shortly.' },
  { key: 'being_prepared',    label: 'Preparing',   icon: 'package'      as const, desc: 'Our team is freshly baking your order right now.' },
  { key: 'ready_for_pickup',  label: 'Ready',       icon: 'shopping-bag' as const, desc: 'Your order is ready at the counter. Come grab it!' },
];

const STAGES_SCHEDULED_PICKUP = [
  { key: 'scheduled',         label: 'Scheduled',   icon: 'calendar'     as const, desc: 'Your pickup slot is booked. We\'ll confirm it shortly.' },
  { key: 'accepted',          label: 'Confirmed',   icon: 'check-circle' as const, desc: 'Your pickup slot is confirmed. We\'ll prepare it ahead of time.' },
  { key: 'being_prepared',    label: 'Preparing',   icon: 'package'      as const, desc: 'Our team is freshly baking your order right now.' },
  { key: 'ready_for_pickup',  label: 'Ready',       icon: 'shopping-bag' as const, desc: 'Your order is ready at the counter. Come grab it!' },
];

const STAGES_DELIVERY = [
  { key: 'scheduled',         label: 'Scheduled',        icon: 'calendar' as const,      desc: 'Your delivery is booked. We\'ll confirm it shortly.' },
  { key: 'accepted',          label: 'Confirmed',        icon: 'check-circle' as const,  desc: 'Your delivery is confirmed. We\'ll start preparing it on the day.' },
  { key: 'being_prepared',    label: 'Preparing',        icon: 'package' as const,        desc: 'Our team is freshly making your order right now.' },
  { key: 'out_for_delivery',  label: 'Out for Delivery', icon: 'truck' as const,          desc: 'Your order is on its way to you!' },
  { key: 'completed',         label: 'Delivered',        icon: 'star' as const,           desc: 'Your order has been delivered. Enjoy!' },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtShort(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
}
function sydDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA');
}
function elapsedLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}
function fmtSectionTitle(dateKey: string): string {
  const today     = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  if (dateKey === today)     return 'Today';
  if (dateKey === yesterday) return 'Yesterday';
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Pulsing status dot ───────────────────────────────────────────────────────
function PulsingDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1.6, duration: 700, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1,   duration: 700, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, transform: [{ scale: anim }] }} />
    </View>
  );
}

// ── Stage step ───────────────────────────────────────────────────────────────
function StageStep({ stage, index, currentIndex, totalStages }: { stage: any; index: number; currentIndex: number; totalStages: number }) {
  const isCompleted = index < currentIndex;
  const isActive    = index === currentIndex;
  const isPending   = index > currentIndex;
  const dotColor    = STATUS_COLORS[stage.key]?.dot ?? BLUE_DARK;
  return (
    <View style={{ flexDirection: 'row', gap: 14, minHeight: 52 }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: isCompleted || isActive ? dotColor : '#F3F4F6', borderWidth: isActive ? 2 : 0, borderColor: dotColor, alignItems: 'center', justifyContent: 'center', opacity: isPending ? 0.4 : 1 }}>
          <Feather name={isCompleted ? 'check' : stage.icon} size={15} color={isCompleted || isActive ? '#fff' : MUTED} />
        </View>
        {index < totalStages - 1 && (
          <View style={{ width: 2, flex: 1, minHeight: 18, borderRadius: 1, backgroundColor: isCompleted ? dotColor : BORDER, marginVertical: 3 }} />
        )}
      </View>
      <View style={{ flex: 1, paddingTop: 6, paddingBottom: 10, opacity: isPending ? 0.4 : 1 }}>
        <Text style={{ fontSize: 14, fontWeight: isActive ? '700' : '500', color: isActive || isCompleted ? TEXT : MUTED }}>
          {stage.label}{isActive ? <Text style={{ color: dotColor, fontWeight: '600' }}> · Now</Text> : ''}
        </Text>
        {(isActive || isCompleted) && (
          <Text style={{ fontSize: 12, color: MUTED, lineHeight: 17, marginTop: 2 }}>{stage.desc}</Text>
        )}
      </View>
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
  const isScheduledPickup = order?.type === 'pickup' && !!order?.scheduledFor;
  const STAGES       = isDelivery ? STAGES_DELIVERY : isScheduledPickup ? STAGES_SCHEDULED_PICKUP : STAGES_QUICK_PICKUP;
  const stageIndex   = (() => {
    const idx = STAGES.findIndex(s => s.key === status);
    if (idx === -1 && status === 'completed') return STAGES.length;
    return idx;
  })();
  const isCancelled  = status === 'cancelled' || status === 'refunded';
  const isActive     = ACTIVE_STATUSES.includes(status);
  const dotColor     = STATUS_COLORS[status]?.dot ?? BLUE_DARK;
  const currentStage = STAGES[stageIndex];
  const items        = normalizeOrderItems(order?.items);
  const total        = (order?.totalCents ?? 0) / 100;
  const pointsEarned = order?.loyaltyPointsEarned ?? 0;
  const col          = STATUS_COLORS[status] ?? STATUS_COLORS.received;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, paddingTop: insets.top > 0 ? insets.top + 4 : 20, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD }}>
          <Pressable onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' }}>
            {isLoading ? 'Loading…' : `Order #${order?.orderNumber ?? (order?.id ?? '').slice(-6).toUpperCase()}`}
          </Text>
          <View style={{ width: 36 }} />
        </View>
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={BLUE_DARK} size="large" />
          </View>
        ) : !order ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Feather name="alert-circle" size={40} color={MUTED} />
            <Text style={{ color: MUTED, fontWeight: '500' }}>Order not found</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
            <View style={{ borderRadius: 16, padding: 16, borderWidth: 1, backgroundColor: CARD, borderColor: BORDER }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ gap: 3 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>
                    Order #{order.orderNumber ?? order.id.slice(-6).toUpperCase()}
                  </Text>
                  <Text style={{ fontSize: 12, color: MUTED }}>{fmtDate(order.createdAt)}</Text>
                  <Text style={{ fontSize: 12, color: MUTED, textTransform: 'capitalize' }}>
                    {order.type === 'delivery' ? '🚗 Delivery' : '🛍️ Pickup'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>AUD ${total.toFixed(2)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: dotColor + '18' }}>
                    {isActive && <PulsingDot color={dotColor} />}
                    <Text style={{ fontSize: 12, fontWeight: '600', color: dotColor }}>{currentStage?.label ?? STATUS_LABEL[status] ?? status}</Text>
                  </View>
                </View>
              </View>
              {order.scheduledFor && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER }}>
                  <Feather name="clock" size={13} color={BLUE_DARK} />
                  <Text style={{ fontSize: 13, fontWeight: '500', color: TEXT }}>
                    {order.type === 'delivery' ? 'Delivery' : 'Pickup'}: {fmtShort(order.scheduledFor).date} · {fmtShort(order.scheduledFor).time}
                  </Text>
                </View>
              )}
            </View>

            {isActive && currentStage && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 14, borderWidth: 1, backgroundColor: dotColor + '12', borderColor: dotColor + '30' }}>
                <Feather name="zap" size={14} color={dotColor} />
                <Text style={{ fontSize: 13, fontWeight: '500', color: dotColor, flex: 1, lineHeight: 18 }}>{currentStage.desc}</Text>
              </View>
            )}

            {items.length > 0 && (
              <View style={{ borderRadius: 16, padding: 16, borderWidth: 1, backgroundColor: CARD, borderColor: BORDER }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 10 }}>Items ordered</Text>
                {items.map((item, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: BORDER }}>
                    <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: BLUE_DARK, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{item.quantity}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: TEXT }}>
                        {item.name}{item.variantName ? <Text style={{ fontWeight: '400', color: MUTED }}>{` · ${item.variantName}`}</Text> : null}
                      </Text>
                      {item.isFreeReward && (
                        <View style={{ backgroundColor: '#DCFCE7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#166534' }}>FREE</Text>
                        </View>
                      )}
                      {item.boxContents.length > 0 && (
                        <Text style={{ fontSize: 12, color: MUTED, lineHeight: 17 }}>{item.boxContents.join(' · ')}</Text>
                      )}
                      {item.notableOptions.length > 0 && (
                        <Text style={{ fontSize: 12, color: BLUE_DARK }}>{item.notableOptions.join(' · ')}</Text>
                      )}
                    </View>
                    {item.lineTotalCents > 0 && (
                      <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>${(item.lineTotalCents / 100).toFixed(2)}</Text>
                    )}
                  </View>
                ))}
                <View style={{ borderTopWidth: 1, borderTopColor: BORDER, marginTop: 12, paddingTop: 12, gap: 6 }}>
                  {(order.loyaltyPointsUsed ?? 0) > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: MUTED }}>Points redeemed</Text>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: GREEN }}>−{order.loyaltyPointsUsed} pts</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>Total paid</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>AUD ${total.toFixed(2)}</Text>
                  </View>
                  {pointsEarned > 0 && (
                    <View style={{ borderRadius: 10, padding: 10, borderWidth: 1, backgroundColor: '#FFFBEB', borderColor: '#FDE68A', alignItems: 'center', marginTop: 4 }}>
                      <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '600' }}>🏅 +{pointsEarned} loyalty points earned</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {!isCancelled ? (
              <View style={{ borderRadius: 16, padding: 16, borderWidth: 1, backgroundColor: CARD, borderColor: BORDER }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 10 }}>Order progress</Text>
                {STAGES.map((stage, i) => (
                  <StageStep key={stage.key} stage={stage} index={i} currentIndex={stageIndex} totalStages={STAGES.length} />
                ))}
                {isActive && (
                  <Text style={{ textAlign: 'center', fontSize: 11, color: MUTED, marginTop: 8 }}>Updates automatically every 10 seconds</Text>
                )}
              </View>
            ) : (
              <View style={{ borderRadius: 16, padding: 16, borderWidth: 1, backgroundColor: '#FFF1F0', borderColor: '#FECACA' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="x-circle" size={20} color="#EF4444" />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#EF4444' }}>Order {status === 'refunded' ? 'Refunded' : 'Cancelled'}</Text>
                </View>
                <Text style={{ fontSize: 13, color: '#EF4444', opacity: 0.8, marginTop: 6, lineHeight: 18 }}>
                  This order was {status === 'refunded' ? 'refunded' : 'cancelled'}. Contact us at hello@butterfieldcookies.com.au if you need help.
                </Text>
              </View>
            )}

            {order.type === 'delivery' && order.deliveryAddress && (
              <View style={{ borderRadius: 16, padding: 16, borderWidth: 1, backgroundColor: CARD, borderColor: BORDER }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 8 }}>Delivery address</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="map-pin" size={14} color={MUTED} />
                  <Text style={{ fontSize: 14, color: TEXT, flex: 1 }}>
                    {typeof order.deliveryAddress === 'string' ? order.deliveryAddress : JSON.stringify(order.deliveryAddress)}
                  </Text>
                </View>
              </View>
            )}

            {order.notes && (
              <View style={{ borderRadius: 12, padding: 14, borderWidth: 1, backgroundColor: '#FFFBEB', borderColor: '#FDE68A', flexDirection: 'row', gap: 8 }}>
                <Feather name="message-circle" size={14} color="#92400E" />
                <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '500', flex: 1 }}>{order.notes}</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Active order card (for pinned strip) ─────────────────────────────────────
function ActiveOrderCard({ order, onPress }: { order: ApiOrder; onPress: () => void }) {
  const col   = STATUS_COLORS[order.status] ?? STATUS_COLORS.received;
  const items = normalizeOrderItems(order.items);
  const summary = summarizeOrderItems(items);
  const elapsed = elapsedLabel(order.createdAt);
  const isScheduled = ['scheduled', 'accepted'].includes(order.status);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 220, backgroundColor: CARD, borderRadius: 16, padding: 14,
        borderWidth: 1, borderColor: BORDER, marginRight: 12,
        opacity: pressed ? 0.9 : 1,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <PulsingDot color={col.dot} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: TEXT }} numberOfLines={1}>
            #{order.orderNumber ?? order.id.slice(-6).toUpperCase()}
          </Text>
        </View>
        <View style={{ backgroundColor: col.bg, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: col.text }}>{STATUS_LABEL[order.status] ?? order.status}</Text>
        </View>
      </View>
      {order.customerName && (
        <Text style={{ fontSize: 12, color: MUTED, fontWeight: '500', marginBottom: 4 }} numberOfLines={1}>{order.customerName}</Text>
      )}
      {summary ? (
        <Text style={{ fontSize: 12, color: MUTED, marginBottom: 6 }} numberOfLines={1}>{summary}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="clock" size={11} color={MUTED} />
          <Text style={{ fontSize: 11, color: MUTED }}>{isScheduled ? 'Scheduled' : elapsed}</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '700', color: BLUE_DARK }}>
          ${((order.totalCents ?? 0) / 100).toFixed(2)}
        </Text>
      </View>
    </Pressable>
  );
}

// ── Past order card (for day-grouped history) ────────────────────────────────
function PastOrderCard({ order, onPress, onReorder }: { order: ApiOrder; onPress: () => void; onReorder: () => void }) {
  const col   = STATUS_COLORS[order.status] ?? STATUS_COLORS.completed;
  const items = normalizeOrderItems(order.items);
  const summary = summarizeOrderItems(items);
  const total = (order.totalCents ?? 0) / 100;

  // Up to 3 item thumbnails shown as name+qty rows
  const itemRows = items.slice(0, 3);
  const extraCount = items.length - 3;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: CARD, borderRadius: 16, padding: 14,
        borderWidth: 1, borderColor: BORDER, marginBottom: 10,
        opacity: pressed ? 0.9 : 1,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>
            #{order.orderNumber ?? order.id.slice(-6).toUpperCase()}
          </Text>
          {order.customerName && (
            <Text style={{ fontSize: 12, color: MUTED }}>{order.customerName}</Text>
          )}
          {/* Item thumbnails — up to 3 rows, then "+N more" */}
          <View style={{ gap: 2, marginTop: 2 }}>
            {itemRows.map((item, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: BLUE + '15', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: BLUE }}>{item.quantity}</Text>
                </View>
                <Text style={{ fontSize: 12, color: TEXT, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                  {item.name}{item.variantName ? ` · ${item.variantName}` : ''}
                </Text>
              </View>
            ))}
            {extraCount > 0 && (
              <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>+{extraCount} more item{extraCount !== 1 ? 's' : ''}</Text>
            )}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <View style={{ backgroundColor: col.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: col.text }}>{STATUS_LABEL[order.status] ?? order.status}</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>AUD ${total.toFixed(2)}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="clock" size={11} color={MUTED} />
          <Text style={{ fontSize: 12, color: MUTED }}>
            {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
          </Text>
          <Text style={{ fontSize: 12, color: MUTED }}>
            · {order.type === 'delivery' ? '🚗 Delivery' : '🛍️ Pickup'}
          </Text>
        </View>
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); onReorder(); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: RED + '12', borderWidth: 1, borderColor: RED + '40', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}
        >
          <Feather name="refresh-cw" size={11} color={RED} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: RED }}>Reorder</Text>
        </Pressable>
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
  useFocusStatusBar('dark-content');
  const qc = useQueryClient();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.orders.list(),
    refetchInterval: 15000,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const orders: ApiOrder[] = data?.data ?? [];

  const activeOrders = useMemo(
    () => orders.filter((o) => ACTIVE_STATUSES.includes(o.status)),
    [orders],
  );
  const pastOrders = useMemo(
    () => orders.filter((o) => TERMINAL_STATUSES.includes(o.status)),
    [orders],
  );

  const pastSections = useMemo(() => {
    const groups: Record<string, ApiOrder[]> = {};
    for (const o of pastOrders) {
      const k = sydDateKey(o.createdAt);
      (groups[k] ??= []).push(o);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, items]) => ({ key: dateKey, title: fmtSectionTitle(dateKey), data: items }));
  }, [pastOrders]);

  const { addItemToCart } = useCart();
  const handleReorder = useCallback(async (order: ApiOrder) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Use raw items so we have productId and original pricing
    const rawItems: any[] = Array.isArray(order.items) ? order.items : [];
    if (rawItems.length === 0) { return; }
    let added = 0;
    for (const raw of rawItems) {
      const productId = raw.productId ?? raw.product_id ?? raw.id ?? '';
      if (!productId) continue;
      addItemToCart({
        productId,
        productName: raw.name ?? raw.productName ?? 'Item',
        basePriceCents: raw.unitPriceCents ?? raw.priceCents ?? Math.round((raw.lineTotalCents ?? 0) / Math.max(raw.quantity ?? 1, 1)),
        selectedOptions: [],
        quantity: raw.quantity ?? 1,
        variantId: raw.variantId ?? undefined,
        variantName: raw.variantName ?? undefined,
        imageUrl: raw.imageUrl ?? undefined,
        category: raw.category ?? undefined,
        isCoffee: raw.isCoffee ?? false,
      });
      added++;
    }
    if (added > 0) router.push('/(customer)/cart' as any);
  }, [addItemToCart]);

  const handleExit = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile' as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, paddingTop: insets.top + 14, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD }}>
        <Pressable onPress={handleExit} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="arrow-left" size={22} color={TEXT} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: TEXT }}>My orders</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', fontStyle: 'italic', color: BLUE_DARK }}>Butterfield</Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE_DARK} />
        </View>
      ) : orders.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
          <Feather name="package" size={48} color={BLUE_DARK + '40'} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>No orders yet</Text>
          <Text style={{ fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 }}>
            Your order history will appear here once you place your first order.
          </Text>
          <Pressable onPress={() => router.push('/(customer)/menu' as any)} style={{ backgroundColor: RED, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Browse Menu</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={pastSections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE_DARK} />}
          ListHeaderComponent={
            <View>
              {/* ── Active Orders pinned strip ──────────────────────── */}
              {activeOrders.length > 0 && (
                <View style={{ paddingTop: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginBottom: 12 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>Active Orders</Text>
                    <View style={{ backgroundColor: GREEN + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: GREEN, fontWeight: '700', fontSize: 12 }}>{activeOrders.length}</Text>
                    </View>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
                  >
                    {activeOrders.map((item) => (
                      <ActiveOrderCard key={item.id} order={item} onPress={() => setSelectedOrderId(item.id)} />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── Past Orders header ─────────────────────────── */}
              {pastOrders.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginTop: activeOrders.length > 0 ? 24 : 16, marginBottom: 4 }}>
                  <Feather name="clock" size={14} color={MUTED} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>Past Orders</Text>
                  <Text style={{ fontSize: 13, color: MUTED }}>({pastOrders.length})</Text>
                </View>
              )}
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={{ paddingHorizontal: 20, paddingVertical: 8, backgroundColor: BG }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item: order }) => (
            <View style={{ paddingHorizontal: 20 }}>
              <PastOrderCard
                order={order}
                onPress={() => setSelectedOrderId(order.id)}
                onReorder={() => handleReorder(order)}
              />
            </View>
          )}
          ListEmptyComponent={
            activeOrders.length > 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                <Text style={{ fontSize: 13, color: MUTED }}>No completed orders yet</Text>
              </View>
            ) : null
          }
        />
      )}

      {selectedOrderId && (
        <OrderDetailModal orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
      )}
    </View>
  );
}
