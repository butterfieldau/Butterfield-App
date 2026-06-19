import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

const OBSIDIAN = '#0A0A0A';
const GOLD     = '#C9A84C';
const MUTED    = '#888888';
const TEXT     = '#F5F5F5';
const TEXT_DIM = '#AAAAAA';
const SURFACE  = '#1A1A1A';
const SURFACE2 = '#242424';
const BORD     = '#2A2A2A';
const GREEN    = '#16A34A';
const ERROR    = '#EF4444';

const CATEGORIES = ['cookies', 'coffee', 'desserts', 'sauces', 'seasonal'];

type IngredientRow = {
  id?: string;
  name: string;
  quantity: string;
  unit: string;
  costCentsPerUnit: string;
  supplier: string;
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
    <TextInput
      {...props}
      style={[s.input, props.style]}
      placeholderTextColor={MUTED}
    />
  );
}

export default function VaultRecipeEditScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const { isUnlocked, vaultToken, resetInactivityTimer } = useVault();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('cookies');
  const [description, setDescription] = useState('');
  const [yieldCount, setYieldCount] = useState('12');
  const [yieldUnit, setYieldUnit] = useState('cookies');
  const [prepTime, setPrepTime] = useState('');
  const [bakeTime, setBakeTime] = useState('');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([emptyIngredient()]);
  const [deletedIngredientIds, setDeletedIngredientIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isUnlocked) router.replace('/(director)/vault-lock' as any);
  }, [isUnlocked]);

  const { data: existingData } = useQuery({
    queryKey: ['vault-recipe', id],
    queryFn: () => api.vault.recipe(vaultToken!, id!),
    enabled: isEdit && isUnlocked && !!vaultToken,
    staleTime: 30_000,
  });

  useEffect(() => {
    const recipe = existingData?.data;
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
        id: ing.id,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        costCentsPerUnit: String(ing.costCentsPerUnit / 100),
        supplier: ing.supplier ?? '',
      })));
    }
  }, [existingData]);

  function mark() { setDirty(true); resetInactivityTimer(); }

  function addIngredient() { mark(); setIngredients(prev => [...prev, emptyIngredient()]); }
  function removeIngredient(i: number) {
    mark();
    setIngredients(prev => {
      const ing = prev[i];
      // Track server-persisted ingredients that get removed so we can delete them on save
      if (ing?.id) {
        setDeletedIngredientIds(ids => [...ids, ing.id!]);
      }
      return prev.filter((_, idx) => idx !== i);
    });
  }
  function updateIngredient(i: number, field: keyof IngredientRow, val: string) {
    mark();
    setIngredients(prev => prev.map((ing, idx) => idx === i ? { ...ing, [field]: val } : ing));
  }

  function computeLineCost(ing: IngredientRow) {
    const qty = parseFloat(ing.quantity) || 0;
    const cost = parseFloat(ing.costCentsPerUnit) || 0;
    return qty * cost * 100;
  }

  const totalBatchCostCents = ingredients.reduce((sum, ing) => sum + computeLineCost(ing), 0);

  function handleBack() {
    if (dirty) {
      Alert.alert('Discard Changes', 'Discard unsaved changes?', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  }

  async function handleSave() {
    if (!name.trim()) { setError('Recipe name is required'); return; }
    setLoading(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        category,
        description: description || null,
        yieldCount: parseInt(yieldCount) || 1,
        yieldUnit,
        prepTimeMin: prepTime ? parseInt(prepTime) : null,
        bakeTimeMin: bakeTime ? parseInt(bakeTime) : null,
        notes: notes || null,
        ingredients: ingredients
          .filter(i => i.name.trim())
          .map((ing, idx) => ({
            id: ing.id,
            name: ing.name.trim(),
            quantity: ing.quantity || '0',
            unit: ing.unit,
            costCentsPerUnit: Math.round((parseFloat(ing.costCentsPerUnit) || 0) * 100),
            supplier: ing.supplier || null,
            sortOrder: idx,
          })),
      };

      if (isEdit) {
        await api.vault.updateRecipe(vaultToken!, id!, payload);
        // Delete any ingredients that were removed in the edit session
        for (const deletedId of deletedIngredientIds) {
          await api.vault.deleteIngredient(vaultToken!, deletedId);
        }
        // Create or update remaining ingredients
        for (const ing of payload.ingredients) {
          if (ing.id) {
            await api.vault.updateIngredient(vaultToken!, ing.id, ing);
          } else {
            await api.vault.addIngredient(vaultToken!, id!, ing);
          }
        }
      } else {
        await api.vault.createRecipe(vaultToken!, payload);
      }

      queryClient.invalidateQueries({ queryKey: ['vault-recipes'] });
      queryClient.invalidateQueries({ queryKey: ['vault-recipe', id] });
      router.back();
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  if (!isUnlocked) return null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={OBSIDIAN} />

        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={handleBack} style={s.backBtn}>
            <Feather name="x" size={20} color={MUTED} />
          </Pressable>
          <Text style={s.headerTitle}>{isEdit ? 'Edit Recipe' : 'New Recipe'}</Text>
          <Pressable
            onPress={handleSave}
            disabled={loading}
            style={[s.saveBtn, loading && { opacity: 0.6 }]}
          >
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

        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}>

          {step === 0 && (
            <>
              <Field label="Recipe Name *">
                <Input
                  value={name}
                  onChangeText={t => { setName(t); mark(); }}
                  placeholder="e.g. Classic Choc Chip"
                />
              </Field>

              <Field label="Category">
                <View style={s.catRow}>
                  {CATEGORIES.map(cat => (
                    <Pressable
                      key={cat}
                      onPress={() => { setCategory(cat); mark(); }}
                      style={[s.catChip, category === cat && s.catChipActive]}
                    >
                      <Text style={[s.catChipText, category === cat && s.catChipTextActive]}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>

              <Field label="Description">
                <Input
                  value={description}
                  onChangeText={t => { setDescription(t); mark(); }}
                  placeholder="Brief description…"
                  multiline
                  numberOfLines={3}
                  style={{ height: 72, textAlignVertical: 'top' }}
                />
              </Field>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 2 }}>
                  <Field label="Yield Count">
                    <Input
                      value={yieldCount}
                      onChangeText={t => { setYieldCount(t); mark(); }}
                      keyboardType="number-pad"
                      placeholder="12"
                    />
                  </Field>
                </View>
                <View style={{ flex: 3 }}>
                  <Field label="Yield Unit">
                    <Input
                      value={yieldUnit}
                      onChangeText={t => { setYieldUnit(t); mark(); }}
                      placeholder="cookies"
                    />
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

              <Field label="Notes">
                <Input
                  value={notes}
                  onChangeText={t => { setNotes(t); mark(); }}
                  placeholder="Chef notes, tips, variations…"
                  multiline
                  numberOfLines={4}
                  style={{ height: 90, textAlignVertical: 'top' }}
                />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Text style={s.sectionLabel}>INGREDIENTS ({ingredients.length})</Text>
              <Text style={{ color: MUTED, fontSize: 12, marginBottom: 4 }}>Enter cost per unit in AUD (e.g. 0.05 for 5¢)</Text>

              {ingredients.map((ing, i) => (
                <View key={i} style={s.ingCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ color: GOLD, fontSize: 12, fontWeight: '600' }}>#{i + 1}</Text>
                    <Pressable onPress={() => removeIngredient(i)}>
                      <Feather name="trash-2" size={16} color={ERROR} />
                    </Pressable>
                  </View>

                  <Input
                    value={ing.name}
                    onChangeText={t => updateIngredient(i, 'name', t)}
                    placeholder="Ingredient name (e.g. Butter)"
                    style={{ marginBottom: 8 }}
                  />

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                    <Input
                      value={ing.quantity}
                      onChangeText={t => updateIngredient(i, 'quantity', t)}
                      placeholder="Qty"
                      keyboardType="decimal-pad"
                      style={{ flex: 1 }}
                    />
                    <Input
                      value={ing.unit}
                      onChangeText={t => updateIngredient(i, 'unit', t)}
                      placeholder="Unit"
                      style={{ flex: 1 }}
                    />
                    <Input
                      value={ing.costCentsPerUnit}
                      onChangeText={t => updateIngredient(i, 'costCentsPerUnit', t)}
                      placeholder="$/unit"
                      keyboardType="decimal-pad"
                      style={{ flex: 1.2 }}
                    />
                  </View>

                  <Input
                    value={ing.supplier}
                    onChangeText={t => updateIngredient(i, 'supplier', t)}
                    placeholder="Supplier (optional)"
                  />

                  {ing.name && ing.quantity && ing.costCentsPerUnit ? (
                    <Text style={{ color: GOLD, fontSize: 12, marginTop: 8 }}>
                      Line total: ${(computeLineCost(ing) / 100).toFixed(4)}
                    </Text>
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
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: OBSIDIAN },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: TEXT },
  saveBtn: { backgroundColor: GREEN, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  error: { color: ERROR, fontSize: 12, textAlign: 'center', marginHorizontal: 16, marginBottom: 4 },

  stepRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORD, marginHorizontal: 16, marginBottom: 4 },
  stepTab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  stepTabActive: { borderBottomWidth: 2, borderBottomColor: GOLD },
  stepText: { fontSize: 14, fontWeight: '500', color: MUTED },
  stepTextActive: { color: GOLD },

  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: MUTED, letterSpacing: 0.4 },
  input: {
    backgroundColor: SURFACE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    color: TEXT, fontSize: 14, borderWidth: 1, borderColor: BORD,
  },

  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORD },
  catChipActive: { backgroundColor: GOLD + '20', borderColor: GOLD + '60' },
  catChipText: { fontSize: 13, color: MUTED },
  catChipTextActive: { color: GOLD, fontWeight: '600' },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8 },

  ingCard: { backgroundColor: SURFACE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORD },
  addIngBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    borderRadius: 12, borderWidth: 1.5, borderColor: GOLD + '44', borderStyle: 'dashed',
    paddingVertical: 14, backgroundColor: GOLD + '08',
  },
  addIngText: { color: GOLD, fontWeight: '600', fontSize: 14 },

  totalCard: {
    backgroundColor: GOLD + '18', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: GOLD + '33',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { color: TEXT_DIM, fontSize: 14 },
  totalValue: { color: GOLD, fontSize: 22, fontWeight: '800' },
});
