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
      <Text style={[chip.text, { fontFamily: 'Inter_500Medium', color: active ? '#fff' : MUTED }]}>{label}</Text>
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
      <Text style={[form.sectionTitle, { fontFamily: 'Inter_700Bold', color: NAVY }]}>{title}</Text>
    </View>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <View style={form.fieldWrap}>
      <Text style={[form.label, { fontFamily: 'Inter_500Medium', color: MUTED }]}>{label}{required && <Text style={{ color: RED }}> *</Text>}</Text>
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
      style={[form.input, { fontFamily: 'Inter_400Regular', color: TEXT, height: multiline ? (lines ?? 3) * 22 + 20 : 46, textAlignVertical: multiline ? 'top' : 'center' }]}
    />
  );
}

function Toggle({ label, value, onChange, color, desc }: { label: string; value: boolean; onChange: (v: boolean) => void; color?: string; desc?: string }) {
  return (
    <View style={form.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[form.toggleLabel, { fontFamily: 'Inter_500Medium', color: TEXT }]}>{label}</Text>
        {desc ? <Text style={[form.toggleDesc, { fontFamily: 'Inter_400Regular', color: MUTED }]}>{desc}</Text> : null}
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
          <Text style={[seg.text, { fontFamily: 'Inter_500Medium' }, value === opt && { color: '#fff' }]}>{opt}</Text>
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
});

type FormState = ReturnType<typeof BLANK>;

