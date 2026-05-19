import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
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
const BLUE    = '#1493FF';
const BLUE_DARK = '#3CBBEE';
const NAVY    = '#1A2B4A';
const TEXT    = '#1C1C1E';
const MUTED   = '#8E8E93';
const BORDER  = '#E5E7EB';
const GREEN   = '#22C55E';
const GOOGLE_RED = '#4285F4';

const GOOGLE_IOS_CLIENT_ID = '119890251041-tsgds8o83po7p4gaeqqfnph67e3fpt46.apps.googleusercontent.com';

// Configure the native Google Sign-In SDK once at module load time
GoogleSignin.configure({ iosClientId: GOOGLE_IOS_CLIENT_ID });

const PUBLIC_ROLES = [
  { role: 'customer'  as UserRole, label: 'Customer',  subtitle: 'Order, earn\nrewards & explore', icon: 'coffee'  },
  { role: 'wholesale' as UserRole, label: 'Wholesale', subtitle: 'Bulk orders\n& account tools',   icon: 'package' },
];

const INTERNAL_EMAILS: string[] = [];
type ScreenMode = 'login' | 'register' | 'wholesale-apply';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, internalLogin, register, wholesaleApply, socialLogin } = useAuth();
  const params = useLocalSearchParams<{ mode?: string }>();

  const [selectedRole, setSelectedRole] = useState<UserRole>('customer');
  const [mode, setMode]                 = useState<ScreenMode>(
    params.mode === 'register' ? 'register' : 'login',
  );
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [name, setName]                 = useState('');
  const [phone, setPhone]               = useState('');
  const [companyName, setCompanyName]   = useState('');
  const [abn, setAbn]                   = useState('');
  const [address, setAddress]           = useState('');
  const [howDidYouHear, setHowDidYouHear] = useState('');
  const [submitted, setSubmitted]       = useState(false);
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
    setEmail(''); setPassword(''); setName(''); setPhone(''); setCompanyName(''); setAbn('');
    setAddress(''); setHowDidYouHear(''); setError(''); setSuccessMsg(''); setShowPw(false);
  };

  // ── Google Sign-In (native iOS SDK) ──────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setError('');
    setSocialLoading('google');
    try {
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;
      if (!idToken) {
        setError('Google sign-in failed — no token received.');
        setSocialLoading(null);
        return;
      }
      const result = await socialLogin({ provider: 'google', idToken });
      if (!result.success) {
        setError(result.error ?? 'Google sign-in failed.');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      if (e.code !== 'SIGN_IN_CANCELLED') {
        setError('Google sign-in failed. Please try again.');
      }
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
      if (!credential.identityToken) { setError('Apple sign-in failed — no identity token received.'); return; }
      const result = await socialLogin({
        provider: 'apple',
        idToken: credential.identityToken,
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
        if (!phone.trim()) { setError('Phone number is required.'); setLoading(false); return; }
        const res = await register({ email: email.trim(), password, name: name.trim(), phone: phone.trim() });
        if (!res.success) { setError(res.error ?? 'Registration failed.'); return; }
        router.replace('/(tabs)');
      } else if (isWholesaleApply) {
        if (!name.trim()) { setError('Full name is required.'); setLoading(false); return; }
        if (!phone.trim()) { setError('Phone number is required.'); setLoading(false); return; }
        if (!address.trim()) { setError('Business address is required.'); setLoading(false); return; }
        const res = await wholesaleApply({
          email: email.trim(), password, name: name.trim(),
          companyName: companyName.trim(), abn: abn.trim() || undefined,
          phone: phone.trim(), deliveryAddress: address.trim(),
          howDidYouHear: howDidYouHear || undefined,
        });
        if (!res.success) { setError(res.error ?? 'Application failed.'); return; }
        clearPublic();
        setSubmitted(true);
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
      <View style={{ flex: 1 }}>
        <LinearGradient colors={[BLUE, BLUE_DARK]} style={[s.hero, { paddingTop: insets.top + 28 }]}>
          <Image
            source={require('@/assets/images/logo-white.png')}
            style={{ width: 240, height: 88, marginBottom: 4 }}
            resizeMode="contain"
          />
          <Text style={[s.tagline, { fontWeight: '400' }]}>Cookies · Coffee · Desserts</Text>
        </LinearGradient>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.body}>

          {!showInternal ? (
            <>
              <Text style={[s.signInAs, { fontWeight: '600' }]}>Sign in as</Text>

              <View style={s.roleRow}>
                {PUBLIC_ROLES.map((r) => {
                  const active = selectedRole === r.role;
                  return (
                    <Pressable
                      key={r.role}
                      onPress={() => { setSelectedRole(r.role); setMode('login'); clearPublic(); Haptics.selectionAsync(); }}
                      style={[s.roleCard, { backgroundColor: CARD, borderColor: active ? BLUE : BORDER, borderWidth: active ? 2 : 1 }]}
                    >
                      <View style={[s.roleIconBox, { backgroundColor: active ? '#E6F0FF' : '#F5F6FA' }]}>
                        <Feather name={r.icon as any} size={22} color={active ? BLUE : MUTED} />
                      </View>
                      <Text style={[s.roleLabel, { fontWeight: active ? '700' : '500', color: active ? TEXT : MUTED }]}>
                        {r.label}
                      </Text>
                      <Text style={[s.roleSub, { fontWeight: '400', color: MUTED }]}>{r.subtitle}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {isWholesale && (
                <View style={[s.segControl, { backgroundColor: '#EFEFEF' }]}>
                  {(['login', 'wholesale-apply'] as const).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => { setMode(m); clearPublic(); setSubmitted(false); Haptics.selectionAsync(); }}
                      style={[s.segBtn, { backgroundColor: mode === m ? CARD : 'transparent' }]}
                    >
                      <Text style={[s.segBtnText, { fontWeight: mode === m ? '600' : '400', color: mode === m ? TEXT : MUTED }]}>
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
                              <Text style={[s.socialBtnText, { fontWeight: '600', color: '#fff' }]}>Apple</Text>
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
                            <Text style={{ fontSize: 15, lineHeight: 18, fontWeight: '700', color: '#4285F4' }}>G</Text>
                            <Text style={[s.socialBtnText, { fontWeight: '600', color: TEXT }]}>Google</Text>
                          </>
                      }
                    </Pressable>
                  </View>

                  <View style={s.dividerRow}>
                    <View style={s.dividerLine} />
                    <Text style={[s.dividerText, { fontWeight: '400', color: MUTED }]}>or continue with email</Text>
                    <View style={s.dividerLine} />
                  </View>
                </>
              )}

              {!submitted && (mode === 'register' || isWholesaleApply) && (
                <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <Feather name="user" size={16} color={MUTED} />
                  <TextInput style={[s.input, { color: TEXT }]} placeholder="Full name" placeholderTextColor={MUTED} value={name} onChangeText={setName} autoCapitalize="words" />
                </View>
              )}

              {!submitted && mode === 'register' && (
                <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <Feather name="phone" size={16} color={MUTED} />
                  <TextInput style={[s.input, { color: TEXT }]} placeholder="Mobile number (required)" placeholderTextColor={MUTED} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                </View>
              )}

              {!submitted && isWholesaleApply && (
                <>
                  <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Feather name="briefcase" size={16} color={MUTED} />
                    <TextInput style={[s.input, { color: TEXT }]} placeholder="Company name" placeholderTextColor={MUTED} value={companyName} onChangeText={setCompanyName} autoCapitalize="words" />
                  </View>
                  <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Feather name="hash" size={16} color={MUTED} />
                    <TextInput style={[s.input, { color: TEXT }]} placeholder="ABN (optional)" placeholderTextColor={MUTED} value={abn} onChangeText={setAbn} keyboardType="numeric" />
                  </View>
                  <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Feather name="phone" size={16} color={MUTED} />
                    <TextInput style={[s.input, { color: TEXT }]} placeholder="Phone number (required)" placeholderTextColor={MUTED} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                  </View>
                  <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Feather name="map-pin" size={16} color={MUTED} />
                    <TextInput style={[s.input, { color: TEXT }]} placeholder="Business address (required)" placeholderTextColor={MUTED} value={address} onChangeText={setAddress} autoCapitalize="words" />
                  </View>
                </>
              )}

              {!submitted && (
                <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <Feather name="mail" size={16} color={MUTED} />
                  <TextInput style={[s.input, { color: TEXT }]} placeholder="Email address" placeholderTextColor={MUTED} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
                </View>
              )}

              {!submitted && (
                <View style={[s.inputRow, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <Feather name="lock" size={16} color={MUTED} />
                  <TextInput style={[s.input, { flex: 1, color: TEXT }]} placeholder="Password" placeholderTextColor={MUTED} value={password} onChangeText={setPassword} secureTextEntry={!showPw} />
                  <Pressable onPress={() => setShowPw(p => !p)}><Feather name={showPw ? 'eye-off' : 'eye'} size={16} color={MUTED} /></Pressable>
                </View>
              )}

              {!submitted && isWholesaleApply && (
                <>
                  <Text style={[s.hearLabel, { fontWeight: '600', color: TEXT }]}>How did you hear about us?</Text>
                  <View style={s.hearRow}>
                    {['Social media', 'Google / Search', 'Word of mouth', 'Trade show / Event', 'Other'].map((opt) => (
                      <Pressable
                        key={opt}
                        onPress={() => { setHowDidYouHear(howDidYouHear === opt ? '' : opt); Haptics.selectionAsync(); }}
                        style={[s.hearPill, { backgroundColor: howDidYouHear === opt ? BLUE : CARD, borderColor: howDidYouHear === opt ? BLUE : BORDER }]}
                      >
                        <Text style={[s.hearPillText, { fontWeight: howDidYouHear === opt ? '600' : '400', color: howDidYouHear === opt ? '#fff' : MUTED }]}>{opt}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {mode === 'login' && !isWholesaleApply && (
                <Pressable onPress={() => router.push('/(auth)/forgot-password')} style={{ alignSelf: 'flex-end', marginTop: -4 }}>
                  <Text style={[s.forgotText, { fontWeight: '500', color: BLUE }]}>Forgot password?</Text>
                </Pressable>
              )}

              {error ? <View style={s.errorBox}><Feather name="alert-circle" size={14} color="#EF4444" /><Text style={[s.errorText, { fontWeight: '400' }]}>{error}</Text></View> : null}
              {successMsg ? <View style={s.successBox}><Feather name="check-circle" size={14} color={GREEN} /><Text style={[s.successText, { fontWeight: '400' }]}>{successMsg}</Text></View> : null}

              {isWholesaleApply && submitted ? (
                <View style={s.submittedBox}>
                  <View style={[s.submittedIcon, { backgroundColor: '#F0FDF4' }]}>
                    <Feather name="check-circle" size={32} color={GREEN} />
                  </View>
                  <Text style={[s.submittedTitle, { fontWeight: '700', color: TEXT }]}>Application Submitted!</Text>
                  <Text style={[s.submittedBody, { fontWeight: '400', color: MUTED }]}>
                    Your application has been submitted. Someone from our team will be in contact with you soon.
                  </Text>
                </View>
              ) : (
              <Pressable onPress={handlePublicSubmit} disabled={loading} style={[s.submitBtn, { backgroundColor: '#D0312D', opacity: loading ? 0.85 : 1 }]}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={[s.submitBtnText, { fontWeight: '700' }]}>
                    {isWholesaleApply ? 'Submit Application' : mode === 'register' ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </Pressable>
              )}

              {(mode === 'register' || isWholesaleApply) && !submitted && (
                <Text style={[s.termsText, { color: MUTED }]}>
                  By creating an account you agree to our{' '}
                  <Text
                    style={{ color: BLUE, fontWeight: '600' }}
                    onPress={() => WebBrowser.openBrowserAsync('https://butterfieldcookies.com.au/pages/terms-of-service')}
                  >Terms of Service</Text>
                  {' '}and{' '}
                  <Text
                    style={{ color: BLUE, fontWeight: '600' }}
                    onPress={() => WebBrowser.openBrowserAsync('https://butterfieldcookies.com.au/pages/privacy-policy')}
                  >Privacy Policy</Text>.
                </Text>
              )}
              {!isWholesale && (
                <Pressable onPress={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); Haptics.selectionAsync(); }} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={[s.toggleText, { fontWeight: '400', color: MUTED }]}>
                    {mode === 'register' ? 'Already have an account? ' : "Don't have an account? "}
                    <Text style={{ color: BLUE, fontWeight: '600' }}>{mode === 'register' ? 'Sign In' : 'Register'}</Text>
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => { setShowInternal(true); setIError(''); setIEmail(''); setIPassword(''); setGeoStatus('idle'); Haptics.selectionAsync(); }}
                style={{ alignItems: 'center', paddingVertical: 8 }}
              >
                <Text style={[s.internalLink, { fontWeight: '400', color: MUTED }]}>
                  Staff / Internal Access  →
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => { setShowInternal(false); setIError(''); setGeoStatus('idle'); Haptics.selectionAsync(); }} style={s.backBtn}>
                <Feather name="arrow-left" size={18} color={TEXT} />
                <Text style={[s.backText, { fontWeight: '500', color: TEXT }]}>Back</Text>
              </Pressable>

              <View style={[s.internalHeader, { backgroundColor: NAVY }]}>
                <View style={s.internalBadgeRow}>
                  <Feather name="shield" size={13} color="rgba(255,255,255,0.6)" />
                  <Text style={[s.internalBadgeTxt, { fontWeight: '700' }]}>INTERNAL ACCESS</Text>
                </View>
                <Text style={[s.internalTitle, { fontWeight: '700' }]}>Internal Portal Sign In</Text>
                <Text style={[s.internalSub, { fontWeight: '400' }]}>
                  Your role is automatically determined by your credentials.
                </Text>
              </View>

              {geoStatus === 'acquiring' && (
                <View style={[s.geoBanner, { backgroundColor: '#EFF6FF', borderColor: '#3B82F680' }]}>
                  <ActivityIndicator size="small" color="#3B82F6" />
                  <Text style={[s.geoText, { fontWeight: '400', color: '#3B82F6' }]}>Getting your location…</Text>
                </View>
              )}
              {geoStatus === 'ready' && (
                <View style={[s.geoBanner, { backgroundColor: '#F0FDF4', borderColor: '#22C55E80' }]}>
                  <Feather name="check-circle" size={14} color={GREEN} />
                  <Text style={[s.geoText, { fontWeight: '400', color: GREEN }]}>Location verified</Text>
                </View>
              )}
              {geoStatus === 'denied' && (
                <View style={[s.geoBanner, { backgroundColor: '#FEF2F2', borderColor: '#EF444480' }]}>
                  <Feather name="alert-circle" size={14} color="#EF4444" />
                  <Text style={[s.geoText, { fontWeight: '400', color: '#EF4444' }]}>Location denied — enable in Settings</Text>
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

              <Pressable onPress={() => router.push('/(auth)/forgot-password')} style={{ alignSelf: 'flex-end', marginTop: -4 }}>
                <Text style={[s.forgotText, { fontWeight: '500', color: '#9CA3AF' }]}>Forgot password?</Text>
              </Pressable>

              {iError ? <View style={s.errorBox}><Feather name="alert-circle" size={14} color="#EF4444" /><Text style={[s.errorText, { fontWeight: '400' }]}>{iError}</Text></View> : null}

              <Pressable onPress={handleInternalSubmit} disabled={iLoading} style={[s.submitBtn, { backgroundColor: NAVY, opacity: iLoading ? 0.8 : 1 }]}>
                {iLoading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={[s.submitBtnText, { fontWeight: '700' }]}>
                      {geoStatus === 'acquiring' ? 'Getting location…' : 'Signing in…'}
                    </Text>
                  </View>
                ) : <Text style={[s.submitBtnText, { fontWeight: '700' }]}>Sign In</Text>}
              </Pressable>

              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 2 }}>
                <Feather name="map-pin" size={11} color={MUTED} style={{ marginTop: 1 }} />
                <Text style={[s.geoNote, { fontWeight: '400', color: MUTED }]}>
                  Staff must be within range of Butterfield Merrylands to sign in.
                </Text>
              </View>
            </>
          )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  hero:            { alignItems: 'center', paddingBottom: 36, gap: 6 },
  scrollContent:   { paddingBottom: 48 },
  tagline:         { color: 'rgba(255,255,255,0.8)', fontSize: 13, letterSpacing: 0.5 },
  body:            { flexGrow: 1, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 48, gap: 14 },
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
  forgotText:      { fontSize: 13 },
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
  termsText:       { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  hearLabel:       { fontSize: 13, color: TEXT, marginTop: 2, marginBottom: -4 },
  hearRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hearPill:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  hearPillText:    { fontSize: 13 },
  submittedBox:    { alignItems: 'center', gap: 12, paddingVertical: 16 },
  submittedIcon:   { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  submittedTitle:  { fontSize: 20, textAlign: 'center' },
  submittedBody:   { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
});
