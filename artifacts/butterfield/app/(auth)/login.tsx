import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import type { UserRole } from '@/types';

// Loaded lazily so a missing native module never crashes the login screen
let AppleAuthentication: typeof import('expo-apple-authentication') | null = null;
try { AppleAuthentication = require('expo-apple-authentication'); } catch {}

const BG      = '#F5F6FA';
const CARD    = '#FFFFFF';
const BLUE    = '#40C0F2';
const NAVY    = '#1A2B4A';
const TEXT    = '#1C1C1E';
const MUTED   = '#8E8E93';
const BORDER  = '#E5E7EB';
const GREEN   = '#22C55E';
const GOOGLE_RED = '#4285F4';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

const PUBLIC_ROLES = [
  { role: 'customer'  as UserRole, label: 'Customer',  subtitle: 'Order, earn\nrewards & explore', icon: 'coffee'  },
  { role: 'wholesale' as UserRole, label: 'Wholesale', subtitle: 'Bulk orders\n& account tools',   icon: 'package' },
];

const INTERNAL_EMAILS: string[] = [];
type ScreenMode = 'login' | 'register' | 'wholesale-apply';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, internalLogin, register, wholesaleApply, socialLogin } = useAuth();

  const [selectedRole, setSelectedRole] = useState<UserRole>('customer');
  const [mode, setMode]                 = useState<ScreenMode>('login');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [name, setName]                 = useState('');
  const [companyName, setCompanyName]   = useState('');
  const [abn, setAbn]                   = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [successMsg, setSuccessMsg]     = useState('');
  const [showPw, setShowPw]             = useState(false);
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Check Apple availability without crashing if native module is absent
  React.useEffect(() => {
    if (AppleAuthentication && Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
    }
  }, []);

  const [showInternal, setShowInternal]   = useState(false);
  const [iEmail, setIEmail]               = useState('');
  const [iPassword, setIPassword]         = useState('');
  const [iShowPw, setIShowPw]             = useState(false);
  const [iLoading, setILoading]           = useState(false);
  const [iError, setIError]               = useState('');
  const [geoStatus, setGeoStatus]         = useState<'idle' | 'acquiring' | 'ready' | 'denied'>('idle');

  const isWholesale      = selectedRole === 'wholesale';
  const isWholesaleApply = mode === 'wholesale-apply';
  const showSocial       = !isWholesale && mode !== 'wholesale-apply' && !showInternal;

  const clearPublic = () => {
    setEmail(''); setPassword(''); setName(''); setCompanyName(''); setAbn('');
    setError(''); setSuccessMsg(''); setShowPw(false);
  };

  // ── Google OAuth (via WebBrowser implicit flow — no native crypto needed) ───
  const handleGoogleSignIn = async () => {
    if (!GOOGLE_CLIENT_ID) {
      setError('Google sign-in is not configured yet.');
      return;
    }
    setError('');
    setSocialLoading('google');
    try {
      const redirectUri = 'butterfield://';
      const state = Math.random().toString(36).substring(2);
      const url =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${GOOGLE_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=token` +
        `&scope=${encodeURIComponent('openid profile email')}` +
        `&state=${state}`;
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
      if (result.type !== 'success') { setSocialLoading(null); return; }
      const fragment = result.url.split('#')[1] ?? '';
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      if (!accessToken) { setError('Google sign-in failed — no token received.'); return; }
      const infoRes = await fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const gUser = await infoRes.json();
      const loginResult = await socialLogin({
        provider: 'google',
        providerId: gUser.id,
        email: gUser.email,
        name: gUser.name,
      });
      if (!loginResult.success) { setError(loginResult.error ?? 'Google sign-in failed.'); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message ?? 'Google sign-in failed.');
    } finally {
      setSocialLoading(null);
    }
  };

  // ── Apple Sign-In ───────────────────────────────────────────────────────────
  const handleAppleSignIn = async () => {
    if (!AppleAuthentication) return;
    setSocialLoading('apple');
    setError('');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean).join(' ') || undefined;
      const result = await socialLogin({
        provider: 'apple',
        providerId: credential.user,
        email: credential.email ?? '',
        name: fullName,
      });
      if (!result.success) { setError(result.error ?? 'Apple sign-in failed.'); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        setError('Apple sign-in failed. Please try again.');
      }
    } finally {
      setSocialLoading(null);
    }
  };

  // ── Public submit ───────────────────────────────────────────────────────────
  const handlePublicSubmit = async () => {
    setError(''); setSuccessMsg('');
    if (!email.trim() || !password.trim()) { setError('Please enter your email and password.'); return; }
    if (isWholesaleApply && !companyName.trim()) { setError('Company name is required.'); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (mode === 'register') {
        if (!name.trim()) { setError('Please enter your name.'); setLoading(false); return; }
        const res = await register({ email: email.trim(), password, name: name.trim() });
        if (!res.success) { setError(res.error ?? 'Registration failed.'); return; }
        router.replace('/(tabs)');
      } else if (isWholesaleApply) {
        const res = await wholesaleApply({
          email: email.trim(), password, name: name.trim() || email.trim(),
          companyName: companyName.trim(), abn: abn.trim() || undefined,
        });
        if (!res.success) { setError(res.error ?? 'Application failed.'); return; }
        setSuccessMsg("Application submitted! We'll review it within 1 business day.");
        clearPublic();
      } else {
        const res = await login(email.trim(), password, selectedRole);
        if (!res.success) { setError(res.error ?? 'Login failed.'); return; }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setLoading(false); }
  };

  // ── Internal submit ─────────────────────────────────────────────────────────
  const handleInternalSubmit = async () => {
    setIError('');
    if (!iEmail.trim() || !iPassword.trim()) { setIError('Email and password are required.'); return; }
    setILoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const isDemoAcc = INTERNAL_EMAILS.includes(iEmail.trim().toLowerCase());
    let coords: { latitude: number; longitude: number } | undefined;

    if (!isDemoAcc) {
      setGeoStatus('acquiring');
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setGeoStatus('denied');
          setIError('Location permission is required for staff sign-in.');
          setILoading(false); return;
        }
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Location timed out')), 10000)
        );
        const locPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const loc = await Promise.race([locPromise, timeout]);
        coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setGeoStatus('ready');
      } catch {
        setIError('Could not get your location. Ensure Location Services are on.');
        setILoading(false); setGeoStatus('idle'); return;
      }
    }

    try {
      const res = await internalLogin(iEmail.trim(), iPassword, coords);
      if (!res.success) { setIError(res.error ?? 'Sign in failed.'); setGeoStatus('idle'); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (e: any) {
      setIError(e.message ?? 'Something went wrong.');
      setGeoStatus('idle');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setILoading(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <LinearGradient colors={['#4B72C4', '#3058A8']} style={[s.hero, { paddingTop: insets.top + 28 }]}>
          <Image
            source={require('@/assets/images/logo-white.png')}
            style={{ width: 240, height: 88, marginBottom: 4 }}
            resizeMode="contain"
          />
          <Text style={[s.tagline, { fontFamily: 'Inter_400Regular' }]}>Cookies · Coffee · Desserts</Text>
        </LinearGradient>

        <View style={s.body}>

          {!showInternal ? (
            <>
              <Text style={[s.signInAs, { fontFamily: 'Inter_600SemiBold' }]}>Sign in as</Text>

              <View style={s.roleRow}>
                {PUBLIC_ROLES.map((r) => {
                  const active = selectedRole === r.role;
                  return (
                    <Pressable
                      key={r.role}
                      onPress={() => { setSelectedRole(r.role); setMode('login'); clearPublic(); Haptics.selectionAsync(); }}
                      style={[s.roleCard, { backgroundColor: CARD, borderColor: active ? BLUE : BORDER, borderWidth: active ? 2 : 1 }]}
                    >
                      <View style={[s.roleIconBox, { backgroundColor: active ? '#E6F7FE' : '#F5F6FA' }]}>
                        <Feather name={r.icon as any} size={22} color={active ? BLUE : MUTED} />
                      </View>
                      <Text style={[s.roleLabel, { fontFamily: active ? 'Inter_700Bold' : 'Inter_500Medium', color: active ? TEXT : MUTED }]}>
                        {r.label}
                      </Text>
                      <Text style={[s.roleSub, { fontFamily: 'Inter_400Regular', color: MUTED }]}>{r.subtitle}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {isWholesale && (
                <View style={[s.segControl, { backgroundColor: '#EFEFEF' }]}>
                  {(['login', 'wholesale-apply'] as const).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => { setMode(m); clearPublic(); Haptics.selectionAsync(); }}
                      style={[s.segBtn, { backgroundColor: mode === m ? CARD : 'transparent' }]}
                    >
                      <Text style={[s.segBtnText, { fontFamily: mode === m ? 'Inter_600SemiBold' : 'Inter_400Regular', color: mode === m ? TEXT : MUTED }]}>
                        {m === 'login' ? 'Sign In' : 'Apply for Account'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Social sign-in — customer only, login/register mode */}
              {showSocial && (
                <>
                  <View style={s.socialRow}>
                    {appleAvailable && (
                      <Pressable
                        onPress={handleAppleSignIn}
                        disabled={socialLoading !== null}
                        style={[s.socialBtn, { backgroundColor: '#000', flex: 1 }]}
                      >
                        {socialLoading === 'apple'
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <>
                              <Feather name="smartphone" size={16} color="#fff" />
                              <Text style={[s.socialBtnText, { fontFamily: 'Inter_600SemiBold', color: '#fff' }]}>Apple</Text>
                            </>
                        }
                      </Pressable>
                    )}
                    <Pressable
                      onPress={handleGoogleSignIn}
                      disabled={socialLoading !== null}
                      style={[s.socialBtn, { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, flex: 1 }]}
                    >
                      {socialLoading === 'google'
                        ? <ActivityIndicator color={GOOGLE_RED} size="small" />
                        : <>
                            <Text style={{ fontSize: 15, lineHeight: 18, fontFamily: 'Inter_700Bold', color: '#4285F4' }}>G</Text>
                            <Text style={[s.socialBtnText, { fontFamily: 'Inter_600SemiBold', color: TEXT }]}>Google</Text>
                          </>
                      }
                    </Pressable>
                  </View>

                  <View style={s.dividerRow}>
                    <View style={s.dividerLine} />
                    <Text style={[s.dividerText, { fontFamily: 'Inter_400Regular', color: MUTED }]}>or continue with email</Text>
                    <View style={s.dividerLine} />
                  </View>
                </>
              )}

              {(mode === 'register' || isWholesaleApply) && (
                <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <Feather name="user" size={16} color={MUTED} />
                  <TextInput style={[s.input, { color: TEXT }]} placeholder="Full name" placeholderTextColor={MUTED} value={name} onChangeText={setName} autoCapitalize="words" />
                </View>
              )}

              {isWholesaleApply && (
                <>
                  <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Feather name="briefcase" size={16} color={MUTED} />
                    <TextInput style={[s.input, { color: TEXT }]} placeholder="Company name" placeholderTextColor={MUTED} value={companyName} onChangeText={setCompanyName} autoCapitalize="words" />
                  </View>
                  <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Feather name="hash" size={16} color={MUTED} />
                    <TextInput style={[s.input, { color: TEXT }]} placeholder="ABN (optional)" placeholderTextColor={MUTED} value={abn} onChangeText={setAbn} keyboardType="numeric" />
                  </View>
                </>
              )}

              <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                <Feather name="mail" size={16} color={MUTED} />
                <TextInput style={[s.input, { color: TEXT }]} placeholder="Email address" placeholderTextColor={MUTED} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              </View>

              <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                <Feather name="lock" size={16} color={MUTED} />
                <TextInput style={[s.input, { flex: 1, color: TEXT }]} placeholder="Password" placeholderTextColor={MUTED} value={password} onChangeText={setPassword} secureTextEntry={!showPw} />
                <Pressable onPress={() => setShowPw(p => !p)}><Feather name={showPw ? 'eye-off' : 'eye'} size={16} color={MUTED} /></Pressable>
              </View>

              {error ? <View style={s.errorBox}><Feather name="alert-circle" size={14} color="#EF4444" /><Text style={[s.errorText, { fontFamily: 'Inter_400Regular' }]}>{error}</Text></View> : null}
              {successMsg ? <View style={s.successBox}><Feather name="check-circle" size={14} color={GREEN} /><Text style={[s.successText, { fontFamily: 'Inter_400Regular' }]}>{successMsg}</Text></View> : null}

              <Pressable onPress={handlePublicSubmit} disabled={loading} style={[s.submitBtn, { backgroundColor: BLUE, opacity: loading ? 0.85 : 1 }]}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={[s.submitBtnText, { fontFamily: 'Inter_700Bold' }]}>
                    {isWholesaleApply ? 'Submit Application' : mode === 'register' ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </Pressable>

              {!isWholesale && (
                <Pressable onPress={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); Haptics.selectionAsync(); }} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={[s.toggleText, { fontFamily: 'Inter_400Regular', color: MUTED }]}>
                    {mode === 'register' ? 'Already have an account? ' : "Don't have an account? "}
                    <Text style={{ color: BLUE, fontFamily: 'Inter_600SemiBold' }}>{mode === 'register' ? 'Sign In' : 'Register'}</Text>
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => { setShowInternal(true); setIError(''); setIEmail(''); setIPassword(''); setGeoStatus('idle'); Haptics.selectionAsync(); }}
                style={{ alignItems: 'center', paddingVertical: 8 }}
              >
                <Text style={[s.internalLink, { fontFamily: 'Inter_400Regular', color: MUTED }]}>
                  Staff / Internal Access  →
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => { setShowInternal(false); setIError(''); setGeoStatus('idle'); Haptics.selectionAsync(); }} style={s.backBtn}>
                <Feather name="arrow-left" size={18} color={TEXT} />
                <Text style={[s.backText, { fontFamily: 'Inter_500Medium', color: TEXT }]}>Back</Text>
              </Pressable>

              <View style={[s.internalHeader, { backgroundColor: NAVY }]}>
                <View style={s.internalBadgeRow}>
                  <Feather name="shield" size={13} color="rgba(255,255,255,0.6)" />
                  <Text style={[s.internalBadgeTxt, { fontFamily: 'Inter_700Bold' }]}>INTERNAL ACCESS</Text>
                </View>
                <Text style={[s.internalTitle, { fontFamily: 'Inter_700Bold' }]}>Staff & Director Sign In</Text>
                <Text style={[s.internalSub, { fontFamily: 'Inter_400Regular' }]}>
                  Your role is automatically determined by your credentials.
                </Text>
              </View>

              {geoStatus === 'acquiring' && (
                <View style={[s.geoBanner, { backgroundColor: '#EFF6FF', borderColor: '#3B82F680' }]}>
                  <ActivityIndicator size="small" color="#3B82F6" />
                  <Text style={[s.geoText, { fontFamily: 'Inter_400Regular', color: '#3B82F6' }]}>Getting your location…</Text>
                </View>
              )}
              {geoStatus === 'ready' && (
                <View style={[s.geoBanner, { backgroundColor: '#F0FDF4', borderColor: '#22C55E80' }]}>
                  <Feather name="check-circle" size={14} color={GREEN} />
                  <Text style={[s.geoText, { fontFamily: 'Inter_400Regular', color: GREEN }]}>Location verified</Text>
                </View>
              )}
              {geoStatus === 'denied' && (
                <View style={[s.geoBanner, { backgroundColor: '#FEF2F2', borderColor: '#EF444480' }]}>
                  <Feather name="alert-circle" size={14} color="#EF4444" />
                  <Text style={[s.geoText, { fontFamily: 'Inter_400Regular', color: '#EF4444' }]}>Location denied — enable in Settings</Text>
                </View>
              )}

              <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                <Feather name="mail" size={16} color={MUTED} />
                <TextInput style={[s.input, { color: TEXT }]} placeholder="Email address" placeholderTextColor={MUTED} value={iEmail} onChangeText={setIEmail} keyboardType="email-address" autoCapitalize="none" autoFocus />
              </View>

              <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                <Feather name="lock" size={16} color={MUTED} />
                <TextInput style={[s.input, { flex: 1, color: TEXT }]} placeholder="Password" placeholderTextColor={MUTED} value={iPassword} onChangeText={setIPassword} secureTextEntry={!iShowPw} />
                <Pressable onPress={() => setIShowPw(p => !p)}><Feather name={iShowPw ? 'eye-off' : 'eye'} size={16} color={MUTED} /></Pressable>
              </View>

              {iError ? <View style={s.errorBox}><Feather name="alert-circle" size={14} color="#EF4444" /><Text style={[s.errorText, { fontFamily: 'Inter_400Regular' }]}>{iError}</Text></View> : null}

              <Pressable onPress={handleInternalSubmit} disabled={iLoading} style={[s.submitBtn, { backgroundColor: NAVY, opacity: iLoading ? 0.8 : 1 }]}>
                {iLoading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={[s.submitBtnText, { fontFamily: 'Inter_700Bold' }]}>
                      {geoStatus === 'acquiring' ? 'Getting location…' : 'Signing in…'}
                    </Text>
                  </View>
                ) : <Text style={[s.submitBtnText, { fontFamily: 'Inter_700Bold' }]}>Sign In</Text>}
              </Pressable>

              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 2 }}>
                <Feather name="map-pin" size={11} color={MUTED} style={{ marginTop: 1 }} />
                <Text style={[s.geoNote, { fontFamily: 'Inter_400Regular', color: MUTED }]}>
                  Staff must be within range of Butterfield Merrylands to sign in.
                </Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  hero:            { alignItems: 'center', paddingBottom: 36, gap: 6 },
  tagline:         { color: 'rgba(255,255,255,0.8)', fontSize: 13, letterSpacing: 0.5 },
  body:            { flex: 1, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 48, gap: 14 },
  signInAs:        { fontSize: 15, color: TEXT },
  roleRow:         { flexDirection: 'row', gap: 12 },
  roleCard:        { flex: 1, padding: 16, gap: 8, alignItems: 'center', borderRadius: 16 },
  roleIconBox:     { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  roleLabel:       { fontSize: 15 },
  roleSub:         { fontSize: 11, textAlign: 'center' },
  segControl:      { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 13 },
  segBtn:          { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  segBtnText:      { fontSize: 13 },
  socialRow:       { flexDirection: 'row', gap: 12 },
  socialBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 13, paddingHorizontal: 12 },
  socialBtnText:   { fontSize: 15 },
  dividerRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine:     { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText:     { fontSize: 12 },
  inputRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 52, borderWidth: 1, borderRadius: 12 },
  input:           { flex: 1, fontSize: 15 },
  errorBox:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: '#FEF2F2', borderRadius: 10 },
  errorText:       { flex: 1, color: '#EF4444', fontSize: 13 },
  successBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: '#F0FDF4', borderRadius: 10 },
  successText:     { flex: 1, color: GREEN, fontSize: 13 },
  submitBtn:       { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  submitBtnText:   { color: '#fff', fontSize: 16 },
  toggleText:      { fontSize: 14, textAlign: 'center' },
  internalLink:    { fontSize: 13 },
  backBtn:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  backText:        { fontSize: 15 },
  internalHeader:  { padding: 20, gap: 8, borderRadius: 16 },
  internalBadgeRow:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  internalBadgeTxt:{ color: 'rgba(255,255,255,0.6)', fontSize: 11, letterSpacing: 1.5 },
  internalTitle:   { color: '#fff', fontSize: 22 },
  internalSub:     { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 18 },
  geoBanner:       { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  geoText:         { flex: 1, fontSize: 13 },
  geoNote:         { flex: 1, fontSize: 11, lineHeight: 16 },
});