// ─── Add/Edit Modal ────────────────────────────────────────────────────────────
function ProductModal({
  visible, onClose, onSave, initial, editing,
}: { visible: boolean; onClose: () => void; onSave: (d: any) => Promise<void>; initial?: any; editing?: boolean }) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [f, setF] = useState<FormState>(BLANK());

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
        mediaTypes: ['images'], allowsEditing: true, quality: 0.88,
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
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
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
            <Text style={[modal.title, { fontFamily: 'Inter_700Bold', color: TEXT }]}>
              {editing ? 'Edit Product' : 'Add New Product'}
            </Text>
            <Pressable onPress={handleSave} disabled={saving} style={[modal.saveBtn, { backgroundColor: BLUE }]}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[modal.saveBtnText, { fontFamily: 'Inter_700Bold' }]}>Save</Text>}
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}>

            {/* ── 1. Basic Info ──────────────────────────────────── */}
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
                    {CATEGORIES.map(c => (
                      <TagChip key={c} label={c} active={f.category === c} color={CAT_COLORS[c] ?? MUTED} onPress={() => upd('category', c)} />
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
              <Text style={[form.label, { fontFamily: 'Inter_500Medium', color: MUTED, marginBottom: 8 }]}>
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
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: BLUE }}>
                        {uploading ? 'Uploading…' : 'Replace Photo'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleRemoveProductImage}
                      disabled={uploading}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10, backgroundColor: RED + '12', borderWidth: 1, borderColor: RED + '60' }}
                    >
                      <Feather name="trash-2" size={14} color={RED} />
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: RED }}>Remove</Text>
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
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: TEXT, marginBottom: 4 }}>
                        Upload Product Photo
                      </Text>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED }}>
                        JPG · PNG · WebP · HEIC  ·  Max 8 MB
                      </Text>
                    </>
                  )}
                </Pressable>
              )}

              <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 4 }} />

              {/* Gallery */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <Text style={[form.label, { fontFamily: 'Inter_500Medium', color: MUTED }]}>Gallery Images</Text>
                <Pressable
                  onPress={handlePickGalleryImage}
                  disabled={uploading}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Feather name="upload" size={13} color={BLUE} />
                  <Text style={{ fontSize: 12, color: BLUE, fontFamily: 'Inter_600SemiBold' }}>Upload</Text>
                </Pressable>
              </View>

              {f.galleryUrls.length === 0 ? (
                <Text style={{ fontSize: 12, color: MUTED, fontFamily: 'Inter_400Regular' }}>
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

            {/* ── 4. Identifiers ─────────────────────────────────── */}
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
            </View>

            {/* ── 4. Availability ────────────────────────────────── */}
            <View style={form.card}>
              <SectionHeader title="Availability" icon="toggle-right" color={AMBER} />
              <Toggle label="Available for sale"   value={f.isAvailable}          onChange={v => upd('isAvailable', v)}          color={GREEN}  desc="Show this product to customers" />
              <Toggle label="Featured"             value={f.isFeatured}           onChange={v => upd('isFeatured', v)}           color={BLUE}   desc="Show in featured sections" />
              <Toggle label="New product badge"    value={f.isNew}                onChange={v => upd('isNew', v)}                color={PINK}   />
              <Toggle label="Wholesale available"  value={f.isWholesaleAvailable} onChange={v => upd('isWholesaleAvailable', v)} color={PURPLE} desc="Visible to wholesale accounts" />
              <Toggle label="Limited drop"         value={f.isLimitedDrop}        onChange={v => upd('isLimitedDrop', v)}        color={RED}    desc="Shows 'Limited' badge" />
              <Toggle label="Sold out"             value={f.isSoldOut}            onChange={v => upd('isSoldOut', v)}            color={RED}    desc="Displays as sold out" />
              <Toggle label="Coming soon"          value={f.isComingSoon}         onChange={v => upd('isComingSoon', v)}         color={AMBER}  />
              <Toggle label="Pickup only"          value={f.isPickupOnly}         onChange={v => upd('isPickupOnly', v)}         color={MUTED}  />
              <Toggle label="Staff only visibility" value={f.isStaffOnly}         onChange={v => upd('isStaffOnly', v)}          color={MUTED}  desc="Hidden from public" />
              <Toggle label="App only"             value={f.isAppOnly}            onChange={v => upd('isAppOnly', v)}            color={MUTED}  desc="Not on website" />
            </View>

            {/* ── 5. Allergens & Dietary ─────────────────────────── */}
            <View style={form.card}>
              <SectionHeader title="Allergens" icon="alert-triangle" color={RED} />
              <View style={form.tagGrid}>
                {ALLERGEN_LIST.map(a => (
                  <TagChip key={a} label={a} active={f.allergens.includes(a)} color={RED} onPress={() => toggleArr('allergens', a)} />
                ))}
              </View>
              <View style={{ height: 1, backgroundColor: BORDER, marginTop: 8 }} />
              <SectionHeader title="Dietary Tags" icon="heart" color={GREEN} />
              <View style={form.tagGrid}>
                {DIETARY_LIST.map(d => (
                  <TagChip key={d} label={d} active={f.dietaryTags.includes(d)} color={GREEN} onPress={() => toggleArr('dietaryTags', d)} />
                ))}
              </View>
            </View>

            {/* ── 6. Product Details ─────────────────────────────── */}
            <View style={form.card}>
              <SectionHeader title="Product Details" icon="file-text" color={PURPLE} />
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

            {/* ── 7. Order Rules ─────────────────────────────────── */}
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

            {/* ── 8. Stock ───────────────────────────────────────── */}
            <View style={form.card}>
              <SectionHeader title="Stock Management" icon="box" color={PURPLE} />
              <View style={form.row2}>
                <View style={{ flex: 1 }}>
                  <Field label="Current Stock">
                    <TextF value={f.stockCount} onChange={v => upd('stockCount', v)} placeholder="Leave empty = unlimited" numeric />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Low Stock Alert At">
                    <TextF value={f.lowStockThreshold} onChange={v => upd('lowStockThreshold', v)} placeholder="10" numeric />
                  </Field>
                </View>
              </View>
              <View style={form.row2}>
                <View style={{ flex: 1 }}>
                  <Field label="Sort Order">
                    <TextF value={f.sortOrder} onChange={v => upd('sortOrder', v)} placeholder="0" numeric />
                  </Field>
                </View>
              </View>
            </View>

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DirectorProductsScreen() {
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-products'],
    queryFn: () => api.director.products(),
  });

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

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Search bar */}
      <View style={[styles.searchBar, { borderColor: BORDER }]}>
        <Feather name="search" size={16} color={MUTED} />
        <TextInput
          value={search} onChangeText={setSearch}
          placeholder="Search products, SKU, category…"
          placeholderTextColor={MUTED}
          style={[styles.searchInput, { fontFamily: 'Inter_400Regular', color: TEXT }]}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {FILTER_TABS.map(t => (
          <Pressable key={t} onPress={() => setFilter(t)} style={[styles.filterTab, filter === t && { backgroundColor: NAVY, borderColor: NAVY }]}>
            <Text style={[styles.filterText, { fontFamily: 'Inter_500Medium' }, filter === t && { color: '#fff' }]}>{t}</Text>
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
            <Text style={[styles.count, { fontFamily: 'Inter_400Regular', color: MUTED }]}>
              {products.length} product{products.length !== 1 ? 's' : ''}
              {filter !== 'All' ? ` · ${filter}` : ''}
            </Text>
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 14 }}>
              <View style={{ backgroundColor: BORDER, width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="package" size={28} color={MUTED} />
              </View>
              <Text style={{ color: MUTED, fontFamily: 'Inter_500Medium', fontSize: 15 }}>No products {filter !== 'All' ? `in "${filter}"` : ''}</Text>
              <Pressable onPress={openAdd} style={[styles.emptyAddBtn, { backgroundColor: BLUE }]}>
                <Feather name="plus" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 }}>Add first product</Text>
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
                    <Text style={[styles.productName, { fontFamily: 'Inter_700Bold', color: TEXT }]} numberOfLines={1}>{p.name}</Text>
                    {p.shortDescription && <Text style={[styles.productSub, { fontFamily: 'Inter_400Regular', color: MUTED }]} numberOfLines={1}>{p.shortDescription}</Text>}
                    <View style={styles.metaRow}>
                      <View style={[styles.catPill, { backgroundColor: catColor + '18' }]}>
                        <Text style={[styles.catPillText, { fontFamily: 'Inter_600SemiBold', color: catColor }]}>{p.category}</Text>
                      </View>
                      {p.sku && <Text style={[styles.skuText, { fontFamily: 'Inter_400Regular', color: MUTED }]}>#{p.sku}</Text>}
                    </View>
                  </View>
                  <View style={styles.priceStack}>
                    <Text style={[styles.price, { fontFamily: 'Inter_700Bold', color: TEXT }]}>{priceFmt}</Text>
                    {wsFmt && <Text style={[styles.wsPrice, { fontFamily: 'Inter_400Regular', color: MUTED }]}>WS {wsFmt}</Text>}
                    {profitPct != null && <Text style={[styles.profit, { fontFamily: 'Inter_600SemiBold', color: GREEN }]}>{profitPct}% margin</Text>}
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
                      <Text style={[styles.toggleLabel, { fontFamily: 'Inter_600SemiBold', color: TEXT, fontSize: 13 }]}>{t.label}</Text>
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
                    <Text style={[styles.actionText, { fontFamily: 'Inter_500Medium', color: BLUE }]}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => toggle(p, 'isLimitedDrop', !p.isLimitedDrop)} style={styles.actionBtn}>
                    <Feather name="zap" size={13} color={AMBER} />
                    <Text style={[styles.actionText, { fontFamily: 'Inter_500Medium', color: AMBER }]}>{p.isLimitedDrop ? 'Remove Drop' : 'Limited Drop'}</Text>
                  </Pressable>
                  <Pressable onPress={() => handleArchive(p)} style={styles.actionBtn}>
                    <Feather name="archive" size={13} color={MUTED} />
                    <Text style={[styles.actionText, { fontFamily: 'Inter_500Medium', color: MUTED }]}>Archive</Text>
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
        <Text style={[styles.fabText, { fontFamily: 'Inter_700Bold' }]}>Add Product</Text>
      </Pressable>

      <ProductModal
        visible={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSave={handleSave}
        initial={editTarget}
        editing={!!editTarget}
      />
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
  badgeText:     { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
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
