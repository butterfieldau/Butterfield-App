import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';

const BG = 'transparent';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';

export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets();
  const { email, phone, method, destination, devOtp } = useLocalSearchParams<{
    email?: string;
    phone?: string;
    method?: string;
    destination?: string;
    devOtp?: string;
  }>();
  const inputRef = useRef<TextInput>(null);

  const isSms = method === 'sms';
  const displayDest = destination || (isSms ? phone : email) || '';

  const [otp, setOtp]                   = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resending, setResending]       = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setResendCooldown(c => c > 0 ? c - 1 : 0);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (devOtp && devOtp.length === 6) {
      setOtp(devOtp);
    }
  }, [devOtp]);

  const handleVerify = async () => {
    if (otp.length !== 6) { setError('Please enter all 6 digits.'); return; }
    setError('');
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const payload = isSms
        ? { phone: phone ?? '', otp }
        : { email: email ?? '', otp };
      const res = await api.auth.verifyResetOtp(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({
        pathname: '/(auth)/reset-password',
        params: { resetToken: res.resetToken, email: email ?? '' },
      });
    } catch (e: any) {
      setError(e.message ?? 'Invalid or expired code. Please try again.');
      setOtp('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError('');
    try {
      const payload = isSms
        ? { method: 'sms' as const, phone: phone ?? '' }
        : { method: 'email' as const, email: email ?? '' };
      await api.auth.forgotPassword(payload);
      setResendCooldown(60);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError('Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleOtpChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setOtp(digits);
    setError('');
    if (digits.length === 6) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
            <Feather name={isSms ? 'message-square' : 'mail'} size={28} color="#fff" />
          </View>
          <Text style={[s.heroTitle, { fontWeight: '700' }]}>
            {isSms ? 'Check your phone' : 'Check your email'}
          </Text>
          <Text style={[s.heroSub, { fontWeight: '400' }]}>
            {isSms ? 'We sent a 6-digit code via SMS to' : 'We sent a 6-digit code to'}{'\n'}
            <Text style={{ fontWeight: '600', color: '#fff' }}>{displayDest}</Text>
          </Text>
        </LinearGradient>

        <View style={s.body}>
          <View style={[s.card, { backgroundColor: CARD }]}>
            <Text style={[s.label, { fontWeight: '600', color: TEXT }]}>Enter the 6-digit code</Text>

            <Pressable onPress={() => inputRef.current?.focus()} style={s.otpRow}>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <View
                  key={i}
                  style={[
                    s.otpBox,
                    {
                      borderColor: otp.length === i ? BLUE : otp[i] ? BLUE : BORDER,
                      backgroundColor: otp[i] ? '#E6F0FF' : '#EFF6FF',
                      borderWidth: otp.length === i ? 2 : 1,
                    }
                  ]}
                >
                  <Text style={[s.otpDigit, { fontWeight: '700', color: TEXT }]}>
                    {otp[i] ?? ''}
                  </Text>
                </View>
              ))}
            </Pressable>

            <TextInput
              ref={inputRef}
              style={s.hiddenInput}
              value={otp}
              onChangeText={handleOtpChange}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              caretHidden
            />

            {error ? (
              <View style={s.errorBox}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={[s.errorText, { fontWeight: '400' }]}>{error}</Text>
              </View>
            ) : null}

            {devOtp && devOtp.length === 6 ? (
              <View style={s.devBanner}>
                <Feather name="terminal" size={13} color={GREEN} />
                <Text style={[s.devText, { fontWeight: '400' }]}>
                  {isSms
                    ? 'Dev mode: code pre-filled. Add Twilio credentials to send real SMS.'
                    : 'Dev mode: code pre-filled. Add RESEND_API_KEY to send real emails.'}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleVerify}
              disabled={loading || otp.length !== 6}
              style={[s.btn, { backgroundColor: BLUE, opacity: (loading || otp.length !== 6) ? 0.6 : 1 }]}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[s.btnText, { fontWeight: '700' }]}>Verify Code</Text>
              }
            </Pressable>

            <View style={s.resendRow}>
              <Text style={[s.resendLabel, { fontWeight: '400', color: MUTED }]}>
                Didn't get a code?{' '}
              </Text>
              <Pressable onPress={handleResend} disabled={resendCooldown > 0 || resending}>
                <Text style={[s.resendLink, {
                  fontWeight: '600',
                  color: resendCooldown > 0 ? MUTED : BLUE,
                }]}>
                  {resending ? 'Sending…' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </Text>
              </Pressable>
            </View>

            <Pressable onPress={() => router.back()} style={s.changeMethod}>
              <Feather name="arrow-left" size={13} color={MUTED} />
              <Text style={[s.changeMethodText, { color: MUTED, fontWeight: '400' }]}>
                {isSms ? 'Try with email instead' : 'Try with SMS instead'}
              </Text>
            </Pressable>
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  hero:             { alignItems: 'center', paddingBottom: 36, gap: 10, paddingHorizontal: 24 },
  backBtn:          { alignSelf: 'flex-start', padding: 4, marginBottom: 12 },
  heroIcon:         { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  heroTitle:        { color: '#fff', fontSize: 24, marginTop: 4 },
  heroSub:          { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  body:             { flex: 1, padding: 20 },
  card:             { borderRadius: 16, padding: 20, gap: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  label:            { fontSize: 14 },
  otpRow:           { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  otpBox:           { width: 46, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  otpDigit:         { fontSize: 24 },
  hiddenInput:      { position: 'absolute', opacity: 0, width: 1, height: 1 },
  errorBox:         { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: '#FEF2F2', borderRadius: 10 },
  errorText:        { flex: 1, color: '#EF4444', fontSize: 13 },
  devBanner:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, backgroundColor: '#F0FDF4', borderRadius: 10 },
  devText:          { flex: 1, color: '#15803D', fontSize: 12 },
  btn:              { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText:          { color: '#fff', fontSize: 16 },
  resendRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  resendLabel:      { fontSize: 14 },
  resendLink:       { fontSize: 14 },
  changeMethod:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 4 },
  changeMethodText: { fontSize: 13 },
});
