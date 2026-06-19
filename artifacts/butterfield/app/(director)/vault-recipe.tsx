import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
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

const CATEGORY_COLORS: Record<string, string> = {
  cookies: '#C9A84C', coffee: '#92400E', desserts: '#BE185D', sauces: '#065F46', seasonal: '#1D4ED8',
};

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

type Ingredient = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  costCentsPerUnit: number;
  supplier?: string | null;
  notes?: string | null;
  sortOrder: number;
};

type Recipe = {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  yieldCount: number;
  yieldUnit: string;
  prepTimeMin?: number | null;
  bakeTimeMin?: number | null;
  notes?: string | null;
  status: string;
  ingredients: Ingredient[];
};

export default function VaultRecipeScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isUnlocked, vaultToken, resetInactivityTimer } = useVault();
  const queryClient = useQueryClient();
  const [retailPrice, setRetailPrice] = useState('');

  useEffect(() => {
    if (!isUnlocked) router.replace('/(director)/vault-lock' as any);
  }, [isUnlocked]);

  const { data, isLoading } = useQuery({
    queryKey: ['vault-recipe', id],
    queryFn: () => api.vault.recipe(vaultToken!, id),
    enabled: isUnlocked && !!vaultToken && !!id,
    staleTime: 30_000,
  });

  const recipe: Recipe | undefined = data?.data;

  const ingredients: Ingredient[] = recipe?.ingredients ?? [];
  const totalBatchCostCents = ingredients.reduce((sum, ing) => {
    const qty = parseFloat(ing.quantity) || 0;
    return sum + Math.round(qty * ing.costCentsPerUnit);
  }, 0);
  const costPerItem = recipe ? totalBatchCostCents / (recipe.yieldCount || 1) : 0;
  const retailCents = parseFloat(retailPrice) * 100;
  const margin = retailCents > 0 ? ((retailCents - costPerItem) / retailCents) * 100 : null;

  async function handleArchive() {
    if (!recipe) return;
    Alert.alert(
      'Archive Recipe',
      `Archive "${recipe.name}"? It will be hidden from the main list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.vault.archiveRecipe(vaultToken!, recipe.id);
              queryClient.invalidateQueries({ queryKey: ['vault-recipes'] });
              router.back();
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Could not archive recipe');
            }
          },
        },
      ],
    );
  }

  if (!isUnlocked) return null;

  return (
    <View style={[s.container, { paddingTop: insets.top }]} onTouchStart={resetInactivityTimer}>
      <StatusBar barStyle="light-content" backgroundColor={OBSIDIAN} />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="chevron-left" size={22} color={MUTED} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>Recipe Detail</Text>
        {recipe ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => router.push({ pathname: '/(director)/vault-recipe-edit', params: { id: recipe.id } } as any)}
              style={s.iconBtn}
            >
              <Feather name="edit-2" size={16} color={GOLD} />
            </Pressable>
            <Pressable onPress={handleArchive} style={[s.iconBtn, { borderColor: '#EF444444' }]}>
              <Feather name="archive" size={16} color="#EF4444" />
            </Pressable>
          </View>
        ) : null}
      </View>

      {isLoading && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: MUTED }}>Loading…</Text>
        </View>
      )}

      {recipe && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}>
          {/* Recipe metadata */}
          <View style={s.metaCard}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <View style={[s.catBadge, { backgroundColor: (CATEGORY_COLORS[recipe.category] ?? GOLD) + '22', borderColor: (CATEGORY_COLORS[recipe.category] ?? GOLD) + '44', alignSelf: 'flex-start', marginBottom: 8 }]}>
                  <Text style={[s.catBadgeText, { color: CATEGORY_COLORS[recipe.category] ?? GOLD }]}>{recipe.category.toUpperCase()}</Text>
                </View>
                <Text style={s.recipeName}>{recipe.name}</Text>
                {recipe.description ? <Text style={s.recipeDesc}>{recipe.description}</Text> : null}
              </View>
            </View>

            <View style={s.metaGrid}>
              <View style={s.metaItem}>
                <Feather name="layers" size={14} color={GOLD} />
                <Text style={s.metaLabel}>Yield</Text>
                <Text style={s.metaValue}>{recipe.yieldCount} {recipe.yieldUnit}</Text>
              </View>
              {recipe.prepTimeMin ? (
                <View style={s.metaItem}>
                  <Feather name="clock" size={14} color={GOLD} />
                  <Text style={s.metaLabel}>Prep</Text>
                  <Text style={s.metaValue}>{recipe.prepTimeMin} min</Text>
                </View>
              ) : null}
              {recipe.bakeTimeMin ? (
                <View style={s.metaItem}>
                  <Feather name="thermometer" size={14} color={GOLD} />
                  <Text style={s.metaLabel}>Bake</Text>
                  <Text style={s.metaValue}>{recipe.bakeTimeMin} min</Text>
                </View>
              ) : null}
            </View>

            {recipe.notes ? (
              <View style={s.notesBox}>
                <Text style={s.notesText}>{recipe.notes}</Text>
              </View>
            ) : null}
          </View>

          {/* Ingredients table */}
          <View style={s.tableCard}>
            <Text style={s.sectionLabel}>INGREDIENTS</Text>

            {/* Table header */}
            <View style={s.tableHeader}>
              <Text style={[s.colHead, { flex: 3 }]}>Ingredient</Text>
              <Text style={[s.colHead, { flex: 1, textAlign: 'right' }]}>Qty</Text>
              <Text style={[s.colHead, { flex: 1, textAlign: 'center' }]}>Unit</Text>
              <Text style={[s.colHead, { flex: 1.5, textAlign: 'right' }]}>$/unit</Text>
              <Text style={[s.colHead, { flex: 1.5, textAlign: 'right' }]}>Total</Text>
            </View>

            {ingredients.map((ing, i) => {
              const qty = parseFloat(ing.quantity) || 0;
              const lineTotal = Math.round(qty * ing.costCentsPerUnit);
              return (
                <View key={ing.id} style={[s.tableRow, i % 2 === 0 && s.tableRowAlt]}>
                  <Text style={[s.cellText, { flex: 3 }]} numberOfLines={1}>{ing.name}</Text>
                  <Text style={[s.cellText, { flex: 1, textAlign: 'right' }]}>{ing.quantity}</Text>
                  <Text style={[s.cellText, { flex: 1, textAlign: 'center' }]}>{ing.unit}</Text>
                  <Text style={[s.cellText, { flex: 1.5, textAlign: 'right' }]}>{formatCurrency(ing.costCentsPerUnit)}</Text>
                  <Text style={[s.cellText, { flex: 1.5, textAlign: 'right', color: GOLD }]}>{formatCurrency(lineTotal)}</Text>
                </View>
              );
            })}

            {ingredients.length === 0 && (
              <Text style={{ color: MUTED, textAlign: 'center', paddingVertical: 20 }}>No ingredients yet</Text>
            )}
          </View>

          {/* Cost summary */}
          <View style={s.costCard}>
            <Text style={s.sectionLabel}>COST SUMMARY</Text>
            <View style={s.costRow}>
              <Text style={s.costLabel}>Total Batch Cost</Text>
              <Text style={s.costValue}>{formatCurrency(totalBatchCostCents)}</Text>
            </View>
            <View style={[s.costRow, { borderTopWidth: 1, borderTopColor: BORD, paddingTop: 10 }]}>
              <Text style={s.costLabel}>Cost per {recipe.yieldUnit.replace(/s$/, '')}</Text>
              <Text style={[s.costValue, { color: GOLD }]}>{formatCurrency(Math.round(costPerItem))}</Text>
            </View>
          </View>

          {/* Margin calculator */}
          <View style={s.marginCard}>
            <Text style={s.sectionLabel}>MARGIN CALCULATOR</Text>
            <Text style={[s.costLabel, { marginBottom: 8 }]}>Enter retail price per item (AUD)</Text>
            <View style={s.marginInputRow}>
              <Text style={s.dollarSign}>$</Text>
              <TextInput
                style={s.marginInput}
                value={retailPrice}
                onChangeText={setRetailPrice}
                placeholder="0.00"
                placeholderTextColor={MUTED}
                keyboardType="decimal-pad"
              />
            </View>
            {margin !== null && (
              <View style={[s.marginResult, { backgroundColor: margin > 0 ? '#16A34A18' : '#EF444418' }]}>
                <Text style={[s.marginPct, { color: margin > 0 ? '#16A34A' : '#EF4444' }]}>
                  {margin.toFixed(1)}%
                </Text>
                <Text style={s.marginLabel}>margin</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: OBSIDIAN },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  backBtn: { padding: 6 },
  iconBtn: { padding: 8, borderRadius: 10, backgroundColor: SURFACE, borderWidth: 1, borderColor: GOLD + '33' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: TEXT },

  metaCard: { backgroundColor: SURFACE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORD, gap: 12 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  catBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  recipeName: { fontSize: 22, fontWeight: '700', color: TEXT },
  recipeDesc: { fontSize: 14, color: TEXT_DIM, lineHeight: 20, marginTop: 4 },
  metaGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: SURFACE2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  metaLabel: { fontSize: 11, color: MUTED },
  metaValue: { fontSize: 13, fontWeight: '600', color: TEXT },
  notesBox: { backgroundColor: SURFACE2, borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: GOLD },
  notesText: { fontSize: 13, color: TEXT_DIM, lineHeight: 18 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 10 },

  tableCard: { backgroundColor: SURFACE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORD },
  tableHeader: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: BORD, marginBottom: 4 },
  colHead: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.4 },
  tableRow: { flexDirection: 'row', paddingVertical: 8, borderRadius: 6, paddingHorizontal: 4 },
  tableRowAlt: { backgroundColor: SURFACE2 },
  cellText: { fontSize: 12, color: TEXT_DIM },

  costCard: { backgroundColor: SURFACE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORD, gap: 10 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  costLabel: { fontSize: 14, color: TEXT_DIM },
  costValue: { fontSize: 18, fontWeight: '700', color: TEXT },

  marginCard: { backgroundColor: SURFACE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORD, gap: 10 },
  marginInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE2, borderRadius: 10, borderWidth: 1, borderColor: BORD },
  dollarSign: { fontSize: 18, color: GOLD, paddingLeft: 12, fontWeight: '600' },
  marginInput: { flex: 1, fontSize: 18, color: TEXT, padding: 12, fontWeight: '600' },
  marginResult: { borderRadius: 12, padding: 16, alignItems: 'center', gap: 4 },
  marginPct: { fontSize: 32, fontWeight: '800' },
  marginLabel: { fontSize: 13, color: TEXT_DIM },
});
