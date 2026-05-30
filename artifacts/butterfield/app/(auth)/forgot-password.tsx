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

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

type Method = 'email' | 'sms';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [method, setMethod]   = useState<Method>('email');
  const [email, setEmail]     = useState('');
  const [phone, setPhone]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const switchMethod = (m: Method) => {
    setMethod(m);
    setError('');
    Haptics.selectionAsync();
  };

  const handleSubmit = async () => {
    setError('');

    if (method === 'email') {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) { setError('Please enter your email address.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setError('Please enter a valid email address.'); return;
      }
    } else {
      const trimmed = phone.trim();
      if (!trimmed) { setError('Please enter your phone number.'); return; }
      if (trimmed.replace(/\D/g, '').length < 8) {
        setError('Please enter a valid phone number.'); return;
      }
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const payload = method === 'email'
        ? { method: 'email' as const, email: email.trim().toLowerCase() }
        : { method: 'sms' as const, phone: phone.trim().replace(/\s+/g, '') };

      const res = await api.auth.forgotPassword(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({
        pathname: '/(auth)/verify-otp',
        params: {
          email:       method === 'email' ? email.trim().toLowerCase() : '',
          phone:       method === 'sms'   ? phone.trim().replace(/\s+/g, '') : '',
          method,
          destination: res.destination ?? (method === 'email' ? email : phone),
          devOtp:      res.devOtp ?? '',
        },
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <LinearGradient colors={['#1493FF', '#3CBBEE']} style={[s.hero, { paddingTop: insets.top + 20 }]}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <View style={s.heroIcon}>
            <Feather name="lock" size={28} color="#fff" />
          </View>
          <Text style={[s.heroTitle, { fontWeight: '700' }]}>Forgot password?</Text>
          <Text style={[s.heroSub, { fontWeight: '400' }]}>
            {method === 'email'
              ? "Enter your email and we'll send\nyou a reset code"
              : "Enter your phone and we'll text\nyou a reset code"}
          </Text>
        </LinearGradient>

        <View style={s.body}>

          {/* Method toggle */}
          <View style={[s.toggle, { backgroundColor: CARD }]}>
            <Pressable
              style={[s.toggleBtn, method === 'email' && { backgroundColor: BLUE }]}
              onPress={() => switchMethod('email')}
            >
              <Feather name="mail" size={15} color={method === 'email' ? '#fff' : MUTED} />
              <Text style={[s.toggleText, { color: method === 'email' ? '#fff' : MUTED, fontWeight: method === 'email' ? '600' : '400' }]}>
                Email
              </Text>
            </Pressable>
            <Pressable
              style={[s.toggleBtn, method === 'sms' && { backgroundColor: BLUE }]}
              onPress={() => switchMethod('sms')}
            >
              <Feather name="message-square" size={15} color={method === 'sms' ? '#fff' : MUTED} />
              <Text style={[s.toggleText, { color: method === 'sms' ? '#fff' : MUTED, fontWeight: method === 'sms' ? '600' : '400' }]}>
                SMS
              </Text>
            </Pressable>
          </View>

          <View style={[s.card, { backgroundColor: CARD }]}>
            {method === 'email' ? (
              <>
                <Text style={[s.label, { fontWeight: '600', color: TEXT }]}>Email address</Text>
                <View style={[s.inputRow, { backgroundColor: '#EFF6FF', borderColor: BORDER }]}>
                  <Feather name="mail" size={16} color={MUTED} />
                  <TextInput
                    style={[s.input, { color: TEXT, fontWeight: '400' }]}
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
              </>
            ) : (
              <>
                <Text style={[s.label, { fontWeight: '600', color: TEXT }]}>Mobile number</Text>
                <View style={[s.inputRow, { backgroundColor: '#EFF6FF', borderColor: BORDER }]}>
                  <Feather name="smartphone" size={16} color={MUTED} />
                  <TextInput
                    style={[s.input, { color: TEXT, fontWeight: '400' }]}
                    placeholder="+61 4XX XXX XXX"
                    placeholderTextColor={MUTED}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoFocus
                    returnKeyType="send"
                    onSubmitEditing={handleSubmit}
                  />
                </View>
                <Text style={[s.hint, { color: MUTED }]}>
                  Must match the number on your account
                </Text>
              </>
            )}

            {error ? (
              <View style={s.errorBox}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={[s.errorText, { fontWeight: '400' }]}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={[s.btn, { backgroundColor: BLUE, opacity: loading ? 0.8 : 1 }]}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[s.btnText, { fontWeight: '700' }]}>Send Reset Code</Text>
              }
            </Pressable>

            <Pressable onPress={() => router.back()} style={s.backLink}>
              <Text style={[s.backLinkText, { fontWeight: '500', color: MUTED }]}>
                Back to sign in
              </Text>
            </Pressable>
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
  body:         { flex: 1, padding: 20, gap: 14 },
  toggle:       { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  toggleBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, borderRadius: 10 },
  toggleText:   { fontSize: 14 },
  card:         { borderRadius: 16, padding: 20, gap: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  label:        { fontSize: 14 },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12 },
  input:        { flex: 1, fontSize: 15 },
  hint:         { fontSize: 12, lineHeight: 17 },
  errorBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: '#FEF2F2', borderRadius: 10 },
  errorText:    { flex: 1, color: '#EF4444', fontSize: 13 },
  btn:          { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText:      { color: '#fff', fontSize: 16 },
  backLink:     { alignItems: 'center', paddingVertical: 4 },
  backLinkText: { fontSize: 14 },
});
