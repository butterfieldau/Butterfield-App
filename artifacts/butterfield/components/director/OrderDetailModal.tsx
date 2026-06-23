import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeOrderItems } from '@/lib/orderItems';
import {
  STATUS_COLORS, STATUS_LABEL, ACTION_LABEL, WHOLESALE_NEXT,
  getCustomerNextStatuses,
} from '@/lib/orderStatus';
import type { ApiOrder } from '@/lib/api';
import { styles } from './ordersStyles';
import { fmtTime, openMap } from './ordersHelpers';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const NAVY   = '#1A2B4A';
const RED    = '#DC2626';
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export default function OrderDetailModal({ order, visible, onClose, onStatusChange, onAcceptOrder, onPrintReceipt, onViewInvoice, printing, canCancelRefund }: {
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
  const AMBER = '#F59E0B';

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
    setPendingStatus(status); setCancelReasonText(''); setShowCancelModal(true);
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
    setShowCancelModal(false); setCancelReasonText('');
    setUpdating(true);
    await onStatusChange(order.id, pendingStatus, reason);
    setUpdating(false);
  };
  const discountCents  = order.discountCents ?? 0;
  const loyaltyUsed    = order.loyaltyPointsUsed ?? 0;
  const loyaltyEarned  = order.loyaltyPointsEarned ?? 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
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
            <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>
              {new Date(order.createdAt).toLocaleDateString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney',
              })} · {fmtTime(order.createdAt)}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
          {order.status === 'scheduled' && (
            <View style={{ backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#FDE68A', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="clock" size={16} color="#92400E" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E', flex: 1 }}>Awaiting Acceptance</Text>
              </View>
              {order.scheduledFor && (
                <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '400' }}>
                  {order.type === 'delivery' ? 'Delivery' : 'Pickup'} scheduled for{' '}
                  {new Date(order.scheduledFor).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' })}
                  {order.type !== 'delivery' ? ` at ${new Date(order.scheduledFor).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })}` : ''}
                </Text>
              )}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Alert.alert('Accept Order', `Confirm this ${order.type === 'delivery' ? 'delivery' : 'pickup'} order and notify the customer?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Accept', onPress: () => { setAccepting(true); onAcceptOrder(order.id).finally(() => setAccepting(false)); } },
                  ]);
                }}
                disabled={accepting}
                style={{ backgroundColor: accepting ? MUTED : AMBER, borderRadius: 10, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
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
          {order.status === 'accepted' && order.scheduledFor && (
            <View style={{ backgroundColor: '#DCFCE7', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#86EFAC', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="check-circle" size={16} color="#166534" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#166534', flex: 1 }}>
                Confirmed for {new Date(order.scheduledFor).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' })}
                {order.type !== 'delivery' ? ` at ${new Date(order.scheduledFor).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })}` : ''}
              </Text>
            </View>
          )}
          <View style={[styles.section, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <View>
              <Text style={styles.sectionLabel}>Status</Text>
              <View style={[styles.statusPill, { backgroundColor: colors.bg, marginTop: 4 }]}>
                <Text style={[styles.statusPillText, { color: colors.text }]}>{label}</Text>
              </View>
            </View>
            {next.length > 0 && (
              <Pressable onPress={handleChangeStatus} disabled={updating} style={[styles.updateStatusBtn, { backgroundColor: updating ? MUTED : BLUE }]}>
                {updating ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Feather name="edit-3" size={13} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Update Status</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
          <Pressable onPress={onPrintReceipt} disabled={printing} style={[styles.printBtn, { backgroundColor: printing ? MUTED : TEXT }]}>
            {printing ? <ActivityIndicator color="#fff" size="small" /> : (
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
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>View invoice {order.invoiceNumber ?? ''}</Text>
              </>
            </Pressable>
          ) : null}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{isWholesale ? 'Account' : 'Customer'}</Text>
            <View style={{ gap: 4, marginTop: 6 }}>
              {order.customerName && (<View style={styles.detailRow}><Feather name={isWholesale ? 'briefcase' : 'user'} size={14} color={MUTED} /><Text style={styles.detailText}>{order.customerName}</Text></View>)}
              {order.customerEmail && (<View style={styles.detailRow}><Feather name="mail" size={14} color={MUTED} /><Text style={styles.detailText}>{order.customerEmail}</Text></View>)}
              {order.customerPhone && (<View style={styles.detailRow}><Feather name="phone" size={14} color={MUTED} /><Text style={styles.detailText}>{order.customerPhone}</Text></View>)}
              {order.companyAbn && (<View style={styles.detailRow}><Feather name="hash" size={14} color={MUTED} /><Text style={styles.detailText}>ABN: {order.companyAbn}</Text></View>)}
              {isWholesale && order.poReference && (<View style={styles.detailRow}><Feather name="file-text" size={14} color={MUTED} /><Text style={styles.detailText}>PO: {order.poReference}</Text></View>)}
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {(order.type === 'delivery' || order.deliveryType === 'delivery') ? 'Delivery Details' : order.scheduledFor ? 'Pickup Details' : 'ASAP Pickup Details'}
            </Text>
            <View style={{ gap: 4, marginTop: 6 }}>
              <View style={styles.detailRow}>
                <Feather name={order.type === 'delivery' || order.deliveryType === 'delivery' ? 'truck' : 'map-pin'} size={14} color={MUTED} />
                <Text style={styles.detailText}>
                  {(order.type === 'delivery' || order.deliveryType === 'delivery') ? 'Delivery' : order.scheduledFor ? 'Pickup' : 'ASAP Pickup'}
                </Text>
              </View>
              {(order.deliveryAddress || order.street) && (() => {
                const addr = order.deliveryAddress ?? [order.street, order.suburb, order.postcode].filter(Boolean).join(', ');
                return (
                  <Pressable onPress={() => { openMap(addr); Haptics.selectionAsync(); }}
                    style={[styles.detailRow, { backgroundColor: '#EFF6FF', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#BFDBFE' }]}>
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
                    {new Date(order.scheduledDate).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' })}
                  </Text>
                </View>
              )}
              {order.contactName && (<View style={styles.detailRow}><Feather name="user" size={14} color={MUTED} /><Text style={styles.detailText}>{order.contactName}</Text></View>)}
              {order.contactPhone && (<View style={styles.detailRow}><Feather name="phone" size={14} color={MUTED} /><Text style={styles.detailText}>{order.contactPhone}</Text></View>)}
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Items ({items.length})</Text>
            <View style={{ gap: 0, marginTop: 6 }}>
              {items.map((item, i: number) => (
                <View key={i} style={[styles.itemRow, i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ color: TEXT, fontWeight: '500', fontSize: 14 }}>
                        {item.name}{item.variantName ? ` · ${item.variantName}` : ''}
                      </Text>
                      {item.isFreeReward && (<View style={{ backgroundColor: '#DCFCE7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ fontSize: 10, fontWeight: '700', color: '#166534', letterSpacing: 0.5 }}>FREE</Text></View>)}
                      {item.priceOverrideCents !== undefined && (<View style={{ backgroundColor: '#FEF3C7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ fontSize: 10, fontWeight: '700', color: '#92400E', letterSpacing: 0.5 }}>PRICE ADJ</Text></View>)}
                    </View>
                    <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>
                      {item.quantity} ×{' '}
                      {item.originalPriceCents !== undefined ? (
                        <><Text style={{ textDecorationLine: 'line-through' }}>${(item.originalPriceCents / 100).toFixed(2)}</Text>{' '}${(item.unitPriceCents / 100).toFixed(2)}</>
                      ) : (`$${(item.unitPriceCents / 100).toFixed(2)}`)}
                    </Text>
                    {item.notableOptions.length > 0 && (<Text style={{ color: BLUE, fontWeight: '400', fontSize: 12 }}>{item.notableOptions.join(' · ')}</Text>)}
                    {item.baristaNote ? (<Text style={{ color: MUTED, fontWeight: '400', fontSize: 11, fontStyle: 'italic' }}>"{item.baristaNote}"</Text>) : null}
                  </View>
                  <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14 }}>${(item.lineTotalCents / 100).toFixed(2)}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Summary</Text>
            <View style={{ gap: 6, marginTop: 6 }}>
              {discountCents > 0 && (<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: MUTED, fontWeight: '400', fontSize: 13 }}>Discount</Text><Text style={{ color: GREEN, fontWeight: '500', fontSize: 13 }}>−${(discountCents / 100).toFixed(2)}</Text></View>)}
              {loyaltyUsed > 0 && (<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: MUTED, fontWeight: '400', fontSize: 13 }}>Points redeemed</Text><Text style={{ color: GREEN, fontWeight: '500', fontSize: 13 }}>−{loyaltyUsed} pts</Text></View>)}
              {isWholesale && (order.deliveryFeeCents ?? 0) > 0 && (<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: MUTED, fontWeight: '400', fontSize: 13 }}>Delivery fee</Text><Text style={{ color: TEXT, fontWeight: '500', fontSize: 13 }}>${((order.deliveryFeeCents ?? 0) / 100).toFixed(2)}</Text></View>)}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
                <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15 }}>Total</Text>
                <Text style={{ color: BLUE, fontWeight: '700', fontSize: 15 }}>AUD ${((order.totalCents ?? 0) / 100).toFixed(2)}</Text>
              </View>
              {loyaltyEarned > 0 && (<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>Points earned</Text><Text style={{ color: '#F59E0B', fontWeight: '500', fontSize: 12 }}>+{loyaltyEarned} pts</Text></View>)}
              {isWholesale && order.isPaid != null && (<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>Payment</Text><Text style={{ color: order.isPaid ? GREEN : '#EF4444', fontWeight: '500', fontSize: 12 }}>{order.isPaid ? 'Paid' : 'Awaiting Payment'}</Text></View>)}
            </View>
          </View>
          {order.notes ? (<View style={styles.section}><Text style={styles.sectionLabel}>Notes</Text><Text style={{ color: TEXT, fontWeight: '400', fontSize: 14, marginTop: 6, lineHeight: 20 }}>{order.notes}</Text></View>) : null}
          {order.cancelReason ? (
            <View style={[styles.section, { backgroundColor: '#FEF2F2', borderRadius: 12, borderWidth: 1, borderColor: '#FECACA' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Feather name="x-circle" size={14} color={RED} /><Text style={[styles.sectionLabel, { color: RED }]}>Cancellation Reason</Text>
              </View>
              <Text style={{ color: '#7F1D1D', fontWeight: '400', fontSize: 14, lineHeight: 20 }}>{order.cancelReason}</Text>
            </View>
          ) : null}
        </ScrollView>

        <Modal visible={showCancelModal} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setShowCancelModal(false); setCancelReasonText(''); }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 20 }} onPress={() => { Keyboard.dismiss(); setShowCancelModal(false); setCancelReasonText(''); }}>
              <Pressable onPress={() => {}} style={{ backgroundColor: CARD, borderRadius: 20, padding: 24, gap: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="x-circle" size={18} color={RED} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>{pendingStatus === 'refunded' ? 'Confirm Refund' : 'Cancel Order'}</Text>
                    <Text style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>A reason is required before continuing.</Text>
                  </View>
                </View>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: MUTED, letterSpacing: 0.6, marginBottom: 8 }}>REASON FOR CANCELLATION *</Text>
                  <TextInput
                    style={{ backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: cancelReasonText.trim() ? BORDER : '#FECACA', borderRadius: 12, padding: 14, fontSize: 15, color: TEXT, minHeight: 90, textAlignVertical: 'top' }}
                    placeholder="e.g. Customer requested cancellation, item out of stock, duplicate order…"
                    placeholderTextColor={MUTED}
                    value={cancelReasonText}
                    onChangeText={setCancelReasonText}
                    multiline autoFocus
                  />
                  {!cancelReasonText.trim() && <Text style={{ color: RED, fontSize: 12, marginTop: 4 }}>Please enter a reason to continue.</Text>}
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Pressable style={{ flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: BORDER }} onPress={() => { Keyboard.dismiss(); setShowCancelModal(false); setCancelReasonText(''); }}>
                    <Text style={{ color: TEXT, fontWeight: '600', fontSize: 15 }}>Go Back</Text>
                  </Pressable>
                  <Pressable style={[{ flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, { backgroundColor: cancelReasonText.trim() ? RED : '#FCA5A5' }]} onPress={handleConfirmCancel} disabled={!cancelReasonText.trim()}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{pendingStatus === 'refunded' ? 'Confirm Refund' : 'Confirm Cancel'}</Text>
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
