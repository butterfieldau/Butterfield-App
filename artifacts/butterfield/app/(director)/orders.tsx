import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView,
  Linking, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getWholesaleInvoiceUrl } from '@/lib/api';
import type { ApiOrder, PosTransaction } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { orderToPrintJob, sendReceiptPrint } from '@/lib/printer';
import { normalizeOrderItems, summarizeOrderItems } from '@/lib/orderItems';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
import {
  STATUS_COLORS, STATUS_LABEL, ACTION_LABEL, WHOLESALE_NEXT,
  getCustomerNextStatuses, ORDER_STATUS_SECTIONS, getOrderSectionKey,
} from '@/lib/orderStatus';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER      = '#E5E7EB';
const GLASS_BG    = 'rgba(255,255,255,0.6)';
const GLASS_BORDER= 'rgba(255,255,255,0.85)';
const GREEN  = '#22C55E';
const NAVY   = '#1A2B4A';
const PURPLE = '#8B5CF6';
const RED_CONST = '#DC2626';
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const FILTER_TABS = [
  { key: 'all',              label: 'All' },
  { key: 'active',           label: 'Active' },
  { key: 'scheduled_all',    label: 'Scheduled' },
  { key: 'received',         label: 'Pending' },
  { key: 'being_prepared',   label: 'Preparing' },
  { key: 'ready_for_pickup', label: 'Ready' },
  { key: 'completed',        label: 'Done' },
  { key: 'wholesale',        label: 'Wholesale' },
  { key: 'cancelled',        label: 'Cancelled' },
];

