import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable,
  ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CardField, StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { api } from '@/lib/api';
import type { Invoice } from '@/types';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';

const BRAND_BG: Record<string, string> = {
  visa: '#1A3A8C', mastercard: '#8C1B1B', amex: '#1B5C8C',
};

interface Props {
  visible: boolean;
  invoice: Invoice | null;
  orderId: string | null;
  onClose: () => void;
  onPaid: () => void;
}

function InvoicePaymentModalInner({ visible, invoice, orderId, onClose, onPaid }: Props) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { handleNextAction } = useStripe();

  const { data: cardsData } = useQuery({
    queryKey: ['wholesale-cards'],
    queryFn: api.wholesale.cards,
    enabled: visible,
    retry: 1,
  });
  const { data: stripeConfigData } = useQuery({
    queryKey: ['stripe-config'],
    queryFn:  api.payment.config,
    enabled:  visible,
    staleTime: 300_000,
  });

  const cards = cardsData?.data ?? [];
  const defCard = cards.find((c: any) => c.isDefault) ?? cards[0] ?? null;

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [saveNewCard, setSaveNewCard] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feeInfo, setFeeInfo] = useState<{
    invoiceAmountCents: number;
    processingFeeCents: number;
    totalWithFeeCents: number;
  } | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const { createPaymentMethod } = useStripe();

  useEffect(() => {
    if (!visible) {
      setSelectedCardId(null);
      setUseNewCard(false);
      setSaveNewCard(true);
      setFeeInfo(null);
      setSubmitting(false);
    }
  }, [visible]);

  useEffect(() => {
    if (cards.length === 0) {
      setUseNewCard(true);
    } else if (!selectedCardId) {
      setSelectedCardId(defCard?.id ?? null);
    }
  }, [cards, defCard, selectedCardId]);

  const previewCard = useNewCard ? null : (cards.find((c: any) => c.id === selectedCardId) ?? defCard);

  const loadFeeInfo = async () => {
    if (!orderId || !invoice || feeInfo) return;
    setFeeLoading(true);
    try {
      const invoiceAmountCents = Math.round(invoice.amount * 100);
      const STRIPE_RATE = 0.017;
      const STRIPE_FIXED = 30;
      const fee = invoiceAmountCents > 0
        ? Math.max(0, Math.round(invoiceAmountCents * STRIPE_RATE) + STRIPE_FIXED)
        : 0;
      setFeeInfo({
        invoiceAmountCents,
        processingFeeCents: fee,
        totalWithFeeCents: invoiceAmountCents + fee,
      });
    } finally {
      setFeeLoading(false);
    }
  };

  useEffect(() => {
    if (visible && invoice) loadFeeInfo();
  }, [visible, invoice?.id]);

  const handlePay = async () => {
    if (!orderId || !invoice) return;
    setSubmitting(true);
    try {
      let paymentMethodId: string;

      if (useNewCard) {
        const { paymentMethod, error } = await createPaymentMethod({ paymentMethodType: 'Card' });
        if (error) throw new Error(error.message);
        if (!paymentMethod?.id) throw new Error('Could not read card details. Please try again.');

        if (saveNewCard) {
          await api.wholesale.addCard({
            paymentMethodId: paymentMethod.id,
            isDefault: cards.length === 0,
          });
          await qc.invalidateQueries({ queryKey: ['wholesale-cards'] });
          await qc.invalidateQueries({ queryKey: ['payment-methods'] });
        }
        paymentMethodId = paymentMethod.id;
      } else {
        if (!selectedCardId) throw new Error('Please select a payment card.');
        paymentMethodId = selectedCardId;
      }

      const intentData = await api.wholesale.invoicePaymentIntent(orderId, paymentMethodId);
      if (!intentData.clientSecret && !intentData.success) {
        throw new Error('Could not create payment. Please try again.');
      }

      let finalPaymentIntentId = intentData.paymentIntentId;

      if (intentData.requiresAction && intentData.clientSecret) {
        const { error } = await handleNextAction(intentData.clientSecret);
        if (error) throw new Error(error.message);

        const confirmed = await api.wholesale.confirmIntent(finalPaymentIntentId);
        if (!confirmed.success) {
          throw new Error('Payment authorization failed. Please try another card.');
        }
        finalPaymentIntentId = confirmed.paymentIntentId;
      }

      await api.wholesale.invoiceConfirmPayment(orderId, finalPaymentIntentId);

      await qc.invalidateQueries({ queryKey: ['wholesale-invoices'] });
      await qc.invalidateQueries({ queryKey: ['wholesale-orders'] });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPaid();
    } catch (err: any) {
      Alert.alert('Payment Failed', err?.message ?? 'Could not process payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!invoice) return null;

  const invoiceCents = feeInfo?.invoiceAmountCents ?? Math.round(invoice.amount * 100);
  const feeCents     = feeInfo?.processingFeeCents ?? 0;
  const totalCents   = feeInfo?.totalWithFeeCents  ?? invoiceCents;
  const fmtAUD = (cents: number) => `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Header */}
        <View style={[st.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} style={st.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={st.title}>Pay Invoice</Text>
            <Text style={st.subtitle}>{invoice.number}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Amount breakdown */}
          <View style={st.card}>
            <Text style={st.sectionTitle}>Payment Summary</Text>
            <View style={{ gap: 10, marginTop: 6 }}>
              <View style={st.row}>
                <Text style={st.rowLabel}>Invoice amount</Text>
                <Text style={st.rowValue}>{fmtAUD(invoiceCents)}</Text>
              </View>
              <View style={st.row}>
                <View style={{ flex: 1 }}>
                  <Text style={st.rowLabel}>Card processing fee</Text>
                  <Text style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>1.7% + $0.30 AUD</Text>
                </View>
                <Text style={st.rowValue}>{fmtAUD(feeCents)}</Text>
              </View>
              <View style={[st.row, { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10 }]}>
                <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15 }}>Total charged</Text>
                <Text style={{ color: BLUE, fontWeight: '700', fontSize: 15 }}>{fmtAUD(totalCents)}</Text>
              </View>
            </View>
          </View>

          {/* Card selection */}
          {cards.length > 0 && (
            <View style={st.card}>
              <Text style={st.sectionTitle}>Payment Method</Text>
              <View style={{ gap: 8, marginTop: 6 }}>
                {cards.map((card: any) => {
                  const brand = (card.brand ?? card.cardBrand ?? 'card').toLowerCase();
                  const isSelected = !useNewCard && selectedCardId === card.id;
                  return (
                    <Pressable
                      key={card.id}
                      onPress={() => { setSelectedCardId(card.id); setUseNewCard(false); Haptics.selectionAsync(); }}
                      style={[st.cardOption, isSelected && { borderColor: BLUE, backgroundColor: '#EFF6FF' }]}
                    >
                      <View style={[st.cardIcon, { backgroundColor: BRAND_BG[brand] ?? '#1A3A8C' }]}>
                        <Feather name="credit-card" size={13} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: TEXT, fontWeight: '600', fontSize: 13 }}>
                          {(card.brand ?? card.cardBrand ?? 'Card').charAt(0).toUpperCase() +
                           (card.brand ?? card.cardBrand ?? 'card').slice(1)} •••• {card.last4}
                        </Text>
                        {card.isDefault && (
                          <Text style={{ color: MUTED, fontSize: 11 }}>Default card</Text>
                        )}
                      </View>
                      <View style={[st.radioOuter, isSelected && { borderColor: BLUE }]}>
                        {isSelected && <View style={st.radioInner} />}
                      </View>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => { setUseNewCard(true); setSelectedCardId(null); Haptics.selectionAsync(); }}
                  style={[st.cardOption, useNewCard && { borderColor: BLUE, backgroundColor: '#EFF6FF' }]}
                >
                  <View style={[st.cardIcon, { backgroundColor: '#E0F2FE' }]}>
                    <Feather name="plus" size={13} color={BLUE} />
                  </View>
                  <Text style={{ flex: 1, color: BLUE, fontWeight: '600', fontSize: 13 }}>Use a different card</Text>
                  <View style={[st.radioOuter, useNewCard && { borderColor: BLUE }]}>
                    {useNewCard && <View style={st.radioInner} />}
                  </View>
                </Pressable>
              </View>
            </View>
          )}

          {/* New card entry */}
          {useNewCard && (
            <View style={st.card}>
              <Text style={st.sectionTitle}>Card Details</Text>
              <View style={{ gap: 8, marginTop: 6 }}>
                <View style={st.cardFieldWrap}>
                  <CardField
                    postalCodeEnabled={false}
                    style={{ height: 50, width: '100%' }}
                    cardStyle={{ backgroundColor: CARD, textColor: TEXT, borderWidth: 0 }}
                    placeholders={{ number: '1234 1234 1234 1234' }}
                  />
                </View>
                {cards.length > 0 && (
                  <View style={st.saveRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: TEXT, fontWeight: '600', fontSize: 13 }}>Save card for future payments</Text>
                    </View>
                    <Switch
                      value={saveNewCard}
                      onValueChange={setSaveNewCard}
                      trackColor={{ false: '#D1D5DB', true: '#BFDBFE' }}
                      thumbColor={saveNewCard ? BLUE : '#fff'}
                    />
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Security note */}
          <View style={st.secureNote}>
            <Feather name="lock" size={12} color={GREEN} />
            <Text style={st.secureText}>
              Payments are processed securely by Stripe. Your card details are never stored on our servers.
            </Text>
          </View>

          {/* Pay button */}
          <Pressable
            onPress={handlePay}
            disabled={submitting || feeLoading || (!useNewCard && !selectedCardId)}
            style={[st.payBtn, { opacity: submitting || feeLoading ? 0.7 : 1 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="check-circle" size={16} color="#fff" />
                <Text style={st.payBtnText}>
                  {feeLoading ? 'Calculating…' : `Pay ${fmtAUD(totalCents)} AUD`}
                </Text>
              </>
            )}
          </Pressable>

          <Pressable onPress={onClose} style={st.cancelBtn}>
            <Text style={st.cancelBtnText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

export function InvoicePaymentModal(props: Props) {
  const { data: stripeConfigData } = useQuery({
    queryKey: ['stripe-config'],
    queryFn:  api.payment.config,
    enabled:  props.visible,
    staleTime: 300_000,
  });
  const publishableKey = stripeConfigData?.data?.publishableKey ?? null;

  if (!publishableKey) {
    return (
      <Modal
        visible={props.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={props.onClose}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: BG }}>
          <ActivityIndicator color={BLUE} />
          <Text style={{ color: MUTED, fontSize: 14 }}>Loading payment…</Text>
          <Pressable onPress={props.onClose} style={[st.cancelBtn, { marginTop: 8 }]}>
            <Text style={st.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <StripeProvider publishableKey={publishableKey}>
      <InvoicePaymentModalInner {...props} />
    </StripeProvider>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD,
  },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 17, fontWeight: '700', color: TEXT },
  subtitle: { fontSize: 12, color: MUTED, marginTop: 1 },
  card:     { backgroundColor: CARD, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: MUTED, letterSpacing: 0.3, textTransform: 'uppercase' },
  row:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  rowLabel: { color: MUTED, fontWeight: '400', fontSize: 13, flex: 1 },
  rowValue: { color: TEXT, fontWeight: '500', fontSize: 13 },
  cardOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: BORDER, borderRadius: 14,
    padding: 12, backgroundColor: CARD,
  },
  cardIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: BLUE },
  cardFieldWrap: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  saveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: BG, borderRadius: 12, padding: 12,
  },
  secureNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1, borderRadius: 12, padding: 12,
  },
  secureText: { flex: 1, fontSize: 12, color: '#166534', lineHeight: 17 },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 52, borderRadius: 26, backgroundColor: BLUE,
  },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', padding: 14 },
  cancelBtnText: { color: MUTED, fontWeight: '500', fontSize: 14 },
});
