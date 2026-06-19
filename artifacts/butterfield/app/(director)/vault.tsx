import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
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
import { useQuery } from '@tanstack/react-query';
import { useVault } from '@/context/VaultContext';
import { api } from '@/lib/api';

const OBSIDIAN = '#0A0A0A';
const GOLD     = '#C9A84C';
const MUTED    = '#888888';
const TEXT     = '#F5F5F5';
const TEXT_DIM = '#AAAAAA';
const SURFACE  = '#1A1A1A';
const SURFACE2 = '#242424';
const BORD     = '#2A2A2A';

const CATEGORIES = [
  { key: 'all',      label: 'All' },
  { key: 'cookies',  label: 'Cookies' },
  { key: 'coffee',   label: 'Coffee' },
  { key: 'desserts', label: 'Desserts' },
  { key: 'sauces',   label: 'Sauces' },
  { key: 'seasonal', label: 'Seasonal' },
];

const CATEGORY_COLORS: Record<string, string> = {
  cookies:  '#C9A84C',
  coffee:   '#92400E',
  desserts: '#BE185D',
  sauces:   '#065F46',
  seasonal: '#1D4ED8',
};

type VaultRecipe = {
  id: string;
  name: string;
  category: string;
  yieldCount: number;
  yieldUnit: string;
  totalBatchCostCents: number;
  ingredientCount: number;
  status: string;
  updatedAt: string;
};