function fmtHourLabel(h: number) {
  if (h === 0)  return '12:00 AM';
  if (h === 12) return '12:00 PM';
  return h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`;
}

function isThisMonth(d: Date | string) {
  const date = new Date(d);
  const now   = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}
// ── Map helper ────────────────────────────────────────────────────────────────
function openMap(address: string) {
  const q = encodeURIComponent(address);
  const url = Platform.OS === 'ios'
    ? `maps://maps.apple.com/?q=${q}`
    : `https://maps.google.com/?q=${q}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${q}`));
}
// ── Date helpers ──────────────────────────────────────────────────────────────
function startOfDay(d: Date) {
  const r = new Date(d); r.setHours(0,0,0,0); return r;
}
function isSameDay(a: Date | string, b: Date) {
  const ad = new Date(a);
  return ad.getFullYear() === b.getFullYear() &&
    ad.getMonth() === b.getMonth() && ad.getDate() === b.getDate();
}
function isThisWeek(d: Date | string) {
  const date = new Date(d);
  const now  = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
  return date >= weekAgo;
}
function fmtTime(d: Date | string) {
  return new Date(d).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function getOrderTimelineDate(order: ApiOrder) {
  if (order.orderSource !== 'wholesale' && order.scheduledFor) {
    return new Date(order.scheduledFor);
  }
  return new Date(order.createdAt);
}

function fmtDateChip(d: Date) {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}
function getPastDays(n: number) {
  const days: Date[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
// ── Order Detail Modal ────────────────────────────────────────────────────────
function OrderDetailModal({ order, visible, onClose, onStatusChange, onAcceptOrder, onPrintReceipt, onViewInvoice, printing, canCancelRefund }: {
  order: ApiOrder | null; visible: boolean; onClose: () => void;
  onStatusChange: (id: string, status: string, cancelReason?: string) => Promise<void>;
  onAcceptOrder: (id: string) => Promise<void>;
  onPrintReceipt: () => Promise<void>;
  onViewInvoice: () => Promise<void>;
  printing: boolean;
  canCancelRefund: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [updating, setUpdating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [pendingStatus, setPendingStatus] = useState('');

  if (!order) return null;
  const isWholesale = order.orderSource === 'wholesale';
  const items = normalizeOrderItems(order.items);
  const colors = STATUS_COLORS[order.status] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const label  = STATUS_LABEL[order.status] ?? order.status;
  const RED = '#DC2626';
  const AMBER = '#F59E0B';

  // 2-week cancellation window for completed/delivered orders
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

  const triggerCancel = (status: string) => {
    setPendingStatus(status);
    setCancelReasonText('');
    setShowCancelModal(true);
  };

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
    setShowCancelModal(false);
    setCancelReasonText('');
    setUpdating(true);
    await onStatusChange(order.id, pendingStatus, reason);
    setUpdating(false);
  };
  const discountCents = order.discountCents ?? 0;
  const loyaltyUsed  = order.loyaltyPointsUsed ?? 0;
  const loyaltyEarned = order.loyaltyPointsEarned ?? 0;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Header */}
        <View style={[styles.modalHeader, { paddingTop: insets.top + 12, backgroundColor: CARD, borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.modalTitle}>
              {isWholesale
                ? `#${order.poReference ?? order.id.slice(0, 8).toUpperCase()}`
                : (order.orderNumber ?? `#${order.id.slice(0, 8).toUpperCase()}`)}
            </Text>
            <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 12 }]}>
              {new Date(order.createdAt).toLocaleDateString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
              })} · {fmtTime(order.createdAt)}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
          {/* Scheduled acceptance banner */}
          {order.status === 'scheduled' && (
            <View style={{ backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#FDE68A', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="clock" size={16} color="#92400E" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E', flex: 1 }}>
                  Awaiting Acceptance
                </Text>
              </View>
              {order.scheduledFor && (
                <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '400' }}>
                  {order.type === 'delivery' ? 'Delivery' : 'Pickup'} scheduled for{' '}
                  {new Date(order.scheduledFor).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {order.type !== 'delivery'
                    ? ` at ${new Date(order.scheduledFor).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}`
                    : ''}
                </Text>
              )}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Alert.alert(
                    'Accept Order',
                    `Confirm this ${order.type === 'delivery' ? 'delivery' : 'pickup'} order and notify the customer?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Accept',
                        onPress: () => {
                          setAccepting(true);
                          onAcceptOrder(order.id).finally(() => setAccepting(false));
                        },
                      },
                    ],
                  );
                }}
                disabled={accepting}
                style={{ backgroundColor: accepting ? MUTED : '#F59E0B', borderRadius: 10, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {accepting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Feather name="check-circle" size={14} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Accept & Confirm {order.type === 'delivery' ? 'Delivery' : 'Pickup'}</Text>
                    </>}
              </Pressable>
            </View>
          )}
          {/* Accepted indicator */}
          {order.status === 'accepted' && order.scheduledFor && (
            <View style={{ backgroundColor: '#DCFCE7', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#86EFAC', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="check-circle" size={16} color="#166534" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#166534', flex: 1 }}>
                Confirmed for {new Date(order.scheduledFor).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                {order.type !== 'delivery'
                  ? ` at ${new Date(order.scheduledFor).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}`
                  : ''}
              </Text>
            </View>
          )}
          {/* Status + change button */}
          <View style={[styles.section, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <View>
              <Text style={styles.sectionLabel}>Status</Text>
              <View style={[styles.statusPill, { backgroundColor: colors.bg, marginTop: 4 }]}>
                <Text style={[styles.statusPillText, { color: colors.text }]}>{label}</Text>
              </View>
            </View>
            {next.length > 0 && (
              <Pressable onPress={handleChangeStatus} disabled={updating}
                style={[styles.updateStatusBtn, { backgroundColor: updating ? MUTED : BLUE }]}>
                {updating
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Feather name="edit-3" size={13} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Update Status</Text>
                    </>}
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={onPrintReceipt}
            disabled={printing}
            style={[styles.printBtn, { backgroundColor: printing ? MUTED : TEXT }]}
          >
            {printing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="printer" size={13} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Print receipt</Text>
              </>
            )}
          </Pressable>
          {isWholesale && (order.invoicePdfUrl || order.invoiceUrl || order.stripeInvoiceId) ? (
            <Pressable onPress={onViewInvoice} style={[styles.printBtn, { backgroundColor: NAVY }]}>
              <>
                <Feather name="file-text" size={13} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
                  View invoice {order.invoiceNumber ?? ''}
                </Text>
              </>
            </Pressable>
          ) : null}
          {/* Customer / Account */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{isWholesale ? 'Account' : 'Customer'}</Text>
            <View style={{ gap: 4, marginTop: 6 }}>
              {order.customerName && (
                <View style={styles.detailRow}>
                  <Feather name={isWholesale ? 'briefcase' : 'user'} size={14} color={MUTED} />
                  <Text style={styles.detailText}>{order.customerName}</Text>
                </View>
              )}
              {order.customerEmail && (
                <View style={styles.detailRow}>
                  <Feather name="mail" size={14} color={MUTED} />
                  <Text style={styles.detailText}>{order.customerEmail}</Text>
                </View>
              )}
              {order.customerPhone && (
                <View style={styles.detailRow}>
                  <Feather name="phone" size={14} color={MUTED} />
                  <Text style={styles.detailText}>{order.customerPhone}</Text>
                </View>
              )}
              {order.companyAbn && (
                <View style={styles.detailRow}>
                  <Feather name="hash" size={14} color={MUTED} />
                  <Text style={styles.detailText}>ABN: {order.companyAbn}</Text>
                </View>
              )}
              {isWholesale && order.poReference && (
                <View style={styles.detailRow}>
                  <Feather name="file-text" size={14} color={MUTED} />
                  <Text style={styles.detailText}>PO: {order.poReference}</Text>
                </View>
              )}
            </View>
          </View>
          {/* Delivery / Pickup */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {(order.type === 'delivery' || order.deliveryType === 'delivery')
                ? 'Delivery Details'
                : order.scheduledFor ? 'Pickup Details' : 'ASAP Pickup Details'}
            </Text>
            <View style={{ gap: 4, marginTop: 6 }}>
              <View style={styles.detailRow}>
                <Feather name={order.type === 'delivery' || order.deliveryType === 'delivery' ? 'truck' : 'map-pin'} size={14} color={MUTED} />
                <Text style={styles.detailText}>
                  {(order.type === 'delivery' || order.deliveryType === 'delivery')
                    ? 'Delivery'
                    : order.scheduledFor ? 'Pickup' : 'ASAP Pickup'}
                </Text>
              </View>
              {(order.deliveryAddress || order.street) && (() => {
                const addr = order.deliveryAddress ?? [order.street, order.suburb, order.postcode].filter(Boolean).join(', ');
                return (
                  <Pressable
                    onPress={() => { openMap(addr); Haptics.selectionAsync(); }}
                    style={[styles.detailRow, { backgroundColor: '#EFF6FF', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#BFDBFE' }]}
                  >
                    <Feather name="navigation" size={14} color="#1E40AF" />
                    <Text style={[styles.detailText, { flex: 1, color: '#1E40AF' }]}>{addr}</Text>
                    <Feather name="external-link" size={13} color="#1E40AF" />
                  </Pressable>
                );
              })()}
              {order.scheduledDate && (
                <View style={styles.detailRow}>
                  <Feather name="calendar" size={14} color={MUTED} />
                  <Text style={styles.detailText}>
                    {new Date(order.scheduledDate).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                </View>
              )}
              {order.contactName && (
                <View style={styles.detailRow}>
                  <Feather name="user" size={14} color={MUTED} />
                  <Text style={styles.detailText}>{order.contactName}</Text>
                </View>
              )}
              {order.contactPhone && (
                <View style={styles.detailRow}>
                  <Feather name="phone" size={14} color={MUTED} />
                  <Text style={styles.detailText}>{order.contactPhone}</Text>
                </View>
              )}
            </View>
          </View>
          {/* Items */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Items ({items.length})</Text>
            <View style={{ gap: 0, marginTop: 6 }}>
              {items.map((item, i: number) => {
                return (
                  <View key={i} style={[styles.itemRow, i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[{ color: TEXT, fontWeight: '500', fontSize: 14 }]}>
                          {item.name}{item.variantName ? ` · ${item.variantName}` : ''}
                        </Text>
                        {item.isFreeReward && (
                          <View style={{ backgroundColor: '#DCFCE7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#166534', letterSpacing: 0.5 }}>FREE</Text>
                          </View>
                        )}
                        {item.priceOverrideCents !== undefined && (
                          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#92400E', letterSpacing: 0.5 }}>PRICE ADJ</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 12 }]}>
                        {item.quantity} ×{' '}
                        {item.originalPriceCents !== undefined ? (
                          <>
                            <Text style={{ textDecorationLine: 'line-through' }}>${(item.originalPriceCents / 100).toFixed(2)}</Text>
                            {' '}${(item.unitPriceCents / 100).toFixed(2)}
                          </>
                        ) : (
                          `$${(item.unitPriceCents / 100).toFixed(2)}`
                        )}
                      </Text>
                      {item.notableOptions.length > 0 && (
                        <Text style={{ color: BLUE, fontWeight: '400', fontSize: 12 }}>
                          {item.notableOptions.join(' · ')}
                        </Text>
                      )}
                      {item.baristaNote ? (
                        <Text style={{ color: MUTED, fontWeight: '400', fontSize: 11, fontStyle: 'italic' }}>
                          "{item.baristaNote}"
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[{ color: TEXT, fontWeight: '600', fontSize: 14 }]}>
                      ${(item.lineTotalCents / 100).toFixed(2)}
                    </Text>
                  </View>
              );
            })}
            </View>
          </View>
          {/* Financial summary */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Summary</Text>
            <View style={{ gap: 6, marginTop: 6 }}>
              {discountCents > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 13 }]}>Discount</Text>
                  <Text style={[{ color: GREEN, fontWeight: '500', fontSize: 13 }]}>−${(discountCents / 100).toFixed(2)}</Text>
                </View>
              )}
              {loyaltyUsed > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 13 }]}>Points redeemed</Text>
                  <Text style={[{ color: GREEN, fontWeight: '500', fontSize: 13 }]}>−{loyaltyUsed} pts</Text>
                </View>
              )}
              <View style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER }]}>
                <Text style={[{ color: TEXT, fontWeight: '700', fontSize: 15 }]}>Total</Text>
                <Text style={[{ color: BLUE, fontWeight: '700', fontSize: 15 }]}>
                  AUD ${((order.totalCents ?? 0) / 100).toFixed(2)}
                </Text>
              </View>
              {loyaltyEarned > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 12 }]}>Points earned</Text>
                  <Text style={[{ color: '#F59E0B', fontWeight: '500', fontSize: 12 }]}>+{loyaltyEarned} pts</Text>
                </View>
              )}
              {isWholesale && order.isPaid != null && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 12 }]}>Payment</Text>
                  <Text style={[{ color: order.isPaid ? GREEN : '#EF4444', fontWeight: '500', fontSize: 12 }]}>
                    {order.isPaid ? 'Paid' : 'Awaiting Payment'}
                  </Text>
                </View>
              )}
          {/* Notes */}
            </View>
          </View>
          {order.notes ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Notes</Text>
              <Text style={[{ color: TEXT, fontWeight: '400', fontSize: 14, marginTop: 6, lineHeight: 20 }]}>
                {order.notes}
              </Text>
            </View>
          ) : null}
          {order.cancelReason ? (
            <View style={[styles.section, { backgroundColor: '#FEF2F2', borderRadius: 12, borderWidth: 1, borderColor: '#FECACA' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Feather name="x-circle" size={14} color={RED} />
                <Text style={[styles.sectionLabel, { color: RED }]}>Cancellation Reason</Text>
              </View>
              <Text style={{ color: '#7F1D1D', fontWeight: '400', fontSize: 14, lineHeight: 20 }}>
                {order.cancelReason}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* ── Cancel Reason Modal ─────────────────────────────────────────── */}
        <Modal
          visible={showCancelModal}
          transparent
          animationType="slide"
          onRequestClose={() => { Keyboard.dismiss(); setShowCancelModal(false); setCancelReasonText(''); }}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 20 }}
              onPress={() => { Keyboard.dismiss(); setShowCancelModal(false); setCancelReasonText(''); }}
            >
            {/* Inner Pressable swallows taps so touching the card doesn't close the modal */}
            <Pressable onPress={() => {}} style={{ backgroundColor: CARD, borderRadius: 20, padding: 24, gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="x-circle" size={18} color={RED} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>
                    {pendingStatus === 'refunded' ? 'Confirm Refund' : 'Cancel Order'}
                  </Text>
                  <Text style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
                    A reason is required before continuing.
                  </Text>
                </View>
              </View>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: MUTED, letterSpacing: 0.6, marginBottom: 8 }}>
                  REASON FOR CANCELLATION *
                </Text>
                <TextInput
                  style={{
                    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: cancelReasonText.trim() ? BORDER : '#FECACA',
                    borderRadius: 12, padding: 14, fontSize: 15, color: TEXT,
                    minHeight: 90, textAlignVertical: 'top',
                  }}
                  placeholder="e.g. Customer requested cancellation, item out of stock, duplicate order…"
                  placeholderTextColor={MUTED}
                  value={cancelReasonText}
                  onChangeText={setCancelReasonText}
                  multiline
                  autoFocus
                />
                {!cancelReasonText.trim() && (
                  <Text style={{ color: RED, fontSize: 12, marginTop: 4 }}>
                    Please enter a reason to continue.
                  </Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable
                  style={{ flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: BORDER }}
                  onPress={() => { Keyboard.dismiss(); setShowCancelModal(false); setCancelReasonText(''); }}
                >
                  <Text style={{ color: TEXT, fontWeight: '600', fontSize: 15 }}>Go Back</Text>
                </Pressable>
                <Pressable
                  style={[{ flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, { backgroundColor: cancelReasonText.trim() ? RED : '#FCA5A5' }]}
                  onPress={handleConfirmCancel}
                  disabled={!cancelReasonText.trim()}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                    {pendingStatus === 'refunded' ? 'Confirm Refund' : 'Confirm Cancel'}
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
// ── Order Card (compact list item) ───────────────────────────────────────────
function OrderCard({ order, onPress, onPrint, printing }: { order: ApiOrder; onPress: () => void; onPrint: () => Promise<void> | void; printing: boolean }) {
  const isWholesale = order.orderSource === 'wholesale';
  const colors = STATUS_COLORS[order.status] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const label = STATUS_LABEL[order.status] ?? order.status;
  const items  = normalizeOrderItems(order.items);
  const itemSummary = summarizeOrderItems(items).replaceAll(' · ', ', ');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.orderCard, { opacity: pressed ? 0.92 : 1 }]}>
      <View style={[styles.orderCardAccent, { backgroundColor: colors.bg }]}>
        <View style={styles.orderCardTop}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.orderId}>
                {isWholesale
                  ? `#${order.poReference ?? order.id.slice(0, 8).toUpperCase()}`
                  : (order.orderNumber ?? `#${order.id.slice(0, 8).toUpperCase()}`)}
              </Text>
              {isWholesale ? (
                <View style={{ backgroundColor: '#DCFCE7', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ color: '#166534', fontWeight: '700', fontSize: 9 }}>WHOLESALE</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: '#DBEAFE', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ color: '#1E40AF', fontWeight: '700', fontSize: 9 }}>APP</Text>
                </View>
              )}
            </View>
            {order.customerName && (
              <Text style={[{ color: MUTED, fontWeight: '500', fontSize: 12 }]}>{order.customerName}</Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={[{ backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.text + '40', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }]}>
              <Text style={[{ color: colors.text, fontWeight: '600', fontSize: 11 }]}>{label}</Text>
            </View>
            <Text style={[{ color: BLUE, fontWeight: '700', fontSize: 14 }]}>
              ${((order.totalCents ?? 0) / 100).toFixed(2)}
            </Text>
          </View>
        </View>
        {/* Delivery / Pickup type pill */}
        {!isWholesale && (() => {
          const isDelivery = order.type === 'delivery' || order.deliveryType === 'delivery';
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: isDelivery ? '#DBEAFE' : '#DCFCE7', borderRadius: 8,
                paddingHorizontal: 8, paddingVertical: 3 }}>
                <Feather name={isDelivery ? 'truck' : 'shopping-bag'} size={11} color={isDelivery ? '#1E40AF' : '#166534'} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: isDelivery ? '#1E40AF' : '#166534' }}>
                  {isDelivery ? 'Delivery' : (order.scheduledFor ? 'Pickup' : 'ASAP Pickup')}
                </Text>
              </View>
              {/* Delivery address preview — tappable */}
              {isDelivery && (order.deliveryAddress || order.street) && (() => {
                const addr = order.deliveryAddress ?? order.street ?? '';
                return (
                  <Pressable onPress={(e) => { e.stopPropagation?.(); openMap(addr); Haptics.selectionAsync(); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#1E40AF', fontWeight: '400', flex: 1 }} numberOfLines={1}>{addr}</Text>
                    <Feather name="external-link" size={10} color="#1E40AF" />
                  </Pressable>
                );
              })()}
            </View>
          );
        })()}
        {order.status === 'scheduled' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Feather name="clock" size={11} color="#92400E" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>Needs Acceptance</Text>
          </View>
        )}
        <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 12, marginTop: 4 }]} numberOfLines={1}>
          {itemSummary || 'No items'}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
          <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 11 }]}>
            {fmtTime(order.createdAt)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Pressable
              onPress={onPrint}
              disabled={printing}
              style={[styles.printMiniBtn, { backgroundColor: printing ? MUTED : TEXT }]}
            >
              <Feather name="printer" size={11} color="#fff" />
              <Text style={styles.printMiniBtnTxt}>{printing ? '...' : 'Print'}</Text>
            </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Feather name="chevron-right" size={12} color={BLUE} />
                <Text style={[{ color: BLUE, fontWeight: '600', fontSize: 11 }]}>Tap to manage</Text>
              </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      <View style={[{ backgroundColor: `${BLUE}18`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }]}>
        <Text style={[{ color: BLUE, fontWeight: '700', fontSize: 11 }]}>{count}</Text>
      </View>
    </View>
  );
}
// ── Calendar date picker modal ────────────────────────────────────────────────
function CalendarModal({
  visible, onClose, selectedDate, onSelectDate, ordersByDate,
}: {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  ordersByDate: Record<string, number>;
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD }}>
          <Pressable onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT }}>Pick a Date</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
          <InlineCalendarPicker
            selectedDate={selectedDate}
            onSelectDate={d => { onSelectDate(d); onClose(); Haptics.selectionAsync(); }}
            accentColor={BLUE}
            maxDate={today}
            dotDates={ordersByDate}
          />
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: BLUE }} />
            <Text style={{ fontSize: 12, color: MUTED }}>Dot indicates orders on that day</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── POS tab utilities ─────────────────────────────────────────────────────────
function sydneyDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(d);
}
function shiftPosDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 2, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return sydneyDateStr(date);
}
function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
function formatPosDay(dateStr: string): string {
  const today = sydneyDateStr();
  const yesterday = shiftPosDate(today, -1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 2, 0, 0)).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short',
  });
}
const POS_METHOD_CONFIG: Record<string, { label: string; color: string }> = {
  eftpos: { label: 'EFTPOS', color: BLUE },
  cash:   { label: 'Cash',   color: GREEN },
  split:  { label: 'Split',  color: '#8B5CF6' },
};
function getPosPaymentLabel(tx: PosTransaction): { label: string; color: string } {
  if (tx.splitPayments && Array.isArray(tx.splitPayments) && tx.splitPayments.length > 1) {
    return POS_METHOD_CONFIG.split;
  }
  const pm = (tx.paymentMethod ?? 'eftpos').toLowerCase();
  return POS_METHOD_CONFIG[pm] ?? { label: pm.toUpperCase(), color: MUTED };
}
function summarisePosItems(items: any[]): string {
  if (!items || items.length === 0) return 'No items';
  const names = items.map((i: any) => {
    const qty = i.quantity ?? i.qty ?? 1;
    const name = i.name ?? i.productName ?? 'Item';
    return qty > 1 ? `${qty}× ${name}` : name;
  });
  if (names.length <= 3) return names.join(', ');
  return names.slice(0, 2).join(', ') + ` & ${names.length - 2} more`;
}
const POS_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received:  { bg: '#DCFCE7', text: '#166534' },
  completed: { bg: '#F3F4F6', text: '#6B7280' },
  refunded:  { bg: '#F3E8FF', text: '#6B21A8' },
  voided:    { bg: '#FEE2E2', text: '#991B1B' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
};
function PosTransactionCard({ tx }: { tx: PosTransaction }) {
  const statusStyle = POS_STATUS_COLORS[tx.status] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const payMethod = getPosPaymentLabel(tx);
  const hasExtras = tx.tipCents > 0 || tx.surchargeCents > 0 || tx.discountCents > 0;
  return (
    <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: BORDER, gap: 8, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>
              {tx.orderNumber ?? tx.id.slice(0, 8).toUpperCase()}
            </Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: statusStyle.bg }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: statusStyle.text, letterSpacing: 0.3 }}>
                {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: MUTED }}>{fmtTime(tx.createdAt)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>{fmtCents(tx.totalCents)}</Text>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: payMethod.color + '18' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: payMethod.color }}>{payMethod.label}</Text>
          </View>
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: BORDER }} />
      <Text style={{ fontSize: 13, color: MUTED, lineHeight: 18 }} numberOfLines={2}>
        {summarisePosItems(tx.items)}
      </Text>
      {hasExtras && (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {tx.discountCents > 0 && <Text style={{ fontSize: 12, color: GREEN }}>−{fmtCents(tx.discountCents)} disc</Text>}
          {tx.surchargeCents > 0 && <Text style={{ fontSize: 12, color: MUTED }}>+{fmtCents(tx.surchargeCents)} surcharge</Text>}
          {tx.tipCents > 0 && <Text style={{ fontSize: 12, color: '#F59E0B' }}>+{fmtCents(tx.tipCents)} tip</Text>}
        </View>
      )}
      {tx.operatorName ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="user" size={11} color={MUTED} />
          <Text style={{ fontSize: 12, color: MUTED }}>{tx.operatorName}</Text>
        </View>
      ) : null}
    </View>
  );
}

