import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';

export default function EditDetailsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState(user?.name ?? '');
  const [email] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [birthday, setBirthday] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your full name.');
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.auth.updateProfile({ name: name.trim(), phone: phone.trim() || undefined, birthday: birthday.trim() || undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
      Alert.alert('Saved!', 'Your details have been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const InputField = ({ label, value, onChangeText, placeholder, keyboardType, editable = true, hint }: any) => (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>{label}</Text>
      <View style={[styles.inputBox, { borderColor: editable ? colors.border : colors.muted, backgroundColor: editable ? colors.background : colors.muted }]}>
        <TextInput
          style={[styles.input, { color: editable ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType={keyboardType}
          editable={editable}
          autoCapitalize="none"
        />
      </View>
      {hint ? <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{hint}</Text> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.muted }]}>
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Edit details</Text>
        <Text style={[styles.brandText, { color: colors.primary, fontFamily: 'Inter_700Bold', fontStyle: 'italic' }]}>Butterfield</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.formCard, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border, borderWidth: 1 }]}>
          <InputField
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            keyboardType="default"
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <InputField
            label="Email"
            value={email}
            placeholder="you@example.com"
            editable={false}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <InputField
            label="Mobile number"
            value={phone}
            onChangeText={setPhone}
            placeholder="04xx xxx xxx"
            keyboardType="phone-pad"
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <InputField
            label="Birthday 🎂"
            value={birthday}
            onChangeText={setBirthday}
            placeholder="DD / MM / YYYY"
            keyboardType="numbers-and-punctuation"
            hint="Get a free cookie every birthday week."
          />
        </View>

        <Text style={[styles.note, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          Your details speed up checkout — name, email and phone are saved on this device.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: 1 }]}>
        <Pressable onPress={handleSave} disabled={saving} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="save" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 16 }}>Save changes</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17 },
  brandText: { fontSize: 18 },
  formCard: { overflow: 'hidden', gap: 0 },
  fieldWrap: { padding: 16, gap: 6 },
  fieldLabel: { fontSize: 14 },
  inputBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  input: { fontSize: 15, minHeight: 22 },
  hint: { fontSize: 12, marginTop: 2 },
  divider: { height: 1 },
  note: { marginTop: 16, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  footer: { paddingHorizontal: 20, paddingTop: 12 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18, borderRadius: 14 },
});
