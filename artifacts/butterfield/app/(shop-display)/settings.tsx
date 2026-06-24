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
import type { ShopDisplayPrinterConfig, ShopDisplayStore } from '@/lib/api';
import { sendOpenDrawer, sendTestPrint } from '@/lib/printer';
import LinklyCloudSettingsCard from '@/components/LinklyCloudSettingsCard';
import {
  getShopDisplaySoundEnabled, setShopDisplaySoundEnabled,
  getDisplayLockPin, setDisplayLockPin, clearDisplayLockPin,
  getScreensaverEnabled, setScreensaverEnabled,
  getScreensaverTimeout, setScreensaverTimeout,
} from '@/lib/shopDisplayMode';

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
  return <LinklyCloudSettingsCard title="Linkly EFTPOS" subtitle="Linkly Cloud terminal integration" onLock={onLock} printerContext="shop_display" />;
}

// ── Printer Configuration Card ────────────────────────────────────────────────
function PrinterConfigCard() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useQuery<{ data: ShopDisplayPrinterConfig }>({
    queryKey: ['shop-display-printer-config'],
    queryFn: () => api.shopDisplay.getPrinterConfig(),
    staleTime: 30_000,
  });

  const cfg = data?.data;
  const [printerIp, setPrinterIp] = useState('');
  const [printerPort, setPrinterPort] = useState('9100');
  const [printerBrand, setPrinterBrand] = useState<'epson' | 'star'>('epson');
  const [autoPrint, setAutoPrint] = useState(false);
  const [autoDrawer, setAutoDrawer] = useState(false);
  const [drawerPin, setDrawerPin] = useState<0|1>(0);
  const [saving, setSaving] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (cfg) {
      setPrinterIp(cfg.printerIp ?? '');
      setPrinterPort(String(cfg.printerPort ?? 9100));
      setPrinterBrand(cfg.printerBrand === 'star' ? 'star' : 'epson');
      setAutoPrint(cfg.autoPrint ?? false);
      setAutoDrawer(cfg.autoDrawer ?? false);
      setDrawerPin(((cfg.drawerPin ?? 0) === 1 ? 1 : 0) as 0|1);
    }
  }, [cfg]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.shopDisplay.savePrinterConfig({
        printerIp: printerIp.trim() || null,
        printerPort: parseInt(printerPort, 10) || 9100,
        printerBrand,
        autoPrint,
        autoDrawer,
        drawerPin,
      });
      await qc.invalidateQueries({ queryKey: ['shop-display-printer-config'] });
      setMsg({ text: '✓ Printer settings saved for this store.', ok: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setMsg({ text: e?.message ?? 'Failed to save.', ok: false });
    } finally {
      setSaving(false);
    }
  };

  const testPrint = async () => {
    const ip = printerIp.trim();
    if (!ip) { Alert.alert('No IP', 'Enter a printer IP address first.'); return; }
    setTestPrinting(true);
    try {
      await sendTestPrint(ip, parseInt(printerPort, 10) || 9100, printerBrand, api.shopDisplay.printerBytes);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Print failed', e?.message ?? 'Could not reach printer.');
    } finally {
      setTestPrinting(false);
    }
  };

  const openDrawer = async () => {
    const ip = printerIp.trim();
    if (!ip) { Alert.alert('No IP', 'Enter a printer IP address first.'); return; }
    setDrawerBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await sendOpenDrawer(ip, parseInt(printerPort, 10) || 9100, api.shopDisplay.printerBytes, drawerPin, printerBrand);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Drawer Error', e?.message ?? 'Could not open the cash drawer.');
    } finally {
      setDrawerBusy(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[pc.card, { alignItems: 'center', paddingVertical: 24 }]}>
        <ActivityIndicator color={BLUE} />
      </View>
    );
  }

  return (
    <View style={pc.card}>
      <Pressable style={pc.headerRow} onPress={() => setExpanded(e => !e)}>
        <View style={pc.iconWrap}>
          <Feather name="printer" size={18} color={BLUE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={pc.cardTitle}>Printer Configuration</Text>
          <Text style={pc.cardSub}>Shared settings for this store's printer</Text>
        </View>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={MUTED} />
      </Pressable>

      {expanded && <>
      <View style={pc.divider} />

      <Text style={pc.inputLabel}>Printer IP Address</Text>
      <TextInput
        style={pc.input}
        value={printerIp}
        onChangeText={setPrinterIp}
        placeholder="192.168.0.100"
        placeholderTextColor={MUTED}
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={pc.inputLabel}>Port</Text>
      <TextInput
        style={pc.input}
        value={printerPort}
        onChangeText={setPrinterPort}
        placeholder="9100"
        placeholderTextColor={MUTED}
        keyboardType="number-pad"
        maxLength={5}
      />

      <Text style={pc.groupLabel}>Printer Brand</Text>
      <View style={pc.brandRow}>
        {(['epson', 'star'] as const).map(b => (
          <Pressable
            key={b}
            onPress={() => { setPrinterBrand(b); Haptics.selectionAsync(); }}
            style={[pc.brandBtn, printerBrand === b && pc.brandBtnActive]}
          >
            <Text style={[pc.brandBtnText, printerBrand === b && pc.brandBtnTextActive]}>
              {b.charAt(0).toUpperCase() + b.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={pc.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={pc.toggleLabel}>Auto-print on new order</Text>
          <Text style={pc.toggleSub}>Automatically print receipt when an order is accepted</Text>
        </View>
        <Switch value={autoPrint} onValueChange={setAutoPrint} trackColor={{ true: BLUE }} thumbColor="#fff" />
      </View>

      <View style={pc.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={pc.toggleLabel}>Auto-open drawer after print</Text>
          <Text style={pc.toggleSub}>Open cash drawer immediately after each receipt print</Text>
        </View>
        <Switch value={autoDrawer} onValueChange={setAutoDrawer} trackColor={{ true: GREEN }} thumbColor="#fff" />
      </View>

      {autoDrawer && (
        <View style={{ paddingTop: 4, paddingBottom: 10 }}>
          <Text style={[pc.groupLabel, { marginBottom: 8 }]}>Drawer Pin</Text>
          <View style={pc.brandRow}>
            {([0, 1] as const).map(pin => (
              <Pressable
                key={pin}
                onPress={() => { setDrawerPin(pin); Haptics.selectionAsync(); }}
                style={[pc.brandBtn, drawerPin === pin && pc.brandBtnActive]}
              >
                <Text style={[pc.brandBtnText, drawerPin === pin && pc.brandBtnTextActive]}>
                  {pin === 0 ? 'Pin 0 (Drawer 1)' : 'Pin 1 (Drawer 2)'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
            Most printers use Pin 0. Use Pin 1 only if your drawer is on the second port.
          </Text>
        </View>
      )}

      {msg ? (
        <Text style={{ fontSize: 13, fontWeight: '600', color: msg.ok ? GREEN : RED }}>{msg.text}</Text>
      ) : null}

      <Pressable
        onPress={save}
        disabled={saving}
        style={[pc.saveBtn, saving && { opacity: 0.6 }]}
      >
        {saving
          ? <ActivityIndicator color="#fff" size="small" />
          : <Feather name="save" size={14} color="#fff" />
        }
        <Text style={pc.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
      </Pressable>

      <View style={pc.actionRow}>
        <Pressable
          onPress={testPrint}
          disabled={testPrinting || drawerBusy}
          style={[pc.actionBtn, (testPrinting || drawerBusy) && { opacity: 0.6 }]}
        >
          {testPrinting ? <ActivityIndicator size="small" color={BLUE} /> : <Feather name="file-text" size={14} color={BLUE} />}
          <Text style={pc.actionBtnText}>{testPrinting ? 'Printing…' : 'Test Print'}</Text>
        </Pressable>

        <Pressable
          onPress={openDrawer}
          disabled={testPrinting || drawerBusy}
          style={[pc.actionBtn, (testPrinting || drawerBusy) && { opacity: 0.6 }]}
        >
          {drawerBusy ? <ActivityIndicator size="small" color={BLUE} /> : <Feather name="unlock" size={14} color={BLUE} />}
          <Text style={pc.actionBtnText}>{drawerBusy ? 'Opening…' : 'Open Drawer'}</Text>
        </Pressable>
      </View>
      </>}
    </View>
  );
}

// ── Main settings screen ──────────────────────────────────────────────────────
export default function ShopDisplaySettingsScreen() {
  const { user, logout } = useAuth();
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [eftposUnlocked, setEftposUnlocked] = useState(false);
  const [lockPinSet, setLockPinSet] = useState(false);
  const [lockPinInput, setLockPinInput] = useState('');
  const [lockPinSaving, setLockPinSaving] = useState(false);
  const [lockPinMsg, setLockPinMsg] = useState<string | null>(null);
  const [screensaverOn, setScreensaverOn] = useState(true);
  const [screensaverMins, setScreensaverMins] = useState(2);

  useEffect(() => {
    getShopDisplaySoundEnabled().then(setSoundEnabledState).catch(() => {});
    getDisplayLockPin().then(p => setLockPinSet(!!p)).catch(() => {});
    getScreensaverEnabled().then(setScreensaverOn).catch(() => {});
    getScreensaverTimeout().then(setScreensaverMins).catch(() => {});
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
              </View>
            );
          })
        )}

        {/* ── Receipt Printer ── */}
        <View style={styles.sectionHeader}>
          <Feather name="printer" size={15} color={NAVY} />
          <Text style={styles.sectionTitle}>Receipt Printer</Text>
        </View>

        <PrinterConfigCard />

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

        {/* ── Display Lock PIN ── */}
        <View style={styles.sectionHeader}>
          <Feather name="shield" size={15} color={NAVY} />
          <Text style={styles.sectionTitle}>Display Lock</Text>
        </View>
        <View style={[styles.card, { gap: 14 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Display PIN</Text>
              <Text style={styles.sub}>
                {lockPinSet
                  ? 'A PIN is set. The display locks automatically on launch.'
                  : 'Set a 4-digit PIN to lock this display on launch. Staff need the PIN to access it.'}
              </Text>
            </View>
            {lockPinSet && (
              <View style={{ backgroundColor: '#DCFCE7', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: GREEN }}>Active</Text>
              </View>
            )}
          </View>
          <TextInput
            style={styles.pinInput}
            placeholder={lockPinSet ? 'Enter new 4-digit PIN to change' : 'Enter 4-digit PIN'}
            placeholderTextColor={MUTED}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            value={lockPinInput}
            onChangeText={t => { setLockPinInput(t.replace(/\D/g, '')); setLockPinMsg(null); }}
          />
          {lockPinMsg ? (
            <Text style={{ fontSize: 13, color: lockPinMsg.startsWith('✓') ? GREEN : RED, fontWeight: '600' }}>{lockPinMsg}</Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.openDrawerBtn, (pressed || lockPinSaving || lockPinInput.length !== 4) && { opacity: 0.6 }]}
            disabled={lockPinSaving || lockPinInput.length !== 4}
            onPress={async () => {
              setLockPinSaving(true);
              try {
                await setDisplayLockPin(lockPinInput);
                setLockPinSet(true);
                setLockPinInput('');
                setLockPinMsg('✓ PIN saved. Display will lock on next launch.');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch {
                setLockPinMsg('Failed to save PIN. Please try again.');
              } finally {
                setLockPinSaving(false);
              }
            }}
          >
            <Feather name="check" size={14} color="#fff" />
            <Text style={styles.openDrawerBtnText}>{lockPinSet ? 'Update PIN' : 'Set PIN'}</Text>
          </Pressable>
          {lockPinSet && (
            <Pressable
              style={({ pressed }) => [styles.openDrawerBtn, { backgroundColor: '#FEE2E2' }, (pressed || lockPinSaving) && { opacity: 0.6 }]}
              disabled={lockPinSaving}
              onPress={() => {
                Alert.alert('Clear Display PIN', 'The display will no longer lock on launch. Continue?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear PIN', style: 'destructive', onPress: async () => {
                      await clearDisplayLockPin();
                      setLockPinSet(false);
                      setLockPinInput('');
                      setLockPinMsg(null);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    },
                  },
                ]);
              }}
            >
              <Feather name="trash-2" size={14} color={RED} />
              <Text style={[styles.openDrawerBtnText, { color: RED }]}>Clear PIN</Text>
            </Pressable>
          )}
        </View>

        {/* ── Screensaver ── */}
        <View style={styles.sectionHeader}>
          <Feather name="moon" size={15} color={NAVY} />
          <Text style={styles.sectionTitle}>Screensaver</Text>
        </View>
        <View style={[styles.card, { gap: 14 }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Enable Screensaver</Text>
              <Text style={styles.sub}>Show an idle screen after a period of inactivity.</Text>
            </View>
            <Switch
              value={screensaverOn}
              onValueChange={async (v) => {
                setScreensaverOn(v);
                await setScreensaverEnabled(v);
                Haptics.selectionAsync();
              }}
              trackColor={{ true: BLUE }}
            />
          </View>
          <View style={{ height: 1, backgroundColor: BORDER, marginHorizontal: -16 }} />
          <View style={{ opacity: screensaverOn ? 1 : 0.4 }}>
            <Text style={[styles.title, { marginBottom: 8 }]}>Timeout</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {([1, 2, 5, 10, 15, 30] as const).map((mins) => {
                const active = screensaverMins === mins;
                return (
                  <Pressable
                    key={mins}
                    disabled={!screensaverOn}
                    onPress={async () => {
                      setScreensaverMins(mins);
                      await setScreensaverTimeout(mins);
                      Haptics.selectionAsync();
                    }}
                    style={({ pressed }) => [
                      styles.screensaverPresetBtn,
                      active && styles.screensaverPresetBtnActive,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.screensaverPresetText, active && styles.screensaverPresetTextActive]}>
                      {mins === 1 ? '1 min' : `${mins} min`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

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
              <Text style={styles.title}>App Sales order alerts</Text>
              <Text style={styles.sub}>Play the App Sales alert sound when a new app order arrives on this display.</Text>
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
  pinInput:         { borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '700', color: TEXT, backgroundColor: '#F9FAFB', letterSpacing: 0, textAlign: 'center' },
  logoutBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 },
  logoutText:       { color: RED, fontSize: 15, fontWeight: '700' },
  lockCard:         { flexDirection: 'row', alignItems: 'center', gap: 14 },
  lockCardIcon:     { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  screensaverPresetBtn:      { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: BORDER },
  screensaverPresetBtnActive:{ backgroundColor: BLUE, borderColor: BLUE },
  screensaverPresetText:     { fontSize: 14, fontWeight: '600', color: MUTED },
  screensaverPresetTextActive:{ color: '#fff', fontWeight: '700' },
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

// ── Printer config card styles ────────────────────────────────────────────────
const pc = StyleSheet.create({
  card:          { backgroundColor: CARD, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: BORDER, gap: 10 },
  headerRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap:      { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  cardTitle:     { fontSize: 15, fontWeight: '800', color: NAVY },
  cardSub:       { fontSize: 12, color: MUTED, marginTop: 1 },
  divider:       { height: 1, backgroundColor: BORDER, marginHorizontal: -16 },
  inputLabel:    { fontSize: 12, fontWeight: '600', color: MUTED, marginBottom: -6 },
  groupLabel:    { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  input:         { backgroundColor: '#F8FAFF', borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT },
  brandRow:      { flexDirection: 'row', gap: 10 },
  brandBtn:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: BORDER },
  brandBtnActive:{ backgroundColor: BLUE, borderColor: BLUE },
  brandBtnText:  { fontSize: 14, fontWeight: '700', color: MUTED },
  brandBtnTextActive: { color: '#fff' },
  toggleRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel:   { fontSize: 14, fontWeight: '600', color: TEXT },
  toggleSub:     { fontSize: 12, color: MUTED, marginTop: 2 },
  saveBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: NAVY, borderRadius: 12, paddingVertical: 12 },
  saveBtnText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
  actionRow:     { flexDirection: 'row', gap: 10 },
  actionBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 11, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: BORDER },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: BLUE },
});
