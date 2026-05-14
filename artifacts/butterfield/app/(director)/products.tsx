import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const NAVY   = '#1A2B4A';
const RED    = '#F40009';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';
const PINK   = '#EC4899';

const CATEGORIES = ['cookies','coffee','desserts','bundles','sandwiches','pastries','drinks','merch','other'];
const PRODUCT_TYPES = ['standard','limited','seasonal','wholesale-only','staff-only'];
const ALLERGEN_LIST = ['Gluten','Dairy','Eggs','Nuts','Peanuts','Soy','Sesame','Sulphites','Fish','Shellfish'];
const DIETARY_LIST  = ['Vegan','Vegetarian','Gluten-Free','Dairy-Free','Nut-Free','Halal','Kosher','Low-Sugar'];
const DAYS_LIST     = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const CAT_COLORS: Record<string, string> = {
  cookies:'#F59E0B', coffee:'#8B5CF6', desserts:'#EC4899',
  bundles:'#40C0F2', sandwiches:'#22C55E', merch:'#6B7280',
  pastries:'#F97316', drinks:'#06B6D4', other:'#8E8E93',
};

const FILTER_TABS = ['All','Available','Featured','Sold Out','Low Stock','Archived'];

// ─── helpers ──────────────────────────────────────────────────────────────────
function centsToDisplay(c?: number | null) { return c != null ? ((c) / 100).toFixed(2) : ''; }
function displayToCents(s: string) { return Math.round(parseFloat(s.replace(/[^0-9.]/g,'')) * 100) || 0; }

function parseJsonField(val?: string | null): string[] {
  if (!val) return [];
  try { const r = JSON.parse(val); return Array.isArray(r) ? r : []; } catch { return []; }
}

// ─── Tag chip ─────────────────────────────────────────────────────────────────
function TagChip({ label, active, color, onPress }: { label: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[chip.base, { backgroundColor: active ? color : CARD, borderColor: active ? color : BORDER }]}>
      <Text style={[chip.text, { fontWeight: '500', color: active ? '#fff' : MUTED }]}>{label}</Text>
    </Pressable>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, icon, color }: { title: string; icon: string; color: string }) {
  return (
    <View style={form.sectionHeader}>
      <View style={[form.sectionIcon, { backgroundColor: color + '18' }]}>
        <Feather name={icon as any} size={14} color={color} />
      </View>
      <Text style={[form.sectionTitle, { fontWeight: '700', color: NAVY }]}>{title}</Text>
    </View>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────
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
        trackColor={{ false: BORDER, true: color ?? BLUE }} thumbColor="#fff" ios_backgroundColor={BORDER} />
    </View>
  );
}

