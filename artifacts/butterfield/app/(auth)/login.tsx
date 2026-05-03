import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import type { UserRole } from '@/types';

const ROLES = [
  {
    role: 'customer' as UserRole,
    label: 'Customer',
    subtitle: 'Order, earn rewards & explore',
    icon: 'coffee',
    gradient: ['#4B72C4', '#3A5BA8'] as [string, string],
  },
  {
    role: 'staff' as UserRole,
    label: 'Staff',
    subtitle: 'Internal Butterfield team',
    icon: 'briefcase',
    gradient: ['#2A3F6B', '#1A2B4A'] as [string, string],
  },
  {
    role: 'wholesale' as UserRole,
    label: 'Wholesale',
    subtitle: 'Bulk orders & account tools',
    icon: 'package',
    gradient: ['#2A5A3A', '#1A3A28'] as [string, string],
  },
];

type ScreenMode = 'login' | 'register' | 'wholesale-apply';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, register, wholesaleApply } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>('customer');
  const [mode, setMode] = useState<ScreenMode>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [abn, setAbn] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const roleConfig = ROLES.find((r) => r.role === selectedRole)!;

  const resetFields = () => {
    setEmail(''); setPassword(''); setName(''); setPhone(''); setBirthday(''); setCompanyName(''); setAbn(''); setError(''); setSuccessMsg('');
  };

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setMode('login');
    resetFields();
    Haptics.selectionAsync();
  };

  const handleSubmit = async () => {
    setError('');
    setSuccessMsg('');
    if (!email.trim() || !password.trim()) { setError('Please enter your email and password.'); return; }
    if (mode === 'register' && !name.trim()) { setError('Please enter your name.'); return; }
    if (mode === 'wholesale-apply' && !companyName.trim()) { setError('Please enter your company name.'); return; }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (mode === 'register') {
        const res = await register({ email: email.trim(), password, name: name.trim(), phone: phone.trim() || undefined });
        if (!res.success) { setError(res.error ?? 'Registration failed.'); return; }
        router.replace('/(customer)/');
      } else if (mode === 'wholesale-apply') {
        const res = await wholesaleApply({ email: email.trim(), password, name: name.trim(), companyName: companyName.trim(), abn: abn.trim() || undefined });
        if (!res.success) { setError(res.error ?? 'Application failed.'); return; }
        setSuccessMsg('Application submitted! We\'ll review and get back to you within 1 business day.');
        resetFields();
      } else {
        const res = await login(email.trim(), password, selectedRole);
        if (!res.success) { setError(res.error ?? 'Login failed. Check your credentials.'); return; }
        router.replace('/(tabs)/');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const isWholesale = selectedRole === 'wholesale';
  const isRegister = mode === 'register';
  const isWholesaleApply = mode === 'wholesale-apply';

  const btnLabel = isWholesaleApply ? 'Submit Application' : isRegister ? 'Create Account' : `Sign In as ${roleConfig.label}`;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#4B72C4', '#3058A8']} style={[styles.heroSection, { paddingTop: insets.top + 24 }]}>
          <View style={styles.logoBox}>
            <Feather name="coffee" size={30} color="#fff" />
          </View>
          <Text style={[styles.brand, { fontFamily: 'Inter_700Bold' }]}>Butterfield</Text>
          <Text style={[styles.tagline, { fontFamily: 'Inter_400Regular' }]}>Cookies · Coffee · Desserts</Text>
        </LinearGradient>

        <View style={[styles.formContainer, { backgroundColor: colors.background }]}>
          <Text style={[styles.signInLabel, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Sign in as</Text>
          <View style={styles.roleRow}>
            {ROLES.map((r) => {
              const active = selectedRole === r.role;
              return (
                <Pressable
                  key={r.role}
                  onPress={() => handleRoleSelect(r.role)}
                  style={[styles.roleCard, {
                    backgroundColor: active ? colors.card : colors.muted,
                    borderColor: active ? colors.primary : 'transparent',
                    borderWidth: active ? 2 : 0,
                    borderRadius: colors.radius,
                  }]}
                >
                  <View style={[styles.roleIcon, { backgroundColor: active ? colors.secondary : colors.muted }]}>
                    <Feather name={r.icon as any} size={20} color={active ? colors.primary : colors.mutedForeground} />
                  </View>
                  <Text style={[styles.roleLabel, { color: active ? colors.foreground : colors.mutedForeground, fontFamily: active ? 'Inter_700Bold' : 'Inter_400Regular' }]}>
                    {r.label}
                  </Text>
                  <Text style={[styles.roleSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={2}>
                    {r.subtitle}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.fields}>
            {isWholesale && (
              <View style={[styles.wholesaleToggle, { backgroundColor: colors.muted, borderRadius: 12 }]}>
                <Pressable
                  onPress={() => { setMode('login'); resetFields(); Haptics.selectionAsync(); }}
                  style={[styles.wholesaleToggleBtn, { backgroundColor: !isWholesaleApply ? colors.card : 'transparent', borderRadius: 9 }]}
                >
                  <Text style={[{ fontFamily: !isWholesaleApply ? 'Inter_600SemiBold' : 'Inter_400Regular', fontSize: 13, color: !isWholesaleApply ? colors.foreground : colors.mutedForeground }]}>Sign In</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setMode('wholesale-apply'); resetFields(); Haptics.selectionAsync(); }}
                  style={[styles.wholesaleToggleBtn, { backgroundColor: isWholesaleApply ? colors.card : 'transparent', borderRadius: 9 }]}
                >
                  <Text style={[{ fontFamily: isWholesaleApply ? 'Inter_600SemiBold' : 'Inter_400Regular', fontSize: 13, color: isWholesaleApply ? colors.foreground : colors.mutedForeground }]}>Apply for Account</Text>
                </Pressable>
              </View>
            )}
            {(isRegister || isWholesaleApply) && (
              <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
                <Feather name="user" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                  placeholder="Full name"
                  placeholderTextColor={colors.mutedForeground}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}
            {isWholesaleApply && (
              <>
                <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
                  <Feather name="briefcase" size={16} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                    placeholder="Company name"
                    placeholderTextColor={colors.mutedForeground}
                    value={companyName}
                    onChangeText={setCompanyName}
                    autoCapitalize="words"
                  />
                </View>
                <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
                  <Feather name="hash" size={16} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                    placeholder="ABN (optional)"
                    placeholderTextColor={colors.mutedForeground}
                    value={abn}
                    onChangeText={setAbn}
                    keyboardType="numeric"
                  />
                </View>
              </>
            )}

            <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
              <Feather name="mail" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                placeholder="Email address"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
              <Feather name="lock" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular', flex: 1 }]}
                placeholder="Password"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: '#FEF2F2', borderRadius: 10 }]}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={[styles.errorText, { fontFamily: 'Inter_400Regular' }]}>{error}</Text>
              </View>
            ) : null}

            {successMsg ? (
              <View style={[styles.successBox, { backgroundColor: '#F0FDF4', borderRadius: 10 }]}>
                <Feather name="check-circle" size={14} color="#22C55E" />
                <Text style={[styles.successText, { fontFamily: 'Inter_400Regular' }]}>{successMsg}</Text>
              </View>
            ) : null}

            <Pressable onPress={handleSubmit} disabled={loading} style={[styles.submitBtn, { backgroundColor: colors.primary, borderRadius: 14 }]}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, { fontFamily: 'Inter_700Bold' }]}>{btnLabel}</Text>
              )}
            </Pressable>

            {!isWholesale && (
              <Pressable
                onPress={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); Haptics.selectionAsync(); }}
                style={{ alignItems: 'center', paddingVertical: 4 }}
              >
                <Text style={[styles.toggleText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {mode === 'register' ? 'Already have an account? ' : "Don't have an account? "}
                  <Text style={[{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
                    {mode === 'register' ? 'Sign In' : 'Register'}
                  </Text>
                </Text>
              </Pressable>
            )}
            {isWholesale && !isWholesaleApply && (
              <Pressable
                onPress={() => { setMode('wholesale-apply'); resetFields(); Haptics.selectionAsync(); }}
                style={{ alignItems: 'center', paddingVertical: 4 }}
              >
                <Text style={[styles.toggleText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {"Don't have an account? "}
                  <Text style={[{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>Apply for Wholesale</Text>
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  heroSection: { alignItems: 'center', paddingBottom: 32, gap: 6 },
  logoBox: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  brand: { color: '#fff', fontSize: 30, letterSpacing: -0.5 },
  tagline: { color: 'rgba(255,255,255,0.8)', fontSize: 13, letterSpacing: 0.5 },
  formContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 28, gap: 20 },
  signInLabel: { fontSize: 15 },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleCard: { flex: 1, padding: 14, gap: 6, alignItems: 'center' },
  roleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  roleLabel: { fontSize: 14 },
  roleSub: { fontSize: 10, textAlign: 'center', color: '#8E8E93' },
  fields: { gap: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 52, borderWidth: 1 },
  input: { flex: 1, fontSize: 15 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12 },
  errorText: { flex: 1, color: '#EF4444', fontSize: 13 },
  successBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12 },
  successText: { flex: 1, color: '#22C55E', fontSize: 13 },
  submitBtn: { height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitBtnText: { color: '#fff', fontSize: 16 },
  toggleText: { fontSize: 14, textAlign: 'center' },
  wholesaleToggle: { flexDirection: 'row', padding: 4, gap: 4 },
  wholesaleToggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
});
