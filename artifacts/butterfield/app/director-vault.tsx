import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Animated,
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

const BG       = '#FFFFFF';
const SURFACE  = '#F5F6FA';
const BORD     = '#E5E7EB';
const TEXT     = '#1A1A1A';
const TEXTD    = '#6B7280';
const MUTED    = '#9CA3AF';
const GOLD     = '#40C0F2';
const GOLD_BG  = '#EDF8FE';
const GOLD_DK  = '#2AA8DC';
const ERROR    = '#EF4444';

const DEFAULT_CATEGORIES = ['cookies', 'coffee', 'desserts', 'sauces', 'seasonal'];
const CAT_STORAGE_KEY    = 'vault:categories';

const CAT_COLORS: Record<string, string> = {
  cookies: '#C9A84C', coffee: '#92400E', desserts: '#BE185D',
  sauces: '#065F46', seasonal: '#1D4ED8',
};

const DOT_COLORS = ['#C9A84C','#92400E','#BE185D','#065F46','#1D4ED8','#7C3AED','#0891B2','#DC2626'];

function catColor(cat: string) { return CAT_COLORS[cat] ?? GOLD; }

/* ─────────────────────────── PIN PAD ─────────────────────────── */

type PinMode = 'lock' | 'create' | 'confirm';

function PinDots({ filled, total = 6 }: { filled: number; total?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 14, height: 14, borderRadius: 7,
            backgroundColor: i < filled ? GOLD : 'transparent',
            borderWidth: 2, borderColor: i < filled ? GOLD : MUTED,
          }}
        />
      ))}
    </View>
  );
}

