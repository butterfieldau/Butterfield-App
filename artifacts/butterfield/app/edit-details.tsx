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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

function autoFormatBirthday(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function birthdayToISO(birthday: string): string | null {
  const parts = birthday.trim().split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map((p) => parseInt(p, 10));
  if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > new Date().getFullYear()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function EditDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [name,     setName]     = useState('');
  const [phone,    setPhone]    = useState('');
  const [birthday, setBirthday] = useState('');
  const [saving,   setSaving]   = useState(false);

  // Load fresh data from the API — never trust the stale auth context
  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn:  () => api.auth.me(),
    retry: 1,
  });
  const { data: loyaltyData, isLoading: loyaltyLoading } = useQuery({
    queryKey: ['loyalty-profile'],
    queryFn:  () => api.loyalty.profile(),
    retry: 1,
  });

  const isLoading = meLoading || loyaltyLoading;
  const email     = meData?.user?.email ?? user?.email ?? '';

  // Track whether the birthday was already saved when this screen opened.
  // Once locked the field becomes read-only and the API will also reject changes.
  const birthdayLocked = Boolean((loyaltyData?.data as any)?.birthday);

  // Populate fields once data arrives
  useEffect(() => {
    if (meData?.user) {
      setName( (meData.user as any).name  ?? '');
      setPhone((meData.user as any).phone ?? '');
    }
  }, [meData?.user?.name, meData?.user?.phone]);

  useEffect(() => {
    const bd = (loyaltyData?.data as any)?.birthday;
    if (bd) {
      const [y, m, d] = bd.split('-');
      setBirthday(`${d}/${m}/${y}`);
    }
  }, [(loyaltyData?.data as any)?.birthday]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }
    if (!birthdayLocked && birthday.trim() && birthday.length < 10) {
      Alert.alert('Invalid birthday', 'Please enter your birthday as DD/MM/YYYY (e.g. 15/06/1995).');
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Save name + phone
      await api.auth.updateMe({
        name:  name.trim(),
        phone: phone.trim() || undefined,
      });

      // Only attempt to save birthday if it hasn't been locked yet
      if (!birthdayLocked && birthday.trim()) {
        const iso = birthdayToISO(birthday);
        if (!iso) {
          Alert.alert('Invalid birthday', 'Please enter your birthday as DD/MM/YYYY (e.g. 15/06/1995).');
          setSaving(false);
          return;
        }
        await api.loyalty.updateBirthday(iso);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Invalidate all caches so every screen shows updated data
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['me'] }),
        qc.invalidateQueries({ queryKey: ['loyalty-profile'] }),
      ]);

      Alert.alert('Saved!', 'Your details have been updated.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save your details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <Text style={styles.brandText}>Butterfield</Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 130 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Personal info ──────────────────────────────────────────── */}
          <View>
            <Text style={styles.groupLabel}>PERSONAL INFO</Text>
            <View style={styles.card}>
              <FieldRow
                icon="user"
                label="Full name"
                value={name}
                onChangeText={setName}
                placeholder="Your full name"
                autoCapitalize="words"
                returnKeyType="next"
              />
              <View style={styles.divider} />
              <FieldRow
                icon="mail"
                label="Email"
                value={email}
                onChangeText={() => {}}
                placeholder="Email"
                editable={false}
                dimmed
                hint="Email address cannot be changed. Contact support if needed."
              />
              <View style={styles.divider} />
              <FieldRow
                icon="phone"
                label="Mobile number"
                value={phone}
                onChangeText={setPhone}
                placeholder="04XX XXX XXX"
                keyboardType="phone-pad"
                returnKeyType="done"
              />
            </View>
          </View>

          {/* ── Birthday ───────────────────────────────────────────────── */}
          <View>
            <Text style={styles.groupLabel}>BIRTHDAY</Text>
            <View style={[styles.card, birthdayLocked && { borderColor: '#D1D5DB', backgroundColor: '#FAFAFA' }]}>
              <View style={styles.fieldRow}>
                <View style={[styles.iconCircle, { backgroundColor: birthdayLocked ? '#F3F4F6' : '#FEF3C7' }]}>
                  {birthdayLocked
                    ? <Feather name="lock" size={16} color={MUTED} />
                    : <Text style={{ fontSize: 16 }}>🎂</Text>
                  }
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.fieldLabel}>Date of birth</Text>
                  {birthdayLocked ? (
                    <>
                      <View style={[styles.input, { backgroundColor: '#F3F4F6', justifyContent: 'center' }]}>
                        <Text style={{ fontWeight: '500', fontSize: 15, color: MUTED }}>
                          {birthday}
                        </Text>
                      </View>
                      <Text style={[styles.fieldHint, { color: '#EF4444' }]}>
                        Birthday is locked. To update it, email{' '}
                        <Text style={{ fontWeight: '600' }}>hello@butterfieldcookies.com.au</Text>
                      </Text>
                    </>
                  ) : (
                    <>
                      <TextInput
                        style={styles.input}
                        value={birthday}
                        onChangeText={(t) => setBirthday(autoFormatBirthday(t))}
                        placeholder="DD/MM/YYYY"
                        placeholderTextColor={MUTED}
                        keyboardType="number-pad"
                        maxLength={10}
                        returnKeyType="done"
                      />
                      <Text style={styles.fieldHint}>
                        🍪 You'll receive a free cookie during your birthday week!
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </View>
          </View>

          <Text style={styles.disclaimer}>
            Your details are saved securely and used to personalise your Butterfield experience.
            Changes are reflected everywhere in the app instantly.
          </Text>
        </ScrollView>
      )}

      {/* ── Save button ─────────────────────────────────────────────────── */}
      {!isLoading && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: saving ? '#A0DCF0' : BLUE }]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="check" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Save changes</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function FieldRow({
  icon, label, value, onChangeText, placeholder, editable = true,
  dimmed = false, autoCapitalize, keyboardType, hint, returnKeyType,
}: {
  icon: string; label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; editable?: boolean; dimmed?: boolean;
  autoCapitalize?: any; keyboardType?: any; hint?: string; returnKeyType?: any;
}) {
  const iconBgs: Record<string, string> = { user: '#E0F5FE', mail: '#F3F4F6', phone: '#DCFCE7' };
  return (
    <View style={styles.fieldRow}>
      <View style={[styles.iconCircle, { backgroundColor: iconBgs[icon] ?? '#F3F4F6' }]}>
        <Feather name={icon as any} size={16} color={editable ? BLUE : MUTED} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
          style={[styles.input, { color: dimmed ? MUTED : TEXT, backgroundColor: dimmed ? '#F9FAFB' : BG }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={MUTED}
          editable={editable}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
        />
        {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER, gap: 8,
    backgroundColor: CARD,
  },
  backBtn:     { padding: 4 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: TEXT },
  brandText:   { fontSize: 18, fontWeight: '700', color: BLUE, fontStyle: 'italic' },

  groupLabel: { fontSize: 11, letterSpacing: 1.2, marginBottom: 8, paddingLeft: 4, fontWeight: '700', color: MUTED },
  card: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  divider:    { height: 1, backgroundColor: BORDER, marginLeft: 68 },
  fieldRow:   { flexDirection: 'row', gap: 14, padding: 16, alignItems: 'flex-start' },
  iconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: TEXT },
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    fontWeight: '400', color: TEXT,
  },
  fieldHint:  { fontSize: 12, fontWeight: '400', color: MUTED, lineHeight: 17 },
  disclaimer: { fontSize: 13, fontWeight: '400', color: MUTED, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
  footer:     { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: BG },
  saveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 17, borderRadius: 16 },
  saveBtnText:{ color: '#fff', fontSize: 16, fontWeight: '700' },
});
