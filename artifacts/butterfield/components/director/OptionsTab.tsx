import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import {
  Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';

const CAT_COLORS: Record<string, string> = {
  cookies: '#F59E0B', coffee: '#8B5CF6', tea: '#22C55E', matcha: '#16A34A',
  desserts: '#EC4899', bundles: '#1493FF', sandwiches: '#22C55E', merch: '#6B7280',
  pastries: '#F97316', drinks: '#06B6D4', 'iced-drinks': '#06B6D4',
  boxes: '#F59E0B', seasonal: '#F97316', specials: '#EF4444', other: '#8E8E93',
};

const modal = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 },
  closeBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  title:       { flex: 1, fontSize: 17, textAlign: 'center' },
  saveBtn:     { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12 },
  saveBtnText: { color: '#fff', fontSize: 14 },
});

const form = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon:   { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  sectionTitle:  { fontSize: 15 },
  fieldWrap:     { gap: 6 },
  label:         { fontSize: 12 },
  input:         { backgroundColor: BG, borderRadius: 10, paddingHorizontal: 14, paddingTop: 12, borderWidth: 1, borderColor: BORDER, fontSize: 14 },
  row2:          { flexDirection: 'row', gap: 10 },
  toggleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: BORDER },
  toggleLabel:   { fontSize: 14 },
  toggleDesc:    { fontSize: 12, marginTop: 2 },
  tagGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  uploadArea:    { height: 160, borderRadius: 14, backgroundColor: BLUE + '08', borderWidth: 1.5, borderColor: BLUE + '40', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
});

const seg = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: BG, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: BORDER, flexWrap: 'wrap', gap: 3 },
  btn:  { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  text: { fontSize: 12, color: MUTED },
});

const chip = StyleSheet.create({
  base: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  text: { fontSize: 12 },
});

function TagChip({ label, active, color, onPress }: { label: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[chip.base, { backgroundColor: active ? color : CARD, borderColor: active ? color : BORDER }]}>
      <Text style={[chip.text, { fontWeight: '500', color: active ? '#fff' : MUTED }]}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ title, icon, color }: { title: string; icon: string; color: string }) {
  return (
    <View style={form.sectionHeader}>
      <View style={[form.sectionIcon, { backgroundColor: color + '33', borderColor: color + '55' }]}>
        <Feather name={icon as any} size={14} color={color} />
      </View>
      <Text style={[form.sectionTitle, { fontWeight: '700', color: TEXT }]}>{title}</Text>
    </View>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <View style={form.fieldWrap}>
      <Text style={[form.label, { fontWeight: '500', color: MUTED }]}>{label}{required && <Text style={{ color: RED }}> *</Text>}</Text>
      {children}
    </View>
  );
}

function TextF({ value, onChange, placeholder, numeric, multiline, lines }: {
  value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; multiline?: boolean; lines?: number;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={MUTED}
      keyboardType={numeric ? 'decimal-pad' : 'default'}
      multiline={multiline}
      numberOfLines={lines ?? 1}
      style={[form.input, { fontWeight: '400', color: TEXT, height: multiline ? (lines ?? 3) * 22 + 20 : 46, textAlignVertical: multiline ? 'top' : 'center' }]}
    />
  );
}

function Toggle({ label, value, onChange, color, desc }: { label: string; value: boolean; onChange: (v: boolean) => void; color?: string; desc?: string }) {
  return (
    <View style={form.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[form.toggleLabel, { fontWeight: '500', color: TEXT }]}>{label}</Text>
        {desc ? <Text style={[form.toggleDesc, { fontWeight: '400', color: MUTED }]}>{desc}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange}
        trackColor={{ false: BORDER, true: color ?? BLUE }} thumbColor="#fff" ios_backgroundColor="transparent" />
    </View>
  );
}

