import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';

const BG    = '#F8F3F0';
const CARD  = '#FFFFFF';
const BLUE  = '#024B68';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';

function getStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: 'Weak', color: '#EF4444' };
  if (score <= 3)  return { score, label: 'Fair', color: '#F59E0B' };
  return { score, label: 'Strong', color: GREEN };
}

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { resetToken, email } = useLocalSearchParams<{ resetToken: string; email?: string }>();

  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [done, setDone]             = useState(false);

  const strength = getStrength(password);
  const strengthBars = [1, 2, 3, 4, 5];

  const handleReset = async () => {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setError('');
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.auth.resetPassword({ resetToken: resetToken ?? '', newPassword: password });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Please start over.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }}>
        <LinearGradient colors={['#024B68', '#013A52']} style={[s.hero, { paddingTop: insets.top + 20 }]}>
          <View style={s.heroIcon}>
            <Feather name="check-circle" size={32} color="#fff" />
          </View>
          <Text style={[s.heroTitle, { fontFamily: 'Inter_700Bold' }]}>Password updated!</Text>
          <Text style={[s.heroSub, { fontFamily: 'Inter_400Regular' }]}>
            Your password has been changed{'\n'}successfully.
          </Text>
        </LinearGradient>
        <View style={s.body}>
          <View style={[s.card, { backgroundColor: CARD, alignItems: 'center' }]}>
            <View style={[s.successIcon, { backgroundColor: '#F0FDF4' }]}>
              <Feather name="lock" size={28} color={GREEN} />
            </View>
            <Text style={[s.successTitle, { fontFamily: 'Inter_700Bold', color: TEXT }]}>All set!</Text>
            <Text style={[s.successSub, { fontFamily: 'Inter_400Regular', color: MUTED }]}>
              You can now sign in with your new password.
            </Text>
            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              style={[s.btn, { backgroundColor: BLUE, width: '100%', marginTop: 8 }]}
            >
              <Text style={[s.btnText, { fontFamily: 'Inter_700Bold' }]}>Sign In</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <LinearGradient colors={['#024B68', '#013A52']} style={[s.hero, { paddingTop: insets.top + 20 }]}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <View style={s.heroIcon}>
            <Feather name="key" size={28} color="#fff" />
          </View>
          <Text style={[s.heroTitle, { fontFamily: 'Inter_700Bold' }]}>Create new password</Text>
          <Text style={[s.heroSub, { fontFamily: 'Inter_400Regular' }]}>
            {email ? `For ${email}` : 'Choose a strong password'}
          </Text>
        </LinearGradient>

        <View style={s.body}>
          <View style={[s.card, { backgroundColor: CARD }]}>

            <View style={{ gap: 6 }}>
              <Text style={[s.label, { fontFamily: 'Inter_600SemiBold', color: TEXT }]}>New password</Text>
              <View style={[s.inputRow, { backgroundColor: '#F8F3F0', borderColor: BORDER }]}>
                <Feather name="lock" size={16} color={MUTED} />
                <TextInput
                  style={[s.input, { color: TEXT, fontFamily: 'Inter_400Regular' }]}
                  placeholder="At least 8 characters"
                  placeholderTextColor={MUTED}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPw}
                  autoFocus
                />
                <Pressable onPress={() => setShowPw(p => !p)}>
                  <Feather name={showPw ? 'eye-off' : 'eye'} size={16} color={MUTED} />
                </Pressable>
              </View>
              {password.length > 0 && (
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {strengthBars.map(b => (
                      <View
                        key={b}
                        style={{
                          flex: 1, height: 3, borderRadius: 2,
                          backgroundColor: b <= strength.score ? strength.color : '#E5E7EB',
                        }}
                      />
                    ))}
                  </View>
                  <Text style={{ fontSize: 12, color: strength.color, fontFamily: 'Inter_500Medium' }}>
                    {strength.label} password
                  </Text>
                </View>
              )}
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[s.label, { fontFamily: 'Inter_600SemiBold', color: TEXT }]}>Confirm password</Text>
              <View style={[s.inputRow, { backgroundColor: '#F8F3F0', borderColor: BORDER }]}>
                <Feather name="lock" size={16} color={MUTED} />
                <TextInput
                  style={[s.input, { color: TEXT, fontFamily: 'Inter_400Regular' }]}
                  placeholder="Repeat password"
                  placeholderTextColor={MUTED}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry={!showConfirm}
                  returnKeyType="done"
                  onSubmitEditing={handleReset}
                />
                <Pressable onPress={() => setShowConfirm(p => !p)}>
                  <Feather name={showConfirm ? 'eye-off' : 'eye'} size={16} color={MUTED} />
                </Pressable>
              </View>
              {confirm.length > 0 && password !== confirm && (
                <Text style={{ fontSize: 12, color: '#EF4444', fontFamily: 'Inter_400Regular' }}>
                  Passwords don't match
                </Text>
              )}
              {confirm.length > 0 && password === confirm && confirm.length >= 8 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="check-circle" size={13} color={GREEN} />
                  <Text style={{ fontSize: 12, color: GREEN, fontFamily: 'Inter_500Medium' }}>Passwords match</Text>
                </View>
              )}
            </View>

            {error ? (
              <View style={s.errorBox}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={[s.errorText, { fontFamily: 'Inter_400Regular' }]}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleReset}
              disabled={loading || password.length < 8 || password !== confirm}
              style={[s.btn, { backgroundColor: BLUE, opacity: (loading || password.length < 8 || password !== confirm) ? 0.6 : 1 }]}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[s.btnText, { fontFamily: 'Inter_700Bold' }]}>Update Password</Text>
              }
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
  heroSub:      { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  body:         { flex: 1, padding: 20 },
  card:         { borderRadius: 16, padding: 20, gap: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  label:        { fontSize: 14 },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12 },
  input:        { flex: 1, fontSize: 15 },
  errorBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: '#FEF2F2', borderRadius: 10 },
  errorText:    { flex: 1, color: '#EF4444', fontSize: 13 },
  btn:          { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText:      { color: '#fff', fontSize: 16 },
  successIcon:  { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  successTitle: { fontSize: 22 },
  successSub:   { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
