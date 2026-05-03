import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const { data: meData, isLoading } = useQuery({
    queryKey: ['me'], queryFn: () => api.auth.me(), retry: 1,
  });

  const savedAddress = (meData?.profile as any)?.deliveryAddress as string | undefined;

  const [editing, setEditing] = useState(false);
  const [street, setStreet] = useState('');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('NSW');
  const [postcode, setPostcode] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (savedAddress) {
      const parts = savedAddress.split(', ');
      setStreet(parts[0] ?? '');
      const subParts = (parts[1] ?? '').split(' ');
      if (subParts.length >= 3) {
        setPostcode(subParts[subParts.length - 1] ?? '');
        setState(subParts[subParts.length - 2] ?? 'NSW');
        setSuburb(subParts.slice(0, -2).join(' '));
      } else {
        setSuburb(parts[1] ?? '');
      }
    }
  }, [savedAddress]);

  const handleSave = async () => {
    if (!street.trim() || !suburb.trim() || !postcode.trim()) {
      Alert.alert('Missing fields', 'Please fill in street, suburb and postcode.');
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const full = `${street.trim()}, ${suburb.trim()} ${state} ${postcode.trim()}`;
      await api.auth.updateMe({ deliveryAddress: full } as any);
      qc.invalidateQueries({ queryKey: ['me'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  const handleRemove = () => {
    Alert.alert('Remove address', 'Remove your saved delivery address?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.auth.updateMe({ deliveryAddress: '' } as any);
          qc.invalidateQueries({ queryKey: ['me'] });
          setStreet(''); setSuburb(''); setPostcode(''); setState('NSW');
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const hasAddress = !!(savedAddress && savedAddress.trim());

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={TEXT} />
        </Pressable>
        <Text style={[styles.title, { color: TEXT }]}>Saved Addresses</Text>
        <View style={{ width: 38 }} />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

          {!editing ? (
            <>
              {hasAddress ? (
                <View style={[styles.addressCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <View style={styles.addressCardTop}>
                    <View style={[styles.addressIcon, { backgroundColor: '#E0F5FE' }]}>
                      <Feather name="home" size={18} color={BLUE} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.addressType, { color: MUTED }]}>HOME</Text>
                      <Text style={[styles.addressText, { color: TEXT }]}>{savedAddress}</Text>
                    </View>
                    <View style={[styles.defaultBadge, { backgroundColor: '#E0F5FE' }]}>
                      <Text style={[styles.defaultBadgeText, { color: BLUE }]}>Default</Text>
                    </View>
                  </View>
                  <View style={[styles.addressActions, { borderTopColor: BORDER }]}>
                    <Pressable
                      onPress={() => setEditing(true)}
                      style={[styles.actionBtn, { borderRightColor: BORDER }]}
                    >
                      <Feather name="edit-2" size={14} color={BLUE} />
                      <Text style={[styles.actionBtnText, { color: BLUE }]}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={handleRemove} style={styles.actionBtn}>
                      <Feather name="trash-2" size={14} color="#EF4444" />
                      <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={[styles.emptyState, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <View style={[styles.emptyIcon, { backgroundColor: '#E0F5FE' }]}>
                    <Feather name="map-pin" size={28} color={BLUE} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: TEXT }]}>No saved addresses</Text>
                  <Text style={[styles.emptySub, { color: MUTED }]}>
                    Save a delivery address to make checkout faster.
                  </Text>
                </View>
              )}

              <Pressable
                onPress={() => setEditing(true)}
                style={[styles.addBtn, { backgroundColor: BLUE }]}
              >
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.addBtnText}>{hasAddress ? 'Update address' : 'Add delivery address'}</Text>
              </Pressable>

              {/* Info note */}
              <View style={[styles.infoCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                <Feather name="info" size={14} color={MUTED} />
                <Text style={[styles.infoText, { color: MUTED }]}>
                  Butterfield currently operates as in-store pickup only. Your saved address is used for future delivery services.
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.formTitle, { color: TEXT }]}>
                {hasAddress ? 'Update address' : 'Add new address'}
              </Text>

              {[
                { label: 'Street address', value: street, setter: setStreet, placeholder: 'e.g. 12 Market Street', autoCapitalize: 'words' as const },
                { label: 'Suburb', value: suburb, setter: setSuburb, placeholder: 'e.g. Merrylands', autoCapitalize: 'words' as const },
                { label: 'Postcode', value: postcode, setter: setPostcode, placeholder: 'e.g. 2160', autoCapitalize: 'none' as const, keyboardType: 'numeric' as const },
              ].map(field => (
                <View key={field.label} style={[styles.inputGroup, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <Text style={[styles.inputLabel, { color: MUTED }]}>{field.label.toUpperCase()}</Text>
                  <TextInput
                    style={[styles.inputField, { color: TEXT }]}
                    value={field.value}
                    onChangeText={field.setter}
                    placeholder={field.placeholder}
                    placeholderTextColor={MUTED}
                    autoCapitalize={field.autoCapitalize}
                    keyboardType={(field as any).keyboardType ?? 'default'}
                  />
                </View>
              ))}

              {/* State selector */}
              <View style={[styles.inputGroup, { backgroundColor: CARD, borderColor: BORDER }]}>
                <Text style={[styles.inputLabel, { color: MUTED }]}>STATE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
                  {['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map(s => (
                    <Pressable
                      key={s}
                      onPress={() => setState(s)}
                      style={[styles.statePill, { backgroundColor: state === s ? BLUE : BG, borderColor: state === s ? BLUE : BORDER }]}
                    >
                      <Text style={[styles.statePillText, { color: state === s ? '#fff' : MUTED }]}>{s}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable
                  onPress={() => setEditing(false)}
                  style={[styles.cancelBtn, { backgroundColor: CARD, borderColor: BORDER }]}
                >
                  <Text style={[styles.cancelBtnText, { color: MUTED }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={[styles.saveBtn, { backgroundColor: BLUE, opacity: saving ? 0.7 : 1 }]}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save address</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  addressCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  addressCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
  addressIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  addressType: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 4 },
  addressText: { fontSize: 14, fontFamily: 'Inter_500Medium', lineHeight: 20 },
  defaultBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  defaultBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  addressActions: { flexDirection: 'row', borderTopWidth: 1 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRightWidth: 0 },
  actionBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  emptyState: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', gap: 10 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14 },
  addBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  infoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  formTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  inputGroup: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  inputLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 6 },
  inputField: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  statePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  statePillText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { flex: 2, borderRadius: 14, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
