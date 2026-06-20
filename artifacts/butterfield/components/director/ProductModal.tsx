import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG          = '#EFF6FF';
const CARD        = '#FFFFFF';
const BLUE        = '#1493FF';
const NAVY        = '#1A2B4A';
const RED         = '#EF4444';
const TEXT        = '#1C1C1E';
const MUTED       = '#8E8E93';
const BORDER      = '#E5E7EB';
const GLASS_BG    = 'rgba(255,255,255,0.6)';
const GLASS_BORDER= 'rgba(255,255,255,0.85)';
const GREEN       = '#22C55E';
const AMBER       = '#F59E0B';
const PURPLE      = '#8B5CF6';
const PINK        = '#EC4899';

// ─── Data constants ────────────────────────────────────────────────────────────
const PRODUCT_TYPES = ['standard','limited','seasonal','wholesale-only','staff-only'];
const ALLERGEN_LIST = ['Gluten','Dairy','Eggs','Nuts','Peanuts','Soy','Sesame','Sulphites','Fish','Shellfish'];
const DIETARY_LIST  = ['Vegan','Vegetarian','Gluten-Free','Dairy-Free','Nut-Free','Halal','Kosher','Low-Sugar'];
const DAYS_LIST     = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const CAT_COLORS: Record<string, string> = {
  cookies:'#F59E0B', coffee:'#8B5CF6', tea:'#22C55E', matcha:'#16A34A',
  desserts:'#EC4899', bundles:'#1493FF', sandwiches:'#22C55E', merch:'#6B7280',
  pastries:'#F97316', drinks:'#06B6D4', 'iced-drinks':'#06B6D4',
  boxes:'#F59E0B', seasonal:'#F97316', specials:'#EF4444', other:'#8E8E93',
};
const PRESET_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981',
  '#06B6D4', '#1493FF', '#8B5CF6', '#EC4899',
  '#92400E', '#0F766E', '#4F46E5', '#64748B',
];
const STATUS_OPTIONS = ['All','Active','Draft','Archived'] as const;
type StatusOption = typeof STATUS_OPTIONS[number];
const SORT_OPTIONS = ['Name A → Z','Name Z → A','Price: Low → High','Price: High → Low','Newest First'] as const;
type SortOption = typeof SORT_OPTIONS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Section header (modal sections) ──────────────────────────────────────────
function SectionHeader({ title, icon, color }: { title: string; icon: string; color: string }) {
  return (
    <View style={form.sectionHeader}>
      <View style={[form.sectionIcon, { backgroundColor: color + '33', borderColor: color + '55' }]}>
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
        trackColor={{ false: BORDER, true: color ?? BLUE }} thumbColor="#fff" ios_backgroundColor="transparent" />
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

// ─── Modal drag handle ────────────────────────────────────────────────────────
function DragHandle() {
  return (
    <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4, backgroundColor: CARD }}>
      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER }} />
    </View>
  );
}

// ─── Derive objectPath from a stored URL ──────────────────────────────────────
function getObjectPath(url: string): string | null {
  const match = url.match(/(\/objects\/.+?)(\?|$)/);
  return match ? match[1] : null;
}

