import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator, Animated, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';
import { normalizeOrderItems } from '@/lib/orderItems';

const STAGES = [
  { key: 'received',          label: 'Received',        icon: 'check-circle',  desc: 'Your order has been placed successfully. We\'ve got it!' },
  { key: 'being_prepared',    label: 'In Preparation',  icon: 'package',       desc: 'Our team is freshly baking your order right now.' },
  { key: 'ready_for_pickup',  label: 'Ready for Pickup',icon: 'shopping-bag',  desc: 'Your order is ready at the counter. Come grab it!' },
  { key: 'completed',         label: 'Collected',       icon: 'star',          desc: 'Enjoy your Butterfield cookies! See you next time.' },
];

const ACTIVE_STATUSES = ['received', 'being_prepared', 'ready_for_pickup'];
const SCHEDULED_STATUSES = ['scheduled', 'accepted'];

const STATUS_COLOR: Record<string, string> = {
  received:         '#F59E0B',
  being_prepared:   '#8B5CF6',
  ready_for_pickup: '#22C55E',
  completed:        '#6B7280',
  cancelled:        '#EF4444',
  refunded:         '#EF4444',
  scheduled:        '#F59E0B',
  accepted:         '#22C55E',
};

function getStageIndex(status: string): number {
  return STAGES.findIndex(s => s.key === status);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function AnimatedStep({ stage, index, currentIndex, colors }: {
  stage: typeof STAGES[0]; index: number; currentIndex: number; colors: any;
}) {
  const isCompleted = index < currentIndex;
  const isActive = index === currentIndex;
  const isPending = index > currentIndex;

  const scaleAnim = useRef(new Animated.Value(isActive ? 0.8 : 1)).current;
  const opacityAnim = useRef(new Animated.Value(isPending ? 0.35 : 1)).current;

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.08, duration: 700, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 0.95, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      scaleAnim.setValue(1);
    }
    Animated.timing(opacityAnim, { toValue: isPending ? 0.35 : 1, duration: 300, useNativeDriver: true }).start();
  }, [isActive, isPending]);

  const stageColor = isCompleted || isActive ? (STATUS_COLOR[stage.key] ?? colors.primary) : colors.border;

  return (
    <View style={styles.stageRow}>
      <View style={{ alignItems: 'center' }}>
        <Animated.View style={[styles.stageCircle, {
          backgroundColor: isCompleted || isActive ? stageColor : colors.muted,
          borderColor: isActive ? stageColor : 'transparent',
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        }]}>
          <Feather name={stage.icon as any} size={16} color={isCompleted || isActive ? '#fff' : colors.mutedForeground} />
        </Animated.View>
        {index < STAGES.length - 1 && (
          <View style={[styles.stageLine, { backgroundColor: isCompleted ? stageColor : colors.border }]} />
        )}
      </View>
      <Animated.View style={[styles.stageInfo, { opacity: opacityAnim }]}>
        <Text style={[styles.stageLabel, { color: isActive || isCompleted ? colors.foreground : colors.mutedForeground, fontWeight: isActive ? '700' : '500' }]}>
          {stage.label}
          {isActive && <Text style={[styles.activeTag, { color: stageColor }]}> · Now</Text>}
        </Text>
        {(isActive || isCompleted) && (
          <Text style={[styles.stageDesc, { color: colors.mutedForeground }]}>{stage.desc}</Text>
        )}
      </Animated.View>
    </View>
  );
}

