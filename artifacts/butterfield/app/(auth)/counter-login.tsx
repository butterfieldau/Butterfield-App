import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { getHomeRouteForRole } from '@/lib/roleRoutes';

const NAVY    = '#1A2B4A';
const NAVY2   = '#243755';
const BLUE    = '#1493FF';
const TEXT    = '#FFFFFF';
const MUTED   = 'rgba(255,255,255,0.55)';
const BORDER  = 'rgba(255,255,255,0.15)';
const INPUT_BG = 'rgba(255,255,255,0.08)';
const RED     = '#EF4444';
const GREEN   = '#22C55E';

export default function CounterLoginScreen() {
  const insets = useSafeAreaInsets();
  const { internalLogin } = useAuth();

  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const handleSignIn = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await internalLogin(email.trim(), password);
      if (!res.success) {
        setError(res.error ?? 'Sign in failed. Check your credentials.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      if (res.role !== 'shop_display') {
        setError('This terminal is for counter / shop display accounts only.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismissAll();
      router.replace(getHomeRouteForRole(res.role));
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: NAVY }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={[NAVY, NAVY2, '#0E1A2E']}
        style={{ flex: 1 }}
      >
        <View style={[s.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>

          <View style={s.logoArea}>
            <Image
              source={require('@/assets/images/logo-white.png')}
              style={s.logo}
              resizeMode="contain"
            />
            <View style={s.badge}>
              <Feather name="monitor" size={12} color={BLUE} />
              <Text style={s.badgeText}>COUNTER TERMINAL</Text>
            </View>
            <Text style={s.subtitle}>Sign in to the shop display portal</Text>
          </View>

          <View style={s.card}>

            <View style={s.inputGroup}>
              <Text style={s.label}>Email address</Text>
              <View style={s.inputRow}>
                <Feather name="mail" size={18} color={MUTED} style={{ marginRight: 10 }} />
                <TextInput
                  style={s.input}
                  placeholder="counter@butterfieldcookies.com.au"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={email}
                  onChangeText={t => { setEmail(t); setError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputRow}>
                <Feather name="lock" size={18} color={MUTED} style={{ marginRight: 10 }} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={password}
                  onChangeText={t => { setPassword(t); setError(''); }}
                  secureTextEntry={!showPw}
                  returnKeyType="go"
                  onSubmitEditing={handleSignIn}
                />
                <Pressable onPress={() => setShowPw(p => !p)} hitSlop={12}>
                  <Feather name={showPw ? 'eye-off' : 'eye'} size={18} color={MUTED} />
                </Pressable>
              </View>
            </View>

            {error ? (
              <View style={s.errorBox}>
                <Feather name="alert-circle" size={14} color={RED} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={[s.signInBtn, loading && { opacity: 0.75 }]}
              onPress={handleSignIn}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="log-in" size={18} color="#fff" />
                  <Text style={s.signInBtnText}>Sign In to Counter</Text>
                </>
              )}
            </Pressable>

            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>or</Text>
              <View style={s.dividerLine} />
            </View>

            <Pressable
              style={s.backBtn}
              onPress={() => { Haptics.selectionAsync(); router.back(); }}
            >
              <Feather name="arrow-left" size={16} color={MUTED} />
              <Text style={s.backBtnText}>Back to customer login</Text>
            </Pressable>

          </View>

          <View style={s.footer}>
            <Feather name="shield" size={13} color="rgba(255,255,255,0.25)" />
            <Text style={s.footerText}>Authorised personnel only</Text>
          </View>

        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  logoArea: {
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 220,
    height: 80,
    marginBottom: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(20,147,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(20,147,255,0.35)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: {
    color: BLUE,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  subtitle: {
    color: MUTED,
    fontSize: 15,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 2,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    color: TEXT,
    fontSize: 16,
    fontWeight: '400',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '400',
    flex: 1,
  },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
  },
  signInBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
  },
  dividerText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '500',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  backBtnText: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 12,
    fontWeight: '400',
  },
});
