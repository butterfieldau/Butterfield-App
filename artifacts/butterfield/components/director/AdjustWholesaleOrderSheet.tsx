import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView,
  Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';

const MEMO_TYPES = [
  { key: 'credit_memo',     label: 'Credit Memo',     icon: 'file-text',   color: BLUE },
  { key: 'partial_refund',  label: 'Partial Refund',  icon: 'refresh-ccw', color: GREEN },
  { key: 'price_correction',label: 'Price Correction', icon: 'edit-2',     color: AMBER },
  { key: 'goodwill',        label: 'Goodwill Credit', icon: 'gift',        color: PURPLE },
];

function normalizeItems(raw: any): Array<{ id?: string; productId?: string; productName?: string; qty: number; unitCents: number; totalCents: number }> {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : Object.values(raw);
  return arr.map((item: any) => {
    const qty       = Number(item.qty ?? item.quantity ?? 1);
    const unitCents = Number(item.unitPriceCents ?? item.unitCents ?? item.priceCents ?? 0);
    const totalCents = Number(item.totalCents ?? (unitCents * qty));
    return {
      id:          item.id,
      productId:   item.productId ?? item.id,
      productName: item.productName ?? item.name ?? 'Item',
      qty,
      unitCents,
      totalCents,
    };
  });
}

