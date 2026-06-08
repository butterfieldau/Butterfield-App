import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { LinklyConfig, ShopDisplayStore } from '@/lib/api';
import { sendOpenDrawer } from '@/lib/printer';
import { getShopDisplaySoundEnabled, setShopDisplaySoundEnabled } from '@/lib/shopDisplayMode';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const GREEN  = '#16A34A';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const INDIGO = '#4F46E5';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open:               { bg: '#DCFCE7', text: '#166534' },
  temporarily_closed: { bg: '#FEF3C7', text: '#92400E' },
  coming_soon:        { bg: '#DBEAFE', text: '#1D4ED8' },
  closed:             { bg: '#FEE2E2', text: '#B91C1C' },
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  temporarily_closed: 'Temporarily Closed',
  coming_soon: 'Coming Soon',
  closed: 'Closed',
};

// ── PIN gate numpad ───────────────────────────────────────────────────────────
function PinModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) { setDigits([]); setError(''); setChecking(false); }
  }, [visible]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const appendDigit = (d: string) => {
    if (digits.length >= 4 || checking) return;
    const next = [...digits, d];
    setDigits(next);
    setError('');
    Haptics.selectionAsync();
    if (next.length === 4) verify(next.join(''));
  };

  const backspace = () => {
    if (checking) return;
    setDigits(prev => prev.slice(0, -1));
    setError('');
    Haptics.selectionAsync();
  };

  const verify = async (pin: string) => {
    setChecking(true);
    try {
      const res = await api.shopDisplay.verifySettingsPin(pin);
      if (res.granted) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        shake();
        setError('Incorrect PIN. Use your director-assigned Settings PIN.');
        setDigits([]);
      }
    } catch {
      setError('Connection error. Try again.');
      setDigits([]);
    } finally {
      setChecking(false);
    }
  };

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'] as const;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}
      supportedOrientations={['portrait','landscape','landscape-left','landscape-right']}>
      <Pressable style={p.backdrop} onPress={onClose}>
        <Pressable style={p.sheet} onPress={e => e.stopPropagation()}>
          <View style={p.header}>
            <View style={p.lockCircle}>
              <Feather name="lock" size={22} color={INDIGO} />
            </View>
            <Text style={p.title}>EFTPOS Settings</Text>
            <Text style={p.sub}>Enter your POS PIN to access Linkly configuration</Text>
          </View>

          <Animated.View style={[p.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0,1,2,3].map(i => (
              <View key={i} style={[p.dot, digits[i] !== undefined && p.dotFilled]} />
            ))}
          </Animated.View>

          {!!error && <Text style={p.errorText}>{error}</Text>}
          {checking && <ActivityIndicator color={INDIGO} style={{ marginBottom: 8 }} />}

          <View style={p.numpad}>
            {KEYS.map((key, i) => {
              if (key === '') return <View key={`k-${i}`} style={p.keyPlaceholder} />;
              const isBack = key === '⌫';
              return (
                <Pressable
                  key={`k-${i}`}
                  onPress={() => isBack ? backspace() : appendDigit(key)}
                  style={({ pressed }) => [p.key, pressed && p.keyPressed]}
                >
                  <Text style={[p.keyText, isBack && p.backText]}>{key}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={onClose} style={p.cancelBtn}>
            <Text style={p.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Linkly config section (shown after PIN unlock) ────────────────────────────
function LinklySection({ onLock }: { onLock: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ data: LinklyConfig }>({
    queryKey: ['linkly-config'],
    queryFn: () => api.shopDisplay.getLinklyConfig(),
    staleTime: 30_000,
  });

  const cfg = data?.data;
  const [enabled, setEnabled] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (cfg) {
      setEnabled(cfg.linklyEnabled ?? false);
      setUsername(cfg.linklyUsername ?? '');
      setPairingCode(cfg.linklyPairingCode ?? '');
      setTerminalId(cfg.linklyTerminalId ?? '');
    }
  }, [cfg]);

  const save = async () => {
    setSaving(true);
    try {
      await api.shopDisplay.saveLinklyConfig({
        linklyEnabled: enabled,
        linklyUsername: username.trim() || undefined,
        linklyPassword: password.trim() || undefined,
        linklyPairingCode: pairingCode.trim() || undefined,
      });
      setPassword('');
      await qc.invalidateQueries({ queryKey: ['linkly-config'] });
      Alert.alert('Saved', 'Linkly configuration saved successfully.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await api.shopDisplay.testLinkly();
      if (res.terminalId) setTerminalId(res.terminalId);
      Alert.alert('Connected', `Terminal ${res.terminalId ?? 'paired'} — Linkly connection successful.`);
      await qc.invalidateQueries({ queryKey: ['linkly-config'] });
    } catch (e: any) {
      Alert.alert('Connection Failed', e?.message ?? 'Could not connect to Linkly Cloud.');
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[l.card, { alignItems: 'center', paddingVertical: 24 }]}>
        <ActivityIndicator color={INDIGO} />
      </View>
    );
  }

  return (
    <View style={l.card}>
      {/* Header row */}
      <View style={l.sectionRow}>
        <View style={l.iconWrap}>
          <Feather name="credit-card" size={18} color={INDIGO} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={l.cardTitle}>Linkly EFTPOS</Text>
          <Text style={l.cardSub}>Linkly Cloud terminal integration</Text>
        </View>
        <Pressable onPress={onLock} style={l.lockBtn} hitSlop={10}>
          <Feather name="lock" size={15} color={MUTED} />
        </Pressable>
      </View>

      <View style={l.divider} />

      {/* Enable toggle */}
      <View style={l.row}>
        <Text style={l.fieldLabel}>Enable EFTPOS on this display</Text>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ true: INDIGO }}
          thumbColor="#fff"
        />
      </View>

      {/* Credentials */}
      <Text style={l.groupLabel}>Linkly Cloud Credentials</Text>

      <Text style={l.inputLabel}>Username</Text>
      <TextInput
        style={l.input}
        value={username}
        onChangeText={setUsername}
        placeholder="Linkly Cloud username"
        placeholderTextColor={MUTED}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={l.inputLabel}>Password {cfg?.hasPassword && !password ? '(saved — enter to change)' : ''}</Text>
      <View style={l.passwordRow}>
        <TextInput
          style={[l.input, { flex: 1 }]}
          value={password}
          onChangeText={setPassword}
          placeholder={cfg?.hasPassword ? '••••••••' : 'Linkly Cloud password'}
          placeholderTextColor={MUTED}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable onPress={() => setShowPassword(v => !v)} style={l.eyeBtn} hitSlop={8}>
          <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={MUTED} />
        </Pressable>
      </View>

      <Text style={l.inputLabel}>Pairing Code</Text>
      <TextInput
        style={l.input}
        value={pairingCode}
        onChangeText={setPairingCode}
        placeholder="6-digit pairing code"
        placeholderTextColor={MUTED}
        keyboardType="number-pad"
        maxLength={6}
      />

      {!!terminalId && (
        <>
          <Text style={l.inputLabel}>Terminal ID</Text>
          <View style={l.terminalIdRow}>
            <Feather name="check-circle" size={14} color={GREEN} />
            <Text style={l.terminalIdText}>{terminalId}</Text>
          </View>
        </>
      )}

      {/* Actions */}
      <View style={l.actionRow}>
        <Pressable
          onPress={testConnection}
          disabled={testing || saving}
          style={[l.btn, l.btnSecondary, (testing || saving) && l.btnDisabled]}
        >
          {testing ? <ActivityIndicator color={INDIGO} size="small" /> : <Feather name="wifi" size={14} color={INDIGO} />}
          <Text style={l.btnSecondaryText}>{testing ? 'Testing…' : 'Test Connection'}</Text>
        </Pressable>

        <Pressable
          onPress={save}
          disabled={saving || testing}
          style={[l.btn, l.btnPrimary, (saving || testing) && l.btnDisabled]}
        >
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="save" size={14} color="#fff" />}
          <Text style={l.btnPrimaryText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Main settings screen ──────────────────────────────────────────────────────
export default function ShopDisplaySettingsScreen() {
  const { user, logout } = useAuth();
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [eftposUnlocked, setEftposUnlocked] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);

  useEffect(() => {
    getShopDisplaySoundEnabled().then(setSoundEnabledState).catch(() => {});
  }, []);

  const { data: storeData, isLoading: storeLoading } = useQuery({
    queryKey: ['shop-display-store'],
    queryFn: () => api.shopDisplay.store(),
    staleTime: 60000,
  });

  const stores: ShopDisplayStore[] = storeData?.data ?? [];

  const toggleSound = async (value: boolean) => {
    setSoundEnabledState(value);
    await setShopDisplaySoundEnabled(value);
  };

  const handlePinSuccess = () => {
    setPinModalVisible(false);
    setEftposUnlocked(true);
  };

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>

        {/* ── Assigned stores ── */}
        <View style={styles.sectionHeader}>
          <Feather name="map-pin" size={15} color={NAVY} />
          <Text style={styles.sectionTitle}>Assigned Stores</Text>
        </View>

        {storeLoading ? (
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
            <ActivityIndicator color={BLUE} />
          </View>
        ) : stores.length === 0 ? (
          <View style={[styles.card, { gap: 6 }]}>
            <Text style={styles.title}>No store assigned</Text>
            <Text style={styles.sub}>Contact your director to assign this display to a store.</Text>
          </View>
        ) : (
          stores.map((store) => {
            const stColors = STATUS_COLORS[store.status ?? 'open'] ?? STATUS_COLORS.open;
            return (
              <View key={store.id} style={[styles.card, { gap: 12 }]}>
                <View style={styles.storeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storeName}>{store.name}</Text>
                    {store.address || store.suburb ? (
                      <Text style={styles.storeAddress}>{[store.address, store.suburb].filter(Boolean).join(', ')}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: stColors.bg }]}>
                    <Text style={[styles.statusText, { color: stColors.text }]}>
                      {STATUS_LABELS[store.status ?? 'open'] ?? store.status}
                    </Text>
                  </View>
                </View>

                {store.dailySpecial ? (
                  <View style={styles.specialBanner}>
                    <Feather name="sun" size={13} color={AMBER} />
                    <Text style={styles.specialText}>{store.dailySpecial}</Text>
                  </View>
                ) : null}

                {(store.printerIp || store.printerBrand) && (
                  <View style={{ gap: 10 }}>
                    <View style={styles.printerRow}>
                      <Feather name="printer" size={14} color={MUTED} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.printerLabel}>Receipt Printer</Text>
                        <Text style={styles.printerValue}>
                          {store.printerBrand
                            ? store.printerBrand.charAt(0).toUpperCase() + store.printerBrand.slice(1)
                            : 'Printer'}
                          {store.printerIp ? ` · ${store.printerIp}:${store.printerPort ?? 9100}` : ' · Not configured'}
                        </Text>
                      </View>
                      <View style={[styles.autoPrintBadge, { backgroundColor: store.autoPrint ? '#DCFCE7' : '#F3F4F6' }]}>
                        <Text style={[styles.autoPrintText, { color: store.autoPrint ? GREEN : MUTED }]}>
                          {store.autoPrint ? 'Auto-print ON' : 'Auto-print OFF'}
                        </Text>
                      </View>
                    </View>
                    {store.printerIp ? (
                      <Pressable
                        style={({ pressed }) => [styles.openDrawerBtn, (pressed || drawerBusy) && { opacity: 0.7 }]}
                        disabled={drawerBusy}
                        onPress={async () => {
                          if (!store.printerIp) return;
                          setDrawerBusy(true);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          try {
                            await sendOpenDrawer(store.printerIp, store.printerPort ?? 9100, api.shopDisplay.printerBytes);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          } catch (e: any) {
                            Alert.alert('Drawer Error', e?.message ?? 'Could not open the cash drawer. Make sure the printer is reachable.');
                          } finally {
                            setDrawerBusy(false);
                          }
                        }}
                      >
                        <Feather name="unlock" size={14} color="#fff" />
                        <Text style={styles.openDrawerBtnText}>{drawerBusy ? 'Opening…' : 'Open Drawer'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* ── Payment terminal ── */}
        <View style={styles.sectionHeader}>
          <Feather name="credit-card" size={15} color={NAVY} />
          <Text style={styles.sectionTitle}>Payment Terminal</Text>
        </View>

        {eftposUnlocked ? (
          <LinklySection onLock={() => setEftposUnlocked(false)} />
        ) : (
          <Pressable
            style={[styles.card, styles.lockCard]}
            onPress={() => setPinModalVisible(true)}
          >
            <View style={styles.lockCardIcon}>
              <Feather name="lock" size={20} color={INDIGO} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: INDIGO }]}>Linkly EFTPOS</Text>
              <Text style={styles.sub}>Tap to unlock with your employee PIN</Text>
            </View>
            <Feather name="chevron-right" size={18} color={MUTED} />
          </Pressable>
        )}

        {/* ── Session info ── */}
        <View style={styles.sectionHeader}>
          <Feather name="user" size={15} color={NAVY} />
          <Text style={styles.sectionTitle}>Session</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>Logged in as</Text>
          <Text style={styles.value}>{user?.name ?? 'Shop Display'}</Text>
          <Text style={styles.sub}>{user?.email}</Text>
        </View>

        {/* ── Preferences ── */}
        <View style={styles.sectionHeader}>
          <Feather name="sliders" size={15} color={NAVY} />
          <Text style={styles.sectionTitle}>Preferences</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Order alerts</Text>
              <Text style={styles.sub}>Play a sound when a new app order arrives.</Text>
            </View>
            <Switch value={soundEnabled} onValueChange={(v) => void toggleSound(v)} trackColor={{ true: BLUE }} />
          </View>
        </View>

        {/* ── App info ── */}
        <View style={styles.sectionHeader}>
          <Feather name="info" size={15} color={NAVY} />
          <Text style={styles.sectionTitle}>About</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>App version</Text>
          <Text style={styles.value}>{Constants.expoConfig?.version ?? 'Unavailable'}</Text>
        </View>

        <Pressable
          onPress={() => logout()}
          style={[styles.card, styles.logoutBtn]}
        >
          <Feather name="log-out" size={16} color={RED} />
          <Text style={styles.logoutText}>Sign out of this display</Text>
        </Pressable>
      </ScrollView>

      <PinModal
        visible={pinModalVisible}
        onClose={() => setPinModalVisible(false)}
        onSuccess={handlePinSuccess}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4, marginBottom: -6 },
  sectionTitle:     { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: MUTED },
  card:             { backgroundColor: CARD, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: BORDER, gap: 4 },
  title:            { color: MUTED, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  value:            { color: TEXT, fontSize: 18, fontWeight: '800' },
  sub:              { color: MUTED, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  row:              { flexDirection: 'row', alignItems: 'center', gap: 12 },
  storeRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  storeName:        { fontSize: 17, fontWeight: '800', color: TEXT },
  storeAddress:     { fontSize: 13, color: MUTED, fontWeight: '500', marginTop: 2 },
  statusBadge:      { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  statusText:       { fontSize: 12, fontWeight: '700' },
  specialBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 10 },
  specialText:      { flex: 1, fontSize: 14, color: '#92400E', fontWeight: '600' },
  printerRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER },
  printerLabel:     { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  printerValue:     { fontSize: 14, fontWeight: '600', color: TEXT, marginTop: 2 },
  autoPrintBadge:   { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 },
  autoPrintText:    { fontSize: 11, fontWeight: '700' },
  openDrawerBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#1A2B4A', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16 },
  openDrawerBtnText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
  logoutBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 },
  logoutText:       { color: RED, fontSize: 15, fontWeight: '700' },
  lockCard:         { flexDirection: 'row', alignItems: 'center', gap: 14 },
  lockCardIcon:     { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
});

// ── PIN modal styles ──────────────────────────────────────────────────────────
const p = StyleSheet.create({
  backdrop:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  sheet:         { backgroundColor: '#fff', borderRadius: 28, padding: 28, width: 320, alignItems: 'center', gap: 16 },
  header:        { alignItems: 'center', gap: 8 },
  lockCircle:    { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  title:         { fontSize: 18, fontWeight: '800', color: NAVY, textAlign: 'center' },
  sub:           { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 18 },
  dotsRow:       { flexDirection: 'row', gap: 14 },
  dot:           { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: INDIGO, backgroundColor: 'transparent' },
  dotFilled:     { backgroundColor: INDIGO },
  errorText:     { fontSize: 13, color: RED, textAlign: 'center', fontWeight: '600' },
  numpad:        { flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 12, justifyContent: 'center' },
  key:           { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F0F2F8', alignItems: 'center', justifyContent: 'center' },
  keyPressed:    { backgroundColor: '#E0E4F0' },
  keyPlaceholder:{ width: 64, height: 64 },
  keyText:       { fontSize: 22, fontWeight: '700', color: NAVY },
  backText:      { fontSize: 18 },
  cancelBtn:     { paddingVertical: 8, paddingHorizontal: 20 },
  cancelText:    { color: MUTED, fontSize: 15, fontWeight: '600' },
});

// ── Linkly section styles ─────────────────────────────────────────────────────
const l = StyleSheet.create({
  card:          { backgroundColor: CARD, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: BORDER, gap: 10 },
  sectionRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap:      { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  cardTitle:     { fontSize: 15, fontWeight: '800', color: NAVY },
  cardSub:       { fontSize: 12, color: MUTED, marginTop: 1 },
  lockBtn:       { padding: 4 },
  divider:       { height: 1, backgroundColor: BORDER, marginHorizontal: -16 },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fieldLabel:    { flex: 1, fontSize: 14, fontWeight: '600', color: TEXT },
  groupLabel:    { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  inputLabel:    { fontSize: 12, fontWeight: '600', color: MUTED, marginBottom: -6 },
  input:         { backgroundColor: '#F8FAFF', borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT },
  passwordRow:   { flexDirection: 'row', alignItems: 'center', gap: 0 },
  eyeBtn:        { position: 'absolute', right: 12, top: 12 },
  terminalIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#DCFCE7', borderRadius: 12, padding: 10 },
  terminalIdText:{ fontSize: 14, fontWeight: '700', color: '#166534' },
  actionRow:     { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, paddingVertical: 12 },
  btnPrimary:    { backgroundColor: INDIGO },
  btnSecondary:  { backgroundColor: '#EEF2FF' },
  btnDisabled:   { opacity: 0.5 },
  btnPrimaryText:{ color: '#fff', fontSize: 14, fontWeight: '700' },
  btnSecondaryText:{ color: INDIGO, fontSize: 14, fontWeight: '700' },
});