// ─── Segment picker ────────────────────────────────────────────────────────────
function Segment({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={seg.wrap}>
      {options.map(opt => (
        <Pressable key={opt} onPress={() => onChange(opt)} style={[seg.btn, value === opt && { backgroundColor: NAVY }]}>
          <Text style={[seg.text, { fontWeight: '500' }, value === opt && { color: '#fff' }]}>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Derive objectPath from a servingUrl for deletion ─────────────────────
function getObjectPath(servingUrl: string): string | null {
  const match = servingUrl.match(/\/api\/storage(\/objects\/.+?)(\?|$)/);
  return match ? match[1] : null;
}

// ─── Default form state ────────────────────────────────────────────────────────
const BLANK = () => ({
  name: '', shortDescription: '', description: '',
  category: 'cookies', productType: 'standard',
  price: '', salePrice: '', costPrice: '', wholesalePrice: '',
  gstIncluded: true, sku: '', barcode: '',
  isAvailable: true, isFeatured: false, isNew: false,
  isWholesaleAvailable: true, isStaffOnly: false, isAppOnly: false,
  isLimitedDrop: false, isSoldOut: false, isComingSoon: false, isPickupOnly: false,
  allergens: [] as string[], dietaryTags: [] as string[], tags: [] as string[],
  ingredients: '', nutritionInfo: '', storageInstructions: '', servingInstructions: '',
  minOrderQty: '1', maxOrderQty: '', leadTimeMins: '', availableTimes: '',
  availableDays: [] as string[], stockCount: '', lowStockThreshold: '10',
  sortOrder: '0', imageUrl: '', galleryUrls: [] as string[],
  productUrl: '',
});

type FormState = ReturnType<typeof BLANK>;

// ─── Variants Card (shown inside edit modal) ───────────────────────────────────
function VariantsCard({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const [addModal, setAddModal] = useState(false);
  const [editV, setEditV] = useState<any>(null);
  const [vName, setVName] = useState('');
  const [vPrice, setVPrice] = useState('');
  const [vSaving, setVSaving] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['product-variants', productId],
    queryFn: () => api.director.productVariants(productId),
    enabled: !!productId,
  });
  const variants: any[] = data?.data ?? [];

  const openAdd  = () => { setEditV(null); setVName(''); setVPrice(''); setAddModal(true); };
  const openEdit = (v: any) => { setEditV(v); setVName(v.name); setVPrice(centsToDisplay(v.priceCents)); setAddModal(true); };

  const save = async () => {
    if (!vName.trim()) return Alert.alert('Name required');
    if (!vPrice.trim()) return Alert.alert('Price required');
    setVSaving(true);
    try {
      if (editV) {
        await api.director.updateVariant(productId, editV.id, { name: vName.trim(), priceCents: displayToCents(vPrice) });
      } else {
        await api.director.createVariant(productId, { name: vName.trim(), priceCents: displayToCents(vPrice) });
      }
      await qc.invalidateQueries({ queryKey: ['product-variants', productId] });
      refetch();
      setAddModal(false);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setVSaving(false); }
  };

  const deleteV = (v: any) => {
    Alert.alert('Delete Variant', `Delete "${v.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.director.deleteVariant(productId, v.id); await qc.invalidateQueries({ queryKey: ['product-variants', productId] }); refetch(); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  return (
    <View style={form.card}>
      <SectionHeader title="Variants / Sizes" icon="layers" color={PURPLE} />
      <Text style={[form.label, { fontWeight: '400', color: MUTED, marginBottom: 4 }]}>
        Variants set separate prices (e.g. Small / Medium / Large). When present the base price is overridden per variant.
      </Text>
      {variants.map(v => (
        <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: BORDER, marginTop: 6 }}>
          <Text style={{ flex: 1, fontWeight: '600', color: TEXT, fontSize: 14 }}>{v.name}</Text>
          <Text style={{ fontWeight: '700', color: GREEN, fontSize: 14 }}>${(v.priceCents / 100).toFixed(2)}</Text>
          <Pressable onPress={() => openEdit(v)} style={{ padding: 6 }} hitSlop={4}>
            <Feather name="edit-2" size={14} color={BLUE} />
          </Pressable>
          <Pressable onPress={() => deleteV(v)} style={{ padding: 6 }} hitSlop={4}>
            <Feather name="trash-2" size={14} color={RED} />
          </Pressable>
        </View>
      ))}
      <Pressable
        onPress={openAdd}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: PURPLE, borderStyle: 'dashed', backgroundColor: PURPLE + '08', marginTop: 10 }}
      >
        <Feather name="plus" size={14} color={PURPLE} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: PURPLE }}>Add Variant</Text>
      </Pressable>
      <Modal visible={addModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddModal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={[modal.header, { paddingTop: 16 }]}>
            <Pressable onPress={() => setAddModal(false)} style={modal.closeBtn}><Feather name="x" size={18} color={TEXT} /></Pressable>
            <Text style={[modal.title, { fontWeight: '700' }]}>{editV ? 'Edit Variant' : 'New Variant'}</Text>
            <Pressable onPress={save} style={[modal.saveBtn, { backgroundColor: vSaving ? MUTED : PURPLE }]} disabled={vSaving}>
              <Text style={[modal.saveBtnText, { fontWeight: '600' }]}>{vSaving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View style={form.card}>
              <Field label="Variant Name" required>
                <TextInput value={vName} onChangeText={setVName} placeholder="e.g. Large" placeholderTextColor={MUTED}
                  style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]} />
              </Field>
              <Field label="Price (AUD)" required>
                <TextInput value={vPrice} onChangeText={setVPrice} placeholder="0.00" placeholderTextColor={MUTED}
                  keyboardType="decimal-pad" style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]} />
              </Field>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

type ModalTab = 'core' | 'status' | 'details' | 'inventory';
const MODAL_TABS: { id: ModalTab; label: string; icon: string }[] = [
  { id: 'core',      label: 'Core',      icon: 'package'        },
  { id: 'status',    label: 'Status',    icon: 'toggle-right'   },
  { id: 'details',   label: 'Details',   icon: 'file-text'      },
  { id: 'inventory', label: 'Inventory', icon: 'box'            },
];

// ─── Add/Edit Modal ────────────────────────────────────────────────────────────
function ProductModal({
  visible, onClose, onSave, initial, editing, categories = [],
}: { visible: boolean; onClose: () => void; onSave: (d: any) => Promise<void>; initial?: any; editing?: boolean; categories?: any[] }) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [modalTab, setModalTab] = useState<ModalTab>('core');
  const [f, setF] = useState<FormState>(BLANK());

  // Reset to first tab whenever modal opens
  React.useEffect(() => {
    if (visible) setModalTab('core');
  }, [visible]);

  // Populate when editing
  React.useEffect(() => {
    if (visible && initial) {
      setF({
        name: initial.name ?? '',
        shortDescription: initial.shortDescription ?? '',
        description: initial.description ?? '',
        category: initial.category ?? 'cookies',
        productType: initial.productType ?? 'standard',
        price: centsToDisplay(initial.priceCents),
        salePrice: centsToDisplay(initial.salePriceCents),
        costPrice: centsToDisplay(initial.costPriceCents),
        wholesalePrice: centsToDisplay(initial.wholesalePriceCents),
        gstIncluded: initial.gstIncluded ?? true,
        sku: initial.sku ?? '', barcode: initial.barcode ?? '',
        imageUrl: initial.imageUrl ?? '',
        galleryUrls: parseJsonField(initial.galleryUrls),
        productUrl: (initial as any).productUrl ?? '',
        isAvailable: initial.isAvailable ?? true,
        isFeatured: initial.isFeatured ?? false,
        isNew: initial.isNew ?? false,
        isWholesaleAvailable: initial.isWholesaleAvailable ?? true,
        isStaffOnly: initial.isStaffOnly ?? false,
        isAppOnly: initial.isAppOnly ?? false,
        isLimitedDrop: initial.isLimitedDrop ?? false,
        isSoldOut: initial.isSoldOut ?? false,
        isComingSoon: initial.isComingSoon ?? false,
        isPickupOnly: initial.isPickupOnly ?? false,
        allergens: parseJsonField(initial.allergens),
        dietaryTags: parseJsonField(initial.dietaryTags),
        tags: parseJsonField(initial.tags),
        ingredients: initial.ingredients ?? '',
        nutritionInfo: initial.nutritionInfo ?? '',
        storageInstructions: initial.storageInstructions ?? '',
        servingInstructions: initial.servingInstructions ?? '',
        minOrderQty: String(initial.minOrderQty ?? 1),
        maxOrderQty: initial.maxOrderQty != null ? String(initial.maxOrderQty) : '',
        leadTimeMins: initial.leadTimeMins != null ? String(initial.leadTimeMins) : '',
        availableTimes: initial.availableTimes ?? '',
        availableDays: parseJsonField(initial.availableDays),
        stockCount: initial.stockCount != null ? String(initial.stockCount) : '',
        lowStockThreshold: String(initial.lowStockThreshold ?? 10),
        sortOrder: String(initial.sortOrder ?? 0),
      });
    } else if (visible && !initial) {
      setF(BLANK());
    }
  }, [visible, initial]);

  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(p => ({ ...p, [k]: v }));
  const toggleArr = (k: 'allergens' | 'dietaryTags' | 'tags' | 'availableDays', val: string) => {
    setF(p => {
      const arr = p[k] as string[];
      return { ...p, [k]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  };

  // ── Product image upload ──────────────────────────────────────────────────
  const handlePickProductImage = async (isReplace: boolean) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow photo library access in Settings.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.88,
        selectionLimit: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
        Alert.alert('File too large', 'Please choose an image under 8 MB.');
        return;
      }
      const filename = asset.fileName ?? asset.uri.split('/').pop() ?? 'product.jpg';
      const contentType = asset.mimeType ?? 'image/jpeg';
      const oldUrl = f.imageUrl.trim();
      setUploading(true);
      const { servingUrl } = await api.storage.uploadProductImage(
        asset.uri, filename, contentType, f.category, f.name.trim() || 'product'
      );
      if (isReplace && oldUrl) {
        const oldPath = getObjectPath(oldUrl);
        if (oldPath) api.storage.deleteProductImage(oldPath).catch(() => {});
      }
      upd('imageUrl', servingUrl);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload image. Please try again.');
    } finally { setUploading(false); }
  };

  const handleRemoveProductImage = () => {
    Alert.alert('Remove Photo', 'Remove this product photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          const url = f.imageUrl.trim();
          if (url) {
            const path = getObjectPath(url);
            if (path) api.storage.deleteProductImage(path).catch(() => {});
          }
          upd('imageUrl', '');
        },
      },
    ]);
  };

  const handlePickGalleryImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Please allow photo library access in Settings.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
        selectionLimit: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) { Alert.alert('File too large', 'Please choose an image under 8 MB.'); return; }
      const filename = asset.fileName ?? asset.uri.split('/').pop() ?? 'gallery.jpg';
      const contentType = asset.mimeType ?? 'image/jpeg';
      setUploading(true);
      const { servingUrl } = await api.storage.uploadProductImage(
        asset.uri, filename, contentType, f.category, (f.name.trim() || 'product') + '-gallery'
      );
      Haptics.selectionAsync();
      upd('galleryUrls', [...f.galleryUrls, servingUrl]);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload image.');
    } finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!f.name.trim()) { Alert.alert('Required', 'Product name is required.'); return; }
    if (!f.price.trim()) { Alert.alert('Required', 'Price is required.'); return; }
    setSaving(true);
    try {
      await onSave({
        name: f.name.trim(),
        shortDescription: f.shortDescription.trim() || null,
        description: f.description.trim(),
        category: f.category,
        productType: f.productType,
        priceCents:         displayToCents(f.price),
        salePriceCents:     f.salePrice    ? displayToCents(f.salePrice)    : null,
        costPriceCents:     f.costPrice    ? displayToCents(f.costPrice)    : null,
        wholesalePriceCents:f.wholesalePrice ? displayToCents(f.wholesalePrice) : null,
        gstIncluded: f.gstIncluded,
        sku:    f.sku.trim()    || null,
        barcode:f.barcode.trim()|| null,
        imageUrl: f.imageUrl.trim() || null,
        galleryUrls: f.galleryUrls.filter(u => u.trim()).length
          ? JSON.stringify(f.galleryUrls.filter(u => u.trim()))
          : null,
        productUrl: f.productUrl.trim() || null,
        isAvailable: f.isAvailable, isFeatured: f.isFeatured, isNew: f.isNew,
        isWholesaleAvailable: f.isWholesaleAvailable, isStaffOnly: f.isStaffOnly,
        isAppOnly: f.isAppOnly, isLimitedDrop: f.isLimitedDrop, isSoldOut: f.isSoldOut,
        isComingSoon: f.isComingSoon, isPickupOnly: f.isPickupOnly,
        allergens:   f.allergens.length  ? f.allergens  : null,
        dietaryTags: f.dietaryTags.length? f.dietaryTags: null,
        tags:        f.tags.length       ? f.tags       : null,
        ingredients:         f.ingredients.trim()         || null,
        nutritionInfo:       f.nutritionInfo.trim()       || null,
        storageInstructions: f.storageInstructions.trim() || null,
        servingInstructions: f.servingInstructions.trim() || null,
        minOrderQty:     parseInt(f.minOrderQty)    || 1,
        maxOrderQty:     f.maxOrderQty     ? parseInt(f.maxOrderQty) : null,
        leadTimeMins:    f.leadTimeMins    ? parseInt(f.leadTimeMins): null,
        availableTimes:  f.availableTimes.trim() || null,
        availableDays:   f.availableDays.length ? f.availableDays : null,
        stockCount:      f.stockCount      ? parseInt(f.stockCount) : null,
        lowStockThreshold: parseInt(f.lowStockThreshold) || 10,
        sortOrder:       parseInt(f.sortOrder) || 0,
      });
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          {/* Modal header */}
          <View style={[modal.header, { paddingTop: insets.top + 12 }]}>
            <Pressable onPress={onClose} style={modal.closeBtn}>
              <Feather name="x" size={20} color={TEXT} />
            </Pressable>
            <Text style={[modal.title, { fontWeight: '700', color: TEXT }]}>
              {editing ? 'Edit Product' : 'Add New Product'}
            </Text>
            <Pressable onPress={handleSave} disabled={saving} style={[modal.saveBtn, { backgroundColor: BLUE }]}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[modal.saveBtnText, { fontWeight: '700' }]}>Save</Text>}
            </Pressable>
          </View>

          {/* ── Tab bar ──────────────────────────────────────────── */}
          <View style={{ flexDirection: 'row', backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
            {MODAL_TABS.map(t => {
              const active = modalTab === t.id;
              return (
                <Pressable key={t.id} onPress={() => { setModalTab(t.id); Haptics.selectionAsync(); }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3, borderBottomWidth: 2.5, borderBottomColor: active ? BLUE : 'transparent' }}>
                  <Feather name={t.icon as any} size={15} color={active ? BLUE : MUTED} />
                  <Text style={{ fontSize: 10, fontWeight: active ? '700' : '500', color: active ? BLUE : MUTED }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}>

            {/* ════════════════════════════════════════════════════════
                TAB 1 — CORE: Basic info, category, pricing, photos
               ════════════════════════════════════════════════════════ */}
            {modalTab === 'core' && <>

            {/* ── Basic Info ─────────────────────────────────────── */}
            <View style={form.card}>
              <SectionHeader title="Basic Information" icon="info" color={BLUE} />
              <Field label="Product Name" required>
                <TextF value={f.name} onChange={v => upd('name', v)} placeholder="e.g. Classic Choc Chip Cookie" />
              </Field>
              <Field label="Short Description (card preview)">
                <TextF value={f.shortDescription} onChange={v => upd('shortDescription', v)} placeholder="One-liner shown on product cards" />
              </Field>
              <Field label="Full Description">
                <TextF value={f.description} onChange={v => upd('description', v)} placeholder="Detailed product description…" multiline lines={4} />
              </Field>
              <Field label="Category">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(categories.length > 0 ? categories : CATEGORIES.map(s => ({ id: s, name: s, slug: s }))).map(c => (
                      <TagChip key={c.id ?? c} label={c.name ?? c} active={f.category === (c.slug ?? c)} color={CAT_COLORS[c.slug ?? c] ?? MUTED} onPress={() => upd('category', c.slug ?? c)} />
                    ))}
                  </View>
                </ScrollView>
              </Field>
              <Field label="Product Type">
                <Segment options={PRODUCT_TYPES} value={f.productType} onChange={v => upd('productType', v)} />
              </Field>
            </View>

            {/* ── 2. Pricing ─────────────────────────────────────── */}
            <View style={form.card}>
              <SectionHeader title="Pricing" icon="dollar-sign" color={GREEN} />
              <View style={form.row2}>
                <View style={{ flex: 1 }}>
                  <Field label="Retail Price (AUD)" required>
                    <TextF value={f.price} onChange={v => upd('price', v)} placeholder="0.00" numeric />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Sale Price">
                    <TextF value={f.salePrice} onChange={v => upd('salePrice', v)} placeholder="0.00" numeric />
                  </Field>
                </View>
              </View>
              <View style={form.row2}>
                <View style={{ flex: 1 }}>
                  <Field label="Cost Price">
                    <TextF value={f.costPrice} onChange={v => upd('costPrice', v)} placeholder="0.00" numeric />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Wholesale Price">
                    <TextF value={f.wholesalePrice} onChange={v => upd('wholesalePrice', v)} placeholder="0.00" numeric />
                  </Field>
                </View>
              </View>
              <Toggle label="GST Included" value={f.gstIncluded} onChange={v => upd('gstIncluded', v)} color={GREEN} desc="Price displayed is GST-inclusive" />
            </View>

            {/* ── 3. Photos ──────────────────────────────────────── */}
            <View style={form.card}>
              <SectionHeader title="Photos" icon="image" color={BLUE} />

              {/* Hero image — upload only, no URL input */}
              <Text style={[form.label, { fontWeight: '500', color: MUTED, marginBottom: 8 }]}>
                Hero Image
              </Text>

              {f.imageUrl.trim() ? (
                <View style={{ gap: 10 }}>
                  <Image
                    source={{ uri: f.imageUrl.trim() }}
                    style={{ width: '100%', height: 200, borderRadius: 12, backgroundColor: '#F3F4F6' }}
                    resizeMode="cover"
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => handlePickProductImage(true)}
                      disabled={uploading}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, backgroundColor: BLUE + '15', borderWidth: 1, borderColor: BLUE }}
                    >
                      {uploading
                        ? <ActivityIndicator size="small" color={BLUE} />
                        : <Feather name="refresh-cw" size={14} color={BLUE} />}
                      <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>
                        {uploading ? 'Uploading…' : 'Replace Photo'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleRemoveProductImage}
                      disabled={uploading}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10, backgroundColor: RED + '12', borderWidth: 1, borderColor: RED + '60' }}
                    >
                      <Feather name="trash-2" size={14} color={RED} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: RED }}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => handlePickProductImage(false)}
                  disabled={uploading}
                  style={form.uploadArea}
                >
                  {uploading ? (
                    <ActivityIndicator size="large" color={BLUE} />
                  ) : (
                    <>
                      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                        <Feather name="upload-cloud" size={26} color={BLUE} />
                      </View>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 4 }}>
                        Upload Product Photo
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED }}>
                        JPG · PNG · WebP · HEIC  ·  Max 8 MB
                      </Text>
                    </>
                  )}
                </Pressable>
              )}

              <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 4 }} />

              {/* Gallery */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <Text style={[form.label, { fontWeight: '500', color: MUTED }]}>Gallery Images</Text>
                <Pressable
                  onPress={handlePickGalleryImage}
                  disabled={uploading}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Feather name="upload" size={13} color={BLUE} />
                  <Text style={{ fontSize: 12, color: BLUE, fontWeight: '600' }}>Upload</Text>
                </Pressable>
              </View>

              {f.galleryUrls.length === 0 ? (
                <Text style={{ fontSize: 12, color: MUTED, fontWeight: '400' }}>
                  No gallery images — tap Upload to add more photos
                </Text>
              ) : (
                f.galleryUrls.map((url, idx) => (
                  <View key={idx} style={{ gap: 6 }}>
                    {url.trim() ? (
                      <View style={{ position: 'relative' }}>
                        <Image
                          source={{ uri: url.trim() }}
                          style={{ width: '100%', height: 120, borderRadius: 10, backgroundColor: '#F3F4F6' }}
                          resizeMode="cover"
                        />
                        <Pressable
                          onPress={() => {
                            const path = getObjectPath(url);
                            if (path) api.storage.deleteProductImage(path).catch(() => {});
                            Haptics.selectionAsync();
                            upd('galleryUrls', f.galleryUrls.filter((_, i) => i !== idx));
                          }}
                          style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, padding: 5 }}
                        >
                          <Feather name="x" size={14} color="#fff" />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </View>

            {/* close core tab fragment */}
            </>}

            {/* ════════════════════════════════════════════════════════
                TAB 2 — STATUS: All visibility / sale toggles
               ════════════════════════════════════════════════════════ */}
            {modalTab === 'status' && <>
            <View style={form.card}>
              <SectionHeader title="Sale & Visibility" icon="eye" color={GREEN} />
              <Toggle label="Available for sale"    value={f.isAvailable}          onChange={v => upd('isAvailable', v)}          color={GREEN}  desc="Show this product to customers" />
              <Toggle label="Featured"              value={f.isFeatured}           onChange={v => upd('isFeatured', v)}           color={BLUE}   desc="Show in featured sections on home" />
              <Toggle label="New product badge"     value={f.isNew}                onChange={v => upd('isNew', v)}                color={PINK}   desc="Shows a 'NEW' label on the tile" />
              <Toggle label="Wholesale available"   value={f.isWholesaleAvailable} onChange={v => upd('isWholesaleAvailable', v)} color={PURPLE} desc="Visible to wholesale accounts" />
            </View>
            <View style={form.card}>
              <SectionHeader title="Stock Status" icon="alert-circle" color={RED} />
              <Toggle label="Limited drop"          value={f.isLimitedDrop}        onChange={v => upd('isLimitedDrop', v)}        color={RED}    desc="Shows 'LIMITED' badge on tile" />
              <Toggle label="Sold out"              value={f.isSoldOut}            onChange={v => upd('isSoldOut', v)}            color={RED}    desc="Displays as sold out, blocks ordering" />
              <Toggle label="Coming soon"           value={f.isComingSoon}         onChange={v => upd('isComingSoon', v)}         color={AMBER}  desc="Teaser before launch" />
            </View>
            <View style={form.card}>
              <SectionHeader title="Access Restrictions" icon="lock" color={MUTED} />
              <Toggle label="Pickup only"           value={f.isPickupOnly}         onChange={v => upd('isPickupOnly', v)}         color={MUTED}  desc="Cannot be delivered" />
              <Toggle label="Staff only visibility" value={f.isStaffOnly}          onChange={v => upd('isStaffOnly', v)}          color={MUTED}  desc="Hidden from public menu" />
              <Toggle label="App only"              value={f.isAppOnly}            onChange={v => upd('isAppOnly', v)}            color={MUTED}  desc="Not shown on website" />
            </View>
            </>}

            {/* ════════════════════════════════════════════════════════
                TAB 3 — DETAILS: Allergens, dietary, ingredients, IDs
               ════════════════════════════════════════════════════════ */}
            {modalTab === 'details' && <>
            <View style={form.card}>
              <SectionHeader title="Identifiers" icon="hash" color={PURPLE} />
              <View style={form.row2}>
                <View style={{ flex: 1 }}>
                  <Field label="SKU">
                    <TextF value={f.sku} onChange={v => upd('sku', v)} placeholder="BC-001" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Barcode">
                    <TextF value={f.barcode} onChange={v => upd('barcode', v)} placeholder="1234567890" />
                  </Field>
                </View>
              </View>
              <Field label="Product URL">
                <TextInput
                  value={f.productUrl}
                  onChangeText={v => upd('productUrl', v)}
                  placeholder="https://butterfieldcookies.com.au/products/…"
                  placeholderTextColor={MUTED}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]}
                />
                <Text style={[form.label, { fontWeight: '400', color: MUTED, marginTop: 4, fontSize: 11 }]}>
                  Shown as a "View on Website" link in the product sheet. Leave blank to hide.
                </Text>
              </Field>
            </View>
            <View style={form.card}>
              <SectionHeader title="Allergens" icon="alert-triangle" color={RED} />
              <View style={form.tagGrid}>
                {ALLERGEN_LIST.map(a => (
                  <TagChip key={a} label={a} active={f.allergens.includes(a)} color={RED} onPress={() => toggleArr('allergens', a)} />
                ))}
              </View>
              <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 12 }} />
              <SectionHeader title="Dietary Tags" icon="heart" color={GREEN} />
              <View style={form.tagGrid}>
                {DIETARY_LIST.map(d => (
                  <TagChip key={d} label={d} active={f.dietaryTags.includes(d)} color={GREEN} onPress={() => toggleArr('dietaryTags', d)} />
                ))}
              </View>
            </View>
            <View style={form.card}>
              <SectionHeader title="Product Info" icon="file-text" color={PURPLE} />
              <Field label="Ingredients">
                <TextF value={f.ingredients} onChange={v => upd('ingredients', v)} placeholder="Flour, Butter, Sugar, Chocolate chips…" multiline lines={3} />
              </Field>
              <Field label="Nutrition Info">
                <TextF value={f.nutritionInfo} onChange={v => upd('nutritionInfo', v)} placeholder="Energy, Protein, Fat, Carbs…" multiline lines={3} />
              </Field>
              <Field label="Storage Instructions">
                <TextF value={f.storageInstructions} onChange={v => upd('storageInstructions', v)} placeholder="Store in airtight container…" multiline lines={2} />
              </Field>
              <Field label="Serving Instructions">
                <TextF value={f.servingInstructions} onChange={v => upd('servingInstructions', v)} placeholder="Best served at room temperature…" multiline lines={2} />
              </Field>
            </View>
            </>}

            {/* ════════════════════════════════════════════════════════
                TAB 4 — INVENTORY: Stock, order rules, variants
               ════════════════════════════════════════════════════════ */}
            {modalTab === 'inventory' && <>
            <View style={form.card}>
              <SectionHeader title="Stock Management" icon="box" color={PURPLE} />
              <View style={form.row2}>
                <View style={{ flex: 1 }}>
                  <Field label="Current Stock">
                    <TextF value={f.stockCount} onChange={v => upd('stockCount', v)} placeholder="Empty = unlimited" numeric />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Low Stock Alert At">
                    <TextF value={f.lowStockThreshold} onChange={v => upd('lowStockThreshold', v)} placeholder="10" numeric />
                  </Field>
                </View>
              </View>
              <Field label="Sort Order">
                <TextF value={f.sortOrder} onChange={v => upd('sortOrder', v)} placeholder="0 = default" numeric />
              </Field>
            </View>
            <View style={form.card}>
              <SectionHeader title="Order Rules" icon="sliders" color={AMBER} />
              <View style={form.row2}>
                <View style={{ flex: 1 }}>
                  <Field label="Min Order Qty">
                    <TextF value={f.minOrderQty} onChange={v => upd('minOrderQty', v)} placeholder="1" numeric />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Max Order Qty">
                    <TextF value={f.maxOrderQty} onChange={v => upd('maxOrderQty', v)} placeholder="No limit" numeric />
                  </Field>
                </View>
              </View>
              <Field label="Lead Time (mins)">
                <TextF value={f.leadTimeMins} onChange={v => upd('leadTimeMins', v)} placeholder="e.g. 30" numeric />
              </Field>
              <Field label="Available Days">
                <View style={form.tagGrid}>
                  {DAYS_LIST.map(d => (
                    <TagChip key={d} label={d} active={f.availableDays.includes(d)} color={BLUE} onPress={() => toggleArr('availableDays', d)} />
                  ))}
                </View>
              </Field>
              <Field label="Available Times">
                <TextF value={f.availableTimes} onChange={v => upd('availableTimes', v)} placeholder="e.g. 07:00-15:00" />
              </Field>
            </View>
            {editing && initial?.id && <VariantsCard productId={initial.id} />}
            </>}

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Category list sub-screen ──────────────────────────────────────────────────
function CatalogTab() {
  const qc = useQueryClient();
  const [catModal, setCatModal] = useState(false);
  const [editCat, setEditCat] = useState<any>(null);
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catSaving, setCatSaving] = useState(false);

  const { data, refetch, isRefetching } = useQuery({
    queryKey: ['director-categories'],
    queryFn: () => api.director.categories(),
  });
  const cats: any[] = data?.data ?? [];

  const openAddCat = () => { setEditCat(null); setCatName(''); setCatSlug(''); setCatDesc(''); setCatModal(true); };
  const openEditCat = (c: any) => { setEditCat(c); setCatName(c.name); setCatSlug(c.slug); setCatDesc(c.description ?? ''); setCatModal(true); };

  const saveCat = async () => {
    if (!catName.trim()) return Alert.alert('Name required');
    setCatSaving(true);
    try {
      const slug = catSlug.trim() || catName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      if (editCat) {
        await api.director.updateCategory(editCat.id, { name: catName.trim(), slug, description: catDesc.trim() || undefined });
      } else {
        await api.director.createCategory({ name: catName.trim(), slug, description: catDesc.trim() || undefined });
      }
      await qc.invalidateQueries({ queryKey: ['director-categories'] });
      setCatModal(false);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setCatSaving(false); }
  };

  const toggleCatActive = async (c: any) => {
    try {
      await api.director.updateCategory(c.id, { isActive: !c.isActive });
      await qc.invalidateQueries({ queryKey: ['director-categories'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const deleteCat = (c: any) => {
    Alert.alert('Delete Category', `Delete "${c.name}"? Products in this category will need to be reassigned.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.director.deleteCategory(c.id);
          await qc.invalidateQueries({ queryKey: ['director-categories'] });
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={cats}
        keyExtractor={c => c.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
        ListEmptyComponent={<Text style={{ color: MUTED, textAlign: 'center', marginTop: 60, fontWeight: '400' }}>No categories yet</Text>}
        renderItem={({ item: c }) => (
          <View style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: TEXT, fontSize: 14 }}>{c.name}</Text>
              <Text style={{ fontWeight: '400', color: MUTED, fontSize: 12 }}>/{c.slug}</Text>
              {c.description ? <Text style={{ fontWeight: '400', color: MUTED, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{c.description}</Text> : null}
            </View>
            <Switch value={c.isActive ?? true} onValueChange={() => toggleCatActive(c)} trackColor={{ false: BORDER, true: GREEN }} thumbColor="#fff" />
            <Pressable onPress={() => openEditCat(c)} style={{ padding: 8 }} hitSlop={4}>
              <Feather name="edit-2" size={16} color={BLUE} />
            </Pressable>
            <Pressable onPress={() => deleteCat(c)} style={{ padding: 8 }} hitSlop={4}>
              <Feather name="trash-2" size={16} color={RED} />
            </Pressable>
          </View>
        )}
      />

      {/* FAB */}
      <Pressable onPress={openAddCat} style={[styles.fab, { backgroundColor: NAVY, bottom: 20 }]}>
        <Feather name="plus" size={20} color="#fff" />
        <Text style={[styles.fabText, { fontWeight: '700' }]}>Add Category</Text>
      </Pressable>

      {/* Category modal */}
      <Modal visible={catModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCatModal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={[modal.header, { paddingTop: 16 }]}>
            <Pressable onPress={() => setCatModal(false)} style={modal.closeBtn}><Feather name="x" size={18} color={TEXT} /></Pressable>
            <Text style={[modal.title, { fontWeight: '700' }]}>{editCat ? 'Edit Category' : 'New Category'}</Text>
            <Pressable onPress={saveCat} style={[modal.saveBtn, { backgroundColor: catSaving ? MUTED : NAVY }]} disabled={catSaving}>
              <Text style={[modal.saveBtnText, { fontWeight: '600' }]}>{catSaving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View style={form.card}>
              <Field label="Name" required>
                <TextInput value={catName} onChangeText={setCatName} placeholder="Coffee" placeholderTextColor={MUTED} style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]} />
              </Field>
              <Field label="Slug (URL key)">
                <TextInput value={catSlug} onChangeText={setCatSlug} placeholder="coffee" placeholderTextColor={MUTED} style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]} autoCapitalize="none" />
              </Field>
              <Field label="Description">
                <TextInput value={catDesc} onChangeText={setCatDesc} placeholder="Short description…" placeholderTextColor={MUTED} style={[form.input, { fontWeight: '400', color: TEXT, height: 80, textAlignVertical: 'top', paddingTop: 12 }]} multiline />
              </Field>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Option Groups sub-screen ──────────────────────────────────────────────────
function OptionsTab() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const SEL_COLORS: Record<string, string> = { single: BLUE, multi: PURPLE, text: AMBER };

  // ── Group CRUD state ────────────────────────────────────────────────────────
  const [groupModal, setGroupModal] = useState(false);
  const [editGroup, setEditGroup]   = useState<any>(null);
  const [gName, setGName]           = useState('');
  const [gType, setGType]           = useState<'single' | 'multi' | 'text'>('single');
  const [gRequired, setGRequired]   = useState(false);
  const [gCatIds, setGCatIds]       = useState<string[]>([]);
  const [gSaving, setGSaving]       = useState(false);

  // ── Option CRUD state ───────────────────────────────────────────────────────
  const [optModal, setOptModal]     = useState(false);
  const [editOpt, setEditOpt]       = useState<any>(null);
  const [optGroupId, setOptGroupId] = useState('');
  const [oName, setOName]           = useState('');
  const [oPrice, setOPrice]         = useState('');
  const [oDefault, setODefault]     = useState(false);
  const [oSaving, setOSaving]       = useState(false);

  const { data, refetch, isRefetching } = useQuery({
    queryKey: ['director-option-groups'],
    queryFn: () => api.director.optionGroups(),
  });
  const groups: any[] = data?.data ?? [];

  const { data: catData } = useQuery({
    queryKey: ['director-categories'],
    queryFn: () => api.director.categories(),
  });
  const categories: any[] = catData?.data ?? [];

  const toggleExpand = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // ── Group actions ───────────────────────────────────────────────────────────
  const openAddGroup = () => {
    setEditGroup(null); setGName(''); setGType('single'); setGRequired(false); setGCatIds([]);
    setGroupModal(true);
  };
  const openEditGroup = (g: any) => {
    setEditGroup(g); setGName(g.name); setGType(g.selectionType);
    setGRequired(g.isRequired ?? false); setGCatIds(g.appliesToCategoryIds ?? []);
    setGroupModal(true);
  };
  const saveGroup = async () => {
    if (!gName.trim()) return Alert.alert('Name required');
    setGSaving(true);
    try {
      const payload = { name: gName.trim(), selectionType: gType, isRequired: gRequired, appliesToCategoryIds: gCatIds };
      if (editGroup) { await api.director.updateOptionGroup(editGroup.id, payload); }
      else           { await api.director.createOptionGroup(payload); }
      await qc.invalidateQueries({ queryKey: ['director-option-groups'] });
      setGroupModal(false);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setGSaving(false); }
  };
  const deleteGroup = (g: any) => {
    Alert.alert('Delete Group', `Delete "${g.name}" and all its options?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.director.deleteOptionGroup(g.id); await qc.invalidateQueries({ queryKey: ['director-option-groups'] }); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };
  const toggleGroupActive = async (g: any) => {
    try { await api.director.updateOptionGroup(g.id, { isActive: !g.isActive }); await qc.invalidateQueries({ queryKey: ['director-option-groups'] }); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  // ── Option actions ──────────────────────────────────────────────────────────
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
      const adj = oPrice ? Math.round(parseFloat(oPrice) * 100) : 0;
      const payload = { name: oName.trim(), priceAdjustmentCents: adj, isDefault: oDefault };
      if (editOpt) { await api.director.updateOption(optGroupId, editOpt.id, payload); }
      else         { await api.director.createOption(optGroupId, payload); }
      await qc.invalidateQueries({ queryKey: ['director-option-groups'] });
      setOptModal(false);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setOSaving(false); }
  };
  const deleteOpt = (groupId: string, opt: any) => {
    Alert.alert('Delete Option', `Delete "${opt.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.director.deleteOption(groupId, opt.id); await qc.invalidateQueries({ queryKey: ['director-option-groups'] }); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={groups}
        keyExtractor={g => g.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
        ListEmptyComponent={<Text style={{ color: MUTED, textAlign: 'center', marginTop: 60, fontWeight: '400' }}>No option groups yet. Tap + to add one.</Text>}
        renderItem={({ item: g }) => {
          const isExp      = expanded[g.id] ?? false;
          const selCol     = SEL_COLORS[g.selectionType] ?? BLUE;
          const appliedCats = categories.filter(c => (g.appliesToCategoryIds ?? []).includes(c.id)).map(c => c.name).join(', ') || 'All products';
          const activeOpts  = (g.options ?? []).filter((o: any) => o.isActive !== false);
          return (
            <View style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' }}>
              {/* Group header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 14 }}>
                <Pressable style={{ flex: 1 }} onPress={() => toggleExpand(g.id)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontWeight: '700', color: TEXT, fontSize: 14 }}>{g.name}</Text>
                    {g.isRequired && <View style={{ backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}><Text style={{ fontSize: 10, color: '#D97706', fontWeight: '600' }}>Required</Text></View>}
                    <View style={{ backgroundColor: selCol + '18', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, color: selCol, fontWeight: '600' }}>{g.selectionType}</Text>
                    </View>
                  </View>
                  <Text style={{ fontWeight: '400', color: MUTED, fontSize: 11, marginTop: 3 }}>
                    {activeOpts.length} option{activeOpts.length !== 1 ? 's' : ''} · {appliedCats}
                  </Text>
                </Pressable>
                <Switch value={g.isActive ?? true} onValueChange={() => toggleGroupActive(g)} trackColor={{ false: BORDER, true: GREEN }} thumbColor="#fff" ios_backgroundColor={BORDER} />
                <Pressable onPress={() => openEditGroup(g)} style={{ padding: 6 }} hitSlop={4}>
                  <Feather name="edit-2" size={15} color={BLUE} />
                </Pressable>
                <Pressable onPress={() => deleteGroup(g)} style={{ padding: 6 }} hitSlop={4}>
                  <Feather name="trash-2" size={15} color={RED} />
                </Pressable>
                <Pressable onPress={() => toggleExpand(g.id)} style={{ padding: 4 }} hitSlop={4}>
                  <Feather name={isExp ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
                </Pressable>
              </View>

              {/* Expanded options list */}
              {isExp && (
                <View style={{ borderTopWidth: 1, borderTopColor: BORDER, padding: 12, gap: 8 }}>
                  {g.selectionType === 'text' ? (
                    <Text style={{ color: MUTED, fontWeight: '400', fontSize: 13, fontStyle: 'italic', paddingVertical: 4 }}>
                      Free text input — customers type a note. No individual options needed.
                    </Text>
                  ) : (
                    <>
                      {(g.options ?? []).map((opt: any) => (
                        <View key={opt.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: opt.isDefault ? '#F0FFF4' : BG, borderRadius: 10, borderWidth: 1, borderColor: opt.isDefault ? '#86EFAC' : BORDER }}>
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
                      <Pressable
                        onPress={() => openAddOpt(g.id)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: BLUE, borderStyle: 'dashed', backgroundColor: BLUE + '08', marginTop: 2 }}
                      >
                        <Feather name="plus" size={14} color={BLUE} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>Add Option</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />

      <Pressable onPress={openAddGroup} style={[styles.fab, { backgroundColor: NAVY, bottom: 20 }]}>
        <Feather name="plus" size={20} color="#fff" />
        <Text style={[styles.fabText, { fontWeight: '700' }]}>Add Group</Text>
      </Pressable>

      {/* ── Group Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={groupModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setGroupModal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={[modal.header, { paddingTop: 16 }]}>
            <Pressable onPress={() => setGroupModal(false)} style={modal.closeBtn}><Feather name="x" size={18} color={TEXT} /></Pressable>
            <Text style={[modal.title, { fontWeight: '700' }]}>{editGroup ? 'Edit Option Group' : 'New Option Group'}</Text>
            <Pressable onPress={saveGroup} style={[modal.saveBtn, { backgroundColor: gSaving ? MUTED : NAVY }]} disabled={gSaving}>
              <Text style={[modal.saveBtnText, { fontWeight: '600' }]}>{gSaving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View style={form.card}>
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
            </View>
            {categories.length > 0 && (
              <View style={form.card}>
                <SectionHeader title="Applies To Categories" icon="grid" color={BLUE} />
                <Text style={[form.label, { fontWeight: '400', color: MUTED, marginBottom: 8 }]}>
                  This option group appears for all products in the selected categories. Leave none selected for per-product linking.
                </Text>
                <View style={form.tagGrid}>
                  {categories.map(c => (
                    <TagChip key={c.id} label={c.name} active={gCatIds.includes(c.id)}
                      color={CAT_COLORS[c.slug] ?? BLUE}
                      onPress={() => setGCatIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])} />
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Option Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={optModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOptModal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={[modal.header, { paddingTop: 16 }]}>
            <Pressable onPress={() => setOptModal(false)} style={modal.closeBtn}><Feather name="x" size={18} color={TEXT} /></Pressable>
            <Text style={[modal.title, { fontWeight: '700' }]}>{editOpt ? 'Edit Option' : 'New Option'}</Text>
            <Pressable onPress={saveOpt} style={[modal.saveBtn, { backgroundColor: oSaving ? MUTED : NAVY }]} disabled={oSaving}>
              <Text style={[modal.saveBtnText, { fontWeight: '600' }]}>{oSaving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View style={form.card}>
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
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DirectorProductsScreen() {
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'products' | 'catalog' | 'options'>('products');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-products'],
    queryFn: () => api.director.products(),
  });

  const { data: catsData } = useQuery({
    queryKey: ['director-categories'],
    queryFn: () => api.director.categories(),
  });
  const dbCategories: any[] = catsData?.data ?? [];

  const all: any[] = data?.data ?? [];

  const products = useMemo(() => {
    let list = [...all];
    if (filter === 'Available')  list = list.filter(p => p.isAvailable && p.isActive);
    if (filter === 'Featured')   list = list.filter(p => p.isFeatured);
    if (filter === 'Sold Out')   list = list.filter(p => p.isSoldOut);
    if (filter === 'Low Stock')  list = list.filter(p => p.stockCount != null && p.stockCount <= p.lowStockThreshold);
    if (filter === 'Archived')   list = list.filter(p => !p.isActive);
    else if (filter === 'All')   list = list.filter(p => p.isActive);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [all, filter, search]);

  const toggle = async (product: any, field: string, value: boolean) => {
    Haptics.selectionAsync();
    try {
      await api.director.updateProduct(product.id, { [field]: value });
      await qc.invalidateQueries({ queryKey: ['director-products'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleArchive = (product: any) => {
    Alert.alert('Archive Product', `Archive "${product.name}"? It will be hidden from all views.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: async () => {
        try { await api.director.archiveProduct(product.id); await qc.invalidateQueries({ queryKey: ['director-products'] }); } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const handleSave = async (data: any) => {
    try {
      if (editTarget) {
        await api.director.updateProduct(editTarget.id, data);
      } else {
        await api.director.createProduct(data);
      }
      await qc.invalidateQueries({ queryKey: ['director-products'] });
      setModalOpen(false);
      setEditTarget(null);
    } catch (e: any) { Alert.alert('Error', e.message); throw e; }
  };

  const openEdit = (product: any) => { setEditTarget(product); setModalOpen(true); };
  const openAdd  = () => { setEditTarget(null); setModalOpen(true); };

  const TAB_ITEMS = [
    { id: 'products' as const, label: 'Products', icon: 'package' },
    { id: 'catalog'  as const, label: 'Categories', icon: 'grid' },
    { id: 'options'  as const, label: 'Options', icon: 'sliders' },
  ] as const;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Top tab bar */}
      <View style={{ flexDirection: 'row', backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        {TAB_ITEMS.map(t => {
          const active = activeTab === t.id;
          return (
            <Pressable key={t.id} onPress={() => { setActiveTab(t.id); Haptics.selectionAsync(); }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 12, gap: 3, borderBottomWidth: 2.5, borderBottomColor: active ? NAVY : 'transparent' }}>
              <Feather name={t.icon as any} size={16} color={active ? NAVY : MUTED} />
              <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? NAVY : MUTED }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Catalog tab */}
      {activeTab === 'catalog' && <CatalogTab />}
      {activeTab === 'options' && <OptionsTab />}

      {/* Products tab */}
      {activeTab !== 'catalog' && activeTab !== 'options' && (
      <>
      {/* Search bar */}
      <View style={[styles.searchBar, { borderColor: BORDER }]}>
        <Feather name="search" size={16} color={MUTED} />
        <TextInput
          value={search} onChangeText={setSearch}
          placeholder="Search products, SKU, category…"
          placeholderTextColor={MUTED}
          style={[styles.searchInput, { fontWeight: '400', color: TEXT }]}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {FILTER_TABS.map(t => (
          <Pressable key={t} onPress={() => setFilter(t)} style={[styles.filterTab, filter === t && { backgroundColor: NAVY, borderColor: NAVY }]}>
            <Text style={[styles.filterText, { fontWeight: '500' }, filter === t && { color: '#fff' }]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={p => p.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.count, { fontWeight: '400', color: MUTED }]}>
              {products.length} product{products.length !== 1 ? 's' : ''}
              {filter !== 'All' ? ` · ${filter}` : ''}
            </Text>
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 14 }}>
              <View style={{ backgroundColor: BORDER, width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="package" size={28} color={MUTED} />
              </View>
              <Text style={{ color: MUTED, fontWeight: '500', fontSize: 15 }}>No products {filter !== 'All' ? `in "${filter}"` : ''}</Text>
              <Pressable onPress={openAdd} style={[styles.emptyAddBtn, { backgroundColor: BLUE }]}>
                <Feather name="plus" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Add first product</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: p }) => {
            const catColor = CAT_COLORS[p.category] ?? MUTED;
            const priceFmt = `$${((p.priceCents ?? 0) / 100).toFixed(2)}`;
            const wsFmt    = p.wholesalePriceCents ? `$${(p.wholesalePriceCents / 100).toFixed(2)}` : null;
            const profitPct = p.costPriceCents && p.priceCents
              ? Math.round(((p.priceCents - p.costPriceCents) / p.priceCents) * 100)
              : null;
            return (
              <Pressable onPress={() => openEdit(p)} style={[styles.productCard, { backgroundColor: CARD, borderColor: p.isSoldOut ? '#FCA5A5' : (p.stockCount != null && p.stockCount <= p.lowStockThreshold ? '#FDE68A' : BORDER) }]}>
                {/* Status badges */}
                <View style={styles.badgeRow}>
                  {p.isFeatured    && <View style={[styles.badge, { backgroundColor: BLUE + '18'   }]}><Text style={[styles.badgeText, { color: BLUE   }]}>Featured</Text></View>}
                  {p.isNew         && <View style={[styles.badge, { backgroundColor: PINK + '18'   }]}><Text style={[styles.badgeText, { color: PINK   }]}>New</Text></View>}
                  {p.isLimitedDrop && <View style={[styles.badge, { backgroundColor: RED  + '18'   }]}><Text style={[styles.badgeText, { color: RED    }]}>Limited</Text></View>}
                  {p.isSoldOut     && <View style={[styles.badge, { backgroundColor: '#FEE2E2'     }]}><Text style={[styles.badgeText, { color: RED    }]}>Sold Out</Text></View>}
                  {p.isComingSoon  && <View style={[styles.badge, { backgroundColor: AMBER + '18'  }]}><Text style={[styles.badgeText, { color: AMBER  }]}>Soon</Text></View>}
                  {p.stockCount != null && p.stockCount <= p.lowStockThreshold && !p.isSoldOut &&
                    <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}><Text style={[styles.badgeText, { color: AMBER }]}>Low Stock ({p.stockCount})</Text></View>}
                </View>

                <View style={styles.productTop}>
                  {/* Thumbnail / category icon */}
                  {p.imageUrl ? (
                    <Image
                      source={{ uri: p.imageUrl }}
                      style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#F3F4F6' }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.catBox, { backgroundColor: catColor + '18', borderColor: catColor + '40' }]}>
                      <Feather name="package" size={14} color={catColor} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.productName, { fontWeight: '700', color: TEXT }]} numberOfLines={1}>{p.name}</Text>
                    {p.shortDescription && <Text style={[styles.productSub, { fontWeight: '400', color: MUTED }]} numberOfLines={1}>{p.shortDescription}</Text>}
                    <View style={styles.metaRow}>
                      <View style={[styles.catPill, { backgroundColor: catColor + '18' }]}>
                        <Text style={[styles.catPillText, { fontWeight: '600', color: catColor }]}>{p.category}</Text>
                      </View>
                      {p.sku && <Text style={[styles.skuText, { fontWeight: '400', color: MUTED }]}>#{p.sku}</Text>}
                    </View>
                  </View>
                  <View style={styles.priceStack}>
                    <Text style={[styles.price, { fontWeight: '700', color: TEXT }]}>{priceFmt}</Text>
                    {wsFmt && <Text style={[styles.wsPrice, { fontWeight: '400', color: MUTED }]}>WS {wsFmt}</Text>}
                    {profitPct != null && <Text style={[styles.profit, { fontWeight: '600', color: GREEN }]}>{profitPct}% margin</Text>}
                  </View>
                </View>

                {/* Toggle 2×2 grid */}
                <View style={[styles.toggleGrid, { borderTopColor: BORDER }]}>
                  {[
                    { label: 'Available', field: 'isAvailable', value: p.isAvailable ?? true,  color: GREEN },
                    { label: 'Featured',  field: 'isFeatured',  value: p.isFeatured  ?? false, color: BLUE  },
                    { label: 'New',       field: 'isNew',       value: p.isNew       ?? false, color: PINK  },
                    { label: 'Sold Out',  field: 'isSoldOut',   value: p.isSoldOut   ?? false, color: RED   },
                  ].map((t, i) => (
                    <View key={t.field} style={[
                      styles.toggleGridItem,
                      i % 2 === 1 && { borderLeftWidth: 1, borderLeftColor: BORDER },
                      i >= 2      && { borderTopWidth: 1,  borderTopColor: BORDER  },
                    ]}>
                      <Text style={[styles.toggleLabel, { fontWeight: '600', color: TEXT, fontSize: 13 }]}>{t.label}</Text>
                      <Switch value={t.value} onValueChange={v => toggle(p, t.field, v)}
                        trackColor={{ false: '#D1D5DB', true: t.color }}
                        thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
                    </View>
                  ))}
                </View>

                {/* Action row */}
                <View style={[styles.actionRow, { borderTopColor: BORDER }]}>
                  <Pressable onPress={() => openEdit(p)} style={styles.actionBtn}>
                    <Feather name="edit-2" size={13} color={BLUE} />
                    <Text style={[styles.actionText, { fontWeight: '500', color: BLUE }]}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => toggle(p, 'isLimitedDrop', !p.isLimitedDrop)} style={styles.actionBtn}>
                    <Feather name="zap" size={13} color={AMBER} />
                    <Text style={[styles.actionText, { fontWeight: '500', color: AMBER }]}>{p.isLimitedDrop ? 'Remove Drop' : 'Limited Drop'}</Text>
                  </Pressable>
                  <Pressable onPress={() => handleArchive(p)} style={styles.actionBtn}>
                    <Feather name="archive" size={13} color={MUTED} />
                    <Text style={[styles.actionText, { fontWeight: '500', color: MUTED }]}>Archive</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* FAB */}
      <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openAdd(); }}
        style={[styles.fab, { backgroundColor: NAVY, bottom: 20 }]}>
        <Feather name="plus" size={22} color="#fff" />
        <Text style={[styles.fabText, { fontWeight: '700' }]}>Add Product</Text>
      </Pressable>

      <ProductModal
        visible={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSave={handleSave}
        initial={editTarget}
        editing={!!editTarget}
        categories={dbCategories}
      />
      </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar:     { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, marginBottom: 0, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 44 },
  searchInput:   { flex: 1, fontSize: 14, height: 44 },
  filterScroll:  { flexShrink: 0 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row' },
  filterTab:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  filterText:    { fontSize: 13, color: MUTED },
  count:         { fontSize: 13, marginBottom: 4 },
  productCard:   { borderRadius: 16, borderWidth: 1, overflow: 'hidden', backgroundColor: CARD },
  badgeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10, paddingBottom: 0 },
  badge:         { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText:     { fontSize: 11, fontWeight: '600' },
  productTop:    { flexDirection: 'row', gap: 12, padding: 14 },
  catBox:        { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  productName:   { fontSize: 15 },
  productSub:    { fontSize: 12, marginTop: 2 },
  metaRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' },
  catPill:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  catPillText:   { fontSize: 11 },
  skuText:       { fontSize: 11 },
  priceStack:    { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  price:         { fontSize: 16 },
  wsPrice:       { fontSize: 12 },
  profit:        { fontSize: 11 },
  toggleGrid:     { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1 },
  toggleGridItem: { width: '50%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  toggleLabel:    { fontSize: 11 },
  actionRow:     { flexDirection: 'row', borderTopWidth: 1 },
  actionBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10 },
  actionText:    { fontSize: 12 },
  emptyAddBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  fab:           { position: 'absolute', right: 20, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 28, elevation: 6, shadowColor: NAVY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  fabText:       { color: '#fff', fontSize: 15 },
});

const modal = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 },
  closeBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  title:       { flex: 1, fontSize: 17, textAlign: 'center' },
  saveBtn:     { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12 },
  saveBtnText: { color: '#fff', fontSize: 14 },
});

const form = StyleSheet.create({
  card:          { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon:   { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:  { fontSize: 15 },
  fieldWrap:     { gap: 6 },
  label:         { fontSize: 12 },
  input:         { backgroundColor: BG, borderRadius: 10, paddingHorizontal: 14, paddingTop: 12, borderWidth: 1, borderColor: BORDER, fontSize: 14 },
  row2:          { flexDirection: 'row', gap: 10 },
  toggleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: BORDER },
  toggleLabel:   { fontSize: 14 },
  toggleDesc:    { fontSize: 12, marginTop: 2 },
  tagGrid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  photoPlaceholder:   { height: 120, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: BORDER },
  photoPlaceholderText:{ fontSize: 12 },
  uploadArea: {
    height: 160, borderRadius: 14, backgroundColor: BLUE + '08', borderWidth: 1.5,
    borderColor: BLUE + '40', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
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
