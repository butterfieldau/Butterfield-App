import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView,
  Linking, Modal, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeOrderItems } from '@/lib/orderItems';
import {
  STATUS_COLORS, STATUS_LABEL, ACTION_LABEL, WHOLESALE_NEXT,
  WHOLESALE_FORWARD, WHOLESALE_ALL_STATUSES,
  getCustomerNextStatuses, isWholesaleOrderPaid,
} from '@/lib/orderStatus';
import type { ApiOrder } from '@/lib/api';
import { api } from '@/lib/api';
import { fmtTime, openMap, openMapWithChoice } from './ordersHelpers';
import {
  BG, SURFACE, SURFACE_RAISED, BORDER, TEXT, TEXT_MUTED, TEXT_FAINT, BRAND, BRAND_TEXT_ON,
  GREEN, GREEN_DIM, AMBER, AMBER_DIM, RED, RED_DIM, PURPLE, PURPLE_DIM,
} from './commandCenterColors';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

// ── Timeline builder ──────────────────────────────────────────────────────────
function getTimeline(order: ApiOrder): { label: string; done: boolean; current: boolean }[] {
  const isDelivery = order.type === 'delivery' || order.deliveryType === 'delivery';
  const isScheduled = !!(order.scheduledFor);
  const isWholesale = order.orderSource === 'wholesale' || order.type === 'wholesale';
  const status = order.status;

  let steps: string[];
  let labels: string[];

  if (isWholesale) {
    steps  = ['pending', 'processing', 'dispatched', 'delivered'];
    labels = ['Pending', 'Processing', 'Dispatched', 'Delivered'];
  } else if (isDelivery) {
    steps  = ['scheduled', 'accepted', 'being_prepared', 'out_for_delivery', 'completed'];
    labels = ['Received', 'Confirmed', 'Preparing', 'Out for Delivery', 'Completed'];
  } else if (isScheduled) {
    steps  = ['scheduled', 'accepted', 'being_prepared', 'ready_for_pickup', 'completed'];
    labels = ['Received', 'Confirmed', 'Preparing', 'Ready', 'Completed'];
  } else {
    steps  = ['received', 'being_prepared', 'completed'];
    labels = ['Received', 'Preparing', 'Completed'];
  }

  const currentIdx = steps.indexOf(status);
  return steps.map((_, i) => ({
    label: labels[i],
    done: currentIdx > i,
    current: i === currentIdx,
  }));
}

// ── Sub-components ────────────────────────────────────────────────────────────
function TimelineStep({ label, done, current }: { label: string; done: boolean; current: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={[
        d.timelineDot,
        done    && { backgroundColor: GREEN },
        current && { backgroundColor: BRAND, shadowColor: BRAND, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 2 },
        !done && !current && { backgroundColor: '#E5E7EB' },
      ]}>
        {done && <Feather name="check" size={12} color="#fff" />}
        {current && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />}
      </View>
      <Text style={{ fontSize: 15, fontWeight: current ? '600' : '400', color: done || current ? TEXT : TEXT_MUTED }}>
        {label}
      </Text>
    </View>
  );
}

