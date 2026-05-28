import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BUTTERFIELD_PRIVACY_URL, BUTTERFIELD_TERMS_URL } from '@/constants/legal';
import { openExistingLogin } from '@/lib/guestAccess';

interface LoggedOutAccountPromptProps {
  redirectTo?: string;
  compact?: boolean;
}

export function LoggedOutAccountPrompt({ redirectTo = '/(customer)/profile', compact = false }: LoggedOutAccountPromptProps) {
  const insets = useSafeAreaInsets();

  const openLogin = (mode?: 'login' | 'register') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openExistingLogin(redirectTo, mode);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + (compact ? 28 : 72), paddingBottom: insets.bottom + 28 }]}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Feather name="user" size={26} color="#1493FF" />
        </View>
        <Text style={styles.heading}>Login or create an account</Text>
        <View style={styles.buttonStack}>
          <Pressable style={styles.primaryBtn} onPress={() => openLogin('login')}>
            <Text style={styles.primaryText}>Login</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => openLogin('register')}>
            <Text style={styles.secondaryText}>Create Account</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.legalRow}>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(BUTTERFIELD_PRIVACY_URL)}>
          <Text style={styles.legalLink}>Privacy Policy</Text>
        </Pressable>
        <Text style={styles.legalDot}>|</Text>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(BUTTERFIELD_TERMS_URL)}>
          <Text style={styles.legalLink}>Terms of Use</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#EFF6FF', paddingHorizontal: 20, justifyContent: 'space-between' },
  card:          { backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 8 },
  iconWrap:      { width: 62, height: 62, borderRadius: 31, backgroundColor: '#E6F4FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  heading:       { color: '#1C1C1E', fontSize: 24, lineHeight: 30, fontWeight: '800', textAlign: 'center' },
  buttonStack:   { alignSelf: 'stretch', gap: 10, marginTop: 24 },
  primaryBtn:    { height: 52, borderRadius: 15, backgroundColor: '#1493FF', alignItems: 'center', justifyContent: 'center' },
  primaryText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn:  { height: 52, borderRadius: 15, backgroundColor: '#F0FAFF', borderWidth: 1, borderColor: '#B9E2FF', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#1493FF', fontSize: 16, fontWeight: '700' },
  legalRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  legalLink:     { color: '#1493FF', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  legalDot:      { color: '#9CA3AF', fontSize: 13 },
});