export default function TrackOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.orders.get(id),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return (ACTIVE_STATUSES.includes(status ?? '') || SCHEDULED_STATUSES.includes(status ?? '')) ? 10000 : false;
    },
    retry: 1,
  });

  const order = data?.data;
  const status = order?.status ?? 'received';
  const stageIndex = getStageIndex(status);
  const isCancelled = status === 'cancelled' || status === 'refunded';
  const isActive = ACTIVE_STATUSES.includes(status);
  const isScheduledPending = SCHEDULED_STATUSES.includes(status);
  const total = ((order?.totalCents ?? 0) / 100).toFixed(2);
  const statusColor = STATUS_COLOR[status] ?? colors.primary;
  const currentStage = STAGES[stageIndex];

  const scheduledDeliveryLabel = order?.scheduledFor
    ? new Date(order.scheduledFor).toLocaleDateString('en-AU', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Track Order</Text>
        <View style={{ width: 38 }} />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !order ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
          <Text style={[{ color: colors.mutedForeground, fontWeight: '500', fontSize: 15 }]}>Order not found</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

          {/* Order header card */}
          <View style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={[styles.orderRef, { color: colors.foreground }]}>Order #{order.id.slice(-6).toUpperCase()}</Text>
                <Text style={[styles.orderDate, { color: colors.mutedForeground }]}>{formatDate(order.createdAt)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={[styles.orderTotal, { color: colors.primary }]}>${total}</Text>
                <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                  {isActive && <View style={[styles.statusDot, { backgroundColor: statusColor }]} />}
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {isCancelled ? 'Cancelled' : (currentStage?.label ?? status.replace(/_/g, ' '))}
                  </Text>
                </View>
              </View>
            </View>
            {order.scheduledFor && (
              <View style={[styles.pickupRow, { borderTopColor: colors.border }]}>
                <Feather name="clock" size={13} color={colors.primary} />
                <Text style={[styles.pickupText, { color: colors.foreground }]}>
                  Pickup: {new Date(order.scheduledFor).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
          </View>

          {/* Scheduled / Accepted status cards */}
          {status === 'scheduled' && scheduledDeliveryLabel && (
            <View style={[styles.liveCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="clock" size={14} color="#92400E" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E' }}>Awaiting Confirmation</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '400', lineHeight: 17 }}>
                Your delivery for <Text style={{ fontWeight: '700' }}>{scheduledDeliveryLabel}</Text> is awaiting confirmation from the team. You'll be notified once it's accepted.
              </Text>
            </View>
          )}
          {status === 'accepted' && scheduledDeliveryLabel && (
            <View style={[styles.liveCard, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="check-circle" size={14} color="#166534" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534' }}>Delivery Confirmed</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#166534', fontWeight: '400', lineHeight: 17 }}>
                Your delivery on <Text style={{ fontWeight: '700' }}>{scheduledDeliveryLabel}</Text> is confirmed. We'll start preparing it on the day.
              </Text>
            </View>
          )}

          {/* Live message */}
          {isActive && currentStage && (
            <View style={[styles.liveCard, { backgroundColor: `${statusColor}12`, borderColor: `${statusColor}30` }]}>
              <Feather name="zap" size={14} color={statusColor} />
              <Text style={[styles.liveMessage, { color: statusColor }]}>{currentStage.desc}</Text>
            </View>
          )}

          {/* Pipeline */}
          {!isCancelled && !isScheduledPending ? (
            <View style={[styles.pipelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Order Progress</Text>
              <View style={{ marginTop: 8, gap: 0 }}>
                {STAGES.map((stage, i) => (
                  <AnimatedStep key={stage.key} stage={stage} index={i} currentIndex={stageIndex} colors={colors} />
                ))}
              </View>
            </View>
          ) : !isCancelled && isScheduledPending ? null : (
            <View style={[styles.pipelineCard, { backgroundColor: '#FFF1F0', borderColor: '#FECACA' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="x-circle" size={20} color="#EF4444" />
                <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>Order Cancelled</Text>
              </View>
              <Text style={[styles.stageDesc, { color: '#EF4444', opacity: 0.8, marginTop: 6 }]}>
                This order was cancelled. Contact us if you need help.
              </Text>
            </View>
          )}

          {/* Items */}
          {normalizeOrderItems(order.items).length > 0 && (
            <View style={[styles.pipelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Items</Text>
              <View style={{ gap: 8, marginTop: 8 }}>
                {normalizeOrderItems(order.items).map((item, i: number) => {
                  return (
                    <View key={i} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
                      <View style={[styles.qtyBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.itemName, { color: colors.foreground }]}>
                          {item.name}
                          {item.variantName ? <Text style={{ color: colors.mutedForeground, fontWeight: '400' }}>{` · ${item.variantName}`}</Text> : null}
                        </Text>
                        {item.notableOptions.length > 0 && (
                          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '400' }}>
                            {item.notableOptions.join(' · ')}
                          </Text>
                        )}
                        {item.baristaNote ? (
                          <Text style={{ fontSize: 11, color: colors.mutedForeground, fontWeight: '400', fontStyle: 'italic' }}>
                            "{item.baristaNote}"
                          </Text>
                        ) : null}
                      </View>
                      {item.lineTotalCents > 0 && (
                        <Text style={[styles.itemPrice, { color: colors.mutedForeground }]}>
                          ${(item.lineTotalCents / 100).toFixed(2)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {isActive && (
            <Text style={[styles.refreshHint, { color: colors.mutedForeground }]}>
              Status updates automatically every 10 seconds
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  orderCard: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 0 },
  orderRef: { fontSize: 17, fontWeight: '700' },
  orderDate: { fontSize: 12, fontWeight: '400', marginTop: 3 },
  orderTotal: { fontSize: 18, fontWeight: '700' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  pickupRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  pickupText: { fontSize: 13, fontWeight: '500' },
  liveCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 14, borderWidth: 1 },
  liveMessage: { fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18 },
  pipelineCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  stageRow: { flexDirection: 'row', gap: 14, minHeight: 56 },
  stageCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  stageLine: { width: 2, flex: 1, minHeight: 20, borderRadius: 1, marginVertical: 3 },
  stageInfo: { flex: 1, paddingTop: 6, paddingBottom: 10 },
  stageLabel: { fontSize: 14 },
  activeTag: { fontSize: 13, fontWeight: '600' },
  stageDesc: { fontSize: 12, fontWeight: '400', lineHeight: 17, marginTop: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1 },
  qtyBadge: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  itemName: { fontSize: 14, fontWeight: '400' },
  itemPrice: { fontSize: 13, fontWeight: '500' },
  refreshHint: { textAlign: 'center', fontSize: 12, fontWeight: '400' },
});