// ─── Build displayable URL from stored image path ────────────────────────────
const API_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : '';
const CATEGORY_SORT_RECOMMENDATIONS: Array<{ key: string; label: string; sortOrder: number }> = [
  { key: 'cookies', label: 'Cookies', sortOrder: 10 },
  { key: 'coffee', label: 'Coffee', sortOrder: 20 },
  { key: 'matcha', label: 'Matcha', sortOrder: 30 },
  { key: 'tea', label: 'Tea', sortOrder: 35 },
  { key: 'cold-drinks', label: 'Iced Drinks', sortOrder: 40 },
  { key: 'soft-serve', label: 'Soft Serve', sortOrder: 50 },
  { key: 'boxes', label: 'Boxes', sortOrder: 60 },
  { key: 'bundles', label: 'Boxes / Bundles', sortOrder: 60 },
  { key: 'merch', label: 'Merch', sortOrder: 70 },
  { key: 'specials', label: 'Specials', sortOrder: 80 },
  { key: 'seasonal', label: 'Seasonal', sortOrder: 90 },
];
const PRODUCT_SORT_RECOMMENDATIONS: Record<string, Record<string, number>> = {
  cookies: {
    'Choc Chip Cookie': 10, 'M&Ms Cookie': 20, Biscoff: 30, 'Red Velvet Cookie': 40,
    'Pistachio Cookie': 50, 'Bueno Cookie': 60, 'Almond Croissant Cookie': 70,
  },
  coffee: {
    Latte: 10, Cappuccino: 20, 'Flat White': 30, 'Long Black': 40, Mocha: 50,
    'White Choc Mocha': 60, 'Chai Latte': 70, 'Belgian Choc': 80, Piccolo: 90,
    Espresso: 100, Macchiato: 110, 'Cold Brew': 120,
  },
  matcha: { Matcha: 10, 'Dirty Matcha': 20 },
  tea: {
    'Earl Grey': 10, 'English Breakfast': 20, Peppermint: 30, 'Lemongrass & Ginger': 40,
    'Green Sencha': 50, 'Masala Chai': 60, 'Green Tea & Jasmine': 70, 'Red Silk': 80,
  },
  desserts: { 'Cookie & Cream Sandwich': 10, 'Free Soft Serve': 20 },
  'soft-serve': { 'Free Soft Serve': 20 },
  boxes: { 'Cookie Party Box': 10 },
  bundles: { 'Cookie Party Box': 10 },
  merch: { 'Retro Shirt': 10, 'Bucket Hat': 20 },
};
function toDisplayUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return API_DOMAIN ? `${API_DOMAIN}${url}` : url;
}
function normalizeSortKey(value: string | null | undefined): string {
  return `${value ?? ''}`.trim().toLowerCase();
}
function getRecommendedCategorySort(value: string | null | undefined): number | null {
  const key = normalizeSortKey(value);
  const match = CATEGORY_SORT_RECOMMENDATIONS.find((item) => item.key === key || normalizeSortKey(item.label) === key);
  return match?.sortOrder ?? null;
}
function getRecommendedProductSort(category: string | null | undefined, name: string | null | undefined): number | null {
  const categoryMap = PRODUCT_SORT_RECOMMENDATIONS[normalizeSortKey(category)];
  if (!categoryMap) return null;
  const cleanName = `${name ?? ''}`.trim();
  if (!cleanName) return null;
  return categoryMap[cleanName] ?? null;
}

// ─── Default form state ────────────────────────────────────────────────────────
const BLANK = () => ({
  name: '', shortDescription: '', description: '',
  category: 'cookies', categoryId: null as string | null, productType: 'standard',
  price: '', salePrice: '', costPrice: '', wholesalePrice: '',
  gstIncluded: true, sku: '', barcode: '',
  isAvailable: true, isFeatured: false, isNew: false,
  isWholesaleAvailable: true, isStaffOnly: false, isAppOnly: false, isPosOnly: false,
  isLimitedDrop: false, isSoldOut: false, isComingSoon: false, isPickupOnly: false,
  allergens: [] as string[], dietaryTags: [] as string[], tags: [] as string[],
  ingredients: '', nutritionInfo: '', storageInstructions: '', servingInstructions: '',
  minOrderQty: '1', maxOrderQty: '', leadTimeMins: '', availableTimes: '',
  availableDays: [] as string[], stockCount: '', lowStockThreshold: '10',
  sortOrder: '0', imageUrl: '', galleryUrls: [] as string[],
  productUrl: '',
});
type FormState = ReturnType<typeof BLANK>;