function PinPad({ onDigit, onDelete }: { onDigit: (d: string) => void; onDelete: () => void }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <View style={{ gap: 10 }}>
      {[keys.slice(0,3), keys.slice(3,6), keys.slice(6,9), keys.slice(9,12)].map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((k, ki) => {
            if (!k) return <View key={ki} style={{ flex: 1 }} />;
            const isDel = k === '⌫';
            return (
              <Pressable
                key={ki}
                onPress={() => { Haptics.selectionAsync(); isDel ? onDelete() : onDigit(k); }}
                style={({ pressed }) => [
                  pin_s.key,
                  isDel && { backgroundColor: SURFACE, borderColor: BORD },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={[pin_s.keyText, isDel && { fontSize: 22, color: MUTED }]}>{k}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const pin_s = StyleSheet.create({
  key: {
    flex: 1, aspectRatio: 1.6, borderRadius: 14,
    backgroundColor: GOLD_BG, borderWidth: 1, borderColor: GOLD + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  keyText: { fontSize: 22, fontWeight: '600', color: TEXT },
});

/* ─────────────────────────── LOCK VIEW ─────────────────────────── */

function VaultLockView({ onUnlocked }: { onUnlocked: () => void }) {
  const insets = useSafeAreaInsets();
  const { unlock, getBiometricPin } = useVault();
  const [statusData, setStatusData] = useState<{ hasPinSet: boolean } | null>(null);
  const [mode, setMode]     = useState<PinMode>('lock');
  const [pin, setPin]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    api.vault.status().then(r => {
      const data = r.data as unknown as { isPinSet: boolean };
      setStatusData(data as any);
      setMode(data.isPinSet ? 'lock' : 'create');
    }).catch(() => setMode('create'));

    LocalAuthentication.hasHardwareAsync().then(hw => {
      if (!hw) return;
      LocalAuthentication.isEnrolledAsync().then(ok => setHasBiometrics(ok));
    });
  }, []);

  function shake() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  async function handleBiometric() {
    const storedPin = await getBiometricPin();
    if (!storedPin) {
      setError('Unlock with your PIN first to enable Face ID / Touch ID');
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Recipe Vault',
      fallbackLabel: 'Use PIN',
    });
    if (!result.success) return;
    setLoading(true);
    try {
      const res = await api.vault.unlock({ pin: storedPin }) as any;
      await unlock(res.vaultToken ?? res.data?.vaultToken, storedPin);
      onUnlocked();
    } catch {
      setError('Biometric unlock failed — use PIN');
    } finally { setLoading(false); }
  }

  function handleDigit(d: string) {
    setError('');
    if (mode === 'confirm') {
      if (confirm.length >= 6) return;
      setConfirm(prev => prev + d);
    } else {
      if (pin.length >= 6) return;
      setPin(prev => prev + d);
    }
  }

  function handleDelete() {
    setError('');
    if (mode === 'confirm') setConfirm(prev => prev.slice(0, -1));
    else setPin(prev => prev.slice(0, -1));
  }

  useEffect(() => {
    const current = mode === 'confirm' ? confirm : pin;
    if (current.length < 6) return;

    (async () => {
      setLoading(true);
      setError('');
      try {
        if (mode === 'create') {
          setMode('confirm');
          setLoading(false);
          return;
        }

        if (mode === 'confirm') {
          if (pin !== confirm) {
            shake();
            setError('PINs don\'t match — try again');
            setConfirm('');
            setLoading(false);
            return;
          }
          await api.vault.setupPin({ newPin: pin }) as any;
          const res = await api.vault.unlock({ pin }) as any;
          await unlock(res.vaultToken ?? res.data?.vaultToken, pin);
          onUnlocked();
          return;
        }

        // mode === 'lock'
        const res = await api.vault.unlock({ pin }) as any;
        await unlock(res.vaultToken ?? res.data?.vaultToken, pin);
        onUnlocked();
      } catch (e: any) {
        shake();
        setError(e?.message ?? 'Invalid PIN');
        setPin('');
        setConfirm('');
      } finally { setLoading(false); }
    })();
  }, [pin, confirm]);

  const title    = mode === 'create'  ? 'Create Vault PIN'
                 : mode === 'confirm' ? 'Confirm PIN'
                 :                     'Enter PIN';
  const subtitle = mode === 'create'  ? 'Set a 6-digit PIN to protect your recipes'
                 : mode === 'confirm' ? 'Re-enter your PIN to confirm'
                 :                     'Enter your 6-digit vault PIN';
  const filled   = mode === 'confirm' ? confirm.length : pin.length;

  return (
    <View style={[{ flex: 1, backgroundColor: BG, paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORD }}>
        <Pressable onPress={() => router.back()} style={{ padding: 6 }}>
          <Feather name="chevron-left" size={22} color={MUTED} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '700', color: TEXT, marginLeft: 8 }}>
          Recipe Vault
        </Text>
        <View style={{ backgroundColor: GOLD_BG, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: GOLD + '44' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: GOLD }}>LOCKED</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 32, alignItems: 'center', gap: 28 }}>
        {/* Lock icon */}
        <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: GOLD_BG, borderWidth: 1.5, borderColor: GOLD + '44', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={mode === 'lock' ? 'lock' : 'key'} size={34} color={GOLD} />
        </View>

        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT }}>{title}</Text>
          <Text style={{ fontSize: 14, color: TEXTD, textAlign: 'center' }}>{subtitle}</Text>
        </View>

        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <PinDots filled={filled} />
        </Animated.View>

        {error ? (
          <View style={{ backgroundColor: ERROR + '12', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ color: ERROR, fontSize: 13, textAlign: 'center' }}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <Text style={{ color: MUTED, fontSize: 13 }}>Verifying…</Text>
        ) : null}

        <View style={{ width: '100%' }}>
          <PinPad onDigit={handleDigit} onDelete={handleDelete} />
        </View>

        {hasBiometrics && mode === 'lock' && (
          <Pressable
            onPress={handleBiometric}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: BORD, backgroundColor: SURFACE }}
          >
            <Feather name="eye" size={18} color={GOLD} />
            <Text style={{ color: TEXTD, fontWeight: '500', fontSize: 14 }}>Use Face ID / Touch ID</Text>
          </Pressable>
        )}

        {mode === 'confirm' && (
          <Pressable onPress={() => { setMode('create'); setPin(''); setConfirm(''); setError(''); }}>
            <Text style={{ color: TEXTD, fontSize: 13 }}>← Start over</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

/* ─────────────────────────── RECIPE LIST ─────────────────────────── */

type Recipe = {
  id: string; name: string; category: string; yieldCount: number;
  yieldUnit: string; status: string; ingredientCount: number;
  totalCostCents: number;
};

const VIEWS = ['Recipes', 'Settings'] as const;

export default function VaultScreen() {
  const insets = useSafeAreaInsets();
  const { isUnlocked, vaultToken, resetInactivityTimer, lock } = useVault();
  const queryClient = useQueryClient();

  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [view, setView]         = useState<'Recipes' | 'Settings'>('Recipes');
  const [catFilter, setCatFilter] = useState('all');
  const [search, setSearch]     = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [newCatName, setNewCatName] = useState('');

  useEffect(() => { setUnlocked(isUnlocked); }, [isUnlocked]);

  useEffect(() => {
    AsyncStorage.getItem(CAT_STORAGE_KEY).then(raw => {
      if (raw) try { setCategories(JSON.parse(raw)); } catch {}
    });
  }, []);

  async function saveCategories(cats: string[]) {
    setCategories(cats);
    await AsyncStorage.setItem(CAT_STORAGE_KEY, JSON.stringify(cats));
  }

  async function addCategory() {
    const name = newCatName.trim().toLowerCase();
    if (!name || categories.includes(name)) return;
    await saveCategories([...categories, name]);
    setNewCatName('');
    Haptics.selectionAsync();
  }

  async function removeCategory(cat: string) {
    Alert.alert('Remove Category', `Remove "${cat}" from the category list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await saveCategories(categories.filter(c => c !== cat));
          if (catFilter === cat) setCatFilter('all');
        },
      },
    ]);
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['vault-recipes', showArchived],
    queryFn: () => (api.vault.recipes as any)(vaultToken!, showArchived ? {} : { status: 'active' }),
    enabled: unlocked && !!vaultToken,
    staleTime: 30_000,
  });

  const allRecipes: Recipe[] = (data as any)?.data ?? [];
  const filtered = allRecipes.filter(r =>
    (catFilter === 'all' || r.category === catFilter) &&
    (!search || r.name.toLowerCase().includes(search.toLowerCase()))
  );

  const totalRecipes = allRecipes.length;
  const avgCost = totalRecipes > 0
    ? Math.round(allRecipes.reduce((s, r) => s + (r.totalCostCents ?? 0), 0) / totalRecipes)
    : 0;

  function handleLock() {
    Alert.alert('Lock Vault', 'Lock the Recipe Vault?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', onPress: () => { lock(); setUnlocked(false); } },
    ]);
  }

  if (!unlocked) {
    return <VaultLockView onUnlocked={() => { setUnlocked(true); }} />;
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]} onTouchStart={() => resetInactivityTimer()}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="chevron-left" size={22} color={MUTED} />
        </Pressable>
        <Text style={s.headerTitle}>Recipe Vault</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => router.push('/director-vault-recipe-edit' as any)}
            style={s.addBtn}
          >
            <Feather name="plus" size={16} color="#FFF" />
          </Pressable>
          <Pressable onPress={handleLock} style={s.lockBtn}>
            <Feather name="lock" size={16} color={GOLD} />
          </Pressable>
        </View>
      </View>

      {/* View toggle */}
      <View style={s.viewToggle}>
        {VIEWS.map(v => (
          <Pressable
            key={v}
            onPress={() => setView(v)}
            style={[s.viewTab, view === v && s.viewTabActive]}
          >
            <Text style={[s.viewTabText, view === v && s.viewTabTextActive]}>{v}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Recipes view ── */}
      {view === 'Recipes' && (
        <>
          {/* Stats strip */}
          <View style={s.statsStrip}>
            <View style={s.statItem}>
              <Text style={s.statValue}>{totalRecipes}</Text>
              <Text style={s.statLabel}>Recipes</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>${(avgCost / 100).toFixed(2)}</Text>
              <Text style={s.statLabel}>Avg Batch Cost</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{categories.length}</Text>
              <Text style={s.statLabel}>Categories</Text>
            </View>
          </View>

          {/* Search */}
          <View style={s.searchRow}>
            <Feather name="search" size={16} color={MUTED} style={{ marginLeft: 12 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Search recipes…"
              placeholderTextColor={MUTED}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Chips + recipe list scoped together so flex: 1 on the list is relative to remaining space only */}
          <View style={{ flex: 1 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catScroll}>
              {['all', ...categories].map(cat => (
                <Pressable
                  key={cat}
                  onPress={() => { setCatFilter(cat); Haptics.selectionAsync(); }}
                  style={[s.catChip, catFilter === cat && { backgroundColor: catColor(cat) + '18', borderColor: catColor(cat) + '55' }]}
                >
                  <Text style={[s.catChipText, catFilter === cat && { color: catColor(cat), fontWeight: '700' }]}>
                    {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 12 }}>
            {filtered.length === 0 && !isLoading && (
              <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10 }}>
                <Feather name="book-open" size={32} color={MUTED} />
                <Text style={{ color: MUTED, fontSize: 15 }}>No recipes found</Text>
                <Pressable
                  onPress={() => router.push('/director-vault-recipe-edit' as any)}
                  style={s.emptyAddBtn}
                >
                  <Text style={{ color: GOLD, fontWeight: '600' }}>+ Add First Recipe</Text>
                </Pressable>
              </View>
            )}

            {filtered.map(recipe => (
                <Pressable
                  key={recipe.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push({ pathname: '/director-vault-recipe', params: { id: recipe.id } } as any);
                  }}
                  style={({ pressed }) => [s.recipeCard, pressed && { opacity: 0.85 }]}
                >
                  <View style={{ flex: 1, padding: 14, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={s.recipeName} numberOfLines={1}>{recipe.name}</Text>
                      <Feather name="chevron-right" size={16} color={MUTED} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={[s.badge, { backgroundColor: GOLD_BG, borderColor: GOLD + '55' }]}>
                        <Text style={[s.badgeText, { color: GOLD }]}>
                          {recipe.category.charAt(0).toUpperCase() + recipe.category.slice(1)}
                        </Text>
                      </View>
                      <Text style={s.recipeMetaText}>
                        {recipe.yieldCount} {recipe.yieldUnit}
                      </Text>
                      {recipe.ingredientCount > 0 && (
                        <Text style={s.recipeMetaText}>{recipe.ingredientCount} ingredients</Text>
                      )}
                    </View>
                    {recipe.totalCostCents > 0 && (
                      <Text style={{ fontSize: 13, fontWeight: '700', color: GOLD }}>
                        Batch cost ${(recipe.totalCostCents / 100).toFixed(2)}
                      </Text>
                    )}
                  </View>
                </Pressable>
            ))}

            <Pressable
              onPress={() => setShowArchived(a => !a)}
              style={{ alignSelf: 'center', padding: 12 }}
            >
              <Text style={{ color: MUTED, fontSize: 12 }}>
                {showArchived ? 'Hide archived' : 'Show archived'}
              </Text>
            </Pressable>
          </ScrollView>
          </View>
        </>
      )}

      {/* ── Settings view ── */}
      {view === 'Settings' && (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: insets.bottom + 40 }}>
          <View style={s.settingsCard}>
            <Text style={s.settingsTitle}>Manage Categories</Text>
            <Text style={{ fontSize: 13, color: TEXTD, marginBottom: 16 }}>
              Add or remove recipe categories. These appear as filter chips and in the edit form.
            </Text>

            {categories.map((cat, idx) => (
              <View key={cat} style={s.catManageRow}>
                <View style={[s.catDot, { backgroundColor: DOT_COLORS[idx % DOT_COLORS.length] }]} />
                <Text style={s.catManageName}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
                <Pressable
                  onPress={() => removeCategory(cat)}
                  style={s.catDeleteBtn}
                >
                  <Feather name="trash-2" size={14} color={ERROR} />
                </Pressable>
              </View>
            ))}

            <View style={s.addCatRow}>
              <TextInput
                style={s.addCatInput}
                placeholder="New category name…"
                placeholderTextColor={MUTED}
                value={newCatName}
                onChangeText={setNewCatName}
                autoCapitalize="none"
                onSubmitEditing={addCategory}
              />
              <Pressable onPress={addCategory} style={s.addCatBtn}>
                <Feather name="plus" size={18} color="#FFF" />
              </Pressable>
            </View>
          </View>

          <View style={s.settingsCard}>
            <Text style={s.settingsTitle}>Vault Security</Text>
            <Text style={{ fontSize: 13, color: TEXTD, marginBottom: 16 }}>
              The vault auto-locks after 2 minutes of inactivity or when the app goes to background.
            </Text>
            <Pressable onPress={handleLock} style={s.lockNowBtn}>
              <Feather name="lock" size={16} color={ERROR} />
              <Text style={{ color: ERROR, fontWeight: '600', fontSize: 14 }}>Lock Vault Now</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: BORD },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: TEXT },
  addBtn: { backgroundColor: GOLD, borderRadius: 10, padding: 8 },
  lockBtn: { padding: 8, borderRadius: 10, backgroundColor: GOLD_BG, borderWidth: 1, borderColor: GOLD + '44' },

  viewToggle: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 10, backgroundColor: SURFACE, borderRadius: 10, padding: 3 },
  viewTab: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  viewTabActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  viewTabText: { fontSize: 13, fontWeight: '500', color: MUTED },
  viewTabTextActive: { color: TEXT, fontWeight: '700' },

  statsStrip: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: SURFACE, borderRadius: 12, borderWidth: 1, borderColor: BORD, overflow: 'hidden' },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statValue: { fontSize: 18, fontWeight: '700', color: GOLD },
  statLabel: { fontSize: 11, color: MUTED, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: BORD, marginVertical: 10 },

  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 6, backgroundColor: SURFACE, borderRadius: 10, borderWidth: 1, borderColor: BORD, height: 40, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: TEXT, paddingRight: 12 },

  catScroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4, gap: 8, alignItems: 'flex-start' },
  catChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, backgroundColor: SURFACE, borderColor: BORD },
  catChipText: { fontSize: 13, fontWeight: '500', color: MUTED },

  recipeCard: { backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: BORD, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  recipeName: { fontSize: 15, fontWeight: '700', color: TEXT, flex: 1 },
  recipeMetaText: { fontSize: 12, color: MUTED },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  emptyAddBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: GOLD + '55', backgroundColor: GOLD_BG },

  settingsCard: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: BORD, padding: 20 },
  settingsTitle: { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 4 },
  catManageRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORD, gap: 10 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catManageName: { flex: 1, fontSize: 14, fontWeight: '500', color: TEXT, textTransform: 'capitalize' },
  catDeleteBtn: { padding: 6 },
  addCatRow: { flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'center' },
  addCatInput: { flex: 1, height: 40, borderWidth: 1, borderColor: BORD, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: TEXT, backgroundColor: SURFACE },
  addCatBtn: { width: 40, height: 40, backgroundColor: GOLD, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  lockNowBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: ERROR + '33', backgroundColor: ERROR + '0A' },
});