function Segment({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={seg.wrap}>
      {options.map(opt => (
        <Pressable key={opt} onPress={() => onChange(opt)} style={[seg.btn, value === opt && { backgroundColor: '#000' }]}>
          <Text style={[seg.text, { fontWeight: '500' }, value === opt && { color: '#fff' }]}>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function DragHandle() {
  return (
    <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4, backgroundColor: CARD }}>
      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER }} />
    </View>
  );
}

export function OptionsTab() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const SEL_COLORS: Record<string, string> = { single: BLUE, multi: PURPLE, text: GREEN };
  const SEL_ICONS: Record<string, string>  = { single: 'check-circle', multi: 'list', text: 'message-square' };

  const [groupModal, setGroupModal]   = useState(false);
  const [editGroup, setEditGroup]     = useState<any>(null);
  const [gName, setGName]             = useState('');
  const [gType, setGType]             = useState<'single' | 'multi' | 'text'>('single');
  const [gRequired, setGRequired]     = useState(false);
  const [gCatIds, setGCatIds]         = useState<string[]>([]);
  const [gProductIds, setGProductIds] = useState<string[]>([]);
  const [gProductSearch, setGProductSearch] = useState('');
  const [gExcludeProductIds, setGExcludeProductIds] = useState<string[]>([]);
  const [gExcludeProductSearch, setGExcludeProductSearch] = useState('');
  const [gSaving, setGSaving]         = useState(false);

  const [optModal, setOptModal]       = useState(false);
  const [editOpt, setEditOpt]         = useState<any>(null);
  const [optGroupId, setOptGroupId]   = useState('');
  const [oName, setOName]             = useState('');
  const [oPrice, setOPrice]           = useState('');
  const [oDefault, setODefault]       = useState(false);
  const [oSaving, setOSaving]         = useState(false);

  const { data } = useQuery({
    queryKey: ['director-option-groups'],
    queryFn:  () => api.director.optionGroups(),
  });
  const groups: any[] = (data as any)?.data ?? [];

  const { data: catData } = useQuery({
    queryKey: ['director-categories'],
    queryFn:  () => api.director.categories(),
  });
  const categories: any[] = (catData as any)?.data ?? [];

  const { data: prodData } = useQuery({
    queryKey: ['director-products'],
    queryFn:  () => api.director.products(),
  });
  const allProducts: any[] = useMemo(
    () => ((prodData as any)?.data ?? []).filter((p: any) => p.isActive !== false),
    [prodData],
  );

  const toggleExpand = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const moveGroup = async (index: number, dir: -1 | 1) => {
    const other = groups[index + dir];
    const current = groups[index];
    if (!other || !current) return;
    Haptics.selectionAsync();
    try {
      // Normalize: assign sequential sortOrders if any two groups share the same value
      const orderVals = groups.map(g => g.sortOrder);
      const hasCollision = orderVals.length > new Set(orderVals).size;
      const normalized = hasCollision
        ? groups.map((g, i) => ({ ...g, sortOrder: (i + 1) * 10 }))
        : groups;
      const aOrder = normalized[index].sortOrder;
      const bOrder = normalized[index + dir].sortOrder;
      await Promise.all([
        api.director.updateOptionGroup(current.id, { sortOrder: bOrder }),
        api.director.updateOptionGroup(other.id, { sortOrder: aOrder }),
        // If we normalized, persist all other changed orders too
        ...(hasCollision ? normalized
          .filter((_, i) => i !== index && i !== index + dir)
          .map(g => api.director.updateOptionGroup(g.id, { sortOrder: g.sortOrder }))
          : []),
      ]);
      await qc.invalidateQueries({ queryKey: ['director-option-groups'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const moveOption = async (groupId: string, options: any[], index: number, dir: -1 | 1) => {
    const other = options[index + dir];
    const current = options[index];
    if (!other || !current) return;
    Haptics.selectionAsync();
    try {
      // Normalize: assign sequential sortOrders if any two options share the same value
      const orderVals = options.map(o => o.sortOrder);
      const hasCollision = orderVals.length > new Set(orderVals).size;
      const normalized = hasCollision
        ? options.map((o, i) => ({ ...o, sortOrder: (i + 1) * 10 }))
        : options;
      const aOrder = normalized[index].sortOrder;
      const bOrder = normalized[index + dir].sortOrder;
      await Promise.all([
        api.director.updateOption(groupId, current.id, { sortOrder: bOrder }),
        api.director.updateOption(groupId, other.id, { sortOrder: aOrder }),
        // If we normalized, persist all other changed orders too
        ...(hasCollision ? normalized
          .filter((_, i) => i !== index && i !== index + dir)
          .map(o => api.director.updateOption(groupId, o.id, { sortOrder: o.sortOrder }))
          : []),
      ]);
      await qc.invalidateQueries({ queryKey: ['director-option-groups'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const openAddGroup = () => {
    setEditGroup(null); setGName(''); setGType('single'); setGRequired(false);
    setGCatIds([]); setGProductIds([]); setGProductSearch('');
    setGExcludeProductIds([]); setGExcludeProductSearch('');
    setGroupModal(true);
  };
  const openEditGroup = (g: any) => {
    setEditGroup(g); setGName(g.name); setGType(g.selectionType);
    setGRequired(g.isRequired ?? false); setGCatIds(g.appliesToCategoryIds ?? []);
    setGProductIds(g.appliesToProductIds ?? []); setGProductSearch('');
    setGExcludeProductIds(g.excludeProductIds ?? []); setGExcludeProductSearch('');
    setGroupModal(true);
  };
  const saveGroup = async () => {
    if (!gName.trim()) return Alert.alert('Name required');
    const overlap = gProductIds.filter(id => gExcludeProductIds.includes(id));
    if (overlap.length > 0) {
      const names = overlap.map(id => allProducts.find(p => p.id === id)?.name ?? id).join(', ');
      return Alert.alert('Conflicting products', `The following products are in both the include and exclude lists. Please remove them from one list before saving.\n\n${names}`);
    }
    setGSaving(true);
    try {
      const payload = {
        name: gName.trim(), selectionType: gType, isRequired: gRequired,
        appliesToCategoryIds: gCatIds, appliesToProductIds: gProductIds,
        excludeProductIds: gExcludeProductIds,
      };
      if (editGroup) { await api.director.updateOptionGroup(editGroup.id, payload); }
      else           { await api.director.createOptionGroup(payload); }
      await qc.invalidateQueries({ queryKey: ['director-option-groups'] });
      setGroupModal(false);
    } finally { setGSaving(false); }
  };
  const deleteGroup = (g: any) => {
    Alert.alert('Delete Group', `Delete "${g.name}" and all its options?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.director.deleteOptionGroup(g.id);
          await qc.invalidateQueries({ queryKey: ['director-option-groups'] });
        } catch (e: any) { Alert.alert('Error', (e as any).message); }
      }},
    ]);
  };
  const toggleGroupActive = async (g: any) => {
    try {
      await api.director.updateOptionGroup(g.id, { isActive: !g.isActive });
      await qc.invalidateQueries({ queryKey: ['director-option-groups'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const openAddOpt = (groupId: string) => {
    setOptGroupId(groupId); setEditOpt(null); setOName(''); setOPrice(''); setODefault(false);
    setOptModal(true);
  };
  const openEditOpt = (groupId: string, opt: any) => {
    setOptGroupId(groupId); setEditOpt(opt); setOName(opt.name);
    setOPrice(opt.priceAdjustmentCents ? (Math.abs(opt.priceAdjustmentCents) / 100).toFixed(2) : '');
    setODefault(opt.isDefault ?? false);
    setOptModal(true);
  };
  const saveOpt = async () => {
    if (!oName.trim()) return Alert.alert('Name required');
    setOSaving(true);
    try {
      const adj     = oPrice ? Math.round(parseFloat(oPrice) * 100) : 0;
      const payload = { name: oName.trim(), priceAdjustmentCents: adj, isDefault: oDefault };
      if (editOpt) { await api.director.updateOption(optGroupId, editOpt.id, payload); }
      else         { await api.director.createOption(optGroupId, payload); }
      await qc.invalidateQueries({ queryKey: ['director-option-groups'] });
      setOptModal(false);
    } finally { setOSaving(false); }
  };
  const deleteOpt = (groupId: string, opt: any) => {
    Alert.alert('Delete Option', `Delete "${opt.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.director.deleteOption(groupId, opt.id);
          await qc.invalidateQueries({ queryKey: ['director-option-groups'] });
        } catch (e: any) { Alert.alert('Error', (e as any).message); }
      }},
    ]);
  };

  const filteredProducts = useMemo(
    () => gProductSearch.trim()
      ? allProducts.filter(p => p.name.toLowerCase().includes(gProductSearch.toLowerCase()))
      : allProducts,
    [allProducts, gProductSearch],
  );
  const filteredExcludeProducts = useMemo(
    () => gExcludeProductSearch.trim()
      ? allProducts.filter(p => p.name.toLowerCase().includes(gExcludeProductSearch.toLowerCase()))
      : allProducts,
    [allProducts, gExcludeProductSearch],
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={groups}
        keyExtractor={g => g.id}
        ListEmptyComponent={<Text style={{ color: MUTED, textAlign: 'center', marginTop: 60, fontWeight: '400' }}>No option groups yet. Tap Add Group below.</Text>}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
        ListFooterComponent={
          <Pressable
            onPress={() => { Haptics.selectionAsync(); openAddGroup(); }}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              borderRadius: 18, borderWidth: 1.5, borderColor: BLUE + '66', borderStyle: 'dashed',
              paddingVertical: 18, paddingHorizontal: 16, marginTop: 4,
              backgroundColor: BLUE + '08', opacity: pressed ? 0.75 : 1,
            })}
          >
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="plus" size={18} color={BLUE} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: BLUE }}>Add Group</Text>
          </Pressable>
        }
        renderItem={({ item: g, index: gIndex }) => {
          const isExp          = expanded[g.id] ?? false;
          const selCol         = SEL_COLORS[g.selectionType] ?? BLUE;
          const selIcon        = SEL_ICONS[g.selectionType] ?? 'check-circle';
          const activeOpts     = (g.options ?? []).filter((o: any) => o.isActive !== false);
          const typeLabel      = g.selectionType === 'single' ? 'Single Select' : g.selectionType === 'multi' ? 'Multi Select' : 'Free Text';
          const linkedCatNames = categories.filter(c => (g.appliesToCategoryIds ?? []).includes(c.id)).map(c => c.name);
          const linkedProdNames = allProducts.filter(p => (g.appliesToProductIds ?? []).includes(p.id)).map(p => p.name);
          const scopeLabel = (() => {
            const parts: string[] = [];
            if (linkedCatNames.length)  parts.push(linkedCatNames.join(', '));
            if (linkedProdNames.length) parts.push(`${linkedProdNames.length} product${linkedProdNames.length !== 1 ? 's' : ''}`);
            return parts.length ? parts.join(' + ') : 'All products';
          })();

          return (
            <View style={{ backgroundColor: CARD, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, overflow: 'hidden' }}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); openEditGroup(g); }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingVertical: 16, paddingHorizontal: 16, opacity: pressed ? 0.8 : 1,
                })}
              >
                {/* Reorder arrows for group */}
                <View style={{ gap: 2 }}>
                  <Pressable onPress={() => moveGroup(gIndex, -1)} hitSlop={4}
                    style={{ padding: 3, opacity: gIndex === 0 ? 0.2 : 1 }} disabled={gIndex === 0}>
                    <Feather name="chevron-up" size={16} color={MUTED} />
                  </Pressable>
                  <Pressable onPress={() => moveGroup(gIndex, 1)} hitSlop={4}
                    style={{ padding: 3, opacity: gIndex === groups.length - 1 ? 0.2 : 1 }} disabled={gIndex === groups.length - 1}>
                    <Feather name="chevron-down" size={16} color={MUTED} />
                  </Pressable>
                </View>
                <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, backgroundColor: selCol + '33', borderColor: selCol + '55', flexShrink: 0 }}>
                  <Feather name={selIcon as any} size={22} color={selCol} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>{g.name}</Text>
                  <Text style={{ fontSize: 12, color: MUTED }} numberOfLines={1}>{scopeLabel}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: selCol + '18' }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: selCol }}>{typeLabel}</Text>
                    </View>
                    {g.selectionType !== 'text' && (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: MUTED + '18' }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: MUTED }}>{activeOpts.length} option{activeOpts.length !== 1 ? 's' : ''}</Text>
                      </View>
                    )}
                    {g.isRequired && (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: AMBER + '22' }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: AMBER }}>Required</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Switch value={g.isActive ?? true} onValueChange={() => toggleGroupActive(g)}
                    trackColor={{ false: BORDER, true: GREEN }} thumbColor="#fff" ios_backgroundColor={BORDER} />
                  <Pressable onPress={() => deleteGroup(g)} style={{ padding: 8 }} hitSlop={4}>
                    <Feather name="trash-2" size={15} color={RED} />
                  </Pressable>
                  {g.selectionType !== 'text' && (
                    <Pressable onPress={() => { Haptics.selectionAsync(); toggleExpand(g.id); }} style={{ padding: 8 }} hitSlop={4}>
                      <Feather name={isExp ? 'chevron-up' : 'chevron-down'} size={18} color={MUTED} />
                    </Pressable>
                  )}
                  {g.selectionType === 'text' && (
                    <Feather name="chevron-right" size={18} color={MUTED} style={{ marginLeft: 4 }} />
                  )}
                </View>
              </Pressable>

              {isExp && g.selectionType !== 'text' && (
                <View style={{ borderTopWidth: 1, borderTopColor: BORDER, padding: 12, gap: 8 }}>
                  {(g.options ?? []).map((opt: any, oIndex: number) => (
                    <View key={opt.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: opt.isDefault ? '#F0FFF4' : BG, borderRadius: 10, borderWidth: 1, borderColor: opt.isDefault ? '#86EFAC' : BORDER }}>
                      {/* Reorder arrows for option */}
                      <View style={{ gap: 1 }}>
                        <Pressable onPress={() => moveOption(g.id, g.options, oIndex, -1)} hitSlop={4}
                          style={{ padding: 2, opacity: oIndex === 0 ? 0.2 : 1 }} disabled={oIndex === 0}>
                          <Feather name="chevron-up" size={13} color={MUTED} />
                        </Pressable>
                        <Pressable onPress={() => moveOption(g.id, g.options, oIndex, 1)} hitSlop={4}
                          style={{ padding: 2, opacity: oIndex === (g.options ?? []).length - 1 ? 0.2 : 1 }} disabled={oIndex === (g.options ?? []).length - 1}>
                          <Feather name="chevron-down" size={13} color={MUTED} />
                        </Pressable>
                      </View>
                      {opt.isDefault && <Feather name="check-circle" size={13} color={GREEN} />}
                      <Text style={{ flex: 1, fontWeight: '500', color: TEXT, fontSize: 13 }}>{opt.name}</Text>
                      {opt.priceAdjustmentCents !== 0 ? (
                        <Text style={{ fontWeight: '700', color: opt.priceAdjustmentCents > 0 ? GREEN : RED, fontSize: 13 }}>
                          {opt.priceAdjustmentCents > 0 ? '+' : '-'}${(Math.abs(opt.priceAdjustmentCents) / 100).toFixed(2)}
                        </Text>
                      ) : (
                        <Text style={{ fontWeight: '400', color: MUTED, fontSize: 12 }}>Free</Text>
                      )}
                      <Pressable onPress={() => openEditOpt(g.id, opt)} style={{ padding: 5 }} hitSlop={4}>
                        <Feather name="edit-2" size={13} color={BLUE} />
                      </Pressable>
                      <Pressable onPress={() => deleteOpt(g.id, opt)} style={{ padding: 5 }} hitSlop={4}>
                        <Feather name="trash-2" size={13} color={RED} />
                      </Pressable>
                    </View>
                  ))}
                  {(g.options ?? []).length === 0 && (
                    <Text style={{ color: MUTED, fontWeight: '400', fontSize: 13, fontStyle: 'italic' }}>No options yet — tap Add Option below.</Text>
                  )}
                  <Pressable onPress={() => openAddOpt(g.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: BLUE, borderStyle: 'dashed', backgroundColor: BLUE + '08', marginTop: 2 }}>
                    <Feather name="plus" size={14} color={BLUE} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>Add Option</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* ── Group Modal ──────────────────────────────────────────────────────── */}
      <Modal visible={groupModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setGroupModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: CARD }}>
          <DragHandle />
          <View style={[modal.header, { paddingTop: 8 }]}>
            <Pressable onPress={() => setGroupModal(false)} style={modal.closeBtn}><Feather name="x" size={18} color={TEXT} /></Pressable>
            <Text style={[modal.title, { fontWeight: '700' }]}>{editGroup ? 'Edit Option Group' : 'New Option Group'}</Text>
            <Pressable onPress={saveGroup} style={[modal.saveBtn, { backgroundColor: gSaving ? MUTED : BLUE }]} disabled={gSaving}>
              <Text style={[modal.saveBtnText, { fontWeight: '700' }]}>{gSaving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}>
            <SectionHeader title="Group Settings" icon="sliders" color={BLUE} />
            <Field label="Group Name" required>
              <TextInput value={gName} onChangeText={setGName} placeholder="e.g. Milk Type, Size, Extras"
                placeholderTextColor={MUTED} style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]} />
            </Field>
            <Field label="Selection Type">
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                {(['single', 'multi', 'text'] as const).map(t => (
                  <Pressable key={t} onPress={() => setGType(t)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: gType === t ? SEL_COLORS[t] : BORDER, backgroundColor: gType === t ? SEL_COLORS[t] + '12' : CARD, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: gType === t ? SEL_COLORS[t] : MUTED }}>
                      {t === 'single' ? 'Single' : t === 'multi' ? 'Multiple' : 'Text Note'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Field>
            <View style={form.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[form.toggleLabel, { fontWeight: '500', color: TEXT }]}>Required</Text>
                <Text style={[form.toggleDesc, { fontWeight: '400', color: MUTED }]}>Customer must select before adding to cart</Text>
              </View>
              <Switch value={gRequired} onValueChange={setGRequired} trackColor={{ false: BORDER, true: AMBER }} thumbColor="#fff" />
            </View>

            {categories.length > 0 && (
              <>
                <View style={{ height: 1, backgroundColor: BORDER }} />
                <SectionHeader title="Applies To Categories" icon="grid" color={BLUE} />
                <Text style={[form.label, { fontWeight: '400', color: MUTED }]}>
                  Option appears for every product in these categories.
                </Text>
                <View style={form.tagGrid}>
                  {categories.map(c => (
                    <TagChip key={c.id} label={c.name} active={gCatIds.includes(c.id)}
                      color={CAT_COLORS[c.slug] ?? BLUE}
                      onPress={() => setGCatIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])} />
                  ))}
                </View>
              </>
            )}

            {allProducts.length > 0 && (
              <>
                <View style={{ height: 1, backgroundColor: BORDER }} />
                <SectionHeader title="Applies To Specific Products" icon="package" color={PURPLE} />
                <Text style={[form.label, { fontWeight: '400', color: MUTED }]}>
                  Option only appears on these individual products, regardless of category.
                </Text>
                {gProductIds.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {gProductIds.map(pid => {
                      const prod = allProducts.find(p => p.id === pid);
                      return (
                        <Pressable key={pid} onPress={() => setGProductIds(prev => prev.filter(id => id !== pid))}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: PURPLE + '18', borderWidth: 1, borderColor: PURPLE + '33' }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: PURPLE }}>{prod?.name ?? pid}</Text>
                          <Feather name="x" size={12} color={PURPLE} />
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                <View style={[form.input, { padding: 0, overflow: 'hidden', height: 46 }]}>
                  <TextInput value={gProductSearch} onChangeText={setGProductSearch}
                    placeholder="Search products to include…" placeholderTextColor={MUTED}
                    style={{ flex: 1, paddingHorizontal: 14, height: 46, fontWeight: '400', color: TEXT, fontSize: 14 }} />
                </View>
                {gProductSearch.trim().length > 0 && (
                  <View style={{ borderRadius: 12, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', backgroundColor: CARD }}>
                    {filteredProducts.slice(0, 8).map(p => (
                      <Pressable key={p.id}
                        onPress={() => { setGProductIds(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]); setGProductSearch(''); Haptics.selectionAsync(); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, backgroundColor: gProductIds.includes(p.id) ? PURPLE + '08' : CARD }}>
                        {gProductIds.includes(p.id) && <Feather name="check" size={13} color={PURPLE} />}
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: TEXT }}>{p.name}</Text>
                        <Text style={{ fontSize: 12, color: MUTED }}>{p.category}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            {allProducts.length > 0 && (
              <>
                <View style={{ height: 1, backgroundColor: BORDER }} />
                <SectionHeader title="Exclude Specific Products" icon="minus-circle" color={RED} />
                <Text style={[form.label, { fontWeight: '400', color: MUTED }]}>
                  Option will NOT appear on these products, even if their category is included above.
                </Text>
                {gExcludeProductIds.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {gExcludeProductIds.map(pid => {
                      const prod = allProducts.find(p => p.id === pid);
                      return (
                        <Pressable key={pid} onPress={() => setGExcludeProductIds(prev => prev.filter(id => id !== pid))}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: RED + '12', borderWidth: 1, borderColor: RED + '25' }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: RED }}>{prod?.name ?? pid}</Text>
                          <Feather name="x" size={12} color={RED} />
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                <View style={[form.input, { padding: 0, overflow: 'hidden', height: 46 }]}>
                  <TextInput value={gExcludeProductSearch} onChangeText={setGExcludeProductSearch}
                    placeholder="Search products to exclude…" placeholderTextColor={MUTED}
                    style={{ flex: 1, paddingHorizontal: 14, height: 46, fontWeight: '400', color: TEXT, fontSize: 14 }} />
                </View>
                {gExcludeProductSearch.trim().length > 0 && (
                  <View style={{ borderRadius: 12, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', backgroundColor: CARD }}>
                    {filteredExcludeProducts.slice(0, 8).map(p => (
                      <Pressable key={p.id}
                        onPress={() => { setGExcludeProductIds(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]); setGExcludeProductSearch(''); Haptics.selectionAsync(); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, backgroundColor: gExcludeProductIds.includes(p.id) ? RED + '08' : CARD }}>
                        {gExcludeProductIds.includes(p.id) && <Feather name="check" size={13} color={RED} />}
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: TEXT }}>{p.name}</Text>
                        <Text style={{ fontSize: 12, color: MUTED }}>{p.category}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Option Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={optModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOptModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: CARD }}>
          <DragHandle />
          <View style={[modal.header, { paddingTop: 8 }]}>
            <Pressable onPress={() => setOptModal(false)} style={modal.closeBtn}><Feather name="x" size={18} color={TEXT} /></Pressable>
            <Text style={[modal.title, { fontWeight: '700' }]}>{editOpt ? 'Edit Option' : 'New Option'}</Text>
            <Pressable onPress={saveOpt} style={[modal.saveBtn, { backgroundColor: oSaving ? MUTED : BLUE }]} disabled={oSaving}>
              <Text style={[modal.saveBtnText, { fontWeight: '700' }]}>{oSaving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}>
            <SectionHeader title="Option Details" icon="list" color={BLUE} />
            <Field label="Option Name" required>
              <TextInput value={oName} onChangeText={setOName} placeholder="e.g. Oat Milk, Extra Shot, Large"
                placeholderTextColor={MUTED} style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]} />
            </Field>
            <Field label="Price Adjustment (AUD)">
              <TextInput value={oPrice} onChangeText={setOPrice}
                placeholder="e.g. 0.80 for +$0.80  ·  leave empty for free"
                placeholderTextColor={MUTED} keyboardType="decimal-pad"
                style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]} />
            </Field>
            <View style={form.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[form.toggleLabel, { fontWeight: '500', color: TEXT }]}>Default Selection</Text>
                <Text style={[form.toggleDesc, { fontWeight: '400', color: MUTED }]}>Pre-selected when the product sheet opens</Text>
              </View>
              <Switch value={oDefault} onValueChange={setODefault} trackColor={{ false: BORDER, true: GREEN }} thumbColor="#fff" />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
