import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type SavedAddress } from '@/lib/api';
import { SwipeDownSheet } from '@/components/SwipeDownSheet';
import { useAuth } from '@/context/AuthContext';
import { LoggedOutAccountPrompt } from '@/components/LoggedOutAccountPrompt';

const BG = '#F5F6FA';
const CARD = '#FFFFFF';
const BLUE = '#1493FF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const RED = '#EF4444';
const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
function iconForLabel(label: string): string {
  const l = label.toLowerCase();
  if (l === 'home') return 'home';
  if (l === 'work') return 'briefcase';
  return 'map-pin';
}
function formatAddress(a: SavedAddress): string {
  const apt = a.apt ? `${a.apt}/` : '';
  return `${apt}${a.street}, ${a.suburb} ${a.state} ${a.postcode}`;
}
const BLANK = { label: 'Home', street: '', apt: '', suburb: '', postcode: '', state: 'NSW', isDefault: false };
export default function AddressesScreen() {
  const { user } = useAuth();
  if (!user) return <LoggedOutAccountPrompt redirectTo="/addresses" compact />;
  return <AddressesContent />;
}

function AddressesContent() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const scrollRef = useRef(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.addresses.list(),
    retry: 1,
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const addresses = data?.data ?? [];
  const openModal = (addr?: SavedAddress) => {
    if (addr) {
      setEditingId(addr.id);
      setForm({ label: addr.label, street: addr.street, apt: addr.apt ?? '', suburb: addr.suburb, postcode: addr.postcode, state: addr.state, isDefault: addr.isDefault });
    } else {
      setEditingId(null);
      setForm({ ...BLANK, isDefault: addresses.length === 0 });
    }
    setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const closeModal = () => setModalVisible(false);
  const handleSave = async () => {
    if (!form.street.trim() || !form.suburb.trim() || !form.postcode.trim()) return Alert.alert('Missing fields', 'Please fill in street, suburb and postcode.');
    setSaving(true);
    try {
      if (editingId) await api.addresses.update(editingId, form);
      else await api.addresses.create(form);
      await qc.invalidateQueries({ queryKey: ['addresses'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeModal();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save address.');
    } finally { setSaving(false); }
  };
  const handleDelete = (addr: SavedAddress) => {
    Alert.alert(`Remove "${addr.label}"?`, 'This address will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await api.addresses.delete(addr.id); await qc.invalidateQueries({ queryKey: ['addresses'] }); } },
    ]);
  };
  const handleSetDefault = async (addr: SavedAddress) => {
    if (addr.isDefault) return;
    await api.addresses.update(addr.id, { isDefault: true });
    await qc.invalidateQueries({ queryKey: ['addresses'] });
  };
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { paddingTop: insets.top + 14, backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}><Feather name="arrow-left" size={22} color={TEXT} /></Pressable>
        <Text style={s.headerTitle}>Saved addresses</Text>
        <Text style={[s.headerBrand, { color: BLUE }]}>Butterfield</Text>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={BLUE} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 120 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}>
          {addresses.length === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <View style={[s.emptyIconCircle, { backgroundColor: '#EBF8FF' }]}><Feather name="map-pin" size={28} color={BLUE} /></View>
              <Text style={s.emptyTitle}>No addresses yet</Text>
              <Text style={s.emptySub}>Save your home or work address to fill checkout faster.</Text>
              <Pressable onPress={() => openModal()} style={[s.addAddressBtn, { backgroundColor: BLUE }]}><Feather name="plus" size={16} color="#fff" /><Text style={s.addAddressBtnText}>Add address</Text></Pressable>
            </View>
          ) : (
            <>
              {addresses.map((addr) => (
                <View key={addr.id} style={[s.addressCard, { backgroundColor: CARD, borderColor: addr.isDefault ? BLUE : BORDER, borderWidth: addr.isDefault ? 2 : 1 }]}>
                  <View style={s.addressCardBody}>
                    <View style={[s.addressIconCircle, { backgroundColor: addr.isDefault ? '#EBF8FF' : BG }]}><Feather name={iconForLabel(addr.label) as any} size={18} color={addr.isDefault ? BLUE : MUTED} /></View>
                    <View style={{ flex: 1 }}>
                      <View style={s.addressLabelRow}><Text style={s.addressLabel}>{addr.label}</Text>{addr.isDefault && <View style={[s.defaultBadge, { backgroundColor: '#EBF8FF' }]}><Text style={[s.defaultBadgeText, { color: BLUE }]}>Default</Text></View>}</View>
                      <Text style={s.addressLine}>{formatAddress(addr)}</Text>
                    </View>
                  </View>
                  <View style={[s.addressActions, { borderTopColor: BORDER }]}>
                    {!addr.isDefault && <Pressable onPress={() => handleSetDefault(addr)} style={[s.actionBtn, { borderRightWidth: 1, borderRightColor: BORDER }]}><Feather name="star" size={13} color={MUTED} /><Text style={[s.actionBtnText, { color: MUTED }]}>Set default</Text></Pressable>}
                    <Pressable onPress={() => openModal(addr)} style={[s.actionBtn, !addr.isDefault ? { borderRightWidth: 1, borderRightColor: BORDER } : {}]}><Feather name="edit-2" size={13} color={BLUE} /><Text style={[s.actionBtnText, { color: BLUE }]}>Edit</Text></Pressable>
                    <Pressable onPress={() => handleDelete(addr)} style={s.actionBtn}><Feather name="trash-2" size={13} color={RED} /><Text style={[s.actionBtnText, { color: RED }]}>Remove</Text></Pressable>
                  </View>
                </View>
              ))}
              <Pressable onPress={() => openModal()} style={[s.addNewBtn, { borderColor: BLUE }]}><Feather name="plus" size={16} color={BLUE} /><Text style={[s.addNewBtnText, { color: BLUE }]}>Add another address</Text></Pressable>
            </>
          )}
        </ScrollView>
      )}
      <SwipeDownSheet
        visible={modalVisible}
        onClose={closeModal}
      backdropOpacity={0.48}
      sheetHeight={600}
      scrollGestureRef={scrollRef}
      showHandle={false}
      sheetStyle={[s.modalSheet, { paddingBottom: insets.bottom + 24 }]}
      contentStyle={{ flex: 1 }}
      >
        <View style={{ flex: 1 }}>
          <View style={s.modalHandle} />
          <View style={s.modalHeader}><Text style={s.modalTitle}>{editingId ? 'Edit address' : 'New address'}</Text><Pressable onPress={closeModal} style={s.modalCloseBtn}><Feather name="x" size={20} color={MUTED} /></Pressable></View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              <View style={{ padding: 20, gap: 16 }}>
                <View style={s.fieldGroup}><Text style={s.fieldLabel}>Label</Text><View style={s.labelPills}>{['Home', 'Work', 'Other'].map((l) => <Pressable key={l} onPress={() => setForm((f) => ({ ...f, label: l }))} style={[s.labelPill, { backgroundColor: form.label === l ? BLUE : CARD, borderColor: form.label === l ? BLUE : BORDER }]}><Feather name={iconForLabel(l) as any} size={13} color={form.label === l ? '#fff' : MUTED} /><Text style={[s.labelPillText, { color: form.label === l ? '#fff' : TEXT }]}>{l}</Text></Pressable>)}</View></View>
                <View style={s.fieldGroup}><Text style={s.fieldLabel}>Street address</Text><TextInput style={[s.textInput, { borderColor: BORDER, color: TEXT }]} value={form.street} onChangeText={(v) => setForm((f) => ({ ...f, street: v }))} placeholder="123 Smith St" placeholderTextColor={MUTED} autoCapitalize="words" /></View>
                <View style={s.fieldGroup}><Text style={s.fieldLabel}>Apt / unit (optional)</Text><TextInput style={[s.textInput, { borderColor: BORDER, color: TEXT }]} value={form.apt} onChangeText={(v) => setForm((f) => ({ ...f, apt: v }))} placeholder="Unit 4" placeholderTextColor={MUTED} autoCapitalize="words" /></View>
                <View style={s.fieldRow}><View style={[s.fieldGroup, { flex: 1 }]}><Text style={s.fieldLabel}>Suburb</Text><TextInput style={[s.textInput, { borderColor: BORDER, color: TEXT }]} value={form.suburb} onChangeText={(v) => setForm((f) => ({ ...f, suburb: v }))} placeholder="Merrylands" placeholderTextColor={MUTED} autoCapitalize="words" /></View><View style={[s.fieldGroup, { width: 110 }]}><Text style={s.fieldLabel}>Postcode</Text><TextInput style={[s.textInput, { borderColor: BORDER, color: TEXT }]} value={form.postcode} onChangeText={(v) => setForm((f) => ({ ...f, postcode: v }))} placeholder="2160" placeholderTextColor={MUTED} keyboardType="number-pad" maxLength={4} /></View></View>
                <View style={s.fieldGroup}><Text style={s.fieldLabel}>State</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{STATES.map((st) => <Pressable key={st} onPress={() => setForm((f) => ({ ...f, state: st }))} style={[s.statePill, { backgroundColor: form.state === st ? BLUE : CARD, borderColor: form.state === st ? BLUE : BORDER }]}><Text style={[s.statePillText, { color: form.state === st ? '#fff' : MUTED }]}>{st}</Text></Pressable>)}</ScrollView></View>
                <Pressable onPress={() => setForm((f) => ({ ...f, isDefault: !f.isDefault }))} style={[s.defaultToggle, { backgroundColor: form.isDefault ? '#EBF8FF' : BG, borderColor: form.isDefault ? BLUE : BORDER }]}><View style={[s.defaultToggleCheck, { backgroundColor: form.isDefault ? BLUE : CARD, borderColor: form.isDefault ? BLUE : BORDER }]}>{form.isDefault && <Feather name="check" size={12} color="#fff" />}</View><Text style={[s.defaultToggleLabel, { color: form.isDefault ? BLUE : MUTED }]}>Set as default address</Text></Pressable>
                <View style={s.modalBtns}><Pressable onPress={closeModal} style={[s.cancelBtn, { borderColor: BORDER }]}><Feather name="x" size={14} color={MUTED} /><Text style={[s.cancelBtnText, { color: MUTED }]}>Cancel</Text></Pressable><Pressable onPress={handleSave} disabled={saving} style={[s.saveBtn, { backgroundColor: BLUE, opacity: saving ? 0.8 : 1 }]}>{saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveBtnText}>Save</Text>}</Pressable></View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </SwipeDownSheet>
    </View>
  );
}
const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  headerBrand: { fontSize: 18, fontWeight: '700', fontStyle: 'italic' },
  emptyCard: { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', padding: 36, alignItems: 'center', gap: 10 },
  emptyIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  emptySub: { fontSize: 13, fontWeight: '400', color: '#8E8E93', textAlign: 'center', lineHeight: 20 },
  addAddressBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 30 },
  addAddressBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  addressCard: { borderRadius: 14, overflow: 'hidden' },
  addressCardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
  addressIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  addressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  addressLabel: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  defaultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  defaultBadgeText: { fontSize: 11, fontWeight: '600' },
  addressLine: { fontSize: 13, fontWeight: '400', color: '#8E8E93', lineHeight: 19 },
  addressActions: { flexDirection: 'row', borderTopWidth: 1 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11 },
  actionBtnText: { fontSize: 12, fontWeight: '600' },
  addNewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed' },
  addNewBtnText: { fontSize: 14, fontWeight: '600' },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F6FA', alignItems: 'center', justifyContent: 'center' },
  fieldGroup: { gap: 6 },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldLabel: { fontSize: 14, fontWeight: '500', color: '#1C1C1E' },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontWeight: '400', backgroundColor: '#FAFAFA' },
  labelPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  labelPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, borderWidth: 1 },
  labelPillText: { fontSize: 13, fontWeight: '600' },
  statePill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  statePillText: { fontSize: 12, fontWeight: '600' },
  defaultToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  defaultToggleCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  defaultToggleLabel: { fontSize: 14, fontWeight: '500' },
  modalBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 15, borderRadius: 30, borderWidth: 1 },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 30 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
