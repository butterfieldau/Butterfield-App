import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '@/lib/api';
import type { PosLoyaltyResult } from '@/lib/api';
import styles from './posStyles';
import { BLUE, CHERRY, DARK, WHITE, STAMP_GOAL, fmtCents } from './types';

export default function OrderCompleteModal({ order, customerEmail: initialEmail, onClose, onPrintTaxInvoice }: {
  order: {
    id: string; orderNumber: string; invoiceNumber?: string; totalCents: number;
    paymentMethod: 'cash' | 'eftpos' | 'split';
    amountTenderedCents?: number;
    surchargeCents: number;
    splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[];
    loyaltyResult: PosLoyaltyResult | null;
    customerName: string;
    ticketItems: Array<{ name: string; quantity: number; unitPriceCents: number; variantName?: string; options: string[] }>;
    discountAmountCents: number;
    discountLabel: string;
  };
  customerEmail?: string;
  onClose: () => void;
  onPrintTaxInvoice?: () => void;
}) {
  const changeCents = order.paymentMethod === 'cash' && order.amountTenderedCents
    ? Math.max(0, order.amountTenderedCents - order.totalCents)
    : null;
  const lr = order.loyaltyResult;
  const isOffline = order.id.startsWith('offline-');

  const [emailOpen,    setEmailOpen]    = useState(false);
  const [emailValue,   setEmailValue]   = useState(initialEmail ?? '');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent,    setEmailSent]    = useState(false);

  const handleSendEmail = async () => {
    const trimmed = emailValue.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    setEmailSending(true);
    try {
      await api.pos.emailInvoice(order.id, trimmed);
      setEmailSent(true);
      setEmailOpen(false);
    } catch (e: any) {
      Alert.alert('Email Failed', e?.message ?? 'Could not send the invoice. Check Resend is connected.');
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.completeBg}>
        <View style={styles.completeCard}>
          <View style={styles.completeCheck}>
            <Feather name="check" size={32} color={WHITE} />
          </View>
          <Text style={styles.completeTitle}>Payment Complete</Text>
          <Text style={styles.completeOrder}>#{order.orderNumber}</Text>
          {order.invoiceNumber ? (
            <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '500', marginTop: 2, marginBottom: 2 }}>
              Invoice #: {order.invoiceNumber}
            </Text>
          ) : null}
          <Text style={styles.completeTotal}>{fmtCents(order.totalCents)}</Text>
          {changeCents !== null && changeCents > 0 && (
            <View style={styles.changeRowComplete}>
              <Text style={styles.changeLabelComplete}>Change Due</Text>
              <Text style={styles.changeValueComplete}>{fmtCents(changeCents)}</Text>
            </View>
          )}

          {lr && (
            <View style={styles.loyaltyCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={styles.loyaltyStatLabel}>Points Earned</Text>
                  <Text style={styles.loyaltyStatValue}>+{lr.pointsEarned}</Text>
                  <Text style={styles.loyaltyStatSub}>{lr.newBalance} total</Text>
                </View>
                <View style={styles.loyaltyDivider} />
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={styles.loyaltyStatLabel}>Stamps</Text>
                  <Text style={styles.loyaltyStatValue}>{lr.newStampCount}/{lr.stampGoal ?? STAMP_GOAL}</Text>
                  <Text style={styles.loyaltyStatSub}>{lr.stampsAdded > 0 ? '+1 stamp' : 'no coffee'}</Text>
                </View>
              </View>
              {lr.rewardUnlocked && (
                <View style={styles.rewardUnlocked}>
                  <Feather name="gift" size={16} color="#16A34A" />
                  <Text style={styles.rewardUnlockedText}>☕ Free coffee reward unlocked!</Text>
                </View>
              )}
            </View>
          )}

          {!isOffline && onPrintTaxInvoice && (
            <TouchableOpacity
              onPress={onPrintTaxInvoice}
              style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', alignSelf: 'stretch', alignItems: 'center' }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 14, color: DARK, fontWeight: '600' }}>🖨  Print TAX Invoice</Text>
            </TouchableOpacity>
          )}

          {!isOffline && (
            emailSent ? (
              <View style={{ marginTop: 10, paddingVertical: 10, alignSelf: 'stretch', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#16A34A', fontWeight: '700' }}>✓ Invoice sent</Text>
              </View>
            ) : emailOpen ? (
              <View style={{ marginTop: 10, alignSelf: 'stretch' }}>
                <TextInput
                  value={emailValue}
                  onChangeText={setEmailValue}
                  placeholder="customer@email.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#1C1C1E', backgroundColor: '#F8FAFC', marginBottom: 8 }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setEmailOpen(false)}
                    style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', backgroundColor: '#F8FAFC' }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSendEmail}
                    disabled={emailSending}
                    style={{ flex: 2, paddingVertical: 9, borderRadius: 8, backgroundColor: emailSending ? '#93C5FD' : BLUE, alignItems: 'center' }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13, color: WHITE, fontWeight: '700' }}>{emailSending ? 'Sending…' : 'Send Invoice'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setEmailOpen(true)}
                style={{ marginTop: 10, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', alignSelf: 'stretch', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                activeOpacity={0.7}
              >
                <Feather name="mail" size={14} color="#334155" />
                <Text style={{ fontSize: 14, color: '#334155', fontWeight: '600' }}>Email Invoice</Text>
              </TouchableOpacity>
            )
          )}

          <TouchableOpacity onPress={onClose} style={[styles.completeCloseBtn, { marginTop: 16 }]} activeOpacity={0.8}>
            <Text style={styles.completeCloseBtnText}>New Order</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

