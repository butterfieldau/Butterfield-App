import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG = '#F5F6FA';
const CARD = '#FFFFFF';
const BRAND = '#40C0F2';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';

export default function EditDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState(user?.name ?? '');
  const [email] = useState(user?.email ?? '');
  const [phone, setPhone] = useState((user as any)?.phone ?? '');
  const [birthday, setBirthday] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.loyalty.profile().then((res) => {
      const bd = res?.data?.birthday;
      if (bd) {
        const [y, m, d] = bd.split('-');
        setBirthday(`${d}/${m}/${y}`);
      }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.auth.updateMe({ name: name.trim(), phone: phone.trim() || undefined });

      if (birthday.trim()) {
        const parts = birthday.trim().split('/');
        if (parts.length === 3) {
          const [d, m, y] = parts;
          const day = parseInt(d, 10);
          const month = parseInt(m, 10);
          const year = parseInt(y, 10);
          if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= new Date().getFullYear()) {
            const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            await api.loyalty.updateBirthday(isoDate);
          } else {
            Alert.alert('Invalid birthday', 'Please enter your birthday as DD/MM/YYYY.');
            setSaving(false);
            return;
          }
        } else {
          Alert.alert('Invalid birthday format', 'Please use DD/MM/YYYY format.');
          setSaving(false);
          return;
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
      qc.invalidateQueries({ queryKey: ['auth-me'] });
      Alert.alert('Saved!', 'Your details have been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save your details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={TEXT} />
        </Pressable>
        <Text style={[styles.headerTitle, { fontFamily: 'Inter_700Bold' }]}>Edit details</Text>
        <Text style={[styles.brandText, { fontFamily: 'Inter_700Bold', color: BRAND }]}>Butterfield</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: CARD }]}>
          <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
          <View style={styles.divider} />
          <Field label="Email" value={email} onChangeText={() => {}} placeholder="Email" editable={false} dimmed />
          <View style={styles.divider} />
          <Field label="Mobile number" value={phone} onChangeText={setPhone} placeholder="04xx xxx xxx" keyboardType="phone-pad" />
          <View style={styles.divider} />
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { fontFamily: 'Inter_500Medium', color: TEXT }]}>Birthday 🎂</Text>
            <TextInput
              style={[styles.fieldInput, { fontFamily: 'Inter_400Regular', color: TEXT }]}
              value={birthday}
              onChangeText={setBirthday}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={MUTED}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={[styles.fieldHint, { fontFamily: 'Inter_400Regular', color: MUTED }]}>
              Get a free cookie every birthday week.
            </Text>
          </View>
        </View>

        <Text style={[styles.disclaimer, { fontFamily: 'Inter_400Regular', color: MUTED }]}>
          Your details speed up checkout — name, email and phone are saved to your account.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: BRAND }]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="save" size={16} color="#fff" />
              <Text style={[styles.saveBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Save changes</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({
  label, value, onChangeText, placeholder, editable = true, dimmed = false,
  autoCapitalize, keyboardType,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; editable?: boolean; dimmed?: boolean;
  autoCapitalize?: any; keyboardType?: any;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { fontFamily: 'Inter_500Medium', color: TEXT }]}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, { fontFamily: 'Inter_400Regular', color: dimmed ? MUTED : TEXT }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={MUTED}
        editable={editable}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 8,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 20, color: TEXT },
  brandText: { fontSize: 18, fontStyle: 'italic' },

  card: { borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: BORDER, marginHorizontal: 16 },
  fieldWrap: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  fieldLabel: { fontSize: 14, color: TEXT },
  fieldInput: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  fieldHint: { fontSize: 12, marginTop: -4 },

  disclaimer: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },

  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORDER },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14 },
  saveBtnText: { color: '#fff', fontSize: 16 },
});