const POS_SECTIONS = [
  { key: 'active',   label: 'In Progress',      statuses: ['received', 'being_prepared'],         accentColor: '#F59E0B' },
  { key: 'done',     label: 'Completed',         statuses: ['completed'],                          accentColor: GREEN },
  { key: 'issues',   label: 'Refunded / Voided', statuses: ['refunded', 'voided', 'cancelled'],   accentColor: '#DC2626' },
] as const;

const POS_CHIP_FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'eftpos',   label: 'EFTPOS' },
  { key: 'cash',     label: 'Cash' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'voided',   label: 'Voided' },
] as const;
type PosChipKey = (typeof POS_CHIP_FILTERS)[number]['key'];

function applyPosChipFilter(tx: PosTransaction, chip: PosChipKey): boolean {
  if (chip === 'all') return true;
  if (chip === 'refunded') return tx.status === 'refunded';
  if (chip === 'voided')   return tx.status === 'voided' || tx.status === 'cancelled';
  const method = (tx.paymentMethod ?? 'eftpos').toLowerCase();
  const isSplit = tx.splitPayments && Array.isArray(tx.splitPayments) && tx.splitPayments.length > 1;
  if (chip === 'eftpos') return !isSplit && (method === 'eftpos' || method === 'card');
  if (chip === 'cash')   return !isSplit && method === 'cash';
  return true;
}

