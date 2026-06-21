import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';
import { normalizeOrderItems } from '@/lib/orderItems';

type Stage = {
  key: string;
  label: string;
  icon: string;
  desc: string;
};

const QUICK_PICKUP_STAGES: Stage[] = [
  { key: 'received',         label: 'Received',         icon: 'check-circle',  desc: 'Your order is placed and in the queue — we\'ll start making it shortly.' },
  { key: 'being_prepared',   label: 'Preparing',        icon: 'package',       desc: 'Our team is freshly making your order right now.' },
  { key: 'ready_for_pickup', label: 'Ready',            icon: 'shopping-bag',  desc: 'Your order is ready at the counter. Come grab it!' },
];

const SCHEDULED_PICKUP_STAGES: Stage[] = [
  { key: 'scheduled',        label: 'Scheduled',        icon: 'calendar',      desc: 'Your pickup slot is booked. We\'ll confirm it shortly.' },
  { key: 'accepted',         label: 'Confirmed',        icon: 'check-circle',  desc: 'Your pickup slot is confirmed. We\'ll prepare it ahead of time.' },
  { key: 'being_prepared',   label: 'Preparing',        icon: 'package',       desc: 'Our team is freshly baking your order right now.' },
  { key: 'ready_for_pickup', label: 'Ready for Pickup', icon: 'shopping-bag',  desc: 'Your order is ready at the counter. Come grab it!' },
];

const DELIVERY_STAGES: Stage[] = [
  { key: 'scheduled',        label: 'Scheduled',        icon: 'calendar',      desc: 'Your delivery is booked. We\'ll confirm it shortly.' },
  { key: 'accepted',         label: 'Confirmed',        icon: 'check-circle',  desc: 'Your delivery is confirmed. We\'ll start preparing it on the day.' },
  { key: 'being_prepared',   label: 'Preparing',        icon: 'package',       desc: 'Our team is freshly making your order right now.' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: 'truck',         desc: 'Your order is on its way to you!' },
  { key: 'completed',        label: 'Delivered',        icon: 'star',          desc: 'Your order has been delivered. Enjoy 🍪' },
];

function getStages(orderType: string, scheduledFor: string | null | undefined): Stage[] {
  if (orderType === 'delivery') return DELIVERY_STAGES;
  if (scheduledFor) return SCHEDULED_PICKUP_STAGES;
  return QUICK_PICKUP_STAGES;
}

// Statuses where we should still poll for updates
const POLLING_STATUSES = new Set([
  'received', 'scheduled', 'accepted', 'being_prepared', 'ready_for_pickup', 'out_for_delivery',
]);

// Statuses where the rating prompt should appear
const RATABLE_STATUSES = new Set(['ready_for_pickup', 'completed']);

const STATUS_COLOR: Record<string, string> = {
  received:         '#F59E0B',
  being_prepared:   '#8B5CF6',
  ready_for_pickup: '#22C55E',
  out_for_delivery: '#3B82F6',
  completed:        '#6B7280',
  cancelled:        '#EF4444',
  refunded:         '#EF4444',
  scheduled:        '#F59E0B',
  accepted:         '#22C55E',
};

const RATING_KEY_PREFIX = '@butterfield_order_rated_';

function getRatingKey(orderId: string) {
  return `${RATING_KEY_PREFIX}${orderId}`;
}

function getStageIndex(status: string, stages: Stage[]): number {
  const idx = stages.findIndex(s => s.key === status);
  if (idx === -1 && status === 'completed') return stages.length;
  return idx;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' }) +
    ' · ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' });
}

function AnimatedStep({ stage, index, currentIndex, totalStages, colors }: {
  stage: Stage; index: number; currentIndex: number; totalStages: number; colors: any;
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
          <Feather
            name={isCompleted ? 'check' : (stage.icon as any)}
            size={16}
            color={isCompleted || isActive ? '#fff' : colors.mutedForeground}
          />
        </Animated.View>
        {index < totalStages - 1 && (
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

function StarRating({ value, onChange, colors }: { value: number; onChange: (v: number) => void; colors: any }) {
  return (
    <View style={rStyles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(star);
          }}
          style={rStyles.starBtn}
        >
          <Feather
            name="star"
            size={32}
            color={star <= value ? '#F59E0B' : colors.border}
          />
        </Pressable>
      ))}
    </View>
  );
}

function FeedbackToast({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[tStyles.toast, { opacity }]}>
      <Feather name="check-circle" size={16} color="#fff" />
      <Text style={tStyles.toastText}>Thanks for your feedback!</Text>
    </Animated.View>
  );
}

