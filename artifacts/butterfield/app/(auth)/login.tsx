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
    gradient: ['#C8833A', '#E0A050'] as [string, string],
  },
  {
    role: 'staff' as UserRole,
    label: 'Staff',
    subtitle: 'Internal Butterfield team',
    icon: 'briefcase',
    gradient: ['#4A2410', '#7A4028'] as [string, string],
  },
  {
    role: 'wholesale' as UserRole,
    label: 'Wholesale',
    subtitle: 'Bulk orders & account tools',
    icon: 'package',
    gradient: ['#2A4A2A', '#3A6A3A'] as [string, string],
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
    setMode(role === 'wholesale' ? 'wholesale-apply' : 'login');
    resetFields();
    Haptics.selectionAsync();
  };

  const handleSubmit = async () => {
    setError(''); setSuccessMsg('');
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (mode === 'login' || (mode === 'login' && selectedRole === 'staff')) {
        const result = await login(email, password, selectedRole);
        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (selectedRole === 'customer') router.replace('/(customer)/');
          else if (selectedRole === 'staff') router.replace('/(staff)/');
          else router.replace('/(wholesale)/');
        } else {
          setError(result.error ?? 'Sign in failed.');
        }
      } else if (mode === 'register') {
        const result = await register({ email, password, name, phone: phone || undefined, birthday: birthday || undefined });
        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace('/(customer)/');
        } else {
          setError(result.error ?? 'Registration failed.');
        }
      } else if (mode === 'wholesale-apply') {
        const result = await wholesaleApply({ email, password, name, phone: phone || undefined, companyName, abn: abn || undefined });
        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setSuccessMsg(result.message ?? 'Application submitted!');
        } else {
          setError(result.error ?? 'Application failed.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const showRegister = selectedRole === 'customer' && mode === 'register';
  const showWholesale = selectedRole === 'wholesale';

  return (
    <LinearGradient colors={['#FBF7F2', '#F0EBE3']} style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <LinearGradient colors={['#C8833A', '#8B4513']} style={styles.logoCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Feather name="coffee" size={28} color="#fff" />
            </LinearGradient>
            <Text style={[styles.brandName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Butterfield</Text>
            <Text style={[styles.brandTagline, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Cookies · Coffee · Desserts
            </Text>
          </View>

          <View style={styles.formSection}>
            <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
              {mode === 'register' ? 'Create an account' : mode === 'wholesale-apply' ? 'Wholesale application' : 'Sign in as'}
            </Text>

            {mode === 'login' || mode === 'wholesale-apply' ? (
              <View style={styles.roleGrid}>
                {ROLES.map(({ role, label, subtitle, icon, gradient }) => {
                  const isSelected = selectedRole === role;
                  return (
                    <Pressable
                      key={role}
                      onPress={() => handleRoleSelect(role)}
                      style={[styles.roleCard, {
                        borderRadius: colors.radius, borderColor: isSelected ? colors.primary : colors.border,
                        borderWidth: isSelected ? 2 : 1, backgroundColor: isSelected ? colors.card : colors.background,
                      }]}
                    >
                      <LinearGradient colors={isSelected ? gradient : ['#E8DDD0', '#D8CEC0']} style={[styles.roleIcon, { borderRadius: 12 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        <Feather name={icon as any} size={18} color="#fff" />
                      </LinearGradient>
                      <Text style={[styles.roleLabel, { color: isSelected ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{label}</Text>
                      <Text style={[styles.roleSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={2}>{subtitle}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.fields}>
              {showRegister && (
                <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
                  <Feather name="user" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                  <TextInput style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                    placeholder="Full name" placeholderTextColor={colors.mutedForeground} value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="next" />
                </View>
              )}

              {showWholesale && mode === 'wholesale-apply' && (
                <>
                  <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
                    <Feather name="user" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                    <TextInput style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                      placeholder="Your full name" placeholderTextColor={colors.mutedForeground} value={name} onChangeText={setName} returnKeyType="next" />
                  </View>
                  <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
                    <Feather name="briefcase" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                    <TextInput style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                      placeholder="Company name" placeholderTextColor={colors.mutedForeground} value={companyName} onChangeText={setCompanyName} returnKeyType="next" />
                  </View>
                  <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
                    <Feather name="hash" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                    <TextInput style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                      placeholder="ABN (optional)" placeholderTextColor={colors.mutedForeground} value={abn} onChangeText={setAbn} keyboardType="numeric" returnKeyType="next" />
                  </View>
                </>
              )}

              <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
                <Feather name="mail" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                <TextInput style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                  placeholder="Email address" placeholderTextColor={colors.mutedForeground} value={email} onChangeText={setEmail}
                  autoCapitalize="none" keyboardType="email-address" returnKeyType="next" />
              </View>

              {showRegister && (
                <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
                  <Feather name="phone" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                  <TextInput style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                    placeholder="Phone (optional)" placeholderTextColor={colors.mutedForeground} value={phone} onChangeText={setPhone} keyboardType="phone-pad" returnKeyType="next" />
                </View>
              )}

              {showRegister && (
                <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
                  <Feather name="gift" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                  <TextInput style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                    placeholder="Birthday DD/MM/YYYY (optional)" placeholderTextColor={colors.mutedForeground} value={birthday} onChangeText={setBirthday} returnKeyType="next" />
                </View>
              )}

              <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
                <Feather name="lock" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                <TextInput style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular', flex: 1 }]}
                  placeholder="Password" placeholderTextColor={colors.mutedForeground} value={password} onChangeText={setPassword}
                  secureTextEntry={!showPassword} returnKeyType="done" onSubmitEditing={handleSubmit} />
                <Pressable onPress={() => setShowPassword((p) => !p)} style={styles.eyeBtn}>
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {error ? <Text style={[styles.errorText, { fontFamily: 'Inter_400Regular' }]}>{error}</Text> : null}
              {successMsg ? <Text style={[styles.successText, { fontFamily: 'Inter_400Regular' }]}>{successMsg}</Text> : null}

              <Pressable onPress={handleSubmit} disabled={loading} style={[styles.signInBtn, { borderRadius: colors.radius }]}>
                <LinearGradient colors={roleConfig.gradient} style={[styles.signInGradient, { borderRadius: colors.radius }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {loading ? <ActivityIndicator color="#fff" /> : (
                    <Text style={[styles.signInText, { fontFamily: 'Inter_600SemiBold' }]}>
                      {mode === 'register' ? 'Create Account' : mode === 'wholesale-apply' ? 'Submit Application' : `Sign In as ${roleConfig.label}`}
                    </Text>
                  )}
                </LinearGradient>
              </Pressable>

              {selectedRole === 'customer' && (
                <View style={styles.toggleRow}>
                  {mode === 'login' ? (
                    <>
                      <Text style={[styles.toggleText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Don't have an account?</Text>
                      <Pressable onPress={() => { setMode('register'); resetFields(); Haptics.selectionAsync(); }}>
                        <Text style={[styles.toggleLink, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}> Register</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.toggleText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Already have an account?</Text>
                      <Pressable onPress={() => { setMode('login'); resetFields(); Haptics.selectionAsync(); }}>
                        <Text style={[styles.toggleLink, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}> Sign In</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              )}

              {selectedRole === 'wholesale' && mode === 'wholesale-apply' && (
                <Pressable onPress={() => { setMode('login'); setSelectedRole('wholesale'); resetFields(); }} style={styles.toggleRow}>
                  <Text style={[styles.toggleText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Already have an account?</Text>
                  <Text style={[styles.toggleLink, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}> Sign In</Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, gap: 32 },
  brand: { alignItems: 'center', gap: 8 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  brandName: { fontSize: 30, letterSpacing: -0.5 },
  brandTagline: { fontSize: 14, letterSpacing: 0.5 },
  formSection: { gap: 16 },
  sectionLabel: { fontSize: 16 },
  roleGrid: { flexDirection: 'row', gap: 10 },
  roleCard: { flex: 1, padding: 12, gap: 6, shadowColor: '#4A2410', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  roleIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  roleLabel: { fontSize: 13 },
  roleSub: { fontSize: 10, lineHeight: 14 },
  fields: { gap: 12, marginTop: 4 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 14, height: 52 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15 },
  eyeBtn: { padding: 4 },
  errorText: { color: '#DC2626', fontSize: 13, textAlign: 'center' },
  successText: { color: '#16A34A', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  signInBtn: { overflow: 'hidden', marginTop: 4 },
  signInGradient: { height: 54, alignItems: 'center', justifyContent: 'center' },
  signInText: { color: '#fff', fontSize: 16 },
  toggleRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  toggleText: { fontSize: 13 },
  toggleLink: { fontSize: 13 },
});
