import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVault } from '@/context/VaultContext';
import { api } from '@/lib/api';

// ── Colours (light theme) ────────────────────────────────────────────────────
const BG      = '#FFFFFF';
const SURFACE = '#F5F6FA';
const SURF2   = '#EBEBEF';
const BORD    = '#E5E7EB';
const TEXT    = '#1A1A1A';
const TEXTD   = '#6B7280';
const MUTED   = '#9CA3AF';
const GOLD    = '#C9A84C';
const GOLD_BG = '#FDF8EC';
const ERROR   = '#EF4444';
const GREEN   = '#16A34A';
const PIN_LEN = 6;

const DEFAULT_CATEGORIES = ['cookies', 'coffee', 'desserts', 'sauces', 'seasonal'];
const CAT_STORAGE_KEY    = 'vault:categories';

const CATEGORY_COLORS: Record<string, string> = {
  cookies: '#C9A84C', coffee: '#92400E', desserts: '#BE185D',
  sauces: '#065F46',  seasonal: '#1D4ED8',
};

type VaultRecipe = {
  id: string; name: string; category: string;
  yieldCount: number; yieldUnit: string;
  totalBatchCostCents: number; ingredientCount: number;
  status: string; updatedAt: string;
};
type ActiveTab = 'recipes' | 'settings';
type Mode = 'lock' | 'setup' | 'confirm';

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

// ── Lock screen components ───────────────────────────────────────────────────
function PinDots({ filled, shake }: { filled: number; shake: Animated.Value }) {
  return (
    <Animated.View style={[ls.dotsRow, { transform: [{ translateX: shake }] }]}>
      {Array.from({ length: PIN_LEN }).map((_, i) => (
        <View key={i} style={[ls.dot, filled > i ? ls.dotFilled : ls.dotEmpty]} />
      ))}
    </Animated.View>
  );
}

function PinKey({ label, sub, onPress }: { label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={({ pressed }) => [ls.key, pressed && ls.keyPressed]}
    >
      <Text style={ls.keyLabel}>{label}</Text>
      {sub ? <Text style={ls.keySub}>{sub}</Text> : null}
    </Pressable>
  );
}

