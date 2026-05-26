import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';

const BG      = '#F5F6FA';
const CARD    = '#FFFFFF';
const BLUE    = '#1493FF';
const NAVY    = '#1A2B4A';
const TEXT    = '#1C1C1E';
const MUTED   = '#8E8E93';
const BORDER  = '#E5E7EB';
const GREEN   = '#22C55E';
const RED     = '#EF4444';

const POSITIONS = ['Crew', 'Barista', 'Supervisor', 'Trainer', 'Kitchen', 'Delivery'];

export default function StaffRegisterScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string }>();

  // Step 1: code entry
  const [code, setCode]               = useState(params.token ?? '');
  const [validating, setValidating]   = useState(false);
  const [codeValid, setCodeValid]     = useState(false);
  const [codeNote, setCodeNote]       = useState<string | null>(null);

  // Step 2: personal details
  const [name,       setName]         = useState('');
  const [email,      setEmail]        = useState('');
  const [password,   setPassword]     = useState('');
  const [showPass,   setShowPass]     = useState(false);
  const [phone,      setPhone]        = useState('');
  const [position,   setPosition]     = useState('Crew');
  const [submitting, setSubmitting]   = useState(false);

  // Step 3: success
  const [done,       setDone]         = useState(false);
  const [empId,      setEmpId]        = useState('');

  const emailRef    = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const phoneRef    = useRef<TextInput>(null);

  // Auto-validate if token passed via deep link
  useEffect(() => {
    if (params.token && !codeValid) handleValidateCode(params.token);
  }, []);

  async function handleValidateCode(override?: string) {
    const t = (override ?? code).trim().toUpperCase();
    if (!t) { Alert.alert('Enter your invite code'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setValidating(true);
    try {
      const res = await api.auth.validateStaffInvite(t);
      if (res.valid) {
        setCode(t);
        setCodeValid(true);
        setCodeNote(res.note);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: any) {
      Alert.alert('Invalid code', e?.message ?? 'That invite code is not valid or has expired.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setValidating(false);
    }
  }

  async function handleSubmit() {
    if (!name.trim())  { Alert.alert('Enter your full name'); return; }
    if (!email.trim()) { Alert.alert('Enter your email address'); return; }
    if (password.length < 8) { Alert.alert('Password must be at least 8 characters'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const res = await api.auth.staffRegister({
        token: code,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
        position,
        department: 'floor',
      });
      setEmpId(res.employeeId ?? '');
      setDone(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Registration failed', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <View style={[styles.container, { backgroundColor: BG }]}>
        <View style={[styles.successCard, { marginTop: insets.top + 40 }]}>
          <View style={styles.successIcon}>
            <Feather name="check-circle" size={52} color={GREEN} />
          </View>
          <Text style={styles.successTitle}>Application submitted!</Text>
          <Text style={styles.successSub}>
            Your account has been created and is pending director approval. You'll be able to log in
            once approved.
          </Text>
          {empId ? (
            <View style={styles.empIdRow}>
              <Text style={styles.empIdLabel}>Your Employee ID</Text>
              <Text style={styles.empIdValue}>{empId}</Text>
            </View>
          ) : null}
          <Pressable
            style={styles.loginBtn}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={styles.loginBtnText}>Back to Login</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: BG }]}>
      {/* Header */}
      <LinearGradient
        colors={['#1493FF', '#3CBBEE']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 14 }]}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Staff Registration</Text>
          <Text style={styles.headerSub}>Butterfield Cookies</Text>
        </View>
        <View style={[styles.stepBadge, { backgroundColor: codeValid ? GREEN : 'rgba(255,255,255,0.25)' }]}>
          <Text style={styles.stepBadgeText}>{codeValid ? '2 / 2' : '1 / 2'}</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Step 1: Invite code ──────────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepDot, { backgroundColor: BLUE }]}>
                <Text style={styles.stepDotText}>1</Text>
              </View>
              <Text style={styles.stepTitle}>Enter invite code</Text>
              {codeValid && <Feather name="check-circle" size={18} color={GREEN} style={{ marginLeft: 'auto' }} />}
            </View>

            {!codeValid ? (
              <>
                <Text style={styles.fieldLabel}>Invite code</Text>
                <TextInput
                  style={styles.input}
                  value={code}
                  onChangeText={v => setCode(v.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX"
                  placeholderTextColor={MUTED}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => handleValidateCode()}
                />
                <Pressable
                  style={[styles.primaryBtn, validating && { opacity: 0.6 }]}
                  onPress={() => handleValidateCode()}
                  disabled={validating}
                >
                  {validating
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.primaryBtnText}>Verify Code</Text>
                  }
                </Pressable>
              </>
            ) : (
              <View style={styles.codeVerified}>
                <Text style={[styles.codeVerifiedText, { color: GREEN }]}>
                  Code verified {codeNote ? `· ${codeNote}` : ''}
                </Text>
                <Text style={[styles.codeValue, { color: MUTED }]}>{code}</Text>
              </View>
            )}
          </View>

          {/* ── Step 2: Personal details ─────────────────────────────────── */}
          {codeValid && (
            <View style={styles.card}>
              <View style={styles.stepHeader}>
                <View style={[styles.stepDot, { backgroundColor: BLUE }]}>
                  <Text style={styles.stepDotText}>2</Text>
                </View>
                <Text style={styles.stepTitle}>Your details</Text>
              </View>

              <Text style={styles.fieldLabel}>Full name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Jane Smith"
                placeholderTextColor={MUTED}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />

              <Text style={styles.fieldLabel}>Email *</Text>
              <TextInput
                ref={emailRef}
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="jane@example.com"
                placeholderTextColor={MUTED}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />

              <Text style={styles.fieldLabel}>Password * (min 8 characters)</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  ref={passwordRef}
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Create a password"
                  placeholderTextColor={MUTED}
                  secureTextEntry={!showPass}
                  returnKeyType="next"
                  onSubmitEditing={() => phoneRef.current?.focus()}
                />
                <Pressable onPress={() => setShowPass(v => !v)} style={styles.eyeBtn} hitSlop={8}>
                  <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color={MUTED} />
                </Pressable>
              </View>

              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                ref={phoneRef}
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="04xx xxx xxx"
                placeholderTextColor={MUTED}
                keyboardType="phone-pad"
                returnKeyType="done"
              />

              <Text style={styles.fieldLabel}>Position</Text>
              <View style={styles.positionRow}>
                {POSITIONS.map(p => (
                  <Pressable
                    key={p}
                    onPress={() => { setPosition(p); Haptics.selectionAsync(); }}
                    style={[
                      styles.posChip,
                      { backgroundColor: position === p ? BLUE : '#F2F2F7', borderColor: position === p ? BLUE : BORDER },
                    ]}
                  >
                    <Text style={[styles.posChipText, { color: position === p ? '#fff' : TEXT }]}>{p}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={[styles.primaryBtn, { marginTop: 20 }, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Submit Application</Text>
                }
              </Pressable>
              <Text style={styles.approvalNote}>
                Your account will require director approval before you can log in.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 18 },
  backBtn:         { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:     { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub:       { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '400', marginTop: 1 },
  stepBadge:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  stepBadgeText:   { color: '#fff', fontSize: 12, fontWeight: '700' },
  scroll:          { padding: 16, gap: 14 },
  card:            { backgroundColor: CARD, borderRadius: 18, padding: 18, gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  stepHeader:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  stepDot:         { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepDotText:     { color: '#fff', fontSize: 13, fontWeight: '700' },
  stepTitle:       { fontSize: 16, fontWeight: '700', color: NAVY },
  fieldLabel:      { fontSize: 12, fontWeight: '600', color: MUTED, marginTop: 8, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  input:           { backgroundColor: BG, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: TEXT, borderWidth: 1, borderColor: BORDER, marginBottom: 2 },
  passwordRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  eyeBtn:          { padding: 8 },
  positionRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  posChip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  posChipText:     { fontSize: 13, fontWeight: '600' },
  primaryBtn:      { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  primaryBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  approvalNote:    { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 10, lineHeight: 18 },
  codeVerified:    { gap: 2 },
  codeVerifiedText:{ fontSize: 14, fontWeight: '600' },
  codeValue:       { fontSize: 14, fontFamily: 'monospace' },
  // Success
  successCard:     { margin: 24, backgroundColor: CARD, borderRadius: 24, padding: 28, alignItems: 'center', gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  successIcon:     { marginBottom: 4 },
  successTitle:    { fontSize: 22, fontWeight: '800', color: NAVY, textAlign: 'center' },
  successSub:      { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 22 },
  empIdRow:        { backgroundColor: BG, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', gap: 4, width: '100%' },
  empIdLabel:      { fontSize: 11, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  empIdValue:      { fontSize: 18, fontWeight: '800', color: BLUE, fontFamily: 'monospace' },
  loginBtn:        { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 6 },
  loginBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
});