export function AdjustWholesaleOrderSheet({ order, visible, onClose, onSaved }: {
  order: any | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [memoType, setMemoType]     = useState('credit_memo');
  const [reason, setReason]         = useState('');
  const [amountAud, setAmountAud]   = useState('');
  // Per-line refund amounts — keyed by item index, values are AUD strings
  const [lineAmounts, setLineAmounts] = useState<Record<number, string>>({});
  const [manualAmount, setManualAmount] = useState(false); // true when user has typed flat total
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    if (visible) {
      setMemoType('credit_memo');
      setReason('');
      setAmountAud('');
      setLineAmounts({});
      setManualAmount(false);
    }
  }, [visible]);

  // All hooks must run unconditionally before any early return
  const orderItems  = useMemo(() => normalizeItems(order?.items), [order?.items]);
  const maxRefundable = (order?.totalCents ?? 0) - (order?.refundedCents ?? 0);
  const existingMemos: any[] = Array.isArray(order?.creditMemos) ? order!.creditMemos : [];
  const isPaidByCard = !!(order?.isPaid && order?.stripePaymentIntentId &&
    order?.stripePaymentStatus !== 'net_terms' && order?.stripePaymentStatus !== 'pending');

  // Sum per-line amounts → cents
  const lineTotal = useMemo(() => {
    return Object.values(lineAmounts).reduce((s, v) => {
      const c = Math.round(parseFloat(v || '0') * 100);
      return s + (isNaN(c) ? 0 : c);
    }, 0);
  }, [lineAmounts]);

  // When any per-line amount changes and user hasn't typed flat total manually,
  // auto-populate the flat field
  useEffect(() => {
    if (!manualAmount && lineTotal > 0) {
      setAmountAud((lineTotal / 100).toFixed(2));
    }
  }, [lineTotal, manualAmount]);

  if (!order) return null;

  const amountCents = Math.round(parseFloat(amountAud || '0') * 100);
  const isValid = amountCents > 0 && amountCents <= maxRefundable && reason.trim().length > 0;

  const setLineAmount = (idx: number, value: string) => {
    setLineAmounts(prev => ({ ...prev, [idx]: value }));
    setManualAmount(false); // let per-line auto-compute take over
  };

  const handleAmountChange = (value: string) => {
    setAmountAud(value);
    setManualAmount(true); // user typed directly — override per-line sum
  };

  const buildLineItemsPayload = () => {
    return orderItems
      .map((item, idx) => {
        const lineCents = Math.round(parseFloat(lineAmounts[idx] || '0') * 100);
        return {
          productId:   item.productId,
          productName: item.productName,
          qty:         item.qty,
          amountCents: lineCents,
        };
      })
      .filter(li => li.amountCents > 0);
  };

  const handleSave = async () => {
    if (!isValid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const lineItemsPayload = buildLineItemsPayload();
      await api.director.adjustWholesaleOrder(order.id, {
        amountCents,
        reason: reason.trim(),
        type: memoType,
        lineItems: lineItemsPayload.length > 0 ? lineItemsPayload : undefined,
      });
      await qc.invalidateQueries({ queryKey: ['director-orders'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const msg = isPaidByCard
        ? `Stripe refund of $${(amountCents / 100).toFixed(2)} initiated.`
        : `Credit memo of $${(amountCents / 100).toFixed(2)} recorded.`;
      Alert.alert('Done', msg);
      onSaved();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not process adjustment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Header */}
        <View style={{ backgroundColor: CARD, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={onClose} style={{ padding: 6, marginRight: 8 }}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>Adjust / Credit</Text>
            <Text style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>
              #{order.orderNumber ?? order.poReference ?? order.id.slice(0, 8).toUpperCase()} · {order.customerName ?? ''}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

          {/* Payment context */}
          <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6 }}>ORDER PAYMENT</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: MUTED, fontSize: 13 }}>Order total</Text>
              <Text style={{ color: TEXT, fontWeight: '600', fontSize: 13 }}>${((order.totalCents ?? 0) / 100).toFixed(2)}</Text>
            </View>
            {(order.refundedCents ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: MUTED, fontSize: 13 }}>Already refunded</Text>
                <Text style={{ color: RED, fontWeight: '600', fontSize: 13 }}>−${((order.refundedCents ?? 0) / 100).toFixed(2)}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
              <Text style={{ color: TEXT, fontWeight: '700', fontSize: 14 }}>Max refundable</Text>
              <Text style={{ color: GREEN, fontWeight: '700', fontSize: 14 }}>${(maxRefundable / 100).toFixed(2)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isPaidByCard ? '#DCFCE7' : '#FEF3C7', borderRadius: 8, padding: 8 }}>
              <Feather name={isPaidByCard ? 'credit-card' : 'file-text'} size={13} color={isPaidByCard ? GREEN : AMBER} />
              <Text style={{ color: isPaidByCard ? '#166534' : '#92400E', fontSize: 12, fontWeight: '500', flex: 1 }}>
                {isPaidByCard
                  ? 'Paid by card — Stripe refund will be initiated automatically.'
                  : 'Net-terms / unpaid — credit memo will be recorded (no Stripe refund).'}
              </Text>
            </View>
          </View>

          {/* Per-line refund inputs — shown when order has line items */}
          {orderItems.length > 0 && (
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6 }}>PER LINE ITEM (OPTIONAL)</Text>
                <Text style={{ fontSize: 10, color: MUTED }}>Tap % to quick-fill</Text>
              </View>
              {orderItems.map((item, idx) => {
                const lineCents = Math.round(parseFloat(lineAmounts[idx] || '0') * 100);
                const itemMax   = Math.min(item.totalCents, maxRefundable);
                return (
                  <View key={idx} style={{ paddingVertical: 10, borderBottomWidth: idx < orderItems.length - 1 ? 1 : 0, borderBottomColor: BORDER, gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ color: TEXT, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{item.productName}</Text>
                        <Text style={{ color: MUTED, fontSize: 11 }}>
                          {item.qty} × ${(item.unitCents / 100).toFixed(2)} = ${(item.totalCents / 100).toFixed(2)}
                        </Text>
                      </View>
                      {/* Per-line quick buttons */}
                      <View style={{ flexDirection: 'row', gap: 5 }}>
                        {[50, 100].map(pct => (
                          <Pressable
                            key={pct}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setLineAmount(idx, (Math.round(itemMax * pct / 100) / 100).toFixed(2));
                            }}
                            style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: BLUE + '40' }}
                          >
                            <Text style={{ color: BLUE, fontSize: 10, fontWeight: '600' }}>{pct}%</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    {/* Per-line refund input */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: lineCents > itemMax ? RED : (lineCents > 0 ? BLUE : BORDER), borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#F9FAFB', gap: 4 }}>
                      <Text style={{ color: MUTED, fontSize: 14 }}>$</Text>
                      <TextInput
                        style={{ flex: 1, fontSize: 14, fontWeight: '600', color: TEXT }}
                        placeholder="0.00"
                        placeholderTextColor={MUTED}
                        value={lineAmounts[idx] ?? ''}
                        onChangeText={v => setLineAmount(idx, v)}
                        keyboardType="decimal-pad"
                      />
                      {lineCents > 0 && (
                        <Text style={{ color: lineCents > itemMax ? RED : GREEN, fontSize: 11, fontWeight: '600' }}>
                          {lineCents > itemMax ? 'Over max' : `−$${(lineCents / 100).toFixed(2)}`}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
              {lineTotal > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: BORDER }}>
                  <Text style={{ color: TEXT, fontWeight: '600', fontSize: 13 }}>Line item total</Text>
                  <Text style={{ color: lineTotal > maxRefundable ? RED : BLUE, fontWeight: '700', fontSize: 14 }}>${(lineTotal / 100).toFixed(2)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Memo type */}
          <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 10 }}>TYPE</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {MEMO_TYPES.map(t => {
                const active = memoType === t.key;
                return (
                  <Pressable key={t.key} onPress={() => { setMemoType(t.key); Haptics.selectionAsync(); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: active ? t.color : BORDER, backgroundColor: active ? `${t.color}15` : '#F9FAFB' }}>
                    <Feather name={t.icon as any} size={13} color={active ? t.color : MUTED} />
                    <Text style={{ color: active ? t.color : MUTED, fontWeight: '600', fontSize: 12 }}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Total amount override */}
          <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 8 }}>
              TOTAL CREDIT AMOUNT (AUD)
              {lineTotal > 0 && !manualAmount ? <Text style={{ color: BLUE, fontWeight: '400' }}> — from line items</Text> : null}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: amountCents > maxRefundable ? RED : BORDER, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#F9FAFB' }}>
              <Text style={{ color: MUTED, fontSize: 18, marginRight: 4 }}>$</Text>
              <TextInput
                style={{ flex: 1, fontSize: 22, fontWeight: '700', color: TEXT }}
                placeholder="0.00"
                placeholderTextColor={MUTED}
                value={amountAud}
                onChangeText={handleAmountChange}
                keyboardType="decimal-pad"
              />
            </View>
            {amountCents > maxRefundable && (
              <Text style={{ color: RED, fontSize: 12, marginTop: 6 }}>
                Exceeds refundable balance of ${(maxRefundable / 100).toFixed(2)}
              </Text>
            )}
            {/* Quick-set buttons */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {[10, 25, 50].map(pct => {
                const pctCents = Math.round(maxRefundable * pct / 100);
                return (
                  <Pressable key={pct}
                    onPress={() => { setAmountAud((pctCents / 100).toFixed(2)); setManualAmount(true); setLineAmounts({}); Haptics.selectionAsync(); }}
                    style={{ flex: 1, paddingVertical: 7, borderRadius: 10, backgroundColor: '#F0F4FF', borderWidth: 1, borderColor: BLUE + '40', alignItems: 'center' }}>
                    <Text style={{ color: BLUE, fontWeight: '600', fontSize: 12 }}>{pct}%</Text>
                    <Text style={{ color: MUTED, fontSize: 10 }}>${(pctCents / 100).toFixed(2)}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => { setAmountAud((maxRefundable / 100).toFixed(2)); setManualAmount(true); setLineAmounts({}); Haptics.selectionAsync(); }}
                style={{ flex: 1, paddingVertical: 7, borderRadius: 10, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: AMBER + '60', alignItems: 'center' }}>
                <Text style={{ color: AMBER, fontWeight: '600', fontSize: 12 }}>Full</Text>
                <Text style={{ color: MUTED, fontSize: 10 }}>${(maxRefundable / 100).toFixed(2)}</Text>
              </Pressable>
            </View>
          </View>

          {/* Reason */}
          <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 8 }}>REASON *</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, fontSize: 14, color: TEXT, minHeight: 80, textAlignVertical: 'top' }}
              placeholder="e.g. Short-shipped 2 units, price correction, goodwill gesture…"
              placeholderTextColor={MUTED}
              value={reason}
              onChangeText={setReason}
              multiline
            />
          </View>

          {/* Existing credit memos */}
          {existingMemos.length > 0 && (
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 10 }}>EXISTING CREDITS</Text>
              {existingMemos.map((memo, i) => (
                <View key={i} style={{ paddingVertical: 8, borderBottomWidth: i < existingMemos.length - 1 ? 1 : 0, borderBottomColor: BORDER, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: TEXT, fontWeight: '600', fontSize: 13 }}>−${((memo.amountCents ?? 0) / 100).toFixed(2)}</Text>
                    <Text style={{ color: MUTED, fontSize: 11 }}>{memo.createdAt ? new Date(memo.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</Text>
                  </View>
                  <Text style={{ color: MUTED, fontSize: 12 }}>{memo.reason ?? memo.type ?? 'Credit memo'} · by {memo.createdBy ?? '—'}</Text>
                  {/* Show per-line breakdown if present */}
                  {Array.isArray(memo.lineItems) && memo.lineItems.length > 0 && (
                    <View style={{ marginTop: 4, gap: 2 }}>
                      {memo.lineItems.map((li: any, j: number) => (
                        <Text key={j} style={{ color: MUTED, fontSize: 11, paddingLeft: 8 }}>
                          · {li.productName ?? li.productId} — −${((li.amountCents ?? 0) / 100).toFixed(2)}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Save button */}
        <View style={{ padding: 16, paddingBottom: insets.bottom + 8, backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORDER }}>
          <Pressable
            onPress={handleSave}
            disabled={saving || !isValid}
            style={{ height: 52, borderRadius: 14, backgroundColor: saving || !isValid ? MUTED : RED, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="refresh-ccw" size={18} color="#fff" />}
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              {saving ? 'Processing…' : `Issue ${MEMO_TYPES.find(t => t.key === memoType)?.label ?? 'Credit'}`}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default AdjustWholesaleOrderSheet;
