import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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

const BG      = '#FFFFFF';
const SURFACE = '#F5F6FA';
const BORD    = '#E5E7EB';
const TEXT    = '#1A1A1A';
const TEXTD   = '#6B7280';
const MUTED   = '#9CA3AF';
const GOLD    = '#C9A84C';
const GOLD_BG = '#FDF8EC';
const GREEN   = '#16A34A';
const ERROR   = '#EF4444';

const DEFAULT_CATEGORIES = ['cookies', 'coffee', 'desserts', 'sauces', 'seasonal'];
const CAT_STORAGE_KEY    = 'vault:categories';

type IngredientRow = {
  id?: string; name: string; quantity: string;
  unit: string; costCentsPerUnit: string; supplier: string;
};

function emptyIngredient(): IngredientRow {
  return { name: '', quantity: '', unit: 'g', costCentsPerUnit: '', supplier: '' };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput {...props} style={[s.input, props.style]} placeholderTextColor={MUTED} />
  );
}

export default function VaultRecipeEditScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const { isUnlocked, vaultToken, resetInactivityTimer } = useVault();
  const queryClient = useQueryClient();

  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [dirty, setDirty]     = useState(false);

  const [name, setName]               = useState('');
  const [category, setCategory]       = useState('cookies');
  const [description, setDescription] = useState('');
  const [yieldCount, setYieldCount]   = useState('12');
  const [yieldUnit, setYieldUnit]     = useState('cookies');
  const [prepTime, setPrepTime]       = useState('');
  const [bakeTime, setBakeTime]       = useState('');
  const [notes, setNotes]             = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([emptyIngredient()]);
  const [deletedIngredientIds, setDeletedIngredientIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    AsyncStorage.getItem(CAT_STORAGE_KEY).then(raw => {
      if (raw) { try { setCategories(JSON.parse(raw)); } catch {} }
    });
  }, []);

  const { data: existingData } = useQuery({
    queryKey: ['vault-recipe', id],
    queryFn: () => api.vault.recipe(vaultToken!, id!),
    enabled: isEdit && isUnlocked && !!vaultToken,
    staleTime: 30_000,
  });

  useEffect(() => {
    const recipe = (existingData as any)?.data;
    if (!recipe) return;
    setName(recipe.name);
    setCategory(recipe.category);
    setDescription(recipe.description ?? '');
    setYieldCount(String(recipe.yieldCount));
    setYieldUnit(recipe.yieldUnit);
    setPrepTime(recipe.prepTimeMin ? String(recipe.prepTimeMin) : '');
    setBakeTime(recipe.bakeTimeMin ? String(recipe.bakeTimeMin) : '');
    setNotes(recipe.notes ?? '');
    if (recipe.ingredients?.length > 0) {
      setIngredients(recipe.ingredients.map((ing: any) => ({
        id: ing.id, name: ing.name, quantity: ing.quantity, unit: ing.unit,
        costCentsPerUnit: String(ing.costCentsPerUnit / 100), supplier: ing.supplier ?? '',
      })));
    }
  }, [existingData]);

  function mark() { setDirty(true); resetInactivityTimer(); }
  function addIngredient() { mark(); setIngredients(prev => [...prev, emptyIngredient()]); }
  function removeIngredient(i: number) {
    mark();
    setIngredients(prev => {
      const ing = prev[i];
      if (ing?.id) setDeletedIngredientIds(ids => [...ids, ing.id!]);
      return prev.filter((_, idx) => idx !== i);
    });
  }
  function updateIngredient(i: number, field: keyof IngredientRow, val: string) {
    mark();
    setIngredients(prev => prev.map((ing, idx) => idx === i ? { ...ing, [field]: val } : ing));
  }

  function computeLineCost(ing: IngredientRow) {
    return (parseFloat(ing.quantity) || 0) * (parseFloat(ing.costCentsPerUnit) || 0) * 100;
  }
  const totalBatchCostCents = ingredients.reduce((sum, ing) => sum + computeLineCost(ing), 0);

  function handleBack() {
    if (dirty) {
      Alert.alert('Discard Changes', 'Discard unsaved changes?', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else { router.back(); }
  }

  async function handleSave() {
    if (!name.trim()) { setError('Recipe name is required'); setStep(0); return; }
    setLoading(true); setError('');
    try {
      const payload = {
        name: name.trim(), category,
        description: description || null,
        yieldCount: parseInt(yieldCount) || 1, yieldUnit,
        prepTimeMin: prepTime ? parseInt(prepTime) : null,
        bakeTimeMin: bakeTime ? parseInt(bakeTime) : null,
        notes: notes || null,
        ingredients: ingredients
          .filter(i => i.name.trim())
          .map((ing, idx) => ({
            id: ing.id, name: ing.name.trim(),
            quantity: ing.quantity || '0', unit: ing.unit,
            costCentsPerUnit: Math.round((parseFloat(ing.costCentsPerUnit) || 0) * 100),
            supplier: ing.supplier || null, sortOrder: idx,
          })),
      };

      if (isEdit) {
        await api.vault.updateRecipe(vaultToken!, id!, payload);
        for (const deletedId of deletedIngredientIds) {
          await api.vault.deleteIngredient(vaultToken!, deletedId);
        }
        for (const ing of payload.ingredients) {
          if (ing.id) { await api.vault.updateIngredient(vaultToken!, ing.id, ing); }
          else { await api.vault.addIngredient(vaultToken!, id!, ing); }
        }
      } else {
        await api.vault.createRecipe(vaultToken!, payload);
      }

      queryClient.invalidateQueries({ queryKey: ['vault-recipes'] });
      queryClient.invalidateQueries({ queryKey: ['vault-recipe', id] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) { setError(e.message ?? 'Save failed'); }
    finally { setLoading(false); }
  }

  if (!isUnlocked) { router.back(); return null; }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={handleBack} style={s.backBtn}>
            <Feather name="x" size={20} color={MUTED} />
          </Pressable>
          <Text style={s.headerTitle}>{isEdit ? 'Edit Recipe' : 'New Recipe'}</Text>
          <Pressable onPress={handleSave} disabled={loading} style={[s.saveBtn, loading && { opacity: 0.6 }]}>
            <Text style={s.saveBtnText}>{loading ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>

        {/* Step tabs */}
        <View style={s.stepRow}>
          {['Details', 'Ingredients'].map((label, i) => (
            <Pressable key={label} onPress={() => setStep(i)} style={[s.stepTab, step === i && s.stepTabActive]}>
              <Text style={[s.stepText, step === i && s.stepTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 100 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Details step ── */}
          {step === 0 && (
            <>
              <Field label="Recipe Name *">
                <Input value={name} onChangeText={t => { setName(t); mark(); }} placeholder="e.g. Classic Choc Chip" />
              </Field>

              <Field label="Category">
                <View style={s.catRow}>
                  {categories.map(cat => (
                    <Pressable key={cat} onPress={() => { setCategory(cat); mark(); }} style={[s.catChip, category === cat && s.catChipActive]}>
                      <Text style={[s.catChipText, category === cat && s.catChipTextActive]}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>

              <Field label="Description">
                <Input value={description} onChangeText={t => { setDescription(t); mark(); }}
                  placeholder="Brief description…" multiline numberOfLines={3}
                  style={{ height: 72, textAlignVertical: 'top' }} />
              </Field>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 2 }}>
                  <Field label="Yield Count">
                    <Input value={yieldCount} onChangeText={t => { setYieldCount(t); mark(); }}
                      keyboardType="number-pad" placeholder="12" />
                  </Field>
                </View>
                <View style={{ flex: 3 }}>
                  <Field label="Yield Unit">
                    <Input value={yieldUnit} onChangeText={t => { setYieldUnit(t); mark(); }} placeholder="cookies" />
                  </Field>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Prep Time (min)">
                    <Input value={prepTime} onChangeText={t => { setPrepTime(t); mark(); }} keyboardType="number-pad" placeholder="15" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Bake Time (min)">
                    <Input value={bakeTime} onChangeText={t => { setBakeTime(t); mark(); }} keyboardType="number-pad" placeholder="12" />
                  </Field>
                </View>
              </View>

              <Field label="Chef Notes">
                <Input value={notes} onChangeText={t => { setNotes(t); mark(); }}
                  placeholder="Tips, variations, allergens…" multiline numberOfLines={4}
                  style={{ height: 90, textAlignVertical: 'top' }} />
              </Field>
            </>
          )}

          {/* ── Ingredients step ── */}
          {step === 1 && (
            <>
              <View style={s.ingHeader}>
                <Text style={s.sectionLabel}>INGREDIENTS ({ingredients.length})</Text>
                <Text style={{ color: MUTED, fontSize: 12 }}>Cost per unit in AUD (e.g. 0.05 = 5¢)</Text>
              </View>

              {ingredients.map((ing, i) => (
                <View key={i} style={s.ingCard}>
                  <View style={s.ingCardHeader}>
                    <View style={s.ingNumBadge}>
                      <Text style={s.ingNumText}>#{i + 1}</Text>
                    </View>
                    <Text style={s.ingCardName} numberOfLines={1}>{ing.name || 'Untitled ingredient'}</Text>
                    <Pressable onPress={() => removeIngredient(i)} style={s.ingDeleteBtn}>
                      <Feather name="trash-2" size={15} color={ERROR} />
                    </Pressable>
                  </View>

                  <Input value={ing.name} onChangeText={t => updateIngredient(i, 'name', t)}
                    placeholder="Ingredient name (e.g. Butter)" style={{ marginBottom: 8 }} />

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.miniLabel}>Quantity</Text>
                      <Input value={ing.quantity} onChangeText={t => updateIngredient(i, 'quantity', t)}
                        placeholder="0" keyboardType="decimal-pad" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.miniLabel}>Unit</Text>
                      <Input value={ing.unit} onChangeText={t => updateIngredient(i, 'unit', t)} placeholder="g" />
                    </View>
                    <View style={{ flex: 1.2 }}>
                      <Text style={s.miniLabel}>Cost/unit (AUD)</Text>
                      <Input value={ing.costCentsPerUnit} onChangeText={t => updateIngredient(i, 'costCentsPerUnit', t)}
                        placeholder="0.00" keyboardType="decimal-pad" />
                    </View>
                  </View>

                  <Input value={ing.supplier} onChangeText={t => updateIngredient(i, 'supplier', t)}
                    placeholder="Supplier (optional)" />

                  {ing.name && ing.quantity && ing.costCentsPerUnit ? (
                    <View style={s.lineTotalRow}>
                      <Text style={s.lineTotalLabel}>Line total</Text>
                      <Text style={s.lineTotalValue}>${(computeLineCost(ing) / 100).toFixed(4)}</Text>
                    </View>
                  ) : null}
                </View>
              ))}

              <Pressable onPress={() => { Haptics.selectionAsync(); addIngredient(); }} style={s.addIngBtn}>
                <Feather name="plus" size={16} color={GOLD} />
                <Text style={s.addIngText}>Add Ingredient</Text>
              </Pressable>

              {totalBatchCostCents > 0 && (
                <View style={s.totalCard}>
                  <Text style={s.totalLabel}>Estimated Batch Cost</Text>
                  <Text style={s.totalValue}>${(totalBatchCostCents / 100).toFixed(2)}</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* ── Sticky save button ── */}
        <View style={[s.stickyFooter, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            onPress={handleSave}
            disabled={loading}
            style={({ pressed }) => [s.stickyBtn, loading && { opacity: 0.6 }, pressed && { opacity: 0.8 }]}
          >
            <Feather name="check" size={18} color="#FFF" />
            <Text style={s.stickyBtnText}>{loading ? 'Saving…' : 'Save Recipe'}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: BORD },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: TEXT },
  saveBtn: { backgroundColor: GREEN, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  error: { color: ERROR, fontSize: 12, textAlign: 'center', marginHorizontal: 16, marginVertical: 4 },

  stepRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORD, marginHorizontal: 16, marginBottom: 4 },
  stepTab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  stepTabActive: { borderBottomWidth: 2, borderBottomColor: GOLD },
  stepText: { fontSize: 14, fontWeight: '500', color: MUTED },
  stepTextActive: { color: GOLD, fontWeight: '600' },

  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: TEXTD, letterSpacing: 0.4 },
  input: {
    backgroundColor: SURFACE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORD,
  },

  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORD },
  catChipActive: { backgroundColor: GOLD_BG, borderColor: GOLD + '66' },
  catChipText: { fontSize: 13, color: MUTED },
  catChipTextActive: { color: GOLD, fontWeight: '600' },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8 },
  ingHeader: { gap: 4 },

  ingCard: { backgroundColor: SURFACE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORD, gap: 0 },
  ingCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  ingNumBadge: { backgroundColor: GOLD_BG, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: GOLD + '44' },
  ingNumText: { fontSize: 11, fontWeight: '700', color: GOLD },
  ingCardName: { flex: 1, fontSize: 13, fontWeight: '500', color: TEXTD },
  ingDeleteBtn: { padding: 6, backgroundColor: ERROR + '10', borderRadius: 8 },

  miniLabel: { fontSize: 11, fontWeight: '600', color: MUTED, marginBottom: 4, letterSpacing: 0.3 },

  lineTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORD },
  lineTotalLabel: { fontSize: 12, color: TEXTD },
  lineTotalValue: { fontSize: 13, fontWeight: '700', color: GOLD },

  addIngBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    borderRadius: 12, borderWidth: 1.5, borderColor: GOLD + '66', borderStyle: 'dashed',
    paddingVertical: 14, backgroundColor: GOLD_BG,
  },
  addIngText: { color: GOLD, fontWeight: '600', fontSize: 14 },

  totalCard: {
    backgroundColor: GOLD_BG, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: GOLD + '44',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { color: TEXTD, fontSize: 14 },
  totalValue: { color: GOLD, fontSize: 22, fontWeight: '800' },

  stickyFooter: {
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORD,
  },
  stickyBtn: {
    backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  stickyBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
