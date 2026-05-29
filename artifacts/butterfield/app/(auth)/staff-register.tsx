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
import { AddressSearchInput } from '@/components/AddressSearchInput';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';

const POSITIONS = ['Crew', 'Barista', 'Supervisor', 'Trainer', 'Kitchen', 'Delivery'];

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDob(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// ── Sub-component: section header ─────────────────────────────────────────────
function SectionHeading({ icon, title, required }: { icon: string; title: string; required?: boolean }) {
  return (
    <View style={sh.row}>
      <Feather name={icon as any} size={15} color={BLUE} />
      <Text style={sh.title}>{title}</Text>
      {required && <View style={sh.reqBadge}><Text style={sh.reqText}>Required</Text></View>}
      {!required && <View style={sh.optBadge}><Text style={sh.optText}>Optional</Text></View>}
    </View>
  );
}
const sh = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  title:    { fontSize: 15, fontWeight: '700', color: NAVY, flex: 1 },
  reqBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  reqText:  { fontSize: 11, fontWeight: '700', color: BLUE },
  optBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  optText:  { fontSize: 11, fontWeight: '600', color: MUTED },
});

// ── Field label ───────────────────────────────────────────────────────────────
function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {text}{required ? <Text style={{ color: '#EF4444' }}> *</Text> : ''}
    </Text>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function StaffRegisterScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string }>();

  // ── Step 1 ────────────────────────────────────────────────────────────────
  const [code,       setCode]       = useState(params.token ?? '');
  const [validating, setValidating] = useState(false);
  const [codeValid,  setCodeValid]  = useState(false);
  const [codeNote,   setCodeNote]   = useState<string | null>(null);

  // ── Personal (required) ───────────────────────────────────────────────────
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [phone,    setPhone]    = useState('');
  const [address,  setAddress]  = useState('');
  const [dob,      setDob]      = useState('');   // stored as DD/MM/YYYY

  // ── Employment ────────────────────────────────────────────────────────────
  const [position, setPosition] = useState('Crew');

  // ── Optional ─────────────────────────────────────────────────────────────
  const [tfn,      setTfn]      = useState('');
  const [ecName,   setEcName]   = useState('');
  const [ecPhone,  setEcPhone]  = useState('');
  const [ecRel,    setEcRel]    = useState('');

  // ── Submit ────────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [empId,      setEmpId]      = useState('');

  // ── Refs for keyboard flow ────────────────────────────────────────────────
  const emailRef   = useRef<TextInput>(null);
  const passRef    = useRef<TextInput>(null);
  const phoneRef   = useRef<TextInput>(null);
  const addressRef = useRef<TextInput>(null);
  const dobRef     = useRef<TextInput>(null);
  const tfnRef     = useRef<TextInput>(null);
  const ecNameRef  = useRef<TextInput>(null);
  const ecPhoneRef = useRef<TextInput>(null);
  const ecRelRef   = useRef<TextInput>(null);

  useEffect(() => {
    if (params.token && !codeValid) handleValidateCode(params.token);
  }, []);

  // ── Validate invite code ──────────────────────────────────────────────────
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

  // ── Submit registration ───────────────────────────────────────────────────
  async function handleSubmit() {
    // Required field validation
    if (!name.trim())    { Alert.alert('Missing field', 'Full legal name is required.'); return; }
    if (!email.trim())   { Alert.alert('Missing field', 'Email address is required.'); return; }
    if (password.length < 8) { Alert.alert('Missing field', 'Password must be at least 8 characters.'); return; }
    if (!phone.trim())   { Alert.alert('Missing field', 'Phone number is required.'); return; }
    if (!address.trim()) { Alert.alert('Missing field', 'Home address is required.'); return; }
    if (dob.length < 10) { Alert.alert('Missing field', 'Date of birth is required (DD/MM/YYYY).'); return; }

    // Build emergency contact only if any field is filled
    const hasEc = ecName.trim() || ecPhone.trim() || ecRel.trim();
    const emergencyContact = hasEc
      ? { name: ecName.trim(), phone: ecPhone.trim(), relationship: ecRel.trim() }
      : undefined;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const res = await api.auth.staffRegister({
        token:            code,
        name:             name.trim(),
        email:            email.trim().toLowerCase(),
        password,
        phone:            phone.trim(),
        address:          address.trim(),
        dateOfBirth:      dob,
        position,
        department:       'floor',
        taxFileNumber:    tfn.trim() || undefined,
        emergencyContact,
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

  // ── Success screen ────────────────────────────────────────────────────────
  if (done) {
    return (
      <View style={[styles.container, { backgroundColor: BG }]}>
        <View style={[styles.successCard, { marginTop: insets.top + 40 }]}>
          <View style={styles.successIcon}>
            <Feather name="check-circle" size={52} color={GREEN} />
          </View>
          <Text style={styles.successTitle}>Application submitted!</Text>
          <Text style={styles.successSub}>
            Your account has been created and is pending director approval.
            You'll be able to log in once approved.
          </Text>
          {empId ? (
            <View style={styles.empIdRow}>
              <Text style={styles.empIdLabel}>Your Employee ID</Text>
              <Text style={styles.empIdValue}>{empId}</Text>
            </View>
          ) : null}
          <Pressable style={styles.loginBtn} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.loginBtnText}>Back to Login</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: BG }]}>
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 60 }]}
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
                <Label text="Invite code" required />
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
                    : <Text style={styles.primaryBtnText}>Verify Code</Text>}
                </Pressable>
              </>
            ) : (
              <View style={styles.codeVerified}>
                <Text style={[styles.codeVerifiedText, { color: GREEN }]}>
                  Code verified{codeNote ? ` · ${codeNote}` : ''}
                </Text>
                <Text style={[styles.codeValue, { color: MUTED }]}>{code}</Text>
              </View>
            )}
          </View>

          {/* ── Step 2: Details ───────────────────────────────────────────── */}
          {codeValid && (
            <>
              {/* Login credentials */}
              <View style={styles.card}>
                <View style={styles.stepHeader}>
                  <View style={[styles.stepDot, { backgroundColor: BLUE }]}>
                    <Text style={styles.stepDotText}>2</Text>
                  </View>
                  <Text style={styles.stepTitle}>Your details</Text>
                </View>

                <SectionHeading icon="lock" title="Login credentials" required />

                <Label text="Email address" required />
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
                  onSubmitEditing={() => passRef.current?.focus()}
                />

                <Label text="Password (min 8 characters)" required />
                <View style={styles.passwordRow}>
                  <TextInput
                    ref={passRef}
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
              </View>

              {/* Personal info */}
              <View style={styles.card}>
                <SectionHeading icon="user" title="Personal information" required />

                <Label text="Full legal name" required />
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Jane Smith"
                  placeholderTextColor={MUTED}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => phoneRef.current?.focus()}
                />

                <Label text="Phone number" required />
                <TextInput
                  ref={phoneRef}
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="04xx xxx xxx"
                  placeholderTextColor={MUTED}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => addressRef.current?.focus()}
                />

                <Label text="Home address" required />
                <AddressSearchInput
                  currentValue={address || undefined}
                  placeholder="Search your home address…"
                  onSelect={(r) => {
                    const parts = [r.street, r.suburb, r.state, r.postcode].filter(Boolean);
                    setAddress(parts.join(', '));
                  }}
                />
                <TextInput
                  ref={addressRef}
                  style={[styles.input, { minHeight: 56 }]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="123 Main Street, Suburb NSW 2000"
                  placeholderTextColor={MUTED}
                  autoCapitalize="words"
                  multiline
                  returnKeyType="next"
                  blurOnSubmit
                  onSubmitEditing={() => dobRef.current?.focus()}
                />

                <Label text="Date of birth" required />
                <TextInput
                  ref={dobRef}
                  style={styles.input}
                  value={dob}
                  onChangeText={v => setDob(formatDob(v))}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor={MUTED}
                  keyboardType="number-pad"
                  maxLength={10}
                  returnKeyType="done"
                />
              </View>

              {/* Position */}
              <View style={styles.card}>
                <SectionHeading icon="briefcase" title="Position" />
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
              </View>

              {/* Tax / ABN */}
              <View style={styles.card}>
                <SectionHeading icon="file-text" title="Tax / ABN" />

                <Label text="Tax file number (TFN) or ABN" />
                <TextInput
                  ref={tfnRef}
                  style={styles.input}
                  value={tfn}
                  onChangeText={setTfn}
                  placeholder="000 000 000"
                  placeholderTextColor={MUTED}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
                <Text style={styles.hint}>You can provide this later if you don't have it on hand.</Text>
              </View>

              {/* Emergency contact */}
              <View style={styles.card}>
                <SectionHeading icon="phone-call" title="Emergency contact" />

                <Label text="Contact name" />
                <TextInput
                  ref={ecNameRef}
                  style={styles.input}
                  value={ecName}
                  onChangeText={setEcName}
                  placeholder="John Smith"
                  placeholderTextColor={MUTED}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => ecPhoneRef.current?.focus()}
                />

                <Label text="Contact phone" />
                <TextInput
                  ref={ecPhoneRef}
                  style={styles.input}
                  value={ecPhone}
                  onChangeText={setEcPhone}
                  placeholder="04xx xxx xxx"
                  placeholderTextColor={MUTED}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => ecRelRef.current?.focus()}
                />

                <Label text="Relationship" />
                <TextInput
                  ref={ecRelRef}
                  style={styles.input}
                  value={ecRel}
                  onChangeText={setEcRel}
                  placeholder="e.g. Parent, Partner, Sibling"
                  placeholderTextColor={MUTED}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
              </View>

              {/* Submit */}
              <Pressable
                style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Submit Application</Text>}
              </Pressable>
              <Text style={styles.approvalNote}>
                Your account will require director approval before you can log in.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1 },
  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 18 },
  backBtn:          { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:      { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub:        { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '400', marginTop: 1 },
  stepBadge:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  stepBadgeText:    { color: '#fff', fontSize: 12, fontWeight: '700' },
  scroll:           { padding: 16, gap: 14 },
  card:             { backgroundColor: CARD, borderRadius: 18, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  stepHeader:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  stepDot:          { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepDotText:      { color: '#fff', fontSize: 13, fontWeight: '700' },
  stepTitle:        { fontSize: 16, fontWeight: '700', color: NAVY },
  fieldLabel:       { fontSize: 12, fontWeight: '600', color: MUTED, marginTop: 12, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
  input:            { backgroundColor: BG, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: TEXT, borderWidth: 1, borderColor: BORDER },
  passwordRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn:           { padding: 8 },
  positionRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  posChip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  posChipText:      { fontSize: 13, fontWeight: '600' },
  hint:             { fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 17 },
  primaryBtn:       { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  approvalNote:     { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 4, lineHeight: 18 },
  codeVerified:     { gap: 3 },
  codeVerifiedText: { fontSize: 14, fontWeight: '600' },
  codeValue:        { fontSize: 14, fontFamily: 'monospace' },
  // Success
  successCard:      { margin: 24, backgroundColor: CARD, borderRadius: 24, padding: 28, alignItems: 'center', gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  successIcon:      { marginBottom: 4 },
  successTitle:     { fontSize: 22, fontWeight: '800', color: NAVY, textAlign: 'center' },
  successSub:       { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 22 },
  empIdRow:         { backgroundColor: BG, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', gap: 4, width: '100%' },
  empIdLabel:       { fontSize: 11, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  empIdValue:       { fontSize: 18, fontWeight: '800', color: BLUE, fontFamily: 'monospace' },
  loginBtn:         { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 6 },
  loginBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700' },
});