// ─── Add/Edit Modal ────────────────────────────────────────────────────────────
function ProductModal({
  visible, onClose, onSave, initial, editing, categories = [],
}: { visible: boolean; onClose: () => void; onSave: (d: any) => Promise<void>; initial?: any; editing?: boolean; categories?: any[] }) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [f, setF] = useState<FormState>(BLANK());
  const recommendedProductSort = useMemo(
    () => getRecommendedProductSort(f.category, f.name),
    [f.category, f.name],
  );
  React.useEffect(() => {
    if (visible && initial) {
      setF({
        name: initial.name ?? '',
        shortDescription: initial.shortDescription ?? '',
        description: initial.description ?? '',
        category: initial.category ?? 'cookies',
        categoryId: initial.categoryId ?? null,
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
        isPosOnly: (initial as any).isPosOnly ?? false,
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

  // ── Product image upload ────────────────────────────────────────────────────
  const handlePickProductImage = async (isReplace: boolean) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Please allow photo library access in Settings.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, quality: 0.88, selectionLimit: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) { Alert.alert('File too large', 'Please choose an image under 8 MB.'); return; }
      const filename = asset.fileName ?? asset.uri.split('/').pop() ?? 'product.jpg';
      const contentType = asset.mimeType ?? 'image/jpeg';
      const oldUrl = f.imageUrl.trim();
      setUploading(true);
      const { objectPath } = await api.storage.uploadProductImage(asset.uri, filename, contentType, f.category, f.name.trim() || 'product');
      const storagePath = `/api/storage${objectPath}`;
      if (isReplace && oldUrl) {
        const oldPath = getObjectPath(oldUrl);
        if (oldPath) api.storage.deleteProductImage(oldPath).catch(() => {});
      }
      upd('imageUrl', storagePath);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload image. Please try again.');
    } finally { setUploading(false); }
  };
  const handleRemoveProductImage = () => {
    Alert.alert('Remove Photo', 'Remove this product photo?', [
      { text: 'Remove', style: 'destructive', onPress: () => {
        const url = f.imageUrl.trim();
        if (url) { const path = getObjectPath(url); if (path) api.storage.deleteProductImage(path).catch(() => {}); }
        upd('imageUrl', '');
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  const handlePickGalleryImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Please allow photo library access in Settings.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.85, selectionLimit: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) { Alert.alert('File too large', 'Please choose an image under 8 MB.'); return; }
      const filename = asset.fileName ?? asset.uri.split('/').pop() ?? 'gallery.jpg';
      const contentType = asset.mimeType ?? 'image/jpeg';
      setUploading(true);
      const { objectPath } = await api.storage.uploadProductImage(asset.uri, filename, contentType, f.category, (f.name.trim() || 'product') + '-gallery');
      const storagePath = `/api/storage${objectPath}`;
      Haptics.selectionAsync();
      upd('galleryUrls', [...f.galleryUrls, storagePath]);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload image.');
    } finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!f.name.trim()) { Alert.alert('Required', 'Product name is required.'); return; }
    if (!f.price.trim()) { Alert.alert('Required', 'Price is required.'); return; }
    if (categories.length > 0 && !categories.some((c: any) => c.slug === f.category)) {
      Alert.alert('Required', 'Please select a category.'); return;
    }
    setSaving(true);
    try {
      await onSave({
        name: f.name.trim(),
        shortDescription: f.shortDescription.trim() || null,
        description: f.description.trim(),
        category: f.category, categoryId: f.categoryId, productType: f.productType,
        priceCents:          displayToCents(f.price),
        salePriceCents:      f.salePrice      ? displayToCents(f.salePrice)      : null,
        costPriceCents:      f.costPrice      ? displayToCents(f.costPrice)      : null,
        wholesalePriceCents: f.wholesalePrice ? displayToCents(f.wholesalePrice) : null,
        gstIncluded: f.gstIncluded,
        sku: f.sku.trim() || null, barcode: f.barcode.trim() || null,
        imageUrl: f.imageUrl.trim() || null,
        galleryUrls: f.galleryUrls.filter(u => u.trim()).length
          ? JSON.stringify(f.galleryUrls.filter(u => u.trim())) : null,
        productUrl: f.productUrl.trim() || null,
        isAvailable: f.isAvailable, isFeatured: f.isFeatured, isNew: f.isNew,
        isWholesaleAvailable: f.isWholesaleAvailable, isStaffOnly: f.isStaffOnly,
        isAppOnly: f.isAppOnly, isPosOnly: f.isPosOnly, isLimitedDrop: f.isLimitedDrop,
        isSoldOut: f.isSoldOut, isComingSoon: f.isComingSoon, isPickupOnly: f.isPickupOnly,
        allergens:   f.allergens.length   ? f.allergens   : null,
        dietaryTags: f.dietaryTags.length ? f.dietaryTags : null,
        tags:        f.tags.length        ? f.tags        : null,
        ingredients:         f.ingredients.trim()         || null,
        nutritionInfo:       f.nutritionInfo.trim()       || null,
        storageInstructions: f.storageInstructions.trim() || null,
        servingInstructions: f.servingInstructions.trim() || null,
        minOrderQty:       parseInt(f.minOrderQty)    || 1,
        maxOrderQty:       f.maxOrderQty    ? parseInt(f.maxOrderQty)  : null,
        leadTimeMins:      f.leadTimeMins   ? parseInt(f.leadTimeMins) : null,
        availableTimes:    f.availableTimes.trim() || null,
        availableDays:     f.availableDays.length ? f.availableDays : null,
        stockCount:        f.stockCount     ? parseInt(f.stockCount) : null,
        lowStockThreshold: parseInt(f.lowStockThreshold) || 10,
        sortOrder:         parseInt(f.sortOrder) || 0,
      });
    } catch (e: any) {
      Alert.alert('Save failed', (e as Error).message ?? 'Could not save product.');
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: CARD }}>
        {/* Drag handle */}
        <DragHandle />
        {/* Modal header */}
        <View style={[modal.header, { paddingTop: 8 }]}>
          <Pressable onPress={onClose} style={modal.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={[modal.title, { fontWeight: '700', color: TEXT }]}>
            {editing ? 'Edit Product' : 'Add New Product'}
          </Text>
          <View style={{ width: 36 }} />
        </View>
        {/* Single-scroll content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}
        >
          {/* ── Section 1: Basic Information ─────────────────────────── */}
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
          <Field label="Category" required>
            {categories.length === 0 ? (
              <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ color: MUTED, fontSize: 13, fontWeight: '400' }}>No categories yet — add one in the Categories tab first.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {categories.map((c: any) => (
                    <TagChip key={c.id} label={c.name} active={f.category === c.slug}
                      color={CAT_COLORS[c.slug] ?? BLUE}
                      onPress={() => setF(p => ({ ...p, category: c.slug, categoryId: c.id }))} />
                  ))}
                </View>
              </ScrollView>
            )}
          </Field>
          <Field label="Product Type">
            <Segment options={PRODUCT_TYPES} value={f.productType} onChange={v => upd('productType', v)} />
          </Field>

          {/* ── Section 2: Pricing ───────────────────────────────────── */}
          <View style={{ height: 1, backgroundColor: BORDER }} />
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

          {/* ── Section 3: Photos ────────────────────────────────────── */}
          <View style={{ height: 1, backgroundColor: BORDER }} />
          <SectionHeader title="Photos" icon="image" color={BLUE} />
          <Text style={[form.label, { fontWeight: '500', color: MUTED, marginBottom: 4 }]}>Hero Image</Text>
          {f.imageUrl.trim() ? (
            <View style={{ gap: 10 }}>
              <Image source={{ uri: toDisplayUrl(f.imageUrl.trim()) }}
                style={{ width: '100%', height: 200, borderRadius: 12, backgroundColor: '#F3F4F6' }} resizeMode="cover" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => handlePickProductImage(true)} disabled={uploading}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, backgroundColor: BLUE + '15', borderWidth: 1, borderColor: BLUE }}>
                  {uploading ? <ActivityIndicator size="small" color={BLUE} /> : <Feather name="refresh-cw" size={14} color={BLUE} />}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>{uploading ? 'Uploading…' : 'Replace Photo'}</Text>
                </Pressable>
                <Pressable onPress={handleRemoveProductImage}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10, backgroundColor: RED + '12', borderWidth: 1, borderColor: RED + '60' }}>
                  <Feather name="trash-2" size={14} color={RED} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: RED }}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => handlePickProductImage(false)} disabled={uploading} style={form.uploadArea}>
              {uploading ? <ActivityIndicator size="large" color={BLUE} /> : (
                <>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: BLUE + '33', alignItems: 'center', justifyContent: 'center', marginBottom: 10, borderWidth: 1.5, borderColor: BLUE + '55' }}>
                    <Feather name="upload-cloud" size={26} color={BLUE} />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 4 }}>Upload Product Photo</Text>
                  <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED }}>JPG · PNG · WebP · HEIC  ·  Max 8 MB</Text>
                </>
              )}
            </Pressable>
          )}
          <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 4 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <Text style={[form.label, { fontWeight: '500', color: MUTED }]}>Gallery Images</Text>
            <Pressable onPress={handlePickGalleryImage} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name="upload" size={13} color={BLUE} />
              <Text style={{ fontSize: 12, color: BLUE, fontWeight: '600' }}>Upload</Text>
            </Pressable>
          </View>
          {f.galleryUrls.length === 0 ? (
            <Text style={{ fontSize: 12, color: MUTED, fontWeight: '400' }}>No gallery images — tap Upload to add more photos</Text>
          ) : (
            f.galleryUrls.map((url, idx) => (
              <View key={idx} style={{ gap: 6 }}>
                {url.trim() ? (
                  <View style={{ position: 'relative' }}>
                    <Image source={{ uri: toDisplayUrl(url.trim()) }}
                      style={{ width: '100%', height: 120, borderRadius: 10, backgroundColor: '#F3F4F6' }} resizeMode="cover" />
                    <Pressable
                      onPress={() => {
                        const path = getObjectPath(url);
                        if (path) api.storage.deleteProductImage(path).catch(() => {});
                        Haptics.selectionAsync();
                        upd('galleryUrls', f.galleryUrls.filter((_, i) => i !== idx));
                      }}
                      style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, padding: 5 }}>
                      <Feather name="x" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))
          )}

          {/* ── Section 4: Sale & Visibility ─────────────────────────── */}
          <View style={{ height: 1, backgroundColor: BORDER }} />
          <SectionHeader title="Sale & Visibility" icon="eye" color={GREEN} />
          <Toggle label="Available for sale"    value={f.isAvailable}          onChange={v => upd('isAvailable', v)}          color={GREEN}  desc="Show this product to customers" />
          <Toggle label="Featured"              value={f.isFeatured}           onChange={v => upd('isFeatured', v)}           color={BLUE}   desc="Show in featured sections on home" />
          <Toggle label="New product badge"     value={f.isNew}                onChange={v => upd('isNew', v)}                color={PINK}   desc="Shows a 'NEW' label on the tile" />
          <Toggle label="Wholesale available"   value={f.isWholesaleAvailable} onChange={v => upd('isWholesaleAvailable', v)} color={PURPLE} desc="Visible to wholesale accounts" />

          {/* ── Section 5: Stock Status ──────────────────────────────── */}
          <View style={{ height: 1, backgroundColor: BORDER }} />
          <SectionHeader title="Stock Status" icon="alert-circle" color={RED} />
          <Toggle label="Limited drop"  value={f.isLimitedDrop} onChange={v => upd('isLimitedDrop', v)} color={RED}   desc="Shows 'LIMITED' badge on tile" />
          <Toggle label="Sold out"      value={f.isSoldOut}     onChange={v => upd('isSoldOut', v)}     color={RED}   desc="Displays as sold out, blocks ordering" />
          <Toggle label="Coming soon"   value={f.isComingSoon}  onChange={v => upd('isComingSoon', v)}  color={AMBER} desc="Teaser before launch" />

          {/* ── Section 6: Access Restrictions ──────────────────────── */}
          <View style={{ height: 1, backgroundColor: BORDER }} />
          <SectionHeader title="Access Restrictions" icon="lock" color={MUTED} />
          <Toggle label="Pickup only"             value={f.isPickupOnly} onChange={v => upd('isPickupOnly', v)} color={MUTED} desc="Cannot be delivered" />
          <Toggle label="Staff only visibility"   value={f.isStaffOnly}  onChange={v => upd('isStaffOnly', v)}  color={MUTED} desc="Hidden from public menu" />
          <Toggle label="App only (not in-store)" value={f.isAppOnly}    onChange={v => upd('isAppOnly', v)}    color={MUTED} desc="Hidden from Shop Display and POS — app orders only" />
          <Toggle label="POS only"                value={f.isPosOnly}    onChange={v => upd('isPosOnly', v)}    color={MUTED} desc="Hidden from customer app & wholesale" />

          {/* ── Section 7: Identifiers ───────────────────────────────── */}
          <View style={{ height: 1, backgroundColor: BORDER }} />
          <SectionHeader title="Identifiers" icon="hash" color={PURPLE} />
          <View style={form.row2}>
            <Field label="SKU">
              <TextF value={f.sku} onChange={v => upd('sku', v)} placeholder="BC-001" />
            </Field>
            <Field label="Barcode">
              <TextF value={f.barcode} onChange={v => upd('barcode', v)} placeholder="1234567890" />
            </Field>
          </View>
          <Field label="Product URL">
            <TextInput value={f.productUrl} onChangeText={v => upd('productUrl', v)}
              placeholder="https://butterfieldcookies.com.au/products/…"
              placeholderTextColor={MUTED} autoCapitalize="none" autoCorrect={false} keyboardType="url"
              style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]} />
            <Text style={[form.label, { fontWeight: '400', color: MUTED, marginTop: 4, fontSize: 11 }]}>
              Shown as a "View on Website" link in the product sheet. Leave blank to hide.
            </Text>
          </Field>

          {/* ── Section 8: Allergens ─────────────────────────────────── */}
          <View style={{ height: 1, backgroundColor: BORDER }} />
          <SectionHeader title="Allergens" icon="alert-triangle" color={RED} />
          <View style={form.tagGrid}>
            {ALLERGEN_LIST.map(a => (
              <TagChip key={a} label={a} active={f.allergens.includes(a)} color={RED} onPress={() => toggleArr('allergens', a)} />
            ))}
          </View>

          {/* ── Section 9: Dietary Tags ──────────────────────────────── */}
          <View style={{ height: 1, backgroundColor: BORDER }} />
          <SectionHeader title="Dietary Tags" icon="heart" color={GREEN} />
          <View style={form.tagGrid}>
            {DIETARY_LIST.map(d => (
              <TagChip key={d} label={d} active={f.dietaryTags.includes(d)} color={GREEN} onPress={() => toggleArr('dietaryTags', d)} />
            ))}
          </View>

          {/* ── Section 10: Product Info ─────────────────────────────── */}
          <View style={{ height: 1, backgroundColor: BORDER }} />
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

          {/* ── Section 11: Stock Management ─────────────────────────── */}
          <View style={{ height: 1, backgroundColor: BORDER }} />
          <SectionHeader title="Stock Management" icon="box" color={PURPLE} />
          <View style={form.row2}>
            <Field label="Current Stock">
              <TextF value={f.stockCount} onChange={v => upd('stockCount', v)} placeholder="Empty = unlimited" numeric />
            </Field>
            <Field label="Low Stock Alert At">
              <TextF value={f.lowStockThreshold} onChange={v => upd('lowStockThreshold', v)} placeholder="10" numeric />
            </Field>
          </View>
          <Field label="Sort Order">
            <TextF value={f.sortOrder} onChange={v => upd('sortOrder', v)} placeholder="0 = default" numeric />
            {recommendedProductSort != null && (
              <Pressable
                onPress={() => { upd('sortOrder', String(recommendedProductSort)); Haptics.selectionAsync(); }}
                style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: BLUE + '12', borderWidth: 1, borderColor: BLUE + '25' }}>
                <Text style={{ color: BLUE, fontSize: 12, fontWeight: '600' }}>
                  Use Butterfield recommended order ({recommendedProductSort})
                </Text>
              </Pressable>
            )}
            <Text style={[form.label, { fontWeight: '400', color: MUTED, marginTop: 6, fontSize: 11 }]}>
              Best practice: leave gaps of 10 like 10, 20, 30 so you can slot new products in later.
            </Text>
          </Field>

          {/* ── Section 12: Order Rules ──────────────────────────────── */}
          <View style={{ height: 1, backgroundColor: BORDER }} />
          <SectionHeader title="Order Rules" icon="sliders" color={AMBER} />
          <View style={form.row2}>
            <Field label="Min Order Qty">
              <TextF value={f.minOrderQty} onChange={v => upd('minOrderQty', v)} placeholder="1" numeric />
            </Field>
            <Field label="Max Order Qty">
              <TextF value={f.maxOrderQty} onChange={v => upd('maxOrderQty', v)} placeholder="No limit" numeric />
            </Field>
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
            <Text style={[form.label, { fontWeight: '400', color: MUTED, marginTop: 6, fontSize: 11 }]}>
              Leave blank for everyday items. Use this only for specials, seasonal drops, or weekend-only products.
            </Text>
          </Field>
          <Field label="Available Times">
            <TextF value={f.availableTimes} onChange={v => upd('availableTimes', v)} placeholder="e.g. 07:00-15:00" />
            <Text style={[form.label, { fontWeight: '400', color: MUTED, marginTop: 6, fontSize: 11 }]}>
              Example: 06:30-22:00 for all-day availability, or 17:00-22:00 for evening-only specials.
            </Text>
          </Field>
        </ScrollView>
        {/* Sticky footer */}
        <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: CARD }}>
          <Pressable onPress={onClose} style={{ flex: 1, height: 50, borderRadius: 14, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleSave} disabled={saving} style={{ flex: 2, height: 50, borderRadius: 14, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Save Product</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

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

export default ProductModal;