function RatingCard({
  orderId,
  colors,
  onDismiss,
  onSubmitted,
}: {
  orderId: string;
  colors: any;
  onDismiss: () => void;
  onSubmitted: () => void;
}) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (stars === 0) {
      Alert.alert('Select a rating', 'Please tap a star to rate your order.');
      return;
    }
    setSubmitting(true);
    try {
      await api.misc.feedback({
        message: comment.trim() || `${stars}-star rating`,
        rating: stars,
        orderId,
        category: 'order_rating',
      });
      await AsyncStorage.setItem(getRatingKey(orderId), 'submitted');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSubmitted();
      onDismiss();
    } catch {
      Alert.alert('Could not submit', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(getRatingKey(orderId), 'skipped');
    onDismiss();
  };

  return (
    <View style={[rStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={rStyles.headerRow}>
        <Text style={[rStyles.title, { color: colors.foreground }]}>How was your order?</Text>
        <Pressable onPress={handleSkip} hitSlop={12}>
          <Feather name="x" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <Text style={[rStyles.subtitle, { color: colors.mutedForeground }]}>
        Tap a star to rate your experience
      </Text>
      <StarRating value={stars} onChange={setStars} colors={colors} />
      {stars > 0 && (
        <TextInput
          style={[rStyles.commentInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
          placeholder="Tell us more (optional)"
          placeholderTextColor={colors.mutedForeground}
          value={comment}
          onChangeText={(t) => setComment(t.slice(0, 200))}
          multiline
          maxLength={200}
        />
      )}
      <View style={rStyles.actions}>
        <Pressable onPress={handleSkip} style={[rStyles.skipBtn, { borderColor: colors.border }]}>
          <Text style={[rStyles.skipText, { color: colors.mutedForeground }]}>Skip</Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          disabled={submitting || stars === 0}
          style={[rStyles.submitBtn, { opacity: stars === 0 ? 0.45 : 1 }]}
        >
          {submitting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={rStyles.submitText}>Submit</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

export default function TrackOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [ratingDismissed, setRatingDismissed] = useState(true);
  const [toastVisible, setToastVisible] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.orders.get(id),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return POLLING_STATUSES.has(status ?? '') ? 10000 : false;
    },
    retry: 1,
  });

  const order = data?.data;
  const status = order?.status ?? 'received';

  useEffect(() => {
    if (!id || !order) return;
    if (!RATABLE_STATUSES.has(status)) return;
    AsyncStorage.getItem(getRatingKey(id)).then((val) => {
      if (!val) setRatingDismissed(false);
    });
  }, [id, status, order]);

  const orderType = order?.type ?? 'pickup';
  const scheduledFor = order?.scheduledFor ?? null;

  const stages = getStages(orderType, scheduledFor);
  const stageIndex = getStageIndex(status, stages);

  const isCancelled = status === 'cancelled' || status === 'refunded';

  const isActive = stageIndex >= 0 && !isCancelled;

  const total = ((order?.totalCents ?? 0) / 100).toFixed(2);
  const statusColor = STATUS_COLOR[status] ?? colors.primary;

  const currentStage = stages[stageIndex];
  const statusBadgeLabel = isCancelled
    ? (status === 'refunded' ? 'Refunded' : 'Cancelled')
    : (currentStage?.label ?? status.replace(/_/g, ' '));

  const liveMessage = currentStage?.desc ?? null;

  const showPipeline = !isCancelled;

  const showRatingCard = !ratingDismissed && !!order && RATABLE_STATUSES.has(status) && !isCancelled;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FeedbackToast visible={toastVisible} />
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
                <Text style={[styles.orderRef, { color: colors.foreground }]}>Order #{order.orderNumber ?? order.id.slice(-6).toUpperCase()}</Text>
                <Text style={[styles.orderDate, { color: colors.mutedForeground }]}>{formatDate(order.createdAt)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={[styles.orderTotal, { color: colors.primary }]}>${total}</Text>
                <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                  {isActive && !isCancelled && <View style={[styles.statusDot, { backgroundColor: statusColor }]} />}
                  <Text style={[styles.statusText, { color: statusColor }]}>{statusBadgeLabel}</Text>
                </View>
              </View>
            </View>
            {order.scheduledFor && (
              <View style={[styles.pickupRow, { borderTopColor: colors.border }]}>
                <Feather name="clock" size={13} color={colors.primary} />
                <Text style={[styles.pickupText, { color: colors.foreground }]}>
                  {orderType === 'delivery' ? 'Delivery' : 'Pickup'}: {new Date(order.scheduledFor).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' })}
                </Text>
              </View>
            )}
          </View>

          {/* Live message banner (active orders) */}
          {isActive && liveMessage && (
            <View style={[styles.liveCard, { backgroundColor: `${statusColor}12`, borderColor: `${statusColor}30` }]}>
              <Feather name="zap" size={14} color={statusColor} />
              <Text style={[styles.liveMessage, { color: statusColor }]}>{liveMessage}</Text>
            </View>
          )}

          {/* Rating prompt */}
          {showRatingCard && (
            <RatingCard
              orderId={order.id}
              colors={colors}
              onDismiss={() => setRatingDismissed(true)}
              onSubmitted={() => setToastVisible(true)}
            />
          )}

          {/* Pipeline */}
          {showPipeline ? (
            <View style={[styles.pipelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Order Progress</Text>
              <View style={{ marginTop: 8, gap: 0 }}>
                {stages.map((stage, i) => (
                  <AnimatedStep
                    key={stage.key}
                    stage={stage}
                    index={i}
                    currentIndex={stageIndex}
                    totalStages={stages.length}
                    colors={colors}
                  />
                ))}
              </View>
            </View>
          ) : isCancelled ? (
            <View style={[styles.pipelineCard, { backgroundColor: '#FFF1F0', borderColor: '#FECACA' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="x-circle" size={20} color="#EF4444" />
                <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>
                  {status === 'refunded' ? 'Order Refunded' : 'Order Cancelled'}
                </Text>
              </View>
              <Text style={[styles.stageDesc, { color: '#EF4444', opacity: 0.8, marginTop: 6 }]}>
                This order was {status === 'refunded' ? 'refunded' : 'cancelled'}. Contact us if you need help.
              </Text>
            </View>
          ) : null}

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

          {POLLING_STATUSES.has(status) && (
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

const rStyles = StyleSheet.create({
  card: { borderRadius: 16, padding: 18, borderWidth: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 13, fontWeight: '400', marginBottom: 14 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 14 },
  starBtn: { padding: 4 },
  commentInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  actions: { flexDirection: 'row', gap: 10 },
  skipBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  skipText: { fontSize: 14, fontWeight: '600' },
  submitBtn: { flex: 2, backgroundColor: '#D20001', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

const tStyles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
