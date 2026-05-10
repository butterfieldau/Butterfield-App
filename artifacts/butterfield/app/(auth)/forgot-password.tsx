import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';

const BG    = '#F5F6FA';
const CARD  = '#FFFFFF';
const BLUE  = '#40C0F2';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError('Please enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.'); return;
    }
    setError('');
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await api.auth.forgotPassword({ email: trimmed });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: '/(auth)/verify-otp', params: { email: trimmed, devOtp: res.devOtp ?? '' } });
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <LinearGradient colors={['#40C0F2', '#2AA8DC']} style={[s.hero, { paddingTop: insets.top + 20 }]}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <View style={s.heroIcon}>
            <Feather name="lock" size={28} color="#fff" />
          </View>
          <Text style={[s.heroTitle, { fontFamily: 'Inter_700Bold' }]}>Forgot password?</Text>
          <Text style={[s.heroSub, { fontFamily: 'Inter_400Regular' }]}>
            Enter your email and we'll send{'\n'}you a reset code
          </Text>
        </LinearGradient>

        <View style={s.body}>
          <View style={[s.card, { backgroundColor: CARD }]}>
            <Text style={[s.label, { fontFamily: 'Inter_600SemiBold', color: TEXT }]}>Email address</Text>
            <View style={[s.inputRow, { backgroundColor: '#F5F6FA', borderColor: BORDER }]}>
              <Feather name="mail" size={16} color={MUTED} />
              <TextInput
                style={[s.input, { color: TEXT, fontFamily: 'Inter_400Regular' }]}
                placeholder="you@example.com"
                placeholderTextColor={MUTED}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
                returnKeyType="send"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {error ? (
              <View style={s.errorBox}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={[s.errorText, { fontFamily: 'Inter_400Regular' }]}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={[s.btn, { backgroundColor: BLUE, opacity: loading ? 0.8 : 1 }]}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[s.btnText, { fontFamily: 'Inter_700Bold' }]}>Send Reset Code</Text>
              }
            </Pressable>

            <Pressable onPress={() => router.back()} style={s.backLink}>
              <Text style={[s.backLinkText, { fontFamily: 'Inter_500Medium', color: MUTED }]}>
                Back to sign in
              </Text>
            </Pressable>
          </View>

          <View style={s.hint}>
            <Feather name="info" size={13} color={MUTED} />
            <Text style={[s.hintText, { fontFamily: 'Inter_400Regular', color: MUTED }]}>
              The reset code will be sent to any registered account — customer, staff, wholesale, or director.
            </Text>
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  hero:         { alignItems: 'center', paddingBottom: 36, gap: 10, paddingHorizontal: 24 },
  backBtn:      { alignSelf: 'flex-start', padding: 4, marginBottom: 12 },
  heroIcon:     { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  heroTitle:    { color: '#fff', fontSize: 24, marginTop: 4 },
  heroSub:      { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  body:         { flex: 1, padding: 20, gap: 16 },
  card:         { borderRadius: 16, padding: 20, gap: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  label:        { fontSize: 14 },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12 },
  input:        { flex: 1, fontSize: 15 },
  errorBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: '#FEF2F2', borderRadius: 10 },
  errorText:    { flex: 1, color: '#EF4444', fontSize: 13 },
  btn:          { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText:      { color: '#fff', fontSize: 16 },
  backLink:     { alignItems: 'center', paddingVertical: 4 },
  backLinkText: { fontSize: 14 },
  hint:         { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  hintText:     { flex: 1, fontSize: 12, lineHeight: 17 },
});