function VaultLockView() {
  const { isUnlocked, unlock, getBiometricPin } = useVault();
  const [pin, setPin]           = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [mode, setMode]         = useState<Mode>('lock');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds]       = useState<number | null>(null);
  const [hasBiometrics, setHasBiometrics]         = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const lockoutInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const status = await api.vault.status();
        if (!status.data.isPinSet) {
          setMode('setup');
        } else if (status.data.isLockedOut && status.data.lockoutExpiresAt) {
          const remaining = Math.ceil((new Date(status.data.lockoutExpiresAt).getTime() - Date.now()) / 1000);
          setLockoutSeconds(Math.max(remaining, 0));
          startCountdown(Math.max(remaining, 0));
        }
        const hw = await LocalAuthentication.hasHardwareAsync();
        const en = await LocalAuthentication.isEnrolledAsync();
        setHasBiometrics(hw && en);
      } catch { setError('Could not connect to vault'); }
      finally { setLoading(false); }
    })();
    return () => { if (lockoutInterval.current) clearInterval(lockoutInterval.current); };
  }, []);

  function startCountdown(secs: number) {
    let s = secs;
    if (lockoutInterval.current) clearInterval(lockoutInterval.current);
    lockoutInterval.current = setInterval(() => {
      s -= 1; setLockoutSeconds(s);
      if (s <= 0) { clearInterval(lockoutInterval.current!); lockoutInterval.current = null; setLockoutSeconds(null); }
    }, 1000);
  }

  function shake() {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8,  duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 40, useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  const handleDigit = useCallback((digit: string) => {
    if (lockoutSeconds !== null && lockoutSeconds > 0) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError('');
    if (newPin.length === PIN_LEN) handlePinComplete(newPin);
  }, [pin, mode, setupPin, lockoutSeconds]);

  const handleDelete = useCallback(() => setPin(p => p.slice(0, -1)), []);

  async function handlePinComplete(entered: string) {
    if (mode === 'setup') { setSetupPin(entered); setPin(''); setMode('confirm'); return; }
    if (mode === 'confirm') {
      if (entered !== setupPin) {
        shake(); setPin(''); setError('PINs do not match. Try again.'); setMode('setup'); setSetupPin(''); return;
      }
      try {
        setLoading(true);
        await api.vault.setupPin({ newPin: entered });
        const res = await api.vault.unlock({ pin: entered });
        await unlock(res.vaultToken, entered);
      } catch (e: any) { shake(); setError(e.message ?? 'Setup failed'); setPin(''); setMode('setup'); setSetupPin(''); }
      finally { setLoading(false); }
      return;
    }
    try {
      setLoading(true);
      const res = await api.vault.unlock({ pin: entered });
      await unlock(res.vaultToken, entered);
    } catch (e: any) {
      shake(); setPin('');
      if (e.body?.attemptsRemaining !== undefined) {
        setAttemptsRemaining(e.body.attemptsRemaining);
        setError(`Wrong PIN — ${e.body.attemptsRemaining} attempt${e.body.attemptsRemaining === 1 ? '' : 's'} remaining`);
      } else if (e.body?.lockoutExpiresAt) {
        const remaining = e.body.remainingSeconds ?? 30;
        setLockoutSeconds(remaining); startCountdown(remaining);
        setError('Vault locked for 30 seconds');
      } else { setError(e.message ?? 'Wrong PIN'); }
    } finally { setLoading(false); }
  }

  async function handleBiometric() {
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Butterfield Vault', fallbackLabel: 'Use PIN' });
      if (!result.success) return;
      const storedPin = await getBiometricPin();
      if (!storedPin) { setError('Please unlock with PIN first to enable biometric'); return; }
      setLoading(true);
      const res = await api.vault.unlock({ pin: storedPin, biometricAssisted: true });
      await unlock(res.vaultToken, storedPin);
    } catch (e: any) { setError(e.message ?? 'Biometric failed'); }
    finally { setLoading(false); }
  }

  const isLocked = lockoutSeconds !== null && lockoutSeconds > 0;
  const title    = mode === 'setup' ? 'Create Vault PIN' : mode === 'confirm' ? 'Confirm PIN' : 'Vault';
  const subtitle = mode === 'setup' ? 'Choose a 6-digit PIN to protect your recipes'
    : mode === 'confirm' ? 'Re-enter your PIN to confirm'
    : 'Enter your 6-digit PIN';

  return (
    <View style={ls.container}>
      {/* Icon */}
      <View style={ls.iconWrap}>
        <View style={ls.iconOuter}>
          <Feather name={isLocked ? 'lock' : 'shield'} size={36} color={GOLD} />
        </View>
        <Text style={ls.title}>{title}</Text>
        <Text style={ls.subtitle}>{subtitle}</Text>
      </View>

      {/* Dots */}
      <PinDots filled={pin.length} shake={shakeAnim} />

      {error ? <Text style={ls.error}>{error}</Text> : null}
      {isLocked ? <Text style={ls.lockout}>Locked — {lockoutSeconds}s remaining</Text> : null}
      {attemptsRemaining !== null && !error ? (
        <Text style={ls.attempts}>{attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} remaining</Text>
      ) : null}

      {/* PIN pad */}
      <View style={ls.pad} pointerEvents={isLocked || loading ? 'none' : 'auto'}>
        {[['1',''],['2','ABC'],['3','DEF'],
          ['4','GHI'],['5','JKL'],['6','MNO'],
          ['7','PQRS'],['8','TUV'],['9','WXYZ'],
          ['',''],['0',''],['⌫','']].reduce<React.ReactElement[]>((rows, _, i, arr) => {
          if (i % 3 === 0) {
            const trio = arr.slice(i, i + 3);
            rows.push(
              <View key={i} style={ls.row}>
                {trio.map(([label, sub], j) => {
                  if (!label) return <View key={j} style={ls.key} />;
                  if (label === '⌫') return (
                    <Pressable key={j} onPress={handleDelete} style={({ pressed }) => [ls.key, pressed && ls.keyPressed]}>
                      <Feather name="delete" size={22} color={TEXT} />
                    </Pressable>
                  );
                  return <PinKey key={j} label={label} sub={sub} onPress={() => handleDigit(label)} />;
                })}
              </View>
            );
          }
          return rows;
        }, [])}
      </View>

      {hasBiometrics && mode === 'lock' && !isLocked && (
        <Pressable onPress={handleBiometric} style={ls.bioBtn}>
          <Feather name="eye" size={20} color={GOLD} />
          <Text style={ls.bioText}>Use Face ID / Touch ID</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Recipe card ──────────────────────────────────────────────────────────────
function RecipeCard({ recipe, onPress }: { recipe: VaultRecipe; onPress: () => void }) {
  const catColor = CATEGORY_COLORS[recipe.category] ?? GOLD;
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.recipeCard, pressed && { opacity: 0.75 }]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[s.catBadge, { backgroundColor: catColor + '18', borderColor: catColor + '33' }]}>
          <Text style={[s.catBadgeText, { color: catColor }]}>{recipe.category.toUpperCase()}</Text>
        </View>
        <Text style={s.recipeName}>{recipe.name}</Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Text style={s.recipeMeta}>Yield: {recipe.yieldCount} {recipe.yieldUnit}</Text>
          <Text style={s.recipeMeta}>·</Text>
          <Text style={s.recipeMeta}>{recipe.ingredientCount} ingredients</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <View style={[s.costChip]}>
          <Text style={s.costText}>{fmt(recipe.totalBatchCostCents)}</Text>
        </View>
        <Text style={[s.recipeMeta, { fontSize: 11 }]}>batch cost</Text>
      </View>
      <Feather name="chevron-right" size={16} color={MUTED} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

// ── Access log ───────────────────────────────────────────────────────────────
function AccessLogTab({ vaultToken }: { vaultToken: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['vault-access-log'],
    queryFn: () => api.vault.accessLog(vaultToken),
    staleTime: 10_000,
  });
  const logs: any[] = data?.data ?? [];
  const actionIcon: Record<string, string> = {
    unlock: 'unlock', lock: 'lock', view: 'eye', edit: 'edit-2',
    create: 'plus-circle', archive: 'archive', failed_pin: 'alert-triangle', pin_changed: 'key',
  };
  return (
    <View style={{ flex: 1 }}>
      {isLoading ? (
        <Text style={{ color: MUTED, textAlign: 'center', marginTop: 40 }}>Loading…</Text>
      ) : logs.length === 0 ? (
        <Text style={{ color: MUTED, textAlign: 'center', marginTop: 40 }}>No log entries yet</Text>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={item => item.id}
          contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
          renderItem={({ item }) => (
            <View style={s.logRow}>
              <View style={[s.logIcon, item.action === 'failed_pin' && { backgroundColor: ERROR + '18' }]}>
                <Feather name={(actionIcon[item.action] ?? 'activity') as any} size={14} color={item.action === 'failed_pin' ? ERROR : GOLD} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.logAction}>{item.action.replace(/_/g, ' ')}</Text>
                <Text style={s.logTime}>{new Date(item.createdAt).toLocaleString('en-AU')}</Text>
              </View>
              {item.ipAddress ? <Text style={s.logIp}>{item.ipAddress}</Text> : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

// ── Change PIN ───────────────────────────────────────────────────────────────
function ChangePinForm({ onSuccess }: { onSuccess: () => void }) {
  const [current, setCurrent] = useState('');
  const [newPin, setNewPin]   = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  async function handleChange() {
    if (!/^\d{6}$/.test(newPin)) { setErr('New PIN must be 6 digits'); return; }
    if (!current.trim()) { setErr('Enter your current PIN'); return; }
    setLoading(true); setErr('');
    try {
      await api.vault.changePin({ currentPin: current, newPin });
      Alert.alert('PIN Changed', 'Your vault PIN has been updated.');
      onSuccess();
    } catch (e: any) { setErr(e.message ?? 'Failed to change PIN'); }
    finally { setLoading(false); }
  }

  return (
    <View style={s.changePinCard}>
      <Text style={s.changePinTitle}>Change Vault PIN</Text>
      <TextInput style={s.pinInput} placeholder="Current PIN" placeholderTextColor={MUTED}
        secureTextEntry keyboardType="number-pad" maxLength={6} value={current} onChangeText={setCurrent} />
      <TextInput style={s.pinInput} placeholder="New PIN (6 digits)" placeholderTextColor={MUTED}
        secureTextEntry keyboardType="number-pad" maxLength={6} value={newPin} onChangeText={setNewPin} />
      {err ? <Text style={{ color: ERROR, fontSize: 12, marginTop: 4 }}>{err}</Text> : null}
      <Pressable onPress={handleChange} style={({ pressed }) => [s.changePinBtn, pressed && { opacity: 0.8 }]} disabled={loading}>
        <Text style={s.changePinBtnText}>{loading ? 'Saving…' : 'Change PIN'}</Text>
      </Pressable>
    </View>
  );
}

// ── Category manager ─────────────────────────────────────────────────────────
function CategoryManager({
  categories, onAdd, onDelete,
}: { categories: string[]; onAdd: (c: string) => void; onDelete: (c: string) => void }) {
  const [input, setInput] = useState('');

  function handleAdd() {
    const val = input.trim().toLowerCase();
    if (!val) return;
    if (categories.includes(val)) { Alert.alert('Already exists', `"${val}" is already a category.`); return; }
    onAdd(val); setInput('');
  }

  return (
    <View style={s.catMgr}>
      <Text style={s.catMgrTitle}>Manage Categories</Text>
      <Text style={s.catMgrSub}>Add or remove recipe categories</Text>

      {categories.map(cat => {
        const color = CATEGORY_COLORS[cat] ?? GOLD;
        return (
          <View key={cat} style={s.catMgrRow}>
            <View style={[s.catMgrDot, { backgroundColor: color }]} />
            <Text style={s.catMgrLabel}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
            <Pressable
              onPress={() => {
                Alert.alert('Delete Category', `Delete "${cat}"? Recipes won't be deleted.`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => onDelete(cat) },
                ]);
              }}
              style={s.catMgrDelete}
            >
              <Feather name="trash-2" size={14} color={ERROR} />
            </Pressable>
          </View>
        );
      })}

      <View style={s.catAddRow}>
        <TextInput
          style={s.catAddInput}
          placeholder="New category name…"
          placeholderTextColor={MUTED}
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <Pressable onPress={handleAdd} style={s.catAddBtn}>
          <Feather name="plus" size={18} color="#FFF" />
        </Pressable>
      </View>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function VaultScreen() {
  const insets = useSafeAreaInsets();
  const { isUnlocked, vaultToken, lock, resetInactivityTimer } = useVault();
  const queryClient = useQueryClient();
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('all');
  const [activeTab, setActiveTab] = useState<ActiveTab>('recipes');
  const [showChangePin, setShowChangePin] = useState(false);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  // Load custom categories from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(CAT_STORAGE_KEY).then(raw => {
      if (raw) { try { setCategories(JSON.parse(raw)); } catch {} }
    });
  }, []);

  function saveCategories(cats: string[]) {
    setCategories(cats);
    AsyncStorage.setItem(CAT_STORAGE_KEY, JSON.stringify(cats));
  }

  const { data, isLoading } = useQuery({
    queryKey: ['vault-recipes', category],
    queryFn: () => api.vault.recipes(vaultToken!, { category: category === 'all' ? undefined : category }),
    enabled: isUnlocked && !!vaultToken,
    staleTime: 30_000,
  });

  const recipes: VaultRecipe[] = data?.data ?? [];
  const filtered = search.trim()
    ? recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : recipes;

  function handleLock() {
    Alert.alert('Lock Vault', 'Lock the vault now?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', style: 'destructive', onPress: lock },
    ]);
  }

  const CATS = [{ key: 'all', label: 'All' }, ...categories.map(c => ({ key: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))];

  // ── If locked, show lock UI ──────────────────────────────────────────────
  if (!isUnlocked) {
    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={[{ paddingTop: insets.top }, { flex: 1 }]}>
          <View style={s.lockHeader}>
            <Pressable onPress={() => router.back()} style={s.backBtn}>
              <Feather name="x" size={22} color={MUTED} />
            </Pressable>
          </View>
          <VaultLockView />
        </View>
      </View>
    );
  }

  // ── Unlocked ─────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { paddingTop: insets.top }]} onTouchStart={resetInactivityTimer}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="chevron-left" size={22} color={MUTED} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Vault</Text>
          <Text style={s.headerSub}>Recipe & Cost Repository</Text>
        </View>
        <Pressable onPress={handleLock} style={s.lockBtn}>
          <Feather name="lock" size={18} color={GOLD} />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {([['recipes', 'Recipes'], ['settings', 'Settings']] as const).map(([key, label]) => (
          <Pressable key={key} onPress={() => setActiveTab(key)} style={[s.tab, activeTab === key && s.tabActive]}>
            <Text style={[s.tabText, activeTab === key && s.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Recipes tab ── */}
      {activeTab === 'recipes' && (
        <>
          <View style={s.searchRow}>
            <Feather name="search" size={16} color={MUTED} style={{ marginLeft: 12 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Search recipes…"
              placeholderTextColor={MUTED}
              value={search}
              onChangeText={t => { setSearch(t); resetInactivityTimer(); }}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={s.catRow}>
            {CATS.map(cat => (
              <Pressable
                key={cat.key}
                onPress={() => { setCategory(cat.key); resetInactivityTimer(); }}
                style={[s.catChip, category === cat.key && s.catChipActive]}
              >
                <Text style={[s.catChipText, category === cat.key && s.catChipTextActive]}>{cat.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {isLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: MUTED }}>Loading recipes…</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <Feather name="book-open" size={40} color={MUTED} />
              <Text style={{ color: TEXTD, fontSize: 16, fontWeight: '500' }}>No recipes yet</Text>
              <Text style={{ color: MUTED, fontSize: 13 }}>Tap + to add your first recipe</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 80 }}
              renderItem={({ item }) => (
                <RecipeCard
                  recipe={item}
                  onPress={() => router.push({ pathname: '/(director)/vault-recipe', params: { id: item.id } } as any)}
                />
              )}
              onScrollBeginDrag={resetInactivityTimer}
            />
          )}

          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(director)/vault-recipe-edit' as any); }}
            style={[s.fab, { bottom: insets.bottom + 20 }]}
          >
            <Feather name="plus" size={26} color="#FFF" />
          </Pressable>
        </>
      )}

      {/* ── Settings tab ── */}
      {activeTab === 'settings' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}>

          <Text style={s.settingsSection}>SECURITY</Text>
          {showChangePin ? (
            <ChangePinForm onSuccess={() => setShowChangePin(false)} />
          ) : (
            <Pressable
              onPress={() => setShowChangePin(true)}
              style={[s.settingsRow, { justifyContent: 'space-between' }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Feather name="key" size={18} color={GOLD} />
                <Text style={s.settingsRowText}>Change Vault PIN</Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </Pressable>
          )}

          <Text style={[s.settingsSection, { marginTop: 8 }]}>CATEGORIES</Text>
          <CategoryManager
            categories={categories}
            onAdd={cat => saveCategories([...categories, cat])}
            onDelete={cat => saveCategories(categories.filter(c => c !== cat))}
          />

          <Text style={[s.settingsSection, { marginTop: 8 }]}>ACCESS LOG</Text>
          <Text style={{ color: MUTED, fontSize: 12, marginBottom: 4 }}>Last 50 vault events</Text>
          <AccessLogTab vaultToken={vaultToken!} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Lock screen styles ───────────────────────────────────────────────────────
const ls = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  iconWrap: { alignItems: 'center', marginTop: 32, marginBottom: 28 },
  iconOuter: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: GOLD_BG, borderWidth: 1.5, borderColor: GOLD + '66',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title:    { fontSize: 24, fontWeight: '700', color: TEXT, marginBottom: 6 },
  subtitle: { fontSize: 14, color: MUTED, textAlign: 'center' },
  dotsRow:  { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dot:      { width: 14, height: 14, borderRadius: 7 },
  dotEmpty: { backgroundColor: SURF2, borderWidth: 1.5, borderColor: BORD },
  dotFilled:{ backgroundColor: GOLD },
  error:    { color: ERROR, fontSize: 13, marginBottom: 4, textAlign: 'center' },
  lockout:  { color: ERROR, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  attempts: { color: GOLD, fontSize: 12, marginBottom: 4 },
  pad: { width: '100%', marginTop: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  key: {
    flex: 1, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: SURFACE, borderWidth: 1, borderColor: BORD,
  },
  keyPressed: { backgroundColor: SURF2 },
  keyLabel:   { fontSize: 24, fontWeight: '400', color: TEXT },
  keySub:     { fontSize: 9, color: MUTED, letterSpacing: 1, marginTop: 1 },
  bioBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, padding: 12 },
  bioText: { color: GOLD, fontSize: 14, fontWeight: '600' },
});

// ── Main screen styles ───────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  lockHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { padding: 8 },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: BORD },
  lockBtn: { padding: 8, backgroundColor: GOLD_BG, borderRadius: 10, borderWidth: 1, borderColor: GOLD + '44' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: TEXT },
  headerSub:   { fontSize: 12, color: MUTED },

  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORD, marginHorizontal: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { fontSize: 14, fontWeight: '500', color: MUTED },
  tabTextActive: { color: GOLD },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE,
    borderRadius: 12, marginHorizontal: 16, marginTop: 12, marginBottom: 8,
    height: 42, borderWidth: 1, borderColor: BORD,
  },
  searchInput: { flex: 1, paddingHorizontal: 10, color: TEXT, fontSize: 14, height: '100%' },

  catRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORD },
  catChipActive: { backgroundColor: GOLD_BG, borderColor: GOLD + '66' },
  catChipText: { fontSize: 13, fontWeight: '500', color: MUTED },
  catChipTextActive: { color: GOLD, fontWeight: '600' },

  recipeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: SURFACE, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: BORD,
  },
  recipeName: { fontSize: 16, fontWeight: '600', color: TEXT },
  recipeMeta: { fontSize: 12, color: TEXTD },
  catBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, borderWidth: 1 },
  catBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  costChip: { backgroundColor: GOLD_BG, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: GOLD + '33' },
  costText: { fontSize: 14, fontWeight: '700', color: GOLD },

  fab: {
    position: 'absolute', right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center',
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },

  settingsSection: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 6 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORD },
  settingsRowText: { fontSize: 15, fontWeight: '500', color: TEXT },

  changePinCard: { backgroundColor: SURFACE, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORD, gap: 10 },
  changePinTitle: { fontSize: 16, fontWeight: '600', color: TEXT, marginBottom: 4 },
  pinInput: {
    backgroundColor: BG, borderRadius: 10, padding: 12,
    color: TEXT, fontSize: 16, letterSpacing: 4, borderWidth: 1, borderColor: BORD,
  },
  changePinBtn: { backgroundColor: GOLD, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  changePinBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  catMgr: { backgroundColor: SURFACE, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORD, gap: 12 },
  catMgrTitle: { fontSize: 15, fontWeight: '600', color: TEXT },
  catMgrSub: { fontSize: 12, color: MUTED, marginTop: -6 },
  catMgrRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BG, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: BORD },
  catMgrDot: { width: 10, height: 10, borderRadius: 5 },
  catMgrLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: TEXT },
  catMgrDelete: { padding: 6 },
  catAddRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  catAddInput: { flex: 1, backgroundColor: BG, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: TEXT, borderWidth: 1, borderColor: BORD },
  catAddBtn: { backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },

  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: SURFACE, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: BORD },
  logIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: GOLD_BG, alignItems: 'center', justifyContent: 'center' },
  logAction: { fontSize: 13, fontWeight: '500', color: TEXT, textTransform: 'capitalize' },
  logTime: { fontSize: 11, color: MUTED },
  logIp: { fontSize: 10, color: MUTED },
});
