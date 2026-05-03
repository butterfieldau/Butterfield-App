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

const ROLES: { role: UserRole; label: string; subtitle: string; icon: string; gradient: [string, string] }[] = [
  {
    role: 'customer',
    label: 'Customer',
    subtitle: 'Order, earn rewards & explore',
    icon: 'coffee',
    gradient: ['#C8833A', '#E0A050'],
  },
  {
    role: 'staff',
    label: 'Staff',
    subtitle: 'Manage orders & products',
    icon: 'briefcase',
    gradient: ['#4A2410', '#7A4028'],
  },
  {
    role: 'wholesale',
    label: 'Wholesale',
    subtitle: 'Bulk orders & account tools',
    icon: 'package',
    gradient: ['#2A4A2A', '#3A6A3A'],
  },
];

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>('customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await login(selectedRole, email || `${selectedRole}@butterfield.com`, password);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (selectedRole === 'customer') router.replace('/(customer)/');
        else if (selectedRole === 'staff') router.replace('/(staff)/');
        else router.replace('/(wholesale)/');
      } else {
        setError(result.error ?? 'Sign in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const selectedRoleConfig = ROLES.find((r) => r.role === selectedRole)!;

  return (
    <LinearGradient
      colors={['#FBF7F2', '#F0EBE3']}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand */}
          <View style={styles.brand}>
            <LinearGradient
              colors={['#C8833A', '#8B4513']}
              style={styles.logoCircle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Feather name="coffee" size={28} color="#fff" />
            </LinearGradient>
            <Text style={[styles.brandName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              Butterfield
            </Text>
            <Text style={[styles.brandTagline, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Cookies · Coffee · Desserts
            </Text>
          </View>

          <View style={styles.formSection}>
            <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
              Sign in as
            </Text>

            {/* Role Selector */}
            <View style={styles.roleGrid}>
              {ROLES.map(({ role, label, subtitle, icon, gradient }) => {
                const isSelected = selectedRole === role;
                return (
                  <Pressable
                    key={role}
                    onPress={() => {
                      setSelectedRole(role);
                      setError('');
                      Haptics.selectionAsync();
                    }}
                    style={[
                      styles.roleCard,
                      {
                        borderRadius: colors.radius,
                        borderColor: isSelected ? colors.primary : colors.border,
                        borderWidth: isSelected ? 2 : 1,
                        backgroundColor: isSelected ? colors.card : colors.background,
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={isSelected ? gradient : ['#E8DDD0', '#D8CEC0']}
                      style={[styles.roleIcon, { borderRadius: 12 }]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Feather name={icon as any} size={18} color="#fff" />
                    </LinearGradient>
                    <Text
                      style={[
                        styles.roleLabel,
                        {
                          color: isSelected ? colors.foreground : colors.mutedForeground,
                          fontFamily: 'Inter_600SemiBold',
                        },
                      ]}
                    >
                      {label}
                    </Text>
                    <Text
                      style={[styles.roleSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}
                      numberOfLines={2}
                    >
                      {subtitle}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Fields */}
            <View style={styles.fields}>
              <View
                style={[
                  styles.inputWrapper,
                  { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius },
                ]}
              >
                <Feather name="mail" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
                  placeholder={`${selectedRole}@email.com`}
                  placeholderTextColor={colors.mutedForeground}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                />
              </View>

              <View
                style={[
                  styles.inputWrapper,
                  { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius },
                ]}
              >
                <Feather name="lock" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_400Regular', flex: 1 }]}
                  placeholder="Password"
                  placeholderTextColor={colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <Pressable onPress={() => setShowPassword((p) => !p)} style={styles.eyeBtn}>
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {error ? (
                <Text style={[styles.errorText, { fontFamily: 'Inter_400Regular' }]}>{error}</Text>
              ) : null}

              <Pressable
                onPress={handleLogin}
                disabled={loading}
                style={[styles.signInBtn, { borderRadius: colors.radius }]}
              >
                <LinearGradient
                  colors={selectedRoleConfig.gradient}
                  style={[styles.signInGradient, { borderRadius: colors.radius }]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[styles.signInText, { fontFamily: 'Inter_600SemiBold' }]}>
                      Continue as {selectedRoleConfig.label}
                    </Text>
                  )}
                </LinearGradient>
              </Pressable>

              <Text style={[styles.demoHint, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Demo — tap Continue with any email to sign in
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 32,
  },
  brand: {
    alignItems: 'center',
    gap: 8,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  brandName: {
    fontSize: 30,
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 14,
    letterSpacing: 0.5,
  },
  formSection: {
    gap: 16,
  },
  sectionLabel: {
    fontSize: 16,
  },
  roleGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  roleCard: {
    flex: 1,
    padding: 12,
    gap: 6,
    shadowColor: '#4A2410',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  roleIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  roleLabel: {
    fontSize: 13,
  },
  roleSub: {
    fontSize: 10,
    lineHeight: 14,
  },
  fields: {
    gap: 12,
    marginTop: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  eyeBtn: {
    padding: 4,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    textAlign: 'center',
  },
  signInBtn: {
    overflow: 'hidden',
    marginTop: 4,
  },
  signInGradient: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInText: {
    color: '#fff',
    fontSize: 16,
  },
  demoHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});
