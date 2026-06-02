import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Linking, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiOrder } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { orderToPrintJob, sendReceiptPrint } from '@/lib/printer';
import { normalizeOrderItems, summarizeOrderItems } from '@/lib/orderItems';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER      = '#E5E7EB';
const GLASS_BG    = 'rgba(255,255,255,0.6)';
const GLASS_BORDER= 'rgba(255,255,255,0.85)';
const GREEN  = '#22C55E';
// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received:         { bg: '#FEF9C3', text: '#854D0E' },
  being_prepared:   { bg: '#EDE9FE', text: '#5B21B6' },
  ready_for_pickup: { bg: '#DCFCE7', text: '#166534' },
  out_for_delivery: { bg: '#DBEAFE', text: '#1E40AF' },
  completed:        { bg: '#F3F4F6', text: '#6B7280' },
  cancelled:        { bg: '#FEE2E2', text: '#991B1B' },
  refunded:         { bg: '#F3E8FF', text: '#6B21A8' },
  pending:          { bg: '#DBEAFE', text: '#1E40AF' },
  processing:       { bg: '#FEF3C7', text: '#92400E' },
  dispatched:       { bg: '#EDE9FE', text: '#5B21B6' },
  delivered:        { bg: '#DCFCE7', text: '#166534' },
};
const STATUS_LABEL: Record<string, string> = {
  received: 'Pending', being_prepared: 'Preparing',
  ready_for_pickup: 'Ready', out_for_delivery: 'Out for Delivery',
  completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded',
  pending: 'Pending', processing: 'Processing',
  dispatched: 'Dispatched', delivered: 'Delivered',
};
const CUSTOMER_NEXT: Record<string, string[]> = {
  received:         ['being_prepared', 'cancelled'],
  being_prepared:   ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['completed', 'out_for_delivery'],
  out_for_delivery: ['completed'],
  completed: [], cancelled: [], refunded: [],
};
const WHOLESALE_NEXT: Record<string, string[]> = {
  pending:    ['processing', 'cancelled'],
  processing: ['dispatched', 'cancelled'],
  dispatched: ['delivered'],
  delivered: [], cancelled: [],
};
const FILTER_TABS = [
  { key: 'all',              label: 'All' },
  { key: 'active',           label: 'Active' },
  { key: 'received',         label: 'Pending' },
  { key: 'being_prepared',   label: 'Preparing' },
  { key: 'ready_for_pickup', label: 'Ready' },
  { key: 'completed',        label: 'Done' },
  { key: 'wholesale',        label: 'Wholesale' },
  { key: 'cancelled',        label: 'Cancelled' },
];
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
function OrderDetailModal({ order, visible, onClose, onStatusChange, onPrintReceipt, onViewInvoice, printing, canCancelRefund }: {
  order: ApiOrder | null; visible: boolean; onClose: () => void;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onPrintReceipt: () => Promise<void>;
  onViewInvoice: () => Promise<void>;
  printing: boolean;
  canCancelRefund: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [updating, setUpdating] = useState(false);
  if (!order) return null;
  const isWholesale = order.orderSource === 'wholesale';
  const items = normalizeOrderItems(order.items);
  const colors = STATUS_COLORS[order.status] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const label  = STATUS_LABEL[order.status] ?? order.status;
  // Filter cancel/refund from action list for non-directors (managers cannot cancel or refund)
  const rawNext = isWholesale ? (WHOLESALE_NEXT[order.status] ?? []) : (CUSTOMER_NEXT[order.status] ?? []);
  const next = canCancelRefund ? rawNext : rawNext.filter((s: string) => s !== 'cancelled' && s !== 'refunded');
  const handleChangeStatus = () => {
    if (next.length === 0) {
      Alert.alert('Status', `This order is ${label} and cannot be advanced further.`); return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Update Status', 'Move to:', [
      ...next.map(s => ({
        text: STATUS_LABEL[s] ?? s,
        onPress: async () => {
          setUpdating(true);
          await onStatusChange(order.id, s);
          setUpdating(false);
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
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
                : `#BC-${order.id.slice(-6).toUpperCase()}`}
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
              {(order.type === 'delivery' || order.deliveryType === 'delivery') ? 'Delivery Details' : 'Pickup Details'}
            </Text>
            <View style={{ gap: 4, marginTop: 6 }}>
              <View style={styles.detailRow}>
                <Feather name={order.type === 'delivery' || order.deliveryType === 'delivery' ? 'truck' : 'map-pin'} size={14} color={MUTED} />
                <Text style={styles.detailText}>
                  {order.type === 'delivery' || order.deliveryType === 'delivery' ? 'Delivery' : 'Pickup'}
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
                      </View>
                      <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 12 }]}>
                        {item.quantity} × ${(item.unitPriceCents / 100).toFixed(2)}
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
        </ScrollView>
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
                  : `#BC-${order.id.slice(-6).toUpperCase()}`}
              </Text>
              {isWholesale && (
                <View style={{ backgroundColor: '#DCFCE7', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ color: '#166534', fontWeight: '700', fontSize: 9 }}>WHOLESALE</Text>
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
                  {isDelivery ? 'Delivery' : 'Pickup'}
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
  const [calYear, setCalYear] = useState(selectedDate.getFullYear());
  const [calMonth, setCalMonth] = useState(selectedDate.getMonth());

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const sixMonthsAgo = useMemo(() => { const d = new Date(today); d.setMonth(d.getMonth() - 6); return d; }, [today]);
  const twoYearsAgo  = useMemo(() => { const d = new Date(today); d.setFullYear(d.getFullYear() - 2); return d; }, [today]);

  const canGoPrev = new Date(calYear, calMonth, 1) > new Date(twoYearsAgo.getFullYear(), twoYearsAgo.getMonth(), 1);
  const canGoNext = new Date(calYear, calMonth, 1) < new Date(today.getFullYear(), today.getMonth(), 1);

  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth     = new Date(calYear, calMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const dateOf  = (day: number) => new Date(calYear, calMonth, day);
  const isSel   = (day: number) => selectedDate.getFullYear() === calYear && selectedDate.getMonth() === calMonth && selectedDate.getDate() === day;
  const isTod   = (day: number) => today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day;
  const isArc   = (day: number) => dateOf(day) < sixMonthsAgo;
  const isFut   = (day: number) => { const d = dateOf(day); d.setHours(0,0,0,0); return d > today; };
  const dateKey = (day: number) => `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const prevMonth = () => {
    if (!canGoPrev) return;
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); } else { setCalMonth(m => m - 1); }
  };
  const nextMonth = () => {
    if (!canGoNext) return;
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); } else { setCalMonth(m => m + 1); }
  };

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
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Pressable onPress={prevMonth} style={{ padding: 10 }} hitSlop={8}>
              <Feather name="chevron-left" size={22} color={canGoPrev ? TEXT : BORDER} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: TEXT }}>{monthLabel}</Text>
            <Pressable onPress={nextMonth} style={{ padding: 10 }} hitSlop={8}>
              <Feather name="chevron-right" size={22} color={canGoNext ? TEXT : BORDER} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', marginBottom: 10 }}>
            {DAYS.map(d => (
              <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: MUTED }}>{d}</Text>
            ))}
          </View>

          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <View key={row} style={{ flexDirection: 'row', marginBottom: 4 }}>
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (day === null) return <View key={col} style={{ flex: 1, height: 50 }} />;
                const sel = isSel(day);
                const tod = isTod(day);
                const arc = isArc(day);
                const fut = isFut(day);
                const cnt = ordersByDate[dateKey(day)] ?? 0;
                const textColor = sel ? '#fff' : fut ? BORDER : arc ? '#C7C7CC' : tod ? BLUE : TEXT;
                return (
                  <Pressable
                    key={col}
                    onPress={() => {
                      if (fut) return;
                      onSelectDate(new Date(calYear, calMonth, day));
                      onClose();
                      Haptics.selectionAsync();
                    }}
                    style={{ flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? BLUE : tod ? `${BLUE}18` : 'transparent' }}>
                      <Text style={{ fontSize: 14, fontWeight: sel || tod ? '700' : '400', color: textColor }}>{day}</Text>
                    </View>
                    {cnt > 0 && !fut ? (
                      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: arc ? '#C7C7CC' : BLUE, marginTop: 1 }} />
                    ) : (
                      <View style={{ width: 5, height: 5, marginTop: 1 }} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#C7C7CC' }} />
            <Text style={{ fontSize: 12, color: MUTED }}>Greyed dates are archive (older than 6 months)</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DirectorOrdersScreen() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canCancelRefund = user?.role === 'director' || user?.role === 'master';
  const [filter, setFilter]         = useState('active');
  const [viewMode, setViewMode]     = useState<'today' | 'week' | 'date'>('today');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedOrder, setSelectedOrder] = useState<ApiOrder | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-orders'],
    queryFn: () => api.director.orders(),
    refetchInterval: 20000,
  });

  useFocusEffect(
    React.useCallback(() => {
      setFilter('active');
      setViewMode('today');
      setSelectedDate(new Date());
    }, []),
  );

  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const { data: settingsData } = useQuery({
    queryKey: ['director-settings'],
    queryFn: () => api.director.settings(),
    retry: 1,
  });
  const { data: storesData } = useQuery({
    queryKey: ['director-stores'],
    queryFn: () => api.director.storesList(),
    staleTime: 60000,
  });
  const allOrders: ApiOrder[] = data?.data ?? [];
  const stores = storesData?.data ?? [];
  const printerIp = (settingsData?.data?.printer_ip ?? '').trim();
  const printerPort = parseInt(settingsData?.data?.printer_port ?? '9100', 10);
  const printOrder = async (order: ApiOrder) => {
    const orderStore = stores.find((store) => store.id === order.storeId);
    const effectivePrinterIp = (orderStore?.printerIp ?? printerIp ?? '').trim();
    const effectivePrinterPort = orderStore?.printerPort ?? printerPort;
    if (!effectivePrinterIp) {
      Alert.alert('Printer Not Set', 'Set the printer details inside this store before printing orders for it.');
      return;
    }
    setPrintingOrderId(order.id);
    try {
      await sendReceiptPrint(orderToPrintJob(order), effectivePrinterIp, effectivePrinterPort);
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
    if (filter === 'wholesale') return allOrders.filter((o) => o.orderSource === 'wholesale');
    return allOrders.filter((o) => o.status === filter);
  }, [allOrders, filter]);
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
    statusFiltered.filter((o) => isSameDay(getOrderTimelineDate(o), today)),
    [statusFiltered, today]
  );
  const thisWeekOrders = useMemo(() =>
    statusFiltered.filter((o) => isThisWeek(getOrderTimelineDate(o)) && !isSameDay(getOrderTimelineDate(o), today)),
    [statusFiltered, today]);
  const dateOrders = useMemo(() =>
    statusFiltered.filter((o) => isSameDay(getOrderTimelineDate(o), selectedDate)),
    [statusFiltered, selectedDate]
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
  const handleStatusChange = async (orderId: string, status: string) => {
    try {
      await api.director.updateOrderStatus(orderId, status);
      await qc.invalidateQueries({ queryKey: ['director-orders'] });
      await qc.invalidateQueries({ queryKey: ['director-stats'] });
      setSelectedOrder((prev) => prev ? { ...prev, status } : null);
      if (status === 'ready_for_pickup') {
        const order = allOrders.find((o) => o.id === orderId) ?? selectedOrder;
        if (order) {
          await printOrder({ ...order, status });
        }
      }
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error));
    }
  };
  const handleViewInvoice = async (order: ApiOrder) => {
    try {
      const invoiceUrl = order.invoicePdfUrl || order.invoiceUrl;
      if (!invoiceUrl) {
        Alert.alert('Invoice Unavailable', 'This invoice is still being prepared.');
        return;
      }
      await Linking.openURL(invoiceUrl);
    } catch (error) {
      Alert.alert('Invoice Unavailable', getErrorMessage(error, 'Could not open the invoice right now.'));
    }
  };
  const totalToday = statusFiltered.filter((o) => isSameDay(getOrderTimelineDate(o), today)).length;
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Page heading */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: TEXT }}>Orders</Text>
      </View>
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
          {viewMode === 'today' && (
            <>
              <SectionHeader title="Today's Orders" count={todayOrders.length} />
              {todayOrders.length === 0 ? (
                <View style={styles.emptySection}>
                  <Feather name="coffee" size={28} color={BORDER} />
                  <Text style={styles.emptyText}>No orders today yet</Text>
                </View>
              ) : (
                todayOrders.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    onPress={() => { setSelectedOrder(o); Haptics.selectionAsync(); }}
                    onPrint={() => printOrder(o)}
                    printing={printingOrderId === o.id}
                  />
                ))
              )}
            </>
          )}
          {viewMode === 'week' && (
            <>
              <View style={{ height: 8 }} />
              <SectionHeader title="Earlier This Week" count={thisWeekOrders.length} />
              {thisWeekOrders.length === 0 ? (
                <View style={styles.emptySection}>
                  <Text style={styles.emptyText}>No other orders this week</Text>
                </View>
              ) : (
                thisWeekOrders.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    onPress={() => { setSelectedOrder(o); Haptics.selectionAsync(); }}
                    onPrint={() => printOrder(o)}
                    printing={printingOrderId === o.id}
                  />
                ))
              )}
            </>
          )}
          {viewMode === 'date' && (
            <>
              <SectionHeader title={fmtDateChip(selectedDate)} count={dateOrders.length} />
              {dateOrders.length === 0 ? (
                <View style={styles.emptySection}>
                  <Feather name="calendar" size={28} color={BORDER} />
                  <Text style={styles.emptyText}>No orders on this date</Text>
                </View>
              ) : (
                dateOrders.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    onPress={() => { setSelectedOrder(o); Haptics.selectionAsync(); }}
                    onPrint={() => printOrder(o)}
                    printing={printingOrderId === o.id}
                  />
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
      {/* Order detail modal */}
      <OrderDetailModal
        order={selectedOrder}
        visible={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onStatusChange={handleStatusChange}
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
    </View>
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
