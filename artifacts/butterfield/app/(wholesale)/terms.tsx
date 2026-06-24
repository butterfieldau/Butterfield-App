import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, NativeScrollEvent, NativeSyntheticEvent,
  Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { WHOLESALE_TERMS_VERSION, WHOLESALE_TERMS_SECTIONS } from '@/constants/wholesaleTerms';

const BG      = '#F8FAFF';
const BLUE    = '#1493FF';
const NAVY    = '#0F2044';
const TEXT    = '#1C1C1E';
const MUTED   = '#6B7280';
const BORDER  = '#E5E7EB';
const GREEN   = '#16A34A';
const GREEN_BG = '#F0FDF4';
const AMBER   = '#D97706';

interface Props {
  onAccepted: () => void;
}

export default function WholesaleTermsScreen({ onAccepted }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [checked,   setChecked]   = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const nearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
    if (nearBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [hasScrolledToBottom, fadeAnim]);

  const handleAccept = useCallback(async () => {
    if (!checked || submitting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    setError(null);
    try {
      await api.wholesale.acceptTerms({
        devicePlatform: Platform.OS,
        appVersion: Constants.expoConfig?.version ?? undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAccepted();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [checked, submitting, onAccepted]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerBadge}>
          <Feather name="shield" size={13} color={BLUE} />
          <Text style={styles.headerBadgeText}>Wholesale Access</Text>
        </View>
        <Text style={styles.headerTitle}>Terms & Conditions</Text>
        <Text style={styles.headerSub}>
          Please read carefully before accessing wholesale pricing
        </Text>
      </View>

      {/* Scroll hint */}
      {!hasScrolledToBottom && (
        <View style={styles.scrollHint}>
          <Feather name="arrow-down" size={12} color={AMBER} />
          <Text style={styles.scrollHintText}>Scroll to read all terms before accepting</Text>
        </View>
      )}

      {/* Terms body */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator
      >
        {WHOLESALE_TERMS_SECTIONS.map((section, i) => (
          <View key={i} style={i === 0 ? styles.introBlock : styles.section}>
            <Text style={i === 0 ? styles.mainHeading : styles.sectionHeading}>
              {section.heading}
            </Text>
            {section.subheading ? (
              <Text style={styles.sectionSub}>{section.subheading}</Text>
            ) : null}
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.divider} />

        {/* Version */}
        <Text style={styles.versionNote}>
          Terms version: {WHOLESALE_TERMS_VERSION}
        </Text>
      </ScrollView>

      {/* Acceptance footer */}
      <Animated.View style={[styles.footer, { opacity: hasScrolledToBottom ? 1 : 0.35, paddingBottom: insets.bottom + 12 }]}>
        <LinearGradient
          colors={['rgba(248,250,255,0)', 'rgba(248,250,255,1)']}
          style={styles.footerFade}
          pointerEvents="none"
        />

        {/* Checkbox */}
        <Pressable
          onPress={() => {
            if (!hasScrolledToBottom) return;
            Haptics.selectionAsync();
            setChecked(v => !v);
          }}
          style={styles.checkRow}
          hitSlop={8}
        >
          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
            {checked && <Feather name="check" size={13} color="#fff" />}
          </View>
          <Text style={styles.checkLabel}>
            I have read and agree to the Wholesale Terms, Confidentiality Terms and Privacy Notice.
          </Text>
        </Pressable>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {/* Accept button */}
        <Pressable
          onPress={handleAccept}
          disabled={!checked || submitting}
          style={[styles.acceptBtn, (!checked || submitting) && styles.acceptBtnDisabled]}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Feather name="check-circle" size={17} color="#fff" />
                <Text style={styles.acceptBtnText}>Accept & Continue</Text>
              </>
            )
          }
        </Pressable>

        <Text style={styles.footerNote}>
          Wholesale pricing is confidential and only available to approved wholesale accounts.
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1, backgroundColor: BG },

  header:          { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  headerBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10, alignSelf: 'flex-start', backgroundColor: '#EFF6FF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  headerBadgeText: { fontSize: 12, fontWeight: '600', color: BLUE },
  headerTitle:     { fontSize: 26, fontWeight: '700', color: NAVY, letterSpacing: -0.5 },
  headerSub:       { fontSize: 14, color: MUTED, marginTop: 4, lineHeight: 20 },

  scrollHint:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFBEB', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FDE68A' },
  scrollHintText:  { fontSize: 12, color: AMBER, fontWeight: '500', flex: 1 },

  scroll:          { flex: 1 },
  scrollContent:   { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32 },

  introBlock:      { marginBottom: 24, padding: 18, backgroundColor: '#fff', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  mainHeading:     { fontSize: 20, fontWeight: '700', color: NAVY, marginBottom: 4 },
  sectionSub:      { fontSize: 12, color: MUTED, marginBottom: 12, fontStyle: 'italic' },

  section:         { marginBottom: 20 },
  sectionHeading:  { fontSize: 15, fontWeight: '700', color: NAVY, marginBottom: 8, letterSpacing: -0.1 },
  sectionBody:     { fontSize: 14, color: TEXT, lineHeight: 22, letterSpacing: 0.1 },

  divider:         { height: 1, backgroundColor: BORDER, marginVertical: 20 },
  versionNote:     { fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginBottom: 8 },

  footer:          { backgroundColor: BG, paddingHorizontal: 20, paddingTop: 0 },
  footerFade:      { height: 28, position: 'absolute', top: -28, left: 0, right: 0 },

  checkRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 16, paddingBottom: 4 },
  checkbox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#D1D5DB', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  checkboxChecked: { backgroundColor: GREEN, borderColor: GREEN },
  checkLabel:      { flex: 1, fontSize: 14, color: TEXT, lineHeight: 21, fontWeight: '500' },

  errorText:       { fontSize: 13, color: '#EF4444', marginTop: 6 },

  acceptBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BLUE, borderRadius: 14, paddingVertical: 16, marginTop: 14, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 4 },
  acceptBtnDisabled: { backgroundColor: '#9CA3AF', shadowOpacity: 0 },
  acceptBtnText:   { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },

  footerNote:      { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 12, lineHeight: 17 },
});
