import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import { api } from '@/lib/api';

const BG = '#EFF6FF';
const CARD = '#FFFFFF';
const BLUE = '#1493FF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN = '#22C55E';

const BRAND_BG: Record<string, string> = {
  visa: '#1A3A8C',
  mastercard: '#8C1B1B',
  amex: '#1B5C8C',
};

function AddCardModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { nameOnCard: string; isDefault: boolean }) => Promise<void>;
}) {
  const { createPaymentMethod } = useStripe();
  const [nameOnCard, setNameOnCard] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setNameOnCard('');
    setIsDefault(false);
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { paymentMethod, error } = await createPaymentMethod({
        paymentMethodType: 'Card',
        paymentMethodData: nameOnCard.trim() ? { billingDetails: { name: nameOnCard.trim() } } : undefined,
      });
      if (error) throw new Error(error.message);
      if (!paymentMethod?.id) throw new Error('We could not save that card. Please try again.');
      await api.wholesale.addCard({
        paymentMethodId: paymentMethod.id,
        nameOnCard: nameOnCard.trim() || undefined,
        isDefault,
      });
      await onSave({ nameOnCard: nameOnCard.trim(), isDefault });
      reset();
    } catch (err: any) {
      Alert.alert('Card Error', err?.message ?? 'Could not save that card.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalHeader}>
          <Pressable onPress={handleClose} style={styles.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={styles.modalTitle}>Add Payment Card</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name="lock" size={11} color={GREEN} />
            <Text style={{ color: GREEN, fontWeight: '600', fontSize: 11 }}>Secure</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={styles.notice}>
            <Feather name="shield" size={14} color={GREEN} style={{ marginTop: 1 }} />
            <Text style={styles.noticeText}>
              Cards are saved securely with Stripe and can be reused for wholesale checkout and invoice payments.
            </Text>
          </View>

          <View style={{ gap: 4 }}>
            <Text style={styles.label}>Name on Card (optional)</Text>
            <View style={styles.inputRow}>
              <Feather name="user" size={15} color={MUTED} />
              <TextInput
                style={styles.input}
                placeholder="As it appears on the card"
                placeholderTextColor={MUTED}
                value={nameOnCard}
                onChangeText={setNameOnCard}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.cardFieldWrap}>
            <CardField
              postalCodeEnabled={false}
              style={{ height: 50, width: '100%' }}
              cardStyle={{ backgroundColor: '#FFFFFF', textColor: TEXT, borderWidth: 0 }}
              placeholders={{ number: '1234 1234 1234 1234' }}
            />
          </View>

          <View style={styles.defaultRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.defaultLabel}>Set as default</Text>
              <Text style={styles.defaultSub}>This card will be used first for future wholesale payments.</Text>
            </View>
            <Switch
              value={isDefault}
              onValueChange={setIsDefault}
              trackColor={{ false: '#D1D5DB', true: '#BFDBFE' }}
              thumbColor={isDefault ? BLUE : '#FFFFFF'}
            />
          </View>

          <Pressable onPress={handleSave} disabled={saving} style={[styles.saveBtn, { opacity: saving ? 0.7 : 1 }]}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save Card</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function PaymentMethods() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['payment-methods'], queryFn: api.payment.methods, retry: 1 });
  const cards = data?.data ?? [];
  const [showModal, setShowModal] = useState(false);

  const refreshCards = async () => {
    await qc.invalidateQueries({ queryKey: ['payment-methods'] });
    await qc.invalidateQueries({ queryKey: ['wholesale-cards'] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowModal(false);
  };

  const handleSetDefault = async (cardId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await api.payment.setDefaultMethod(cardId);
    await qc.invalidateQueries({ queryKey: ['payment-methods'] });
  };

  const handleRemove = (cardId: string, label: string) => {
    Alert.alert('Remove Card', `Remove ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await api.payment.deleteMethod(cardId);
          await qc.invalidateQueries({ queryKey: ['payment-methods'] });
          await qc.invalidateQueries({ queryKey: ['wholesale-cards'] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  return (
    <View style={{ gap: 10 }}>
      <AddCardModal visible={showModal} onClose={() => setShowModal(false)} onSave={refreshCards} />

      {isLoading ? (
        <ActivityIndicator color={BLUE} style={{ paddingVertical: 24 }} />
      ) : (
        <View style={{ gap: 10 }}>
          {cards.map((card) => {
            const brand = (card.brand ?? 'card').toLowerCase();
            return (
              <View key={card.id} style={styles.cardWrap}>
                <View style={[styles.cardFace, { backgroundColor: BRAND_BG[brand] ?? '#1A3A8C' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 13 }}>
                      {(card.brand ?? 'card').toUpperCase()}
                    </Text>
                    {card.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardNumber}>•••• •••• •••• {card.last4}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View>
                      <Text style={styles.cardLabel}>CARD</Text>
                      <Text style={styles.cardValue}>{(card.brand ?? 'card').toUpperCase()}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.cardLabel}>EXPIRES</Text>
                      <Text style={styles.cardValue}>
                        {`${String(card.expMonth ?? '').padStart(2, '0')}/${String(card.expYear ?? '').slice(-2)}`}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  {!card.isDefault && (
                    <Pressable onPress={() => handleSetDefault(card.id)} style={[styles.actionBtn, styles.primaryAction]}>
                      <Feather name="check-circle" size={14} color={BLUE} />
                      <Text style={[styles.actionText, { color: BLUE }]}>Set Default</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => handleRemove(card.id, `${(card.brand ?? 'card').toUpperCase()} •••• ${card.last4}`)}
                    style={[styles.actionBtn, styles.dangerAction]}
                  >
                    <Feather name="trash-2" size={14} color="#DC2626" />
                    <Text style={[styles.actionText, { color: '#DC2626' }]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          <Pressable onPress={() => setShowModal(true)} style={styles.addCardBtn}>
            <Feather name="plus-circle" size={16} color={BLUE} />
            <Text style={styles.addCardBtnText}>{cards.length > 0 ? 'Add another card' : 'Add payment card'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: TEXT },
  notice: { flexDirection: 'row', gap: 8, backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1, borderRadius: 14, padding: 14 },
  noticeText: { flex: 1, fontSize: 13, color: '#166534', lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: MUTED },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  input: { flex: 1, fontSize: 14, color: TEXT, fontWeight: '400' },
  cardFieldWrap: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14 },
  defaultLabel: { fontSize: 14, fontWeight: '600', color: TEXT },
  defaultSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  saveBtn: { height: 50, borderRadius: 25, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cardWrap: { gap: 10 },
  cardFace: { borderRadius: 18, padding: 18, gap: 18 },
  defaultBadge: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.28)', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  defaultBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cardNumber: { color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: 2.4 },
  cardLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  cardValue: { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 3 },
  cardActions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 12 },
  primaryAction: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  dangerAction: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  actionText: { fontSize: 13, fontWeight: '700' },
  addCardBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', borderRadius: 14, paddingVertical: 14 },
  addCardBtnText: { fontSize: 14, fontWeight: '700', color: BLUE },
});
