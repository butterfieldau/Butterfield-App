import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CenteredGlassModal } from '@/components/CenteredGlassModal';
import { BUTTERFIELD_PRIVACY_URL, BUTTERFIELD_TERMS_URL } from '@/constants/legal';
import { openExistingLogin } from '@/lib/guestAccess';

interface LoginRequiredModalProps {
  visible: boolean;
  redirectTo?: string;
  onCancel: () => void;
}

export function LoginRequiredModal({ visible, redirectTo, onCancel }: LoginRequiredModalProps) {
  const handleLogin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCancel();
    openExistingLogin(redirectTo);
  };

  return (
    <CenteredGlassModal
      visible={visible}
      onClose={onCancel}
      cardStyle={styles.card}
      contentStyle={styles.content}
    >
      <View style={styles.iconWrap}>
        <Feather name="lock" size={22} color="#1493FF" />
      </View>
      <Text style={styles.title}>Login Required</Text>
      <Text style={styles.body}>Login or create an account to continue.</Text>

      <Pressable style={styles.primaryBtn} onPress={handleLogin}>
        <Text style={styles.primaryText}>Login or Create Account</Text>
      </Pressable>
      <Pressable style={styles.cancelBtn} onPress={onCancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>

      <View style={styles.legalRow}>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(BUTTERFIELD_PRIVACY_URL)}>
          <Text style={styles.legalText}>Privacy Policy</Text>
        </Pressable>
        <Text style={styles.legalDot}>|</Text>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(BUTTERFIELD_TERMS_URL)}>
          <Text style={styles.legalText}>Terms of Use</Text>
        </Pressable>
      </View>
    </CenteredGlassModal>
  );
}

const styles = StyleSheet.create({
  content:    { paddingHorizontal: 20 },
  card:       { maxWidth: 390, borderRadius: 24, padding: 24, alignItems: 'center' },
  iconWrap:   { width: 54, height: 54, borderRadius: 27, backgroundColor: '#E6F4FF', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title:      { fontSize: 22, lineHeight: 28, fontWeight: '700', color: '#1C1C1E', textAlign: 'center' },
  body:       { marginTop: 8, fontSize: 15, lineHeight: 21, color: '#6B7280', textAlign: 'center' },
  primaryBtn: { alignSelf: 'stretch', height: 52, borderRadius: 15, backgroundColor: '#1493FF', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  primaryText:{ color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn:  { alignSelf: 'stretch', height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelText: { color: '#4B5563', fontSize: 15, fontWeight: '600' },
  legalRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  legalText:  { color: '#1493FF', fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  legalDot:   { color: '#9CA3AF', fontSize: 12 },
});