function PosTabContent({
  dayStr, onSetDay, posOrders, isLoading, refreshing, onRefresh,
}: {
  dayStr: string; onSetDay: (d: string) => void;
  posOrders: PosTransaction[]; isLoading: boolean;
  refreshing: boolean; onRefresh: () => Promise<void>;
}) {
  const todayStr = sydneyDateStr();
  const isToday  = dayStr === todayStr;

  const [searchQuery, setSearchQuery]       = useState('');
  const [chipFilter, setChipFilter]         = useState<PosChipKey>('all');

  useEffect(() => {
    setSearchQuery('');
    setChipFilter('all');
  }, [dayStr]);

  const filteredOrders = useMemo(() => {
    let list = posOrders;
    if (chipFilter !== 'all') {
      list = list.filter(tx => applyPosChipFilter(tx, chipFilter));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(tx => {
        const num = (tx.orderNumber ?? '').toLowerCase();
        const op  = (tx.operatorName ?? '').toLowerCase();
        return num.includes(q) || op.includes(q);
      });
    }
    return list;
  }, [posOrders, chipFilter, searchQuery]);

  const dailyRevenue = posOrders
    .filter(tx => tx.status !== 'cancelled' && tx.status !== 'voided' && tx.status !== 'refunded')
    .reduce((acc, tx) => acc + tx.totalCents, 0);

  const sections = POS_SECTIONS.map(s => ({
    ...s,
    items: filteredOrders.filter(tx => (s.statuses as readonly string[]).includes(tx.status)),
  })).filter(s => s.items.length > 0);

  const hasActiveFilters = chipFilter !== 'all' || searchQuery.trim().length > 0;

  return (
    <View style={{ flex: 1 }}>
      {/* Day navigation */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, paddingHorizontal: 8, paddingVertical: 10 }}>
        <Pressable onPress={() => onSetDay(shiftPosDate(dayStr, -1))} style={{ padding: 8 }} hitSlop={12}>
          <Feather name="chevron-left" size={22} color={NAVY} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT }}>{formatPosDay(dayStr)}</Text>
        </View>
        <Pressable
          onPress={() => { if (!isToday) onSetDay(shiftPosDate(dayStr, 1)); }}
          style={[{ padding: 8 }, isToday && { opacity: 0.35 }]}
          disabled={isToday}
          hitSlop={12}
        >
          <Feather name="chevron-right" size={22} color={isToday ? BORDER : NAVY} />
        </Pressable>
      </View>

      {/* Search bar */}
      <View style={{ backgroundColor: CARD, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, gap: 8 }}>
          <Feather name="search" size={15} color={MUTED} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: TEXT, padding: 0 }}
            placeholder="Order number or operator…"
            placeholderTextColor={MUTED}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x-circle" size={15} color={MUTED} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' }}
      >
        {POS_CHIP_FILTERS.map(chip => {
          const active = chipFilter === chip.key;
          return (
            <Pressable
              key={chip.key}
              onPress={() => { setChipFilter(chip.key); Haptics.selectionAsync(); }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: active ? NAVY : BG,
                borderWidth: 1,
                borderColor: active ? NAVY : BORDER,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#FFFFFF' : TEXT }}>
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading && !refreshing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : posOrders.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Feather name="monitor" size={40} color={MUTED} />
          <Text style={{ color: MUTED, marginTop: 12, fontSize: 15, fontWeight: '600' }}>
            {isToday ? 'No POS transactions today' : 'No transactions on this day'}
          </Text>
          <Text style={{ color: MUTED, marginTop: 4, fontSize: 13, textAlign: 'center' }}>
            {isToday ? 'Terminal sales will appear here in real time.' : 'Use the arrows to navigate to another day.'}
          </Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Feather name="search" size={36} color={MUTED} />
          <Text style={{ color: MUTED, marginTop: 12, fontSize: 15, fontWeight: '600' }}>No matching transactions</Text>
          <Text style={{ color: MUTED, marginTop: 4, fontSize: 13, textAlign: 'center' }}>
            Try a different search term or filter.
          </Text>
          {hasActiveFilters && (
            <Pressable
              onPress={() => { setSearchQuery(''); setChipFilter('all'); }}
              style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: NAVY, borderRadius: 20 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Clear filters</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        >
          {/* Daily summary row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: CARD, borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: BORDER }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="monitor" size={16} color={BLUE} />
              <Text style={{ fontSize: 13, color: MUTED, fontWeight: '500' }}>
                {hasActiveFilters
                  ? `${filteredOrders.length} of ${posOrders.length} transaction${posOrders.length !== 1 ? 's' : ''}`
                  : `${posOrders.length} transaction${posOrders.length !== 1 ? 's' : ''}`}
              </Text>
            </View>
            {dailyRevenue > 0 && (
              <Text style={{ fontSize: 15, color: TEXT, fontWeight: '700' }}>{fmtCents(dailyRevenue)}</Text>
            )}
          </View>

          {/* Sectioned transaction list */}
          {sections.map(section => (
            <View key={section.key} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: section.accentColor }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  {section.label}
                </Text>
                <View style={{ backgroundColor: section.accentColor + '18', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: section.accentColor }}>{section.items.length}</Text>
                </View>
              </View>
              {section.items.map(tx => <PosTransactionCard key={tx.id} tx={tx} />)}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DirectorOrdersScreen() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canCancelRefund = user?.role === 'director' || user?.role === 'master';
  const params = useLocalSearchParams<{
    drillMode?: string;
    drillValue?: string;
    tab?: string;
  }>();

  const [channelTab, setChannelTab] = useState<'app' | 'pos'>('app');
  const [posDayStr, setPosDayStr]   = useState<string>(sydneyDateStr());
  const [filter, setFilter]         = useState('all');
  const [viewMode, setViewMode]     = useState<'today' | 'week' | 'month' | 'date'>('today');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedOrder, setSelectedOrder] = useState<ApiOrder | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [drillHour, setDrillHour]     = useState<number | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const drillModeRef = useRef<string | null>(null);

  const isStaff = user?.role === 'staff';
  const { data, isLoading, refetch } = useQuery({
    queryKey: isStaff ? ['staff-orders'] : ['director-orders'],
    queryFn: () => isStaff ? api.staff.allOrders() : api.director.orders(),
    refetchInterval: 20000,
  });
  const { data: posData, isLoading: posLoading, refetch: posRefetch } = useQuery({
    queryKey: ['director-pos-orders', posDayStr],
    queryFn: () => api.director.posOrders({ date: posDayStr }),
    staleTime: 30_000,
    enabled: channelTab === 'pos' && !isStaff,
  });

  useFocusEffect(
    React.useCallback(() => {
      const dm = params.drillMode;
      const dv = params.drillValue;
      const compositeKey = dm ? `${dm}:${dv ?? ''}` : null;
      if (dm && compositeKey !== drillModeRef.current) {
        drillModeRef.current = compositeKey;
        setFilter('all');
        setDrillHour(null);
        setProductFilter(null);
        if (dm === 'today') {
          setViewMode('today');
        } else if (dm === 'week') {
          setViewMode('week');
        } else if (dm === 'month') {
          setViewMode('month');
        } else if (dm === 'hour' && dv != null) {
          setViewMode('today');
          setDrillHour(parseInt(dv, 10));
        } else if (dm === 'product' && dv) {
          setViewMode('today');
          setProductFilter(dv);
        }
      } else if (!dm) {
        drillModeRef.current = null;
        setDrillHour(null);
        setProductFilter(null);
        setFilter('active');
        setViewMode(isStaff ? 'week' : 'today');
        setSelectedDate(new Date());
      }
      // Handle tab deep-link param
      if (params.tab === 'pos' && !isStaff) {
        setChannelTab('pos');
      } else if (params.tab === 'app') {
        setChannelTab('app');
      }
    }, [isStaff, params.drillMode, params.drillValue, params.tab]),
  );

  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const { data: settingsData } = useQuery({
    queryKey: ['director-settings'],
    queryFn: () => api.director.settings(),
    retry: 1,
    enabled: !isStaff,
  });
  const { data: storesData } = useQuery({
    queryKey: isStaff ? ['staff-stores'] : ['director-stores'],
    queryFn: () => isStaff ? api.staff.stores() : api.director.storesList(),
    staleTime: 60000,
  });
  const allOrders: ApiOrder[] = data?.data ?? [];
  const stores = storesData?.data ?? [];
  const printerIp = (settingsData?.data?.printer_ip ?? '').trim();
  const printerPort = parseInt(settingsData?.data?.printer_port ?? '9100', 10);

  const isDrillActive = !!(params.drillMode);
  const drillLabel = (() => {
    const dm = params.drillMode;
    const dv = params.drillValue;
    if (dm === 'today')   return 'Today\'s revenue';
    if (dm === 'week')    return 'This week\'s revenue';
    if (dm === 'month')   return 'This month\'s revenue';
    if (dm === 'hour' && dv != null)  return `Orders at ${fmtHourLabel(parseInt(dv, 10))}`;
    if (dm === 'product' && dv) return `Orders containing "${dv}"`;
    return null;
  })();

  const printOrder = async (order: ApiOrder) => {
    const orderStore = stores.find((store) => store.id === order.storeId);
    const effectivePrinterIp = (orderStore?.printerIp ?? printerIp ?? '').trim();
    const effectivePrinterPort = orderStore?.printerPort ?? printerPort;
    const effectivePrinterBrand = (orderStore?.printerBrand ?? 'epson') as 'epson' | 'star';
    if (!effectivePrinterIp) {
      Alert.alert('Printer Not Set', 'Set the printer details inside this store before printing orders for it.');
      return;
    }
    setPrintingOrderId(order.id);
    try {
      await sendReceiptPrint(orderToPrintJob(order, effectivePrinterBrand), effectivePrinterIp, effectivePrinterPort);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Printed', 'Receipt sent to the printer.');
    } catch (error) {
      Alert.alert('Print Failed', getErrorMessage(error) || 'Could not send the receipt to the printer.');
    } finally {
      setPrintingOrderId(null);
    }
  };
  // Apply status filter
  const statusFiltered = useMemo(() => {
    if (filter === 'all') return allOrders;
    if (filter === 'active') return allOrders.filter((o) =>
      ['received','being_prepared','ready_for_pickup','pending','processing','dispatched'].includes(o.status)
    );
    if (filter === 'scheduled_all') return allOrders.filter((o) =>
      ['scheduled','accepted'].includes(o.status)
    );
    if (filter === 'wholesale') return allOrders.filter((o) => o.orderSource === 'wholesale');
    return allOrders.filter((o) => o.status === filter);
  }, [allOrders, filter]);

  // Apply drill secondary filters (hour / product) on top of status filter
  const drillFiltered = useMemo(() => {
    let result = statusFiltered;
    if (drillHour !== null) {
      result = result.filter((o) => new Date(o.createdAt).getHours() === drillHour);
    }
    if (productFilter) {
      const needle = productFilter.toLowerCase();
      result = result.filter((o) => {
        try {
          const items = Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? JSON.parse(o.items) : []);
          return items.some((it: any) => (it.name ?? it.productName ?? '').toLowerCase().includes(needle));
        } catch { return false; }
      });
    }
    return result;
  }, [statusFiltered, drillHour, productFilter]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const activeTodayOrders = useMemo(
    () =>
      allOrders.filter((order) =>
        ['received', 'being_prepared', 'ready_for_pickup', 'pending', 'processing', 'dispatched'].includes(order.status)
        && isSameDay(getOrderTimelineDate(order), today)
      ),
    [allOrders, today],
  );
  const todayOrders = useMemo(() =>
    drillFiltered.filter((o) => isSameDay(getOrderTimelineDate(o), today)),
    [drillFiltered, today]
  );
  // "Earlier this week" tab — excludes today for directors so it doesn't duplicate the today section
  const thisWeekOrders = useMemo(() =>
    drillFiltered.filter((o) => isThisWeek(getOrderTimelineDate(o)) && (isStaff || !isSameDay(getOrderTimelineDate(o), today))),
    [drillFiltered, today, isStaff]);
  // Drill-down version — includes today so the figure matches the dashboard week-to-date total
  const weekDrillOrders = useMemo(() =>
    drillFiltered.filter((o) => isThisWeek(getOrderTimelineDate(o))),
    [drillFiltered]);
  const thisMonthOrders = useMemo(() =>
    drillFiltered.filter((o) => isThisMonth(getOrderTimelineDate(o))),
    [drillFiltered]);
  const dateOrders = useMemo(() =>
    drillFiltered.filter((o) => isSameDay(getOrderTimelineDate(o), selectedDate)),
    [drillFiltered, selectedDate]
  );
  const ordersByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of statusFiltered) {
      const d = getOrderTimelineDate(o);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [statusFiltered]);
  const handleStatusChange = async (orderId: string, status: string, cancelReason?: string) => {
    try {
      if (isStaff) {
        await api.staff.updateOrderStatus(orderId, status);
      } else {
        await api.director.updateOrderStatus(orderId, status, cancelReason);
      }
      await qc.invalidateQueries({ queryKey: isStaff ? ['staff-orders'] : ['director-orders'] });
      if (!isStaff) await qc.invalidateQueries({ queryKey: ['director-stats'] });
      setSelectedOrder((prev) => prev ? { ...prev, status, ...(cancelReason ? { cancelReason } : {}) } : null);
      if (status === 'being_prepared') {
        const order = allOrders.find((o) => o.id === orderId) ?? selectedOrder;
        if (order) {
          const orderStore = stores.find((s) => s.id === order.storeId);
          const shouldAutoPrint = orderStore ? (orderStore.autoPrint !== false) : true;
          if (shouldAutoPrint) {
            await printOrder({ ...order, status });
          }
        }
      }
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error));
    }
  };
  const handleViewInvoice = async (order: ApiOrder) => {
    try {
      // Fetch HTML from custom endpoint → convert to PDF via expo-print (no browser URL).
      let html: string | null = null;
      if (order.id) {
        try {
          const resp = await fetch(getWholesaleInvoiceUrl(order.id));
          if (resp.ok) html = await resp.text();
        } catch { /* fall through */ }
      }

      if (!html) {
        const fallbackUrl = order.invoicePdfUrl ?? order.invoiceUrl;
        if (!fallbackUrl) {
          Alert.alert('Invoice Unavailable', 'This invoice is still being prepared.');
          return;
        }
        await Linking.openURL(fallbackUrl);
        return;
      }

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Invoice ${order.id?.slice(0,8).toUpperCase() ?? ''}`, UTI: 'com.adobe.pdf' });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (error) {
      Alert.alert('Invoice Unavailable', getErrorMessage(error));
    }
  };
  const totalToday = drillFiltered.filter((o) => isSameDay(getOrderTimelineDate(o), today)).length;
  return (
    <DirectorTabScreen title="Orders">
      {/* ── Channel segmented control (director/manager only) ── */}
      {!isStaff && (
        <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', backgroundColor: BG, borderRadius: 12, padding: 3 }}>
            {[
              { key: 'app' as const, label: 'App & Wholesale' },
              { key: 'pos' as const, label: 'POS Terminal' },
            ].map(t => {
              const active = channelTab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => { setChannelTab(t.key); Haptics.selectionAsync(); }}
                  style={[{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' }, active && { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? NAVY : MUTED }}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      {(channelTab === 'pos' && !isStaff) ? (
        <PosTabContent
          dayStr={posDayStr}
          onSetDay={setPosDayStr}
          posOrders={posData?.data ?? []}
          isLoading={posLoading}
          refreshing={refreshing}
          onRefresh={async () => { await posRefetch(); }}
        />
      ) : (
        <>
      {/* Drill-down banner */}
      {isDrillActive && drillLabel && (
        <View style={{ backgroundColor: '#EFF6FF', borderBottomWidth: 1, borderBottomColor: '#BFDBFE', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 }}>
          <View style={{ backgroundColor: BLUE + '20', borderRadius: 8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="filter" size={13} color={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: BLUE, letterSpacing: 0.5 }}>DRILL-DOWN ACTIVE</Text>
            <Text style={{ fontSize: 12, color: '#1E40AF', fontWeight: '500', marginTop: 1 }}>{drillLabel}</Text>
          </View>
          <Pressable
            onPress={() => {
              drillModeRef.current = null;
              router.replace('/(director)/orders' as any);
            }}
            style={{ padding: 4 }}
          >
            <Feather name="x" size={16} color={BLUE} />
          </Pressable>
        </View>
      )}
      {/* Status filter chips */}
      <View style={{ backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <FlatList
          horizontal
          data={FILTER_TABS}
          keyExtractor={(s) => s.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
          renderItem={({ item }) => {
            const active = filter === item.key;
            const color = item.key === 'wholesale' ? GREEN : item.key === 'active' ? '#F59E0B' : BLUE;
            return (
              <Pressable
                onPress={() => { setFilter(item.key); Haptics.selectionAsync(); }}
                style={[styles.filterChip, { backgroundColor: active ? color : BG, borderColor: active ? color : BORDER }]}
              >
                <Text style={[{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : MUTED }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
      {/* Date view selector */}
      <View style={[styles.dateBar, { backgroundColor: BG, borderBottomColor: BORDER }]}>
        {([
          { key: 'today', label: `Today (${totalToday})` },
          { key: 'week',  label: 'This Week' },
          { key: 'month', label: 'Month' },
          { key: 'date',  label: 'Pick Date' },
        ] as const).map((m) => {
          const active = viewMode === m.key;
          return (
            <Pressable
              key={m.key}
              onPress={() => { setViewMode(m.key); if (m.key === 'date') setShowCalendar(true); Haptics.selectionAsync(); }}
              style={[styles.dateTab, { borderBottomWidth: 2, borderBottomColor: active ? BLUE : 'transparent' }]}
            >
              <Text style={[{ fontWeight: active ? '700' : '400', fontSize: 13, color: active ? BLUE : MUTED }]}>
                {m.key === 'date' && viewMode === 'date' ? fmtDateChip(selectedDate) : m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* Date picker row (shown when Pick Date is active) */}
      {viewMode === 'date' && (
        <Pressable
          onPress={() => setShowCalendar(true)}
          style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="calendar" size={16} color={BLUE} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: BLUE }}>
              {selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={MUTED} />
        </Pressable>
      )}
      {/* Content */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 0, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        >
          {(() => {
            // Resolve the active date-range bucket
            const [orders, title, emptyMsg, needsTopGap] = (() => {
              if (viewMode === 'today')  return [todayOrders,     "Today's Orders",                                                                       'No orders today yet',          false] as const;
              if (viewMode === 'week')   return [isDrillActive ? weekDrillOrders : thisWeekOrders,
                                                isDrillActive ? 'This Week (7 Days)' : (isStaff ? 'This Week' : 'Earlier This Week'),
                                                isDrillActive ? 'No orders this week' : 'No other orders this week',                                      true] as const;
              if (viewMode === 'month')  return [thisMonthOrders, new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),              'No orders this month yet',     true] as const;
              return                           [dateOrders,       fmtDateChip(selectedDate),                                                               'No orders on this date',       false] as const;
            })();

            // When "All" is selected, bucket by status section
            const sectionedGroups: Array<{ key: string; label: string; accentColor: string; items: ApiOrder[] }> =
              filter === 'all' && orders.length > 0
                ? (() => {
                    const map: Record<string, ApiOrder[]> = {};
                    for (const o of orders) {
                      const sk = getOrderSectionKey(o);
                      (map[sk] ??= []).push(o);
                    }
                    return ORDER_STATUS_SECTIONS
                      .map(s => ({ key: s.key, label: s.label, accentColor: s.accentColor, items: map[s.key] ?? [] }))
                      .filter(s => s.items.length > 0);
                  })()
                : [];

            const renderCard = (o: ApiOrder) => (
              <OrderCard
                key={o.id}
                order={o}
                onPress={() => { setSelectedOrder(o); Haptics.selectionAsync(); }}
                onPrint={() => printOrder(o)}
                printing={printingOrderId === o.id}
              />
            );

            return (
              <>
                {needsTopGap && <View style={{ height: 8 }} />}
                <SectionHeader title={title} count={orders.length} />
                {orders.length === 0 ? (
                  <View style={styles.emptySection}>
                    <Feather name="coffee" size={28} color={BORDER} />
                    <Text style={styles.emptyText}>{emptyMsg}</Text>
                  </View>
                ) : sectionedGroups.length > 0 ? (
                  sectionedGroups.map(group => (
                    <View key={group.key}>
                      {/* Status section header */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 8 }}>
                        <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: group.accentColor }} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', flex: 1 }}>
                          {group.label}
                        </Text>
                        <View style={{ backgroundColor: group.accentColor + '18', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: group.accentColor }}>{group.items.length}</Text>
                        </View>
                      </View>
                      {group.items.map(renderCard)}
                      <View style={{ height: 8 }} />
                    </View>
                  ))
                ) : (
                  orders.map(renderCard)
                )}
              </>
            );
          })()}
        </ScrollView>
      )}
      {/* Order detail modal */}
      <OrderDetailModal
        order={selectedOrder}
        visible={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onStatusChange={handleStatusChange}
        onAcceptOrder={async (orderId) => {
          try {
            await api.director.acceptOrder(orderId);
            await qc.invalidateQueries({ queryKey: ['director-orders'] });
            await qc.invalidateQueries({ queryKey: ['director-stats'] });
            setSelectedOrder((prev) => prev ? { ...prev, status: 'accepted' } : null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            Alert.alert('Error', getErrorMessage(error));
          }
        }}
        onPrintReceipt={() => selectedOrder ? printOrder(selectedOrder) : Promise.resolve()}
        onViewInvoice={() => selectedOrder ? handleViewInvoice(selectedOrder) : Promise.resolve()}
        printing={printingOrderId === selectedOrder?.id}
        canCancelRefund={canCancelRefund}
      />

      {/* Calendar date picker */}
      <CalendarModal
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        selectedDate={selectedDate}
        onSelectDate={(d) => setSelectedDate(d)}
        ordersByDate={ordersByDate}
      />
        </>
      )}
    </DirectorTabScreen>
  );
}
const styles = StyleSheet.create({
  filterChip:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  dateBar:        { flexDirection: 'row', borderBottomWidth: 1 },
  dateTab:        { flex: 1, alignItems: 'center', paddingVertical: 12 },
  dayChip:        { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, minWidth: 80 },
  orderCard:      { marginBottom: 10 },
  orderCardAccent:{ borderRadius: 16, padding: 14, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: GLASS_BG,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  orderCardTop:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  orderId:        { fontSize: 14, fontWeight: '700', color: TEXT },
  printMiniBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  printMiniBtnTxt:{ color: '#fff', fontWeight: '600', fontSize: 10 },
  sectionHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  sectionHeaderText: { fontSize: 16, fontWeight: '700', color: TEXT, flex: 1 },
  emptySection:   { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyText:      { color: MUTED, fontWeight: '400', fontSize: 14 },
  // Modal
  modalHeader:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  modalTitle:     { fontSize: 17, fontWeight: '700', color: TEXT },
  closeBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  section:        { backgroundColor: GLASS_BG, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: GLASS_BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  sectionLabel:   { fontSize: 11, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusPill:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start' },
  statusPillText: { fontSize: 13, fontWeight: '600' },
  updateStatusBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  printBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, marginHorizontal: 16, marginTop: 2 },
  detailRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailText:     { color: TEXT, fontWeight: '400', fontSize: 14, lineHeight: 20 },
  itemRow:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 10, gap: 8 },
});
