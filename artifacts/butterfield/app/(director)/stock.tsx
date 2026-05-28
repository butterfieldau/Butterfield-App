import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView,
  Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useAuth } from '@/context/AuthContext';
import { api, type StockItem } from '@/lib/api';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';
const BLUE   = '#1493FF';

const CAT_COLORS: Record<string, string> = {
  coffee:         '#7C3AED',
  drinks:         '#06B6D4',
  front_of_house: '#F59E0B',
  sauces:         '#EF4444',
  chocolate:      '#92400E',
  kitchen:        '#22C55E',
  milk:           '#3B82F6',
  dairy:          '#8B5CF6',
  packaging:      '#EC4899',
  cleaning:       '#14B8A6',
};

const CAT_ICONS: Record<string, string> = {
  coffee:         'coffee',
  drinks:         'droplet',
  front_of_house: 'star',
  sauces:         'thermometer',
  chocolate:      'gift',
  kitchen:        'tool',
  milk:           'package',
  dairy:          'package',
  packaging:      'box',
  cleaning:       'wind',
};

const PALETTE = ['#7C3AED','#06B6D4','#F59E0B','#EF4444','#22C55E','#3B82F6','#8B5CF6','#EC4899','#14B8A6','#F97316'];

function catColor(id: string): string {
  return CAT_COLORS[id] ?? PALETTE[Math.abs(id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % PALETTE.length];
}

function catIcon(id: string): string {
  return CAT_ICONS[id] ?? 'box';
}

function centsToAud(c?: number | null) {
  if (c == null) return null;
  return `$${(c / 100).toFixed(2)}`;
}

function stockLevel(item: StockItem): 'ok' | 'low' | 'out' {
  if (item.currentQuantity <= 0) return 'out';
  if (item.lowStockThreshold > 0 && item.currentQuantity <= item.lowStockThreshold) return 'low';
  return 'ok';
}

// ── Quantity adjust modal ────────────────────────────────────────────────────
function QuantityModal({ item, onClose, onSave }: {
  item: StockItem; onClose: () => void; onSave: (qty: number) => void;
}) {
  const [val, setVal] = useState(String(item.currentQuantity));
  const handleSave = () => {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) { Alert.alert('Invalid', 'Enter a valid number'); return; }
    onSave(n);
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={qm.overlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={qm.sheet} onPress={() => {}}>
            <Text style={qm.title}>{item.name}</Text>
            <Text style={qm.sub}>Update quantity ({item.unit})</Text>
            <TextInput style={qm.input} value={val} onChangeText={setVal} keyboardType="decimal-pad" selectTextOnFocus autoFocus />
            <View style={qm.row}>
              <Pressable style={[qm.btn, { backgroundColor: BG }]} onPress={onClose}>
                <Text style={[qm.btnText, { color: TEXT }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[qm.btn, { backgroundColor: NAVY }]} onPress={handleSave}>
                <Text style={[qm.btnText, { color: '#fff' }]}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const qm = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  sheet:    { backgroundColor: CARD, borderRadius: 20, padding: 24, width: '100%', gap: 12 },
  title:    { fontSize: 17, fontWeight: '700', color: TEXT },
  sub:      { fontSize: 13, color: MUTED, marginTop: -6 },
  input:    { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 20, fontWeight: '600', color: TEXT, textAlign: 'center' },
  row:      { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn:      { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  btnText:  { fontSize: 15, fontWeight: '600' },
});

// ── Manage Categories modal ──────────────────────────────────────────────────
function ManageCategoriesModal({
  onClose, categories, onCreated, onDeleted, itemCategories,
}: {
  onClose: () => void;
  categories: { id: string; label: string }[];
  onCreated: (name: string) => Promise<void>;
  onDeleted: (id: string) => Promise<void>;
  itemCategories: string[];
}) {
  const [newName, setNewName] = useState('');
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleAdd = async () => {
    const t = newName.trim();
    if (!t) return;
    setSaving(true);
    try { await onCreated(t); setNewName(''); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    catch { } finally { setSaving(false); }
  };

  const handleDelete = (cat: { id: string; label: string }) => {
    const inUse = itemCategories.includes(cat.id);
    if (inUse) {
      Alert.alert('Cannot Delete', `"${cat.label}" still has items assigned to it. Reassign or delete those items first.`);
      return;
    }
    Alert.alert('Delete Category', `Remove "${cat.label}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setDeleting(cat.id);
        try { await onDeleted(cat.id); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
        catch (e: any) { Alert.alert('Error', e.message); }
        finally { setDeleting(null); }
      }},
    ]);
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={mm.header}>
          <Text style={mm.title}>Manage Categories</Text>
          <Pressable onPress={onClose} style={mm.closeBtn}>
            <Feather name="x" size={18} color={MUTED} />
          </Pressable>
        </View>

        {/* Add new */}
        <View style={mm.addRow}>
          <TextInput
            style={mm.addInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="New category name…"
            placeholderTextColor={MUTED}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />
          <Pressable onPress={handleAdd} disabled={saving || !newName.trim()} style={[mm.addBtn, (!newName.trim() || saving) && { opacity: 0.4 }]}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="plus" size={18} color="#fff" />}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {categories.length === 0 && (
            <Text style={{ color: MUTED, textAlign: 'center', marginTop: 24 }}>No categories yet.</Text>
          )}
          {categories.map((cat) => {
            const color = catColor(cat.id);
            const inUse = itemCategories.includes(cat.id);
            const isDeleting = deleting === cat.id;
            return (
              <View key={cat.id} style={mm.row}>
                <View style={[mm.dot, { backgroundColor: color + '22' }]}>
                  <Feather name={catIcon(cat.id) as any} size={14} color={color} />
                </View>
                <Text style={mm.catName}>{cat.label}</Text>
                {inUse && (
                  <View style={mm.inUseBadge}>
                    <Text style={mm.inUseTxt}>IN USE</Text>
                  </View>
                )}
                <Pressable
                  onPress={() => handleDelete(cat)}
                  disabled={isDeleting}
                  style={[mm.deleteBtn, isDeleting && { opacity: 0.4 }]}
                >
                  {isDeleting
                    ? <ActivityIndicator size="small" color={RED} />
                    : <Feather name="trash-2" size={15} color={RED} />
                  }
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const mm = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  title:     { fontSize: 18, fontWeight: '700', color: TEXT },
  closeBtn:  { width: 32, height: 32, borderRadius: 16, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  addRow:    { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  addInput:  { flex: 1, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: TEXT },
  addBtn:    { width: 44, height: 44, borderRadius: 10, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  dot:       { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  catName:   { flex: 1, fontSize: 14, fontWeight: '600', color: TEXT },
  inUseBadge:{ backgroundColor: BLUE + '18', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  inUseTxt:  { fontSize: 10, fontWeight: '700', color: BLUE },
  deleteBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: RED + '12', alignItems: 'center', justifyContent: 'center' },
});

// ── Item edit modal ──────────────────────────────────────────────────────────
const COMMON_UNITS = ['units', 'kg', 'g', 'L', 'mL', 'bags', 'boxes', 'bottles', 'cans', 'rolls', 'sheets'];

function EditModal({ item, onClose, onSave, categories }: {
  item: Partial<StockItem> | null;
  onClose: () => void;
  onSave: (data: any) => void;
  categories: { id: string; label: string }[];
}) {
  const isNew = !item?.id;
  const [name, setName]           = useState(item?.name ?? '');
  const [category, setCategory]   = useState(item?.category ?? categories[0]?.id ?? '');
  const [customCat, setCustomCat] = useState('');
  const [unit, setUnit]           = useState(item?.unit ?? 'units');
  const [qty, setQty]             = useState(String(item?.currentQuantity ?? 0));
  const [threshold, setThreshold] = useState(String(item?.lowStockThreshold ?? 0));
  const [cost, setCost]           = useState(item?.costCents != null ? String(item.costCents / 100) : '');
  const [supplier, setSupplier]   = useState(item?.supplier ?? '');
  const [notes, setNotes]         = useState(item?.notes ?? '');

  const handleSave = () => {
    if (!name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    if (!category) { Alert.alert('Validation', 'Category is required'); return; }
    onSave({
      name: name.trim(),
      category,
      unit: unit.trim() || 'units',
      currentQuantity: parseFloat(qty) || 0,
      lowStockThreshold: parseFloat(threshold) || 0,
      costCents: cost ? Math.round(parseFloat(cost.replace(/[^0-9.]/g, '')) * 100) : null,
      supplier: supplier.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={em.overlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <Pressable style={em.sheet} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={em.title}>{isNew ? 'Add Stock Item' : 'Edit Stock Item'}</Text>
                <Pressable onPress={onClose} style={em.closeBtn}>
                  <Feather name="x" size={18} color={MUTED} />
                </Pressable>
              </View>

              <Label>Name *</Label>
              <TextInput style={em.input} value={name} onChangeText={setName} placeholder="e.g. Full Cream Milk" placeholderTextColor={MUTED} />

              <Label>Category *</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                {categories.map((c) => {
                  const color = catColor(c.id);
                  const active = category === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => { Haptics.selectionAsync(); setCategory(c.id); setCustomCat(''); }}
                      style={[em.catChip, active && { backgroundColor: color, borderColor: color }]}
                    >
                      <Text style={[em.catLabel, active && { color: '#fff' }]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <TextInput
                style={[em.input, { marginBottom: 16 }]}
                value={customCat}
                onChangeText={(v) => {
                  setCustomCat(v);
                  if (v.trim()) setCategory(v.trim().toLowerCase().replace(/\s+/g, '_'));
                }}
                placeholder="Or type a custom category…"
                placeholderTextColor={MUTED}
              />

              <Label>Unit</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                {COMMON_UNITS.map((u) => (
                  <Pressable key={u} onPress={() => setUnit(u)} style={[em.unitChip, unit === u && { backgroundColor: NAVY, borderColor: NAVY }]}>
                    <Text style={[em.unitLabel, unit === u && { color: '#fff' }]}>{u}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <TextInput style={[em.input, { marginTop: 8 }]} value={unit} onChangeText={setUnit} placeholder="Custom unit" placeholderTextColor={MUTED} />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Label>Current Qty</Label>
                  <TextInput style={em.input} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Label>Low Stock Alert</Label>
                  <TextInput style={em.input} value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" placeholder="0 = off" placeholderTextColor={MUTED} />
                </View>
              </View>

              <Label>Cost per unit (AUD)</Label>
              <View style={em.costRow}>
                <Text style={em.costPrefix}>$</Text>
                <TextInput style={[em.input, { flex: 1 }]} value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="0.00  (director only)" placeholderTextColor={MUTED} />
              </View>

              <Label>Supplier</Label>
              <TextInput style={em.input} value={supplier} onChangeText={setSupplier} placeholder="Supplier name" placeholderTextColor={MUTED} />

              <Label>Notes</Label>
              <TextInput style={[em.input, { height: 70, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} placeholder="Any notes…" placeholderTextColor={MUTED} multiline />

              <View style={em.btnRow}>
                <Pressable style={[em.btn, { backgroundColor: BG }]} onPress={onClose}>
                  <Text style={[em.btnTxt, { color: TEXT }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[em.btn, { backgroundColor: NAVY }]} onPress={handleSave}>
                  <Text style={[em.btnTxt, { color: '#fff' }]}>{isNew ? 'Add Item' : 'Save Changes'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={em.label}>{children}</Text>;
}

const em = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:     { backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '92%' },
  title:     { fontSize: 20, fontWeight: '700', color: TEXT },
  closeBtn:  { width: 32, height: 32, borderRadius: 16, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  label:     { fontSize: 12, fontWeight: '600', color: MUTED, letterSpacing: 0.8, marginBottom: 6, marginTop: 14 },
  input:     { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: TEXT },
  catChip:   { borderWidth: 1.5, borderColor: BORDER, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  catLabel:  { fontSize: 13, fontWeight: '600', color: MUTED },
  unitChip:  { borderWidth: 1.5, borderColor: BORDER, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 },
  unitLabel: { fontSize: 12, fontWeight: '500', color: MUTED },
  costRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  costPrefix:{ fontSize: 18, fontWeight: '600', color: TEXT },
  btnRow:    { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 8 },
  btn:       { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnTxt:    { fontSize: 15, fontWeight: '700' },
});

// ── Stock item card ──────────────────────────────────────────────────────────
function StockCard({ item, isDirector, onQtyPress, onEditPress, onDeletePress }: {
  item: StockItem; isDirector: boolean;
  onQtyPress: () => void; onEditPress: () => void; onDeletePress: () => void;
}) {
  const level = stockLevel(item);
  const color = catColor(item.category);
  const icon  = catIcon(item.category);
  const levelColor = level === 'out' ? RED : level === 'low' ? AMBER : GREEN;

  return (
    <View style={sc.card}>
      <View style={sc.left}>
        <View style={[sc.catDot, { backgroundColor: color + '22' }]}>
          <Feather name={icon as any} size={14} color={color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={sc.name} numberOfLines={1}>{item.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {level !== 'ok' && (
              <View style={[sc.badge, { backgroundColor: levelColor + '20' }]}>
                <Feather name={level === 'out' ? 'alert-octagon' : 'alert-triangle'} size={10} color={levelColor} />
                <Text style={[sc.badgeTxt, { color: levelColor }]}>{level === 'out' ? 'OUT' : 'LOW'}</Text>
              </View>
            )}
            {item.supplier ? <Text style={sc.meta} numberOfLines={1}>{item.supplier}</Text> : null}
          </View>
        </View>
      </View>
      <View style={sc.right}>
        {isDirector && item.costCents != null && (
          <Text style={sc.cost}>{centsToAud(item.costCents)}/{item.unit}</Text>
        )}
        <Pressable onPress={() => { Haptics.selectionAsync(); onQtyPress(); }} style={[sc.qtyBtn, { borderColor: levelColor }]}>
          <Text style={[sc.qtyNum, { color: levelColor }]}>{item.currentQuantity}</Text>
          <Text style={sc.qtyUnit}>{item.unit}</Text>
        </Pressable>
        {isDirector && (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Pressable onPress={() => { Haptics.selectionAsync(); onEditPress(); }} style={sc.iconBtn}>
              <Feather name="edit-2" size={14} color={MUTED} />
            </Pressable>
            <Pressable onPress={() => { Haptics.impactAsync(); onDeletePress(); }} style={sc.iconBtn}>
              <Feather name="trash-2" size={14} color={RED} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  card:    { backgroundColor: CARD, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  left:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 8 },
  catDot:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name:    { fontSize: 15, fontWeight: '600', color: TEXT },
  meta:    { fontSize: 12, color: MUTED },
  badge:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  badgeTxt:{ fontSize: 10, fontWeight: '700' },
  right:   { alignItems: 'flex-end', gap: 5 },
  cost:    { fontSize: 12, fontWeight: '500', color: MUTED },
  qtyBtn:  { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', minWidth: 64 },
  qtyNum:  { fontSize: 16, fontWeight: '700' },
  qtyUnit: { fontSize: 10, color: MUTED, fontWeight: '500', marginTop: -1 },
  iconBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
});

// ── Main screen ──────────────────────────────────────────────────────────────
export default function StockScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const isDirector = user?.role === 'director' || user?.role === 'master';

  const [catFilter, setCatFilter] = useState<string>('all');
  const [search, setSearch]       = useState('');
  const [qtyItem, setQtyItem]     = useState<StockItem | null>(null);
  const [editItem, setEditItem]   = useState<Partial<StockItem> | null | false>(false);
  const [manageCats, setManageCats] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stock-items'],
    queryFn: () => api.stock.items(),
  });

  const { data: catData, refetch: refetchCats } = useQuery({
    queryKey: ['stock-categories'],
    queryFn: () => api.stock.categories(),
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch, refetchCats);

  const items: StockItem[] = data?.data ?? [];
  const categories = catData?.data ?? [];

  // Only show filter tabs for categories that actually have items
  const activeCatIds = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return Array.from(set).sort();
  }, [items]);

  const lowCount = useMemo(() => items.filter((i) => stockLevel(i) !== 'ok').length, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (catFilter !== 'all') list = list.filter((i) => i.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || (i.supplier ?? '').toLowerCase().includes(q));
    }
    // Out of stock first, then low stock, then OK
    const levelOrder = { out: 0, low: 1, ok: 2 };
    list = [...list].sort((a, b) => levelOrder[stockLevel(a)] - levelOrder[stockLevel(b)]);
    return list;
  }, [items, catFilter, search]);

  // ── mutations ──
  const updateQtyMut = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) => api.stock.updateQuantity(id, qty),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock-items'] }),
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const createMut = useMutation({
    mutationFn: (d: any) => api.stock.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-items'] }); setEditItem(false); },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: any }) => api.stock.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-items'] }); setEditItem(false); },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.stock.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock-items'] }),
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handleDelete = (item: StockItem) => {
    Alert.alert('Remove Item', `Remove "${item.name}" from stock?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteMut.mutate(item.id) },
    ]);
  };

  const handleCreateCategory = async (name: string) => {
    await api.stock.createCategory(name);
    qc.invalidateQueries({ queryKey: ['stock-categories'] });
  };

  const handleDeleteCategory = async (id: string) => {
    await api.stock.deleteCategory(id);
    qc.invalidateQueries({ queryKey: ['stock-categories'] });
    if (catFilter === id) setCatFilter('all');
  };

  // Label for a category id (from managed list or formatted id)
  const catLabel = (id: string) => {
    const found = categories.find((c) => c.id === id);
    if (found) return found.label;
    return id.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: 20 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Feather name="chevron-left" size={20} color={NAVY} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Stock & Inventory</Text>
            {lowCount > 0 && (
              <Text style={{ fontSize: 12, color: AMBER, fontWeight: '600', marginTop: 1 }}>
                ⚠ {lowCount} item{lowCount > 1 ? 's' : ''} need attention
              </Text>
            )}
          </View>
          {isDirector && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setManageCats(true); }}
                style={s.manageBtn}
              >
                <Feather name="tag" size={16} color={NAVY} />
              </Pressable>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setEditItem({}); }}
                style={s.addBtn}
              >
                <Feather name="plus" size={18} color="#fff" />
                <Text style={s.addBtnTxt}>Add</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Search */}
        <View style={s.searchBox}>
          <Feather name="search" size={15} color={MUTED} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search items or supplier…"
            placeholderTextColor={MUTED}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Feather name="x-circle" size={15} color={MUTED} />
            </Pressable>
          )}
        </View>

        {/* Category filter — only categories with items */}
        {(activeCatIds.length > 0 || items.length > 0) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            {/* All tab */}
            <Pressable
              key="all"
              onPress={() => { Haptics.selectionAsync(); setCatFilter('all'); }}
              style={[s.catTab, catFilter === 'all' && { backgroundColor: NAVY, borderColor: NAVY }]}
            >
              <Text style={[s.catTabTxt, catFilter === 'all' && { color: '#fff' }]}>All</Text>
              <View style={[s.catCount, catFilter === 'all' && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                <Text style={[s.catCountTxt, catFilter === 'all' && { color: '#fff' }]}>{items.length}</Text>
              </View>
            </Pressable>
            {/* One tab per category that has items */}
            {activeCatIds.map((catId) => {
              const active = catFilter === catId;
              const color  = catColor(catId);
              const count  = items.filter((i) => i.category === catId).length;
              const label  = catLabel(catId);
              return (
                <Pressable
                  key={catId}
                  onPress={() => { Haptics.selectionAsync(); setCatFilter(catId); }}
                  style={[s.catTab, active && { backgroundColor: color, borderColor: color }]}
                >
                  <Text style={[s.catTabTxt, active && { color: '#fff' }]}>{label}</Text>
                  <View style={[s.catCount, active && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                    <Text style={[s.catCountTxt, active && { color: '#fff' }]}>{count}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── Stats strip ── */}
      {items.length > 0 && (
        <View style={s.statsRow}>
          <View style={s.statPill}>
            <Feather name="package" size={13} color={BLUE} />
            <Text style={s.statTxt}>{items.length} items</Text>
          </View>
          {lowCount > 0 && (
            <View style={[s.statPill, { backgroundColor: AMBER + '15' }]}>
              <Feather name="alert-triangle" size={13} color={AMBER} />
              <Text style={[s.statTxt, { color: AMBER }]}>{lowCount} low/out</Text>
            </View>
          )}
          {isDirector && (() => {
            const costed = items.filter((i) => i.costCents != null);
            if (costed.length === 0) return null;
            const total = costed.reduce((acc, i) => acc + (i.costCents! * i.currentQuantity), 0);
            return (
              <View style={[s.statPill, { backgroundColor: GREEN + '15' }]}>
                <Feather name="dollar-sign" size={13} color={GREEN} />
                <Text style={[s.statTxt, { color: GREEN }]}>{centsToAud(Math.round(total))} stock value</Text>
              </View>
            );
          })()}
        </View>
      )}

      {/* ── List ── */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Feather name="archive" size={40} color={BORDER} />
          <Text style={s.emptyTxt}>
            {items.length === 0
              ? isDirector ? 'No stock items yet.\nTap + Add to get started.' : 'No stock items have been added yet.'
              : 'No items match your filters.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAVY} />}
          renderItem={({ item }) => (
            <StockCard
              item={item}
              isDirector={isDirector}
              onQtyPress={() => setQtyItem(item)}
              onEditPress={() => setEditItem(item)}
              onDeletePress={() => handleDelete(item)}
            />
          )}
        />
      )}

      {/* ── Quantity modal ── */}
      {qtyItem && (
        <QuantityModal
          item={qtyItem}
          onClose={() => setQtyItem(null)}
          onSave={(qty) => { updateQtyMut.mutate({ id: qtyItem.id, qty }); setQtyItem(null); }}
        />
      )}

      {/* ── Edit/create modal ── */}
      {isDirector && editItem !== false && (
        <EditModal
          item={editItem}
          categories={categories}
          onClose={() => setEditItem(false)}
          onSave={(d) => {
            if (editItem && 'id' in editItem && editItem.id) {
              updateMut.mutate({ id: editItem.id, d });
            } else {
              createMut.mutate(d);
            }
          }}
        />
      )}

      {/* ── Manage categories modal ── */}
      {isDirector && manageCats && (
        <ManageCategoriesModal
          onClose={() => setManageCats(false)}
          categories={categories}
          itemCategories={activeCatIds}
          onCreated={handleCreateCategory}
          onDeleted={handleDeleteCategory}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header:      { backgroundColor: BG, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  backBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  title:       { fontSize: 22, fontWeight: '700', color: TEXT },
  manageBtn:   { width: 36, height: 36, borderRadius: 10, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: NAVY, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  addBtnTxt:   { fontSize: 14, fontWeight: '700', color: '#fff' },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  searchInput: { flex: 1, fontSize: 15, color: TEXT },
  catTab:      { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: BORDER, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, backgroundColor: CARD },
  catTabTxt:   { fontSize: 13, fontWeight: '600', color: MUTED },
  catCount:    { backgroundColor: BG, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  catCountTxt: { fontSize: 11, fontWeight: '700', color: MUTED },
  statsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  statPill:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BLUE + '12', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statTxt:     { fontSize: 12, fontWeight: '600', color: BLUE },
  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
  emptyTxt:    { fontSize: 15, color: MUTED, textAlign: 'center', lineHeight: 22 },
});