function SecondaryActionRow({ icon, label, onPress, loading, border = true }: {
  icon: string; label: string; onPress: () => void; loading?: boolean; border?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        d.actionRow,
        !border && { borderBottomWidth: 0 },
        pressed && { backgroundColor: '#F8F8F8' },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
        {loading
          ? <ActivityIndicator color={BRAND} size="small" style={{ width: 24 }} />
          : <Feather name={icon as any} size={20} color={BRAND} />
        }
        <Text style={{ fontSize: 16, color: TEXT }}>{label}</Text>
      </View>
      <Feather name="chevron-right" size={18} color="#C7C7CC" />
    </Pressable>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DirectorOrderDetailModal({
  order, visible, onClose, onStatusChange, onAcceptOrder, onPrintReceipt,
  onViewInvoice, printing, canCancelRefund, onEditWholesale, onAdjustWholesale,
  onSendRevisedInvoice, onMarkPaid,
}: {
  order: ApiOrder | null; visible: boolean; onClose: () => void;
  onStatusChange: (id: string, status: string, cancelReason?: string) => Promise<void>;
  onAcceptOrder: (id: string) => Promise<void>;
  onPrintReceipt: () => Promise<void>;
  onViewInvoice: () => Promise<void>;
  printing: boolean;
  canCancelRefund: boolean;
  onEditWholesale?: (order: ApiOrder) => void;
  onAdjustWholesale?: (order: ApiOrder) => void;
  onSendRevisedInvoice?: (order: ApiOrder) => void;
  onMarkPaid?: (order: ApiOrder) => void;
}) {
  const insets = useSafeAreaInsets();
  const [updating, setUpdating]         = useState(false);
  const [accepting, setAccepting]       = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [pendingStatus, setPendingStatus] = useState('');
  // Modify Order state
  const [showModifySheet, setShowModifySheet] = useState(false);
  const [modifyItems, setModifyItems]         = useState<any[]>([]);
  const [modifyReason, setModifyReason]       = useState('');
  const [modifyLoading, setModifyLoading]     = useState(false);
  const [availProds, setAvailProds]           = useState<any[]>([]);
  const [loadingProds, setLoadingProds]       = useState(false);
  const [prodPickerQ, setProdPickerQ]         = useState('');

  if (!order) return null;

  const isWholesale = order.orderSource === 'wholesale' || order.type === 'wholesale';
  const items  = normalizeOrderItems(order.items);
  const colors = STATUS_COLORS[order.status] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const label  = STATUS_LABEL[order.status] ?? order.status;
  const orderRef = isWholesale
    ? `#${order.orderNumber ?? order.poReference ?? order.id.slice(0, 8).toUpperCase()}`
    : (order.orderNumber ?? `#${order.id.slice(0, 8).toUpperCase()}`);

  const withinCancelWindow = (Date.now() - new Date(order.updatedAt).getTime()) < TWO_WEEKS_MS;
  const rawNext = isWholesale ? (WHOLESALE_NEXT[order.status] ?? []) : getCustomerNextStatuses(order);
  const nextWithWindow = (
    canCancelRefund &&
    (order.status === 'completed' || order.status === 'delivered') &&
    withinCancelWindow
  ) ? ['cancelled', 'refunded'] : rawNext;
  const next = canCancelRefund
    ? nextWithWindow
    : nextWithWindow.filter((s: string) => s !== 'cancelled' && s !== 'refunded');

  const discountCents = order.discountCents ?? 0;
  const loyaltyUsed   = order.loyaltyPointsUsed ?? 0;
  const loyaltyEarned = order.loyaltyPointsEarned ?? 0;
  const isDineIn = (order as any).source === 'dine_in';
  const tableNumber = (order as any).tableNumber ?? null;
  const orderType = isDineIn ? 'Dine-In'
    : order.type === 'delivery' || order.deliveryType === 'delivery'
    ? 'Delivery' : order.scheduledFor ? 'Scheduled' : 'Pickup';

  const triggerCancel = (status: string) => {
    setPendingStatus(status); setCancelReasonText(''); setShowCancelModal(true);
  };

  // Wholesale: directly advance to the single next forward status — no Alert.
  const handleWholesaleForward = () => {
    const forwardStatus = WHOLESALE_FORWARD[order.status];
    if (!forwardStatus) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUpdating(true);
    onStatusChange(order.id, forwardStatus).finally(() => setUpdating(false));
  };

  // Wholesale: "Update Status" link — all statuses except current, no cancel/refund.
  const handleWholesaleUpdateStatus = () => {
    const options = WHOLESALE_ALL_STATUSES.filter(s => s !== order.status);
    if (options.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Update Status', 'Move this order to:', [
      ...options.map(s => ({
        text: STATUS_LABEL[s] ?? s,
        onPress: () => {
          setUpdating(true);
          onStatusChange(order.id, s).finally(() => setUpdating(false));
        },
      })),
      { text: 'Dismiss', style: 'cancel' as const },
    ]);
  };

  // Wholesale: "Cancel / Refund Order" button — shows two options then reason modal.
  const handleWholesaleCancelRefund = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Cancel or Refund', 'Choose an action:', [
      { text: 'Cancel Order',    onPress: () => triggerCancel('cancelled') },
      { text: 'Process Refund',  onPress: () => triggerCancel('refunded') },
      { text: 'Dismiss', style: 'cancel' as const },
    ]);
  };

  // Non-wholesale: existing catch-all (retail / customer orders).
  const handleChangeStatus = () => {
    if (next.length === 0) {
      Alert.alert('No Changes Available', `This order is ${label} and has no further status options.`); return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Update Status', 'Select action:', [
      ...next.map(s => ({
        text: ACTION_LABEL[s] ?? STATUS_LABEL[s] ?? s,
        onPress: () => {
          if (s === 'cancelled' || s === 'refunded') {
            triggerCancel(s);
          } else {
            setUpdating(true);
            onStatusChange(order.id, s).finally(() => setUpdating(false));
          }
        },
      })),
      { text: 'Dismiss', style: 'cancel' as const },
    ]);
  };

  const handleConfirmCancel = async () => {
    if (!cancelReasonText.trim()) return;
    Keyboard.dismiss();
    const reason = cancelReasonText.trim();
    setShowCancelModal(false); setCancelReasonText('');
    setUpdating(true);
    await onStatusChange(order.id, pendingStatus, reason);
    setUpdating(false);
  };

  const timeline = getTimeline(order);
  const isCancelledOrRefunded = ['cancelled', 'refunded'].includes(order.status);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>

        {/* ── Back nav bar ──────────────────────────────────────── */}
        <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 4, paddingBottom: 0, backgroundColor: BG }}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', padding: 8, opacity: pressed ? 0.7 : 1 })}
          >
            <Feather name="chevron-left" size={26} color={BRAND} />
            <Text style={{ fontSize: 17, fontWeight: '500', color: BRAND }}>Orders</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero ──────────────────────────────────────────────── */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 8, marginBottom: 20 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={d.heroOrder}>{orderRef}</Text>
              {order.customerName && <Text style={d.heroName}>{order.customerName}</Text>}
              <Text style={d.heroDate}>
                {new Date(order.createdAt).toLocaleDateString([], {
                  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                })} · {fmtTime(order.createdAt)}
              </Text>
            </View>
            <View style={d.typeBadge}>
              <Text style={d.typeBadgeText}>{orderType.toUpperCase()}</Text>
            </View>
          </View>

          {/* ── Contact buttons ────────────────────────────────────── */}
          {(() => {
            const wholesaleAddr = isWholesale
              ? (order.deliveryAddress ?? [(order as any).street, (order as any).suburb, (order as any).postcode].filter(Boolean).join(', ') ?? '').trim()
              : '';
            const hasDeliveryAddr = wholesaleAddr.length > 0;
            if (!order.customerPhone && !order.customerEmail && !hasDeliveryAddr) return null;
            return (
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                {order.customerPhone && (
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); Linking.openURL(`tel:${order.customerPhone}`); }}
                    style={({ pressed }) => [d.contactCard, { opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Feather name="phone" size={20} color={BRAND} />
                    <Text style={d.contactLabel}>Call</Text>
                  </Pressable>
                )}
                {order.customerEmail && (
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); Linking.openURL(`mailto:${order.customerEmail}`); }}
                    style={({ pressed }) => [d.contactCard, { opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Feather name="mail" size={20} color={BRAND} />
                    <Text style={d.contactLabel}>Email</Text>
                  </Pressable>
                )}
                {hasDeliveryAddr && (
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); openMapWithChoice(wholesaleAddr); }}
                    style={({ pressed }) => [d.contactCard, { flex: 2, opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Feather name="map-pin" size={20} color={BRAND} />
                    <Text style={[d.contactLabel, { flex: 1 }]} numberOfLines={1}>{wholesaleAddr}</Text>
                  </Pressable>
                )}
              </View>
            );
          })()}

          {/* ── Scheduled awaiting acceptance banner ───────────────── */}
          {order.status === 'scheduled' && (
            <View style={{ backgroundColor: AMBER_DIM, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: AMBER + '50', gap: 12, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="clock" size={16} color={AMBER} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: AMBER, flex: 1 }}>Awaiting Acceptance</Text>
              </View>
              {(order.scheduledFor ?? (order as any).scheduledDate) && (() => {
                const scheduledTs = order.scheduledFor ?? (order as any).scheduledDate;
                const isDelivery = order.type === 'delivery' || (order as any).deliveryType === 'delivery';
                return (
                  <Text style={{ fontSize: 13, color: AMBER }}>
                    {isDelivery ? 'Delivery' : 'Pickup'} scheduled for{' '}
                    {new Date(scheduledTs).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' })}
                    {!isDelivery ? ` at ${new Date(scheduledTs).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })}` : ''}
                  </Text>
                );
              })()}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Alert.alert('Accept Order', `Confirm this ${order.type === 'delivery' ? 'delivery' : 'pickup'} order?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Accept', onPress: () => { setAccepting(true); onAcceptOrder(order.id).finally(() => setAccepting(false)); } },
                  ]);
                }}
                disabled={accepting}
                style={{ backgroundColor: accepting ? TEXT_MUTED : AMBER, borderRadius: 12, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {accepting ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Feather name="check-circle" size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Accept & Confirm {order.type === 'delivery' ? 'Delivery' : 'Pickup'}</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {order.status === 'accepted' && (order.scheduledFor ?? (order as any).scheduledDate) && (() => {
            const scheduledTs = order.scheduledFor ?? (order as any).scheduledDate;
            const isDelivery = order.type === 'delivery' || (order as any).deliveryType === 'delivery';
            return (
              <View style={{ backgroundColor: GREEN_DIM, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: GREEN + '50', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Feather name="check-circle" size={16} color={GREEN} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: GREEN, flex: 1 }}>
                  Confirmed for {new Date(scheduledTs).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' })}
                  {!isDelivery ? ` at ${new Date(scheduledTs).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })}` : ''}
                </Text>
              </View>
            );
          })()}

          {(order.scheduledFor ?? (order as any).scheduledDate) && (() => {
            const scheduledTs = order.scheduledFor ?? (order as any).scheduledDate;
            const isDelivery = order.type === 'delivery' || (order as any).deliveryType === 'delivery';
            return (
              <View style={{ backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#BFDBFE', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Feather name="calendar" size={14} color="#1D4ED8" />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1D4ED8', flex: 1 }}>
                  {isDelivery ? 'Scheduled Delivery · ' : 'Scheduled Pickup · '}
                  {new Date(scheduledTs).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' })}
                  {' at '}
                  {new Date(scheduledTs).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })}
                </Text>
              </View>
            );
          })()}

          {/* ── Pending customer approval banner ────────────────────── */}
          {order.status === 'pending_customer_approval' && (
            <View style={{ backgroundColor: AMBER_DIM, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: AMBER + '50', gap: 10, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: AMBER }} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: AMBER, flex: 1 }}>Awaiting Customer Approval</Text>
              </View>
              {(order as any).modificationReason && (
                <Text style={{ fontSize: 13, color: AMBER, fontStyle: 'italic' }}>Reason: "{(order as any).modificationReason}"</Text>
              )}
              {(order as any).modificationExpiresAt && (
                <Text style={{ fontSize: 13, color: AMBER }}>
                  Customer must respond by {new Date((order as any).modificationExpiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })} — auto-cancels if unanswered
                </Text>
              )}
            </View>
          )}

          {/* ── Status Timeline ────────────────────────────────────── */}
          {!isCancelledOrRefunded && (
            <View style={[d.card, { marginBottom: 20 }]}>
              <Text style={d.cardTitle}>Status</Text>
              <View style={{ gap: 16, marginTop: 14 }}>
                {timeline.map((step, i) => (
                  <TimelineStep key={i} label={step.label} done={step.done} current={step.current} />
                ))}
              </View>
              {(isWholesale
                ? !isCancelledOrRefunded && order.status !== 'delivered' && WHOLESALE_ALL_STATUSES.filter(s => s !== order.status).length > 0
                : next.length > 0
              ) && (
                <Pressable
                  onPress={isWholesale ? handleWholesaleUpdateStatus : handleChangeStatus}
                  disabled={updating}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER }}
                >
                  {updating
                    ? <ActivityIndicator color={BRAND} size="small" />
                    : <>
                        <Feather name="edit-3" size={14} color={BRAND} />
                        <Text style={{ color: BRAND, fontWeight: '600', fontSize: 14 }}>Update Status</Text>
                      </>
                  }
                </Pressable>
              )}
            </View>
          )}

          {/* Cancelled / refunded status badge */}
          {isCancelledOrRefunded && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <View style={[d.typeBadge, { backgroundColor: colors.bg, borderColor: colors.bg }]}>
                <Text style={[d.typeBadgeText, { color: colors.text }]}>{label.toUpperCase()}</Text>
              </View>
              {next.length > 0 && (
                <Pressable onPress={handleChangeStatus} disabled={updating} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {updating ? <ActivityIndicator color={BRAND} size="small" /> : (
                    <><Feather name="edit-3" size={13} color={BRAND} /><Text style={{ color: BRAND, fontWeight: '600', fontSize: 13 }}>Update</Text></>
                  )}
                </Pressable>
              )}
            </View>
          )}

          {/* ── Primary CTA ────────────────────────────────────────── */}
          {isWholesale ? (
            // Wholesale: blue button advances directly — no modal.
            WHOLESALE_FORWARD[order.status] && (
              <Pressable
                onPress={handleWholesaleForward}
                disabled={updating}
                style={({ pressed }) => [d.primaryBtn, { opacity: pressed || updating ? 0.8 : 1 }]}
              >
                {updating
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={d.primaryBtnText}>
                      {ACTION_LABEL[WHOLESALE_FORWARD[order.status]] ??
                       `Mark as ${STATUS_LABEL[WHOLESALE_FORWARD[order.status]] ?? ''}`}
                    </Text>
                }
              </Pressable>
            )
          ) : (
            // Non-wholesale: existing behaviour.
            next.filter(s => s !== 'cancelled' && s !== 'refunded').length > 0 && (
              <Pressable
                onPress={handleChangeStatus}
                disabled={updating}
                style={({ pressed }) => [d.primaryBtn, { opacity: pressed || updating ? 0.8 : 1 }]}
              >
                {updating
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={d.primaryBtnText}>
                      {ACTION_LABEL[next.filter(s => s !== 'cancelled' && s !== 'refunded')[0]] ??
                       `Mark as ${STATUS_LABEL[next.filter(s => s !== 'cancelled' && s !== 'refunded')[0]] ?? ''}`}
                    </Text>
                }
              </Pressable>
            )
          )}

          {/* ── Modify Order button — non-wholesale, modifiable statuses only ── */}
          {!isWholesale && ['received', 'scheduled', 'accepted', 'being_prepared'].includes(order.status) && (
            <Pressable
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setModifyItems(normalizeOrderItems(order.items).map(li => ({
                  productId: (li as any).productId ?? null,
                  variantId: (li as any).variantId ?? null,
                  name: li.name,
                  variantName: li.variantName,
                  quantity: li.quantity,
                  unitCents: (li as any).unitCents ?? Math.round(li.lineTotalCents / Math.max(li.quantity, 1)),
                })));
                setModifyReason('');
                setProdPickerQ('');
                setShowModifySheet(true);
                setLoadingProds(true);
                try {
                  const res = await api.director.availableProductsForOrder(order.id);
                  setAvailProds(res.data ?? []);
                } catch { setAvailProds([]); } finally { setLoadingProds(false); }
              }}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, backgroundColor: AMBER_DIM, borderWidth: 1, borderColor: AMBER + '40', marginBottom: 16, opacity: pressed ? 0.8 : 1 }]}
            >
              <Feather name="edit-2" size={15} color={AMBER} />
              <Text style={{ color: AMBER, fontWeight: '600', fontSize: 15 }}>Modify Order</Text>
            </Pressable>
          )}

          {/* ── Items card ─────────────────────────────────────────── */}
          <View style={[d.card, { marginBottom: 20 }]}>
            <View style={{ paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, marginBottom: 14 }}>
              <Text style={d.cardTitle}>Order Items</Text>
            </View>
            {items.map((item, i) => (
              <View key={i} style={[{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: 12, gap: 8 }, i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, marginBottom: 12 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: TEXT }}>
                    <Text style={{ color: TEXT_MUTED }}>{item.quantity}×  </Text>
                    {item.name}{item.variantName ? ` · ${item.variantName}` : ''}
                    {item.isFreeReward ? ' 🎁' : ''}
                  </Text>
                  {item.notableOptions.length > 0 && (
                    <Text style={{ fontSize: 13, color: TEXT_MUTED, marginLeft: 24 }}>{item.notableOptions.join(' · ')}</Text>
                  )}
                  {item.baristaNote ? (
                    <Text style={{ fontSize: 13, color: TEXT_MUTED, marginLeft: 24, fontStyle: 'italic' }}>"{item.baristaNote}"</Text>
                  ) : null}
                  {item.boxContents.length > 0 && (
                    <View style={{ marginLeft: 24, marginTop: 2, gap: 1 }}>
                      {item.boxContents.map((cookie, ci) => (
                        <Text key={ci} style={{ fontSize: 12, color: TEXT_MUTED }}>· {cookie}</Text>
                      ))}
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 15, fontWeight: '500', color: TEXT, flexShrink: 0 }}>
                  ${(item.lineTotalCents / 100).toFixed(2)}
                </Text>
              </View>
            ))}
            {/* Summary footer */}
            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, paddingTop: 14, marginTop: 2, gap: 8, backgroundColor: '#FAFAFA', marginHorizontal: -16, paddingHorizontal: 16 }}>
              {discountCents > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, color: TEXT_MUTED }}>Discount</Text>
                  <Text style={{ fontSize: 14, color: GREEN }}>−${(discountCents / 100).toFixed(2)}</Text>
                </View>
              )}
              {loyaltyUsed > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, color: TEXT_MUTED }}>Points redeemed</Text>
                  <Text style={{ fontSize: 14, color: GREEN }}>−{loyaltyUsed} pts</Text>
                </View>
              )}
              {isWholesale && (order.deliveryFeeCents ?? 0) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, color: TEXT_MUTED }}>Delivery fee</Text>
                  <Text style={{ fontSize: 14, color: TEXT }}>${((order.deliveryFeeCents ?? 0) / 100).toFixed(2)}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>Total</Text>
                <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>${((order.totalCents ?? 0) / 100).toFixed(2)}</Text>
              </View>
              {loyaltyEarned > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: TEXT_MUTED }}>Points earned</Text>
                  <Text style={{ fontSize: 13, color: AMBER }}>+{loyaltyEarned} pts</Text>
                </View>
              )}
              {isWholesale && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 2, flexWrap: 'wrap', gap: 2 }}>
                  <Text style={{ fontSize: 13, color: TEXT_MUTED }}>Payment</Text>
                  {isWholesaleOrderPaid(order) ? (
                    <Text style={{ fontSize: 13, fontWeight: '600', color: GREEN }}>
                      {(order as any).paidAt
                        ? `Paid on ${new Date((order as any).paidAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${new Date((order as any).paidAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`
                        : 'Paid'}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 13, fontWeight: '600', color: RED }}>Awaiting Payment</Text>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* ── Secondary actions card ─────────────────────────────── */}
          <View style={[d.card, { marginBottom: 20 }]}>
            <SecondaryActionRow
              icon="printer"
              label="Print Receipt"
              onPress={onPrintReceipt}
              loading={printing}
            />
            {isWholesale && (order.invoicePdfUrl || order.invoiceUrl || order.stripeInvoiceId) && (
              <SecondaryActionRow
                icon="file-text"
                label={`View Invoice ${order.invoiceNumber ?? ''}`}
                onPress={onViewInvoice}
              />
            )}
            {order.customerEmail && (
              <SecondaryActionRow
                icon="user"
                label="Message Customer"
                onPress={() => { Haptics.selectionAsync(); Linking.openURL(`mailto:${order.customerEmail}`); }}
                border={false}
              />
            )}
          </View>

          {/* ── Wholesale action buttons ───────────────────────────── */}
          {isWholesale && (
            <View style={{ gap: 10, marginBottom: 20 }}>
              {onEditWholesale && !isWholesaleOrderPaid(order) && !['dispatched', 'delivered', 'cancelled', 'refunded', 'completed'].includes(order.status) && (
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onEditWholesale(order); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, backgroundColor: BRAND + '12', borderWidth: 1, borderColor: BRAND + '40' }}
                >
                  <Feather name="edit-3" size={15} color={BRAND} />
                  <Text style={{ color: BRAND, fontWeight: '600', fontSize: 15 }}>Edit Items</Text>
                </Pressable>
              )}
              {onMarkPaid && !isWholesaleOrderPaid(order) && (
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onMarkPaid(order); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, backgroundColor: GREEN_DIM, borderWidth: 1, borderColor: GREEN + '40' }}
                >
                  <Feather name="check-circle" size={15} color={GREEN} />
                  <Text style={{ color: GREEN, fontWeight: '600', fontSize: 15 }}>Mark as Paid</Text>
                </Pressable>
              )}
              {onAdjustWholesale && isWholesaleOrderPaid(order) && (
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAdjustWholesale(order); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, backgroundColor: RED_DIM, borderWidth: 1, borderColor: RED + '40' }}
                >
                  <Feather name="refresh-ccw" size={15} color={RED} />
                  <Text style={{ color: RED, fontWeight: '600', fontSize: 15 }}>Adjust / Credit</Text>
                </Pressable>
              )}
              {onSendRevisedInvoice && ((order as any).editHistory?.length > 0 || (order as any).creditMemos?.length > 0) && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Alert.alert('Send Revised Invoice', 'Resend an updated invoice to the accounts email?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Send', onPress: () => onSendRevisedInvoice(order) },
                    ]);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, backgroundColor: PURPLE_DIM, borderWidth: 1, borderColor: PURPLE + '40' }}
                >
                  <Feather name="send" size={15} color={PURPLE} />
                  <Text style={{ color: PURPLE, fontWeight: '600', fontSize: 15 }}>Resend Revised Invoice</Text>
                </Pressable>
              )}
              {/* Cancel / Refund — separate from the status flow, always at the bottom */}
              {canCancelRefund && !isCancelledOrRefunded && (
                <Pressable
                  onPress={handleWholesaleCancelRefund}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, backgroundColor: RED_DIM, borderWidth: 1, borderColor: RED + '40' }}
                >
                  <Feather name="x-circle" size={15} color={RED} />
                  <Text style={{ color: RED, fontWeight: '600', fontSize: 15 }}>Cancel / Refund Order</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* ── Dine-in table details ──────────────────────────────── */}
          {isDineIn && (
            <View style={[d.card, { marginBottom: 20 }]}>
              <Text style={d.cardTitle}>Dine-In Details</Text>
              <View style={{ gap: 8, marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: AMBER + '18', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: AMBER + '40' }}>
                  <Feather name="coffee" size={15} color={AMBER} />
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: AMBER }}>
                    Dine-in{tableNumber ? ` · Table ${tableNumber}` : ''}
                  </Text>
                </View>
                {(order.contactName || order.contactPhone) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Feather name="user" size={15} color={TEXT_MUTED} />
                    <Text style={{ fontSize: 14, color: TEXT }}>
                      {[order.contactName, order.contactPhone].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ── Delivery / pickup details ───────────────────────────── */}
          {!isDineIn && (order.deliveryAddress || order.street || order.scheduledFor || (order as any).scheduledDate || order.contactName) && (
            <View style={[d.card, { marginBottom: 20 }]}>
              <Text style={d.cardTitle}>
                {order.type === 'delivery' || order.deliveryType === 'delivery' ? 'Delivery Details' : (order.scheduledFor ?? (order as any).scheduledDate) ? 'Pickup Details' : 'ASAP Pickup'}
              </Text>
              <View style={{ gap: 8, marginTop: 10 }}>
                {(order.deliveryAddress || order.street) && (() => {
                  const addr = order.deliveryAddress ?? [order.street, (order as any).suburb, (order as any).postcode].filter(Boolean).join(', ');
                  return (
                    <Pressable
                      onPress={() => { openMapWithChoice(addr); Haptics.selectionAsync(); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BRAND + '10', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BRAND + '30' }}
                    >
                      <Feather name="navigation" size={15} color={BRAND} />
                      <Text style={{ flex: 1, fontSize: 14, color: BRAND }}>{addr}</Text>
                      <Feather name="external-link" size={13} color={BRAND} />
                    </Pressable>
                  );
                })()}
                {(order.scheduledFor ?? (order as any).scheduledDate) && (() => {
                  const scheduledTs = order.scheduledFor ?? (order as any).scheduledDate;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Feather name="calendar" size={15} color={TEXT_MUTED} />
                      <Text style={{ fontSize: 14, color: TEXT }}>
                        {new Date(scheduledTs).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' })}
                        {` at ${new Date(scheduledTs).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })}`}
                      </Text>
                    </View>
                  );
                })()}
                {order.contactName && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Feather name="user" size={15} color={TEXT_MUTED} />
                    <Text style={{ fontSize: 14, color: TEXT }}>{order.contactName}</Text>
                  </View>
                )}
                {order.contactPhone && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Feather name="phone" size={15} color={TEXT_MUTED} />
                    <Text style={{ fontSize: 14, color: TEXT }}>{order.contactPhone}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ── Notes ──────────────────────────────────────────────── */}
          {order.notes && (
            <View style={[d.card, { marginBottom: 20 }]}>
              <Text style={d.cardTitle}>Notes</Text>
              <Text style={{ fontSize: 14, color: TEXT, marginTop: 10, lineHeight: 20 }}>{order.notes}</Text>
            </View>
          )}

          {/* ── Cancellation reason ────────────────────────────────── */}
          {order.cancelReason && (
            <View style={{ backgroundColor: RED_DIM, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: RED + '40', gap: 8, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="x-circle" size={14} color={RED} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: RED, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cancellation Reason</Text>
              </View>
              <Text style={{ fontSize: 14, color: RED, lineHeight: 20 }}>{order.cancelReason}</Text>
            </View>
          )}

          {/* ── PO reference (wholesale) ───────────────────────────── */}
          {isWholesale && order.poReference && (
            <View style={[d.card, { marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
              <Feather name="file-text" size={15} color={TEXT_MUTED} />
              <Text style={{ fontSize: 14, color: TEXT_MUTED }}>PO Reference: </Text>
              <Text style={{ fontSize: 14, color: TEXT, fontWeight: '600' }}>{order.poReference}</Text>
            </View>
          )}
        </ScrollView>

        {/* ── Modify Order sheet ───────────────────────────────────── */}
        <Modal
          visible={showModifySheet}
          transparent
          animationType="slide"
          onRequestClose={() => { Keyboard.dismiss(); setShowModifySheet(false); }}
        >
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
              <Pressable style={{ flex: 1 }} onPress={() => { Keyboard.dismiss(); setShowModifySheet(false); }} />
              <View style={{ backgroundColor: SURFACE_RAISED, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', borderWidth: 1, borderBottomWidth: 0, borderColor: BORDER }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                  <Pressable onPress={() => { Keyboard.dismiss(); setShowModifySheet(false); }} style={{ padding: 6 }}>
                    <Feather name="x" size={20} color={TEXT} />
                  </Pressable>
                  <Text style={{ flex: 1, textAlign: 'center', fontWeight: '700', fontSize: 16, color: TEXT }}>Modify Order</Text>
                  <View style={{ width: 32 }} />
                </View>
                <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                  {/* A: Current items */}
                  <Text style={{ fontSize: 11, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current Items</Text>
                  {modifyItems.map((item, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: item.quantity === 0 ? RED_DIM : SURFACE, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: item.quantity === 0 ? RED + '40' : BORDER }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: item.quantity === 0 ? RED : TEXT, textDecorationLine: item.quantity === 0 ? 'line-through' : 'none' }}>
                          {item.name}{item.variantName ? ` · ${item.variantName}` : ''}
                        </Text>
                        <Text style={{ fontSize: 12, color: TEXT_MUTED }}>${((item.unitCents ?? 0) / 100).toFixed(2)} each</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Pressable
                          onPress={() => setModifyItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(0, (it.quantity ?? 1) - 1) } : it))}
                          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Feather name="minus" size={14} color={item.quantity === 0 ? RED : TEXT} />
                        </Pressable>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: item.quantity === 0 ? RED : TEXT, minWidth: 22, textAlign: 'center' }}>{item.quantity ?? 1}</Text>
                        <Pressable
                          onPress={() => setModifyItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: (it.quantity ?? 1) + 1 } : it))}
                          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Feather name="plus" size={14} color={TEXT} />
                        </Pressable>
                      </View>
                    </View>
                  ))}

                  {/* B: Add items picker */}
                  <Text style={{ fontSize: 11, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>Add Items</Text>
                  <TextInput
                    style={{ backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: TEXT }}
                    placeholder="Search products…"
                    placeholderTextColor={TEXT_MUTED}
                    value={prodPickerQ}
                    onChangeText={setProdPickerQ}
                  />
                  {loadingProds ? <ActivityIndicator size="small" color={BRAND} /> : (
                    <View style={{ gap: 6 }}>
                      {(prodPickerQ.trim()
                        ? availProds.filter(p => p.name.toLowerCase().includes(prodPickerQ.toLowerCase()) || p.variants?.some((v: any) => v.name.toLowerCase().includes(prodPickerQ.toLowerCase())))
                        : availProds.slice(0, 20)
                      ).map((p: any) => (
                        <View key={p.id}>
                          {p.variants.length === 0 && (
                            <Pressable
                              onPress={() => setModifyItems(prev => {
                                const ex = prev.findIndex(it => it.productId === p.id && !it.variantId);
                                if (ex >= 0) return prev.map((it, i) => i === ex ? { ...it, quantity: it.quantity + 1 } : it);
                                return [...prev, { productId: p.id, variantId: null, name: p.name, variantName: null, quantity: 1, unitCents: p.salePriceCents ?? p.priceCents }];
                              })}
                              style={({ pressed }) => [{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: BORDER, opacity: pressed ? 0.7 : 1 }]}
                            >
                              <Text style={{ fontSize: 13, fontWeight: '500', color: TEXT }}>{p.name}</Text>
                              <Text style={{ fontSize: 13, color: BRAND, fontWeight: '700' }}>+ ${((p.salePriceCents ?? p.priceCents) / 100).toFixed(2)}</Text>
                            </Pressable>
                          )}
                          {p.variants.map((v: any) => (
                            <Pressable
                              key={v.id}
                              onPress={() => setModifyItems(prev => {
                                const ex = prev.findIndex(it => it.productId === p.id && it.variantId === v.id);
                                if (ex >= 0) return prev.map((it, i) => i === ex ? { ...it, quantity: it.quantity + 1 } : it);
                                return [...prev, { productId: p.id, variantId: v.id, name: p.name, variantName: v.name, quantity: 1, unitCents: v.priceCents }];
                              })}
                              style={({ pressed }) => [{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 10, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: BORDER, opacity: pressed ? 0.7 : 1 }]}
                            >
                              <Text style={{ fontSize: 13, color: TEXT }}>{p.name} · <Text style={{ fontWeight: '600' }}>{v.name}</Text></Text>
                              <Text style={{ fontSize: 13, color: BRAND, fontWeight: '700' }}>+ ${(v.priceCents / 100).toFixed(2)}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* C: Reason */}
                  <Text style={{ fontSize: 11, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>Reason for Change *</Text>
                  <TextInput
                    style={{ backgroundColor: SURFACE, borderWidth: 1, borderColor: modifyReason.trim() ? BORDER : RED + '60', borderRadius: 12, padding: 14, fontSize: 15, color: TEXT, minHeight: 80, textAlignVertical: 'top' }}
                    placeholder="e.g. Item out of stock — replaced with similar product"
                    placeholderTextColor={TEXT_MUTED}
                    value={modifyReason}
                    onChangeText={setModifyReason}
                    multiline
                  />

                  {/* Live total */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: TEXT }}>New Total</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: BRAND }}>
                      ${(modifyItems.reduce((s, it) => s + (it.unitCents ?? 0) * Math.max(it.quantity ?? 0, 0), 0) / 100).toFixed(2)}
                    </Text>
                  </View>

                  {/* Send for Approval */}
                  {(() => {
                    const canSend = modifyReason.trim().length > 0 && modifyItems.some(it => (it.quantity ?? 0) > 0);
                    return (
                      <>
                        <Pressable
                          disabled={!canSend || modifyLoading}
                          onPress={async () => {
                            const itemsToSend = modifyItems.filter(it => (it.quantity ?? 0) > 0);
                            if (!canSend) return;
                            setModifyLoading(true);
                            try {
                              await api.director.modifyOrderItems(order.id, itemsToSend, modifyReason.trim());
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              setShowModifySheet(false);
                              onClose();
                            } catch (err: any) {
                              Alert.alert('Error', err?.message ?? 'Failed to send modification.');
                            } finally {
                              setModifyLoading(false);
                            }
                          }}
                          style={({ pressed }) => [{ backgroundColor: canSend && !modifyLoading ? BRAND : TEXT_FAINT, borderRadius: 14, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 }]}
                        >
                          {modifyLoading
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <><Feather name="send" size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Send for Approval</Text></>
                          }
                        </Pressable>
                        <Pressable onPress={() => { Keyboard.dismiss(); setShowModifySheet(false); }} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: TEXT_MUTED, fontWeight: '600', fontSize: 14 }}>Discard Changes</Text>
                        </Pressable>
                      </>
                    );
                  })()}
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Cancel / refund reason modal ─────────────────────────── */}
        <Modal
          visible={showCancelModal}
          transparent
          animationType="slide"
          onRequestClose={() => { Keyboard.dismiss(); setShowCancelModal(false); setCancelReasonText(''); }}
        >
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 20 }}
              onPress={() => { Keyboard.dismiss(); setShowCancelModal(false); setCancelReasonText(''); }}
            >
              <Pressable onPress={() => {}} style={{ backgroundColor: SURFACE_RAISED, borderRadius: 20, padding: 24, gap: 16, borderWidth: 1, borderColor: BORDER }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: RED_DIM, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="x-circle" size={18} color={RED} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>{pendingStatus === 'refunded' ? 'Confirm Refund' : 'Cancel Order'}</Text>
                    <Text style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 2 }}>A reason is required before continuing.</Text>
                  </View>
                </View>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: TEXT_MUTED, letterSpacing: 0.6, marginBottom: 8 }}>REASON FOR CANCELLATION *</Text>
                  <TextInput
                    style={{ backgroundColor: SURFACE, borderWidth: 1, borderColor: cancelReasonText.trim() ? BORDER : RED + '60', borderRadius: 12, padding: 14, fontSize: 15, color: TEXT, minHeight: 90, textAlignVertical: 'top' }}
                    placeholder="e.g. Customer requested cancellation, item out of stock, duplicate order…"
                    placeholderTextColor={TEXT_MUTED}
                    value={cancelReasonText}
                    onChangeText={setCancelReasonText}
                    multiline
                    autoFocus
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() => { setShowCancelModal(false); setCancelReasonText(''); }}
                    style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: SURFACE_RAISED, borderWidth: 1, borderColor: BORDER, opacity: pressed ? 0.7 : 1 })}
                  >
                    <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14 }}>Go Back</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleConfirmCancel}
                    disabled={!cancelReasonText.trim()}
                    style={({ pressed }) => ({ flex: 2, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: cancelReasonText.trim() ? RED : TEXT_FAINT, opacity: pressed ? 0.8 : 1 })}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                      {pendingStatus === 'refunded' ? 'Confirm Refund' : 'Cancel Order'}
                    </Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const d = StyleSheet.create({
  heroOrder:    { fontSize: 28, fontWeight: '700', color: TEXT, letterSpacing: -0.5, lineHeight: 32 },
  heroName:     { fontSize: 22, fontWeight: '600', color: TEXT + 'CC', lineHeight: 28, marginTop: 2 },
  heroDate:     { fontSize: 13, color: TEXT_MUTED, marginTop: 4 },

  typeBadge:    { backgroundColor: SURFACE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  typeBadgeText:{ fontSize: 13, fontWeight: '700', color: TEXT, textTransform: 'uppercase', letterSpacing: 0.5 },

  contactCard:  { flex: 1, backgroundColor: SURFACE, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  contactLabel: { fontSize: 11, fontWeight: '600', color: BRAND },

  card:         { backgroundColor: SURFACE, borderRadius: 20, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  cardTitle:    { fontSize: 15, fontWeight: '600', color: TEXT },

  timelineDot:  { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  primaryBtn:   { backgroundColor: BRAND, borderRadius: 14, height: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: BRAND, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  primaryBtnText:{ fontSize: 17, fontWeight: '700', color: '#fff' },

  actionRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
});
