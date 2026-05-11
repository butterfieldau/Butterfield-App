import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';

const BRAND_BG: Record<string, string> = {
  Visa: '#1A3A8C', Mastercard: '#8C1B1B', Amex: '#1B5C8C',
};

function detectBrand(number: string): string {
  const n = number.replace(/\s/g, '');
  if (/^(34|37)/.test(n)) return 'Amex';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'Mastercard';
  return 'Visa';
}

function formatCardNumber(raw: string, brand: string): string {
  const digits = raw.replace(/\D/g, '');
  const maxLen = brand === 'Amex' ? 15 : 16;
  const trimmed = digits.slice(0, maxLen);
  if (brand === 'Amex') {
    const p1 = trimmed.slice(0, 4);
    const p2 = trimmed.slice(4, 10);
    const p3 = trimmed.slice(10, 15);
    return [p1, p2, p3].filter(Boolean).join(' ');
  }
  return trimmed.match(/.{1,4}/g)?.join(' ') ?? trimmed;
}

interface CardModalProps {
  visible: boolean;
  editCard: any | null;
  onClose: () => void;
  onSave: (data: { nameOnCard: string; cardBrand: string; last4: string; expiry: string; isDefault: boolean }) => Promise<void>;
}

function CardModal({ visible, editCard, onClose, onSave }: CardModalProps) {
  const [nameOnCard, setNameOnCard] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry]         = useState('');
  const [isDefault, setIsDefault]   = useState(false);
  const [saving, setSaving]         = useState(false);

  const brand  = detectBrand(cardNumber);
  const maxLen = brand === 'Amex' ? 15 : 16;

  const reset = () => {
    setNameOnCard(''); setCardNumber(''); setExpiry('');
    setIsDefault(false); setSaving(false);
  };
  const handleClose = () => { reset(); onClose(); };

  const handleNumberChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, maxLen);
    setCardNumber(formatCardNumber(digits, detectBrand(digits)));
  };
  const handleExpiryChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    setExpiry(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
  };

  const handleSave = async () => {
    const digits = cardNumber.replace(/\s/g, '');
    if (!nameOnCard.trim()) { Alert.alert('Required', 'Please enter the name on the card.'); return; }
    if (digits.length < maxLen) { Alert.alert('Invalid', `Please enter your complete ${maxLen}-digit card number.`); return; }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) { Alert.alert('Invalid', 'Enter expiry as MM/YY (e.g. 09/27).'); return; }
    setSaving(true);
    try {
      await onSave({
        nameOnCard: nameOnCard.trim(), cardBrand: brand,
        last4: digits.slice(-4), expiry, isDefault,
      });
      reset();
    } finally { setSaving(false); }
  };

  const isEditing = !!editCard;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={cml.modalHeader}>
          <Pressable onPress={handleClose} style={cml.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={cml.modalTitle}>{isEditing ? 'Update Card' : 'Add New Card'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name="lock" size={11} color={GREEN} />
            <Text style={{ color: GREEN, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>Secure</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={cml.notice}>
            <Feather name="shield" size={14} color={GREEN} style={{ marginTop: 1 }} />
            <Text style={cml.noticeText}>
              Card details are saved as a reference for invoice payments. Only the last 4 digits are stored.
            </Text>
          </View>

          <View style={[cml.cardPreview, { backgroundColor: BRAND_BG[brand] ?? '#1A3A8C' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter_700Bold', fontSize: 14 }}>{brand}</Text>
              <Feather name="credit-card" size={18} color="rgba(255,255,255,0.5)" />
            </View>
            <Text style={cml.cardNumberPreview}>
              {cardNumber || (isEditing ? `•••• •••• •••• ${editCard?.last4 ?? '••••'}` : '•••• •••• •••• ••••')}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={cml.cardSmallLabel}>CARDHOLDER</Text>
                <Text style={cml.cardSmallValue}>{nameOnCard || (editCard?.nameOnCard ?? '—')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={cml.cardSmallLabel}>EXPIRES</Text>
                <Text style={cml.cardSmallValue}>{expiry || (editCard?.expiry ?? 'MM/YY')}</Text>
              </View>
            </View>
          </View>

          <View>
            <Text style={cml.label}>{isEditing ? 'New Card Number' : 'Card Number'}</Text>
            <View style={cml.inputRow}>
              <Feather name="credit-card" size={15} color={MUTED} />
              <TextInput
                style={[cml.input, { letterSpacing: 2 }]}
                placeholder={isEditing ? `Re-enter (currently ••••${editCard?.last4})` : '1234 5678 9012 3456'}
                placeholderTextColor={MUTED}
                value={cardNumber}
                onChangeText={handleNumberChange}
                keyboardType="number-pad"
                maxLength={brand === 'Amex' ? 17 : 19}
              />
              {cardNumber.length > 0 && (
                <View style={[cml.brandTag, { backgroundColor: BRAND_BG[brand] ?? '#6B7280' }]}>
                  <Text style={cml.brandTagText}>{brand.toUpperCase()}</Text>
                </View>
              )}
            </View>
          </View>

          <View>
            <Text style={cml.label}>Name on Card</Text>
            <View style={cml.inputRow}>
              <Feather name="user" size={15} color={MUTED} />
              <TextInput style={cml.input} placeholder={editCard?.nameOnCard ?? 'As it appears on the card'} placeholderTextColor={MUTED} value={nameOnCard} onChangeText={setNameOnCard} autoCapitalize="words" />
            </View>
          </View>

          <View>
            <Text style={cml.label}>Expiry</Text>
            <View style={cml.inputRow}>
              <Feather name="calendar" size={15} color={MUTED} />
              <TextInput style={cml.input} placeholder={editCard?.expiry ?? 'MM/YY'} placeholderTextColor={MUTED} value={expiry} onChangeText={handleExpiryChange} keyboardType="number-pad" maxLength={5} />
            </View>
          </View>

          <Pressable
            onPress={() => setIsDefault((v) => !v)}
            style={[cml.defaultRow, { backgroundColor: isDefault ? '#E0F5FE' : CARD, borderColor: isDefault ? BLUE : BORDER }]}
          >
            <View style={[cml.checkbox, { borderColor: isDefault ? BLUE : '#D1D5DB', backgroundColor: isDefault ? BLUE : 'transparent' }]}>
              {isDefault && <Feather name="check" size={12} color="#fff" />}
            </View>
            <Text style={{ color: isDefault ? BLUE : TEXT, fontFamily: 'Inter_500Medium', fontSize: 14, flex: 1 }}>Set as default payment card</Text>
          </Pressable>

          <Pressable onPress={handleSave} disabled={saving} style={[cml.saveBtn, { opacity: saving ? 0.7 : 1 }]}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={cml.saveBtnText}>{isEditing ? 'Update Card' : 'Save Card'}</Text>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main exported component ─────────────────────────────────────────────────
export function PaymentMethods() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['wholesale-cards'], queryFn: api.wholesale.cards, retry: 1 });
  const cards = data?.data ?? [];

  const [showModal, setShowModal] = useState(false);
  const [editCard, setEditCard]   = useState<any | null>(null);

  const openAdd  = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEditCard(null); setShowModal(true); };
  const openEdit = (card: any) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEditCard(card); setShowModal(true); };

  const handleSave = async (formData: { nameOnCard: string; cardBrand: string; last4: string; expiry: string; isDefault: boolean }) => {
    const payload = {
      nameOnCard: formData.nameOnCard, cardBrand: formData.cardBrand,
      last4: formData.last4, expiry: formData.expiry, isDefault: formData.isDefault,
    };
    if (editCard) await api.wholesale.updateCard(editCard.id, payload);
    else await api.wholesale.addCard(payload);
    qc.invalidateQueries({ queryKey: ['wholesale-cards'] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowModal(false);
  };

  const handleSetDefault = async (card: any) => {
    if (card.isDefault) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await api.wholesale.updateCard(card.id, { isDefault: true });
    qc.invalidateQueries({ queryKey: ['wholesale-cards'] });
  };

  const handleRemove = (card: any) => {
    Alert.alert('Remove Card', `Remove ${card.cardBrand} •••• ${card.last4}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await api.wholesale.deleteCard(card.id);
          qc.invalidateQueries({ queryKey: ['wholesale-cards'] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  return (
    <View style={{ gap: 10 }}>
      {isLoading ? (
        <ActivityIndicator color={BLUE} style={{ paddingVertical: 24 }} />
      ) : (
        <View style={{ gap: 10 }}>
          {cards.map((card: any) => {
            const bg = BRAND_BG[card.cardBrand] ?? '#1A3A8C';
            return (
              <View key={card.id} style={pm.cardWrap}>
                <View style={[pm.cardFace, { backgroundColor: bg }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.9)', fontFamily: 'Inter_700Bold', fontSize: 13 }}>{card.cardBrand}</Text>
                    {card.isDefault && (
                      <View style={pm.defaultBadge}>
                        <Text style={pm.defaultBadgeText}>DEFAULT</Text>
                      </View>
                    )}
                  </View>
                  <Text style={pm.cardNumber}>•••• •••• •••• {card.last4}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View>
                      <Text style={pm.cardLabel}>CARDHOLDER</Text>
                      <Text style={pm.cardValue} numberOfLines={1}>{card.nameOnCard}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={pm.cardLabel}>EXPIRES</Text>
                      <Text style={pm.cardValue}>{card.expiry}</Text>
                    </View>
                  </View>
                </View>

                <View style={pm.cardActions}>
                  {!card.isDefault && (
                    <>
                      <Pressable onPress={() => handleSetDefault(card)} style={pm.cardActionBtn}>
                        <Feather name="star" size={13} color={BLUE} />
                        <Text style={pm.cardActionText}>Set Default</Text>
                      </Pressable>
                      <View style={pm.cardActionDivider} />
                    </>
                  )}
                  <Pressable onPress={() => openEdit(card)} style={pm.cardActionBtn}>
                    <Feather name="edit-2" size={13} color={BLUE} />
                    <Text style={pm.cardActionText}>Edit</Text>
                  </Pressable>
                  <View style={pm.cardActionDivider} />
                  <Pressable onPress={() => handleRemove(card)} style={pm.cardActionBtn}>
                    <Feather name="trash-2" size={13} color="#DC2626" />
                    <Text style={[pm.cardActionText, { color: '#DC2626' }]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          <Pressable onPress={openAdd} style={pm.addBtn}>
            <View style={pm.addIcon}>
              <Feather name="plus" size={18} color={BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={pm.addTitle}>Add Payment Card</Text>
              <Text style={pm.addSub}>Visa, Mastercard or Amex</Text>
            </View>
            <Feather name="chevron-right" size={16} color={MUTED} />
          </Pressable>
        </View>
      )}

      <View style={pm.secureFoot}>
        <Feather name="lock" size={11} color={MUTED} />
        <Text style={pm.secureFootText}>Cards stored securely · PCI compliant</Text>
      </View>

      <CardModal
        visible={showModal}
        editCard={editCard}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
      />
    </View>
  );
}

const pm = StyleSheet.create({
  cardWrap:           { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  cardFace:           { padding: 16, gap: 14 },
  cardNumber:         { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: 3 },
  cardLabel:          { color: 'rgba(255,255,255,0.55)', fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  cardValue:          { color: '#fff', fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 },
  defaultBadge:       { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  defaultBadgeText:   { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5 },
  cardActions:        { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD },
  cardActionBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11 },
  cardActionText:     { color: BLUE, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  cardActionDivider:  { width: 1, height: 18, backgroundColor: BORDER },
  addBtn:             { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, borderStyle: 'dashed' },
  addIcon:            { width: 36, height: 36, borderRadius: 10, backgroundColor: '#E0F5FE', alignItems: 'center', justifyContent: 'center' },
  addTitle:           { color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  addSub:             { color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 1 },
  secureFoot:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 4 },
  secureFootText:     { color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11 },
});

const cml = StyleSheet.create({
  modalHeader:    { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 24, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER },
  modalTitle:     { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: 'Inter_700Bold', color: TEXT },
  closeBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  notice:         { flexDirection: 'row', gap: 10, backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#BBF7D0' },
  noticeText:     { color: '#166534', fontFamily: 'Inter_400Regular', fontSize: 12, flex: 1, lineHeight: 17 },
  cardPreview:    { borderRadius: 14, padding: 18, minHeight: 140 },
  cardNumberPreview: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: 3, marginBottom: 16 },
  cardSmallLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  cardSmallValue: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 2 },
  label:          { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: MUTED, marginBottom: 6 },
  inputRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12, borderColor: BORDER, backgroundColor: CARD },
  input:          { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', color: TEXT },
  brandTag:       { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  brandTagText:   { color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold' },
  defaultRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  checkbox:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  saveBtn:        { height: 54, backgroundColor: BLUE, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:    { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
});