type ActiveTab = 'recipes' | 'settings';

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function RecipeCard({ recipe, onPress }: { recipe: VaultRecipe; onPress: () => void }) {
  const catColor = CATEGORY_COLORS[recipe.category] ?? GOLD;
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.recipeCard, pressed && { opacity: 0.75 }]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[s.catBadge, { backgroundColor: catColor + '22', borderColor: catColor + '44' }]}>
            <Text style={[s.catBadgeText, { color: catColor }]}>{recipe.category.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={s.recipeName}>{recipe.name}</Text>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Text style={s.recipeMeta}>Yield: {recipe.yieldCount} {recipe.yieldUnit}</Text>
          <Text style={s.recipeMeta}>·</Text>
          <Text style={s.recipeMeta}>{recipe.ingredientCount} ingredients</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <View style={[s.costChip, { backgroundColor: GOLD + '18' }]}>
          <Text style={s.costText}>{formatCurrency(recipe.totalBatchCostCents)}</Text>
        </View>
        <Text style={[s.recipeMeta, { fontSize: 11 }]}>batch cost</Text>
      </View>
      <Feather name="chevron-right" size={16} color={MUTED} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

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
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <View style={s.logRow}>
              <View style={[s.logIcon, item.action === 'failed_pin' && { backgroundColor: '#EF444422' }]}>
                <Feather name={(actionIcon[item.action] ?? 'activity') as any} size={14} color={item.action === 'failed_pin' ? '#EF4444' : GOLD} />
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

function ChangePinForm({ onSuccess }: { onSuccess: () => void }) {
  const [current, setCurrent] = useState('');
  const [newPin, setNewPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleChange() {
    if (!/^\d{6}$/.test(newPin)) { setErr('New PIN must be 6 digits'); return; }
    if (!current.trim()) { setErr('Enter your current PIN'); return; }
    setLoading(true);
    setErr('');
    try {
      await api.vault.changePin({ currentPin: current, newPin });
      Alert.alert('PIN Changed', 'Your vault PIN has been updated.');
      onSuccess();
    } catch (e: any) {
      setErr(e.message ?? 'Failed to change PIN');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={s.changePinCard}>
      <Text style={s.changePinTitle}>Change Vault PIN</Text>
      <TextInput
        style={s.pinInput}
        placeholder="Current PIN"
        placeholderTextColor={MUTED}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        value={current}
        onChangeText={setCurrent}
      />
      <TextInput
        style={s.pinInput}
        placeholder="New PIN (6 digits)"
        placeholderTextColor={MUTED}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        value={newPin}
        onChangeText={setNewPin}
      />
      {err ? <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{err}</Text> : null}
      <Pressable
        onPress={handleChange}
        style={({ pressed }) => [s.changePinBtn, pressed && { opacity: 0.8 }]}
        disabled={loading}
      >
        <Text style={s.changePinBtnText}>{loading ? 'Saving…' : 'Change PIN'}</Text>
      </Pressable>
    </View>
  );
}

export default function VaultScreen() {
  const insets = useSafeAreaInsets();
  const { isUnlocked, vaultToken, lock, resetInactivityTimer } = useVault();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [activeTab, setActiveTab] = useState<ActiveTab>('recipes');
  const [showChangePin, setShowChangePin] = useState(false);

  useEffect(() => {
    if (!isUnlocked) {
      router.replace('/(director)/vault-lock' as any);
    }
  }, [isUnlocked]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['vault-recipes', category],
    queryFn: () => api.vault.recipes(vaultToken!, { category: category === 'all' ? undefined : category }),
    enabled: isUnlocked && !!vaultToken,
    staleTime: 30_000,
  });

  const recipes: VaultRecipe[] = data?.data ?? [];
  const filtered = search.trim()
    ? recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : recipes;

  function handleInteraction() {
    resetInactivityTimer();
  }

  function handleLock() {
    Alert.alert('Lock Vault', 'Lock the vault now?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', style: 'destructive', onPress: lock },
    ]);
  }

  if (!isUnlocked) return null;

  return (
    <View style={[s.container, { paddingTop: insets.top }]} onTouchStart={handleInteraction}>
      <StatusBar barStyle="light-content" backgroundColor={OBSIDIAN} />

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
          <Pressable
            key={key}
            onPress={() => setActiveTab(key)}
            style={[s.tab, activeTab === key && s.tabActive]}
          >
            <Text style={[s.tabText, activeTab === key && s.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'recipes' && (
        <>
          {/* Search */}
          <View style={s.searchRow}>
            <Feather name="search" size={16} color={MUTED} style={{ marginLeft: 12 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Search recipes…"
              placeholderTextColor={MUTED}
              value={search}
              onChangeText={text => { setSearch(text); handleInteraction(); }}
            />
          </View>

          {/* Category filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={s.catRow}>
            {CATEGORIES.map(cat => (
              <Pressable
                key={cat.key}
                onPress={() => { setCategory(cat.key); handleInteraction(); }}
                style={[s.catChip, category === cat.key && s.catChipActive]}
              >
                <Text style={[s.catChipText, category === cat.key && s.catChipTextActive]}>{cat.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Recipe list */}
          {isLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: MUTED }}>Loading recipes…</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <Feather name="book-open" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontSize: 16 }}>No recipes yet</Text>
              <Text style={{ color: '#555', fontSize: 13 }}>Add your first recipe with the + button</Text>
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
              onScrollBeginDrag={handleInteraction}
            />
          )}

          {/* FAB */}
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(director)/vault-recipe-edit' as any); }}
            style={[s.fab, { bottom: insets.bottom + 20 }]}
          >
            <Feather name="plus" size={26} color={OBSIDIAN} />
          </Pressable>
        </>
      )}

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

          <Text style={[s.settingsSection, { marginTop: 8 }]}>ACCESS LOG</Text>
          <Text style={{ color: MUTED, fontSize: 12, marginBottom: 8 }}>Last 50 vault events</Text>
          <AccessLogTab vaultToken={vaultToken!} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: OBSIDIAN },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  backBtn: { padding: 6 },
  lockBtn: { padding: 8, backgroundColor: GOLD + '18', borderRadius: 10, borderWidth: 1, borderColor: GOLD + '33' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: TEXT },
  headerSub:   { fontSize: 12, color: MUTED },

  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORD, marginHorizontal: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { fontSize: 14, fontWeight: '500', color: MUTED },
  tabTextActive: { color: GOLD },

  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 12, marginHorizontal: 16, marginTop: 12, marginBottom: 8, height: 42 },
  searchInput: { flex: 1, paddingHorizontal: 10, color: TEXT, fontSize: 14, height: '100%' },

  catRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORD },
  catChipActive: { backgroundColor: GOLD + '20', borderColor: GOLD + '60' },
  catChipText: { fontSize: 13, fontWeight: '500', color: MUTED },
  catChipTextActive: { color: GOLD },

  recipeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: SURFACE, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: BORD,
  },
  recipeName: { fontSize: 16, fontWeight: '600', color: TEXT },
  recipeMeta: { fontSize: 12, color: TEXT_DIM },
  catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, borderWidth: 1 },
  catBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  costChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
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
    backgroundColor: SURFACE2, borderRadius: 10, padding: 12,
    color: TEXT, fontSize: 16, letterSpacing: 4, borderWidth: 1, borderColor: BORD,
  },
  changePinBtn: { backgroundColor: GOLD, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  changePinBtnText: { color: OBSIDIAN, fontWeight: '700', fontSize: 15 },

  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: SURFACE, borderRadius: 10, padding: 10 },
  logIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: GOLD + '18', alignItems: 'center', justifyContent: 'center' },
  logAction: { fontSize: 13, fontWeight: '500', color: TEXT, textTransform: 'capitalize' },
  logTime:   { fontSize: 11, color: MUTED },
  logIp:     { fontSize: 10, color: '#444' },
});
