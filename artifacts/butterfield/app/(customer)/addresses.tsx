import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type SavedAddress } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const RED    = '#EF4444';

const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

const LABEL_ICONS: Record<string, string> = {
  home:   'home',
  work:   'briefcase',
  other:  'map-pin',
};
function iconForLabel(label: string): string {
  const l = label.toLowerCase();
  if (l === 'home')  return 'home';
  if (l === 'work')  return 'briefcase';
  return 'map-pin';
}

function formatAddress(a: SavedAddress): string {
  const apt = a.apt ? `${a.apt}/` : '';
  return `${apt}${a.street}, ${a.suburb} ${a.state} ${a.postcode}`;
}

interface AddressFormState {
  label:    string;
  street:   string;
  apt:      string;
  suburb:   string;
  postcode: string;
  state:    string;
  isDefault: boolean;
}

const BLANK: AddressFormState = {
  label: 'Home', street: '', apt: '', suburb: '', postcode: '', state: 'NSW', isDefault: false,
};

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const qc     = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['addresses'],
    queryFn:  () => api.addresses.list(),
    retry: 1,
  });
  const addresses = data?.data ?? [];

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [form, setForm]                 = useState<AddressFormState>(BLANK);
  const [saving, setSaving]             = useState(false);
  const slideAnim = useRef(new Animated.Value(600)).current;

  const openModal = (addr?: SavedAddress) => {
    if (addr) {
      setEditingId(addr.id);
      setForm({
        label:     addr.label,
        street:    addr.street,
        apt:       addr.apt ?? '',
        suburb:    addr.suburb,
        postcode:  addr.postcode,
        state:     addr.state,
        isDefault: addr.isDefault,
      });
    } else {
      setEditingId(null);
      const hasAny = addresses.length === 0;
      setForm({ ...BLANK, isDefault: hasAny });
    }
    setModalVisible(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const closeModal = () => {
    Animated.timing(slideAnim, { toValue: 600, useNativeDriver: true, duration: 220 }).start(() => {
      setModalVisible(false);
    });
  };

  const handleSave = async () => {
    if (!form.street.trim() || !form.suburb.trim() || !form.postcode.trim()) {
      Alert.alert('Missing fields', 'Please fill in street, suburb and postcode.');
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (editingId) {
        await api.addresses.update(editingId, {
          label:     form.label.trim() || 'Home',
          street:    form.street.trim(),
          apt:       form.apt.trim() || undefined,
          suburb:    form.suburb.trim(),
          postcode:  form.postcode.trim(),
          state:     form.state,
          isDefault: form.isDefault,
        });
      } else {
        await api.addresses.create({
          label:     form.label.trim() || 'Home',
          street:    form.street.trim(),
          apt:       form.apt.trim() || undefined,
          suburb:    form.suburb.trim(),
          postcode:  form.postcode.trim(),
          state:     form.state,
          isDefault: form.isDefault,
        });
      }
      await qc.invalidateQueries({ queryKey: ['addresses'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeModal();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save address.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (addr: SavedAddress) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(`Remove "${addr.label}"?`, 'This address will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.addresses.delete(addr.id);
            await qc.invalidateQueries({ queryKey: ['addresses'] });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  const handleSetDefault = async (addr: SavedAddress) => {
    if (addr.isDefault) return;
    Haptics.selectionAsync();
    try {
      await api.addresses.update(addr.id, { isDefault: true });
      await qc.invalidateQueries({ queryKey: ['addresses'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14, backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>Saved addresses</Text>
        <Text style={[styles.headerBrand, { color: BLUE }]}>Butterfield</Text>
      </View>

      {/* Body */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {addresses.length === 0 ? (
            /* Empty state */
            <View style={[styles.emptyCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <View style={[styles.emptyIconCircle, { backgroundColor: '#EBF8FF' }]}>
                <Feather name="map-pin" size={28} color={BLUE} />
              </View>
              <Text style={styles.emptyTitle}>No addresses yet</Text>
              <Text style={styles.emptySub}>
                Save your home or work address to fill checkout faster.
              </Text>
              <Pressable onPress={() => openModal()} style={[styles.addAddressBtn, { backgroundColor: BLUE }]}>
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.addAddressBtnText}>Add address</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {addresses.map((addr) => (
                <View key={addr.id} style={[styles.addressCard, { backgroundColor: CARD, borderColor: addr.isDefault ? BLUE : BORDER, borderWidth: addr.isDefault ? 2 : 1 }]}>
                  <View style={styles.addressCardBody}>
                    <View style={[styles.addressIconCircle, { backgroundColor: addr.isDefault ? '#EBF8FF' : BG }]}>
                      <Feather name={iconForLabel(addr.label) as any} size={18} color={addr.isDefault ? BLUE : MUTED} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.addressLabelRow}>
                        <Text style={styles.addressLabel}>{addr.label}</Text>
                        {addr.isDefault && (
                          <View style={[styles.defaultBadge, { backgroundColor: '#EBF8FF' }]}>
                            <Text style={[styles.defaultBadgeText, { color: BLUE }]}>Default</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.addressLine}>{formatAddress(addr)}</Text>
                    </View>
                  </View>

                  <View style={[styles.addressActions, { borderTopColor: BORDER }]}>
                    {!addr.isDefault && (
                      <Pressable onPress={() => handleSetDefault(addr)} style={[styles.actionBtn, { borderRightWidth: 1, borderRightColor: BORDER }]}>
                        <Feather name="star" size={13} color={MUTED} />
                        <Text style={[styles.actionBtnText, { color: MUTED }]}>Set default</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => openModal(addr)}
                      style={[styles.actionBtn, !addr.isDefault ? { borderRightWidth: 1, borderRightColor: BORDER } : {}]}
                    >
                      <Feather name="edit-2" size={13} color={BLUE} />
                      <Text style={[styles.actionBtnText, { color: BLUE }]}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => handleDelete(addr)} style={styles.actionBtn}>
                      <Feather name="trash-2" size={13} color={RED} />
                      <Text style={[styles.actionBtnText, { color: RED }]}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))}

              <Pressable onPress={() => openModal()} style={[styles.addNewBtn, { borderColor: BLUE }]}>
                <Feather name="plus" size={16} color={BLUE} />
                <Text style={[styles.addNewBtnText, { color: BLUE }]}>Add another address</Text>
              </Pressable>
            </>
          )}

          <View style={[styles.infoCard, { backgroundColor: CARD, borderColor: BORDER }]}>
            <Feather name="info" size={13} color={MUTED} />
            <Text style={[styles.infoText, { color: MUTED }]}>
              Your default address is automatically used at checkout for delivery orders. You can always change it before placing an order.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Add address modal (bottom sheet) */}
      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={closeModal}>
        <Pressable style={styles.modalOverlay} onPress={closeModal} />
        <Animated.View
          style={[styles.modalSheet, { transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom + 24 }]}
        >
          <View style={styles.modalHandle} />

          {/* Modal header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit address' : 'New address'}</Text>
            <Pressable onPress={closeModal} style={styles.modalCloseBtn}>
              <Feather name="x" size={20} color={MUTED} />
            </Pressable>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ padding: 20, gap: 16 }}>

                {/* Label */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Label</Text>
                  <View style={styles.labelPills}>
                    {['Home', 'Work', 'Other'].map((l) => (
                      <Pressable
                        key={l}
                        onPress={() => { setForm((f) => ({ ...f, label: l })); Haptics.selectionAsync(); }}
                        style={[styles.labelPill, {
                          backgroundColor: form.label === l ? BLUE : CARD,
                          borderColor:     form.label === l ? BLUE : BORDER,
                        }]}
                      >
                        <Feather name={iconForLabel(l) as any} size={13} color={form.label === l ? '#fff' : MUTED} />
                        <Text style={[styles.labelPillText, { color: form.label === l ? '#fff' : TEXT }]}>{l}</Text>
                      </Pressable>
                    ))}
                    {/* Custom label input if not one of the presets */}
                    {!['Home', 'Work', 'Other'].includes(form.label) && (
                      <TextInput
                        style={[styles.customLabelInput, { borderColor: BORDER, color: TEXT }]}
                        value={form.label}
                        onChangeText={(v) => setForm((f) => ({ ...f, label: v }))}
                        placeholder="Custom…"
                        placeholderTextColor={MUTED}
                      />
                    )}
                  </View>
                </View>

                {/* Street address */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Street address</Text>
                  <TextInput
                    style={[styles.textInput, { borderColor: BORDER, color: TEXT }]}
                    value={form.street}
                    onChangeText={(v) => setForm((f) => ({ ...f, street: v }))}
                    placeholder="123 Smith St"
                    placeholderTextColor={MUTED}
                    autoCapitalize="words"
                  />
                </View>

                {/* Apt / unit */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Apt / unit (optional)</Text>
                  <TextInput
                    style={[styles.textInput, { borderColor: BORDER, color: TEXT }]}
                    value={form.apt}
                    onChangeText={(v) => setForm((f) => ({ ...f, apt: v }))}
                    placeholder="Unit 4"
                    placeholderTextColor={MUTED}
                    autoCapitalize="words"
                  />
                </View>

                {/* Suburb + Postcode */}
                <View style={styles.fieldRow}>
                  <View style={[styles.fieldGroup, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Suburb</Text>
                    <TextInput
                      style={[styles.textInput, { borderColor: BORDER, color: TEXT }]}
                      value={form.suburb}
                      onChangeText={(v) => setForm((f) => ({ ...f, suburb: v }))}
                      placeholder="Merrylands"
                      placeholderTextColor={MUTED}
                      autoCapitalize="words"
                    />
                  </View>
                  <View style={[styles.fieldGroup, { width: 110 }]}>
                    <Text style={styles.fieldLabel}>Postcode</Text>
                    <TextInput
                      style={[styles.textInput, { borderColor: BORDER, color: TEXT }]}
                      value={form.postcode}
                      onChangeText={(v) => setForm((f) => ({ ...f, postcode: v }))}
                      placeholder="2160"
                      placeholderTextColor={MUTED}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                </View>

                {/* State */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>State</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {STATES.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => { setForm((f) => ({ ...f, state: s })); Haptics.selectionAsync(); }}
                        style={[styles.statePill, {
                          backgroundColor: form.state === s ? BLUE : CARD,
                          borderColor:     form.state === s ? BLUE : BORDER,
                        }]}
                      >
                        <Text style={[styles.statePillText, { color: form.state === s ? '#fff' : MUTED }]}>{s}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                {/* Set as default toggle */}
                <Pressable
                  onPress={() => { setForm((f) => ({ ...f, isDefault: !f.isDefault })); Haptics.selectionAsync(); }}
                  style={[styles.defaultToggle, { backgroundColor: form.isDefault ? '#EBF8FF' : BG, borderColor: form.isDefault ? BLUE : BORDER }]}
                >
                  <View style={[styles.defaultToggleCheck, { backgroundColor: form.isDefault ? BLUE : CARD, borderColor: form.isDefault ? BLUE : BORDER }]}>
                    {form.isDefault && <Feather name="check" size={12} color="#fff" />}
                  </View>
                  <Text style={[styles.defaultToggleLabel, { color: form.isDefault ? BLUE : MUTED }]}>
                    Set as default address
                  </Text>
                </Pressable>

                {/* Buttons */}
                <View style={styles.modalBtns}>
                  <Pressable onPress={closeModal} style={[styles.cancelBtn, { borderColor: BORDER }]}>
                    <Feather name="x" size={14} color={MUTED} />
                    <Text style={[styles.cancelBtnText, { color: MUTED }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSave}
                    disabled={saving}
                    style={[styles.saveBtn, { backgroundColor: BLUE, opacity: saving ? 0.8 : 1 }]}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save</Text>
                    )}
                  </Pressable>
                </View>

              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn:      { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  headerBrand:  { fontSize: 18, fontFamily: 'Inter_700Bold', fontStyle: 'italic' },
  // Empty state
  emptyCard:       { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', padding: 36, alignItems: 'center', gap: 10 },
  emptyIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:      { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  emptySub:        { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93', textAlign: 'center', lineHeight: 20 },
  addAddressBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 30, marginTop: 4 },
  addAddressBtnText:{ color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  // Address card
  addressCard:     { borderRadius: 14, overflow: 'hidden' },
  addressCardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
  addressIconCircle:{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  addressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  addressLabel:    { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  defaultBadge:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  defaultBadgeText:{ fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  addressLine:     { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93', lineHeight: 19 },
  // Address actions
  addressActions:  { flexDirection: 'row', borderTopWidth: 1 },
  actionBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11 },
  actionBtnText:   { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  // Add new btn
  addNewBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed' },
  addNewBtnText:   { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  // Info
  infoCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  infoText:  { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  // Modal
  modalOverlay:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle:    { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F6FA', alignItems: 'center', justifyContent: 'center' },
  // Form fields
  fieldGroup:  { gap: 6 },
  fieldRow:    { flexDirection: 'row', gap: 12 },
  fieldLabel:  { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#1C1C1E' },
  textInput:   { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: 'Inter_400Regular', backgroundColor: '#FAFAFA' },
  // Label pills
  labelPills:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  labelPill:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, borderWidth: 1 },
  labelPillText:  { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  customLabelInput:{ borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, minWidth: 80 },
  // State pills
  statePill:     { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  statePillText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  // Default toggle
  defaultToggle:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  defaultToggleCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  defaultToggleLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  // Bottom buttons
  modalBtns:    { flexDirection: 'row', gap: 10 },
  cancelBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 15, borderRadius: 30, borderWidth: 1 },
  cancelBtnText:{ fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  saveBtn:      { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 30 },
  saveBtnText:  { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
