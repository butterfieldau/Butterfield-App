import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useRef, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

// ─── Modal drag handle ────────────────────────────────────────────────────────
function DragHandle() {
  return (
    <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4, backgroundColor: CARD }}>
      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER }} />
    </View>
  );
}


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

// ─── Category list sub-screen ──────────────────────────────────────────────────
function CatalogTab() {
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [catModal, setCatModal] = useState(false);
  const [editCat, setEditCat] = useState<any>(null);
  const editCatRef = useRef<any>(null);
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catSortOrder, setCatSortOrder] = useState('0');
  const [catShowPublic, setCatShowPublic] = useState(true);
  const [catShowWholesale, setCatShowWholesale] = useState(false);
  const [catShowOnHome, setCatShowOnHome] = useState(false);
  const [catHomeOrder, setCatHomeOrder] = useState('0');
  const [catImageUrl, setCatImageUrl] = useState('');
  const [catColor, setCatColor] = useState<string | null>(null);
  const [catShowPos, setCatShowPos] = useState(true);
  const [catIsActive, setCatIsActive] = useState(true);
  const [catUploading, setCatUploading] = useState(false);
  const [catSaving, setCatSaving] = useState(false);
  const recommendedCategorySort = useMemo(
    () => getRecommendedCategorySort(catSlug || catName),
    [catName, catSlug],
  );
  const { data, refetch } = useQuery({
    queryKey: ['director-categories'],
    queryFn: () => api.director.categories(),
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const cats: any[] = data?.data ?? [];

  const openAddCat = () => {
    editCatRef.current = null;
    setEditCat(null); setCatName(''); setCatSlug(''); setCatDesc('');
    setCatSortOrder('0'); setCatShowPublic(true); setCatShowWholesale(false);
    setCatShowOnHome(false); setCatHomeOrder('0'); setCatImageUrl(''); setCatColor(null);
    setCatShowPos(true); setCatIsActive(true);
    setCatModal(true);
  };
  const openEditCat = (c: any) => {
    editCatRef.current = c;
    setEditCat(c); setCatName(c.name); setCatSlug(c.slug); setCatDesc(c.description ?? '');
    setCatSortOrder(String(c.sortOrder ?? 0)); setCatShowPublic(c.showPublic ?? true);
    setCatShowWholesale(c.showWholesale ?? false); setCatShowOnHome(c.showOnHome ?? false);
    setCatHomeOrder(String(c.homeOrder ?? 0)); setCatImageUrl(c.imageUrl ?? '');
    setCatColor(c.color ?? null); setCatShowPos(c.showPos ?? true); setCatIsActive(c.isActive ?? true);
    setCatModal(true);
  };
  const saveCat = async () => {
    if (!catName.trim()) return Alert.alert('Name required');
    setCatSaving(true);
    try {
      const slug = catSlug.trim() || catName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const payload = {
        name: catName.trim(), slug, description: catDesc.trim() || undefined,
        sortOrder: parseInt(catSortOrder) || 0, isActive: catIsActive,
        showPublic: catShowPublic, showWholesale: catShowWholesale,
        showOnHome: catShowOnHome, homeOrder: parseInt(catHomeOrder) || 0,
        imageUrl: catImageUrl.trim() || null, color: catColor || null, showPos: catShowPos,
      };
      const current = editCatRef.current;
      if (current) { await api.director.updateCategory(current.id, payload); }
      else { await api.director.createCategory(payload); }
      await qc.invalidateQueries({ queryKey: ['director-categories'] });
      await qc.invalidateQueries({ queryKey: ['categories'] });
      setCatModal(false);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.includes('409') || msg.toLowerCase().includes('already exists')) {
        Alert.alert('Duplicate slug', 'A category with that slug already exists. Choose a different name or slug.');
      } else {
        Alert.alert('Error', msg || 'Failed to save category. Please try again.');
      }
    } finally { setCatSaving(false); }
  };
  const handlePickCategoryImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Please allow photo library access in Settings.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.88, selectionLimit: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) { Alert.alert('File too large', 'Please choose an image under 8 MB.'); return; }
      const filename = asset.fileName ?? asset.uri.split('/').pop() ?? 'category.jpg';
      const contentType = asset.mimeType ?? 'image/jpeg';
      setCatUploading(true);
      const { objectPath } = await api.storage.uploadProductImage(asset.uri, filename, contentType, 'categories', catName.trim() || 'category');
      setCatImageUrl(`/api/storage${objectPath}`);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload image. Please try again.');
    } finally { setCatUploading(false); }
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
          await qc.invalidateQueries({ queryKey: ['categories'] });
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={cats}
        keyExtractor={c => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ backgroundColor: CARD, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, padding: 16, marginBottom: 6, gap: 10 }}>
            <SectionHeader title="Butterfield Category Order" icon="list" color={BLUE} />
            <Text style={[form.label, { fontWeight: '400', color: MUTED }]}>
              Recommended order for the customer menu. Use sort values in gaps so it stays flexible.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORY_SORT_RECOMMENDATIONS.map((item) => (
                <View key={`${item.key}-${item.sortOrder}`} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: BG, borderWidth: 1, borderColor: BORDER }}>
                  <Text style={{ color: TEXT, fontSize: 12, fontWeight: '600' }}>{item.sortOrder} · {item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={{ color: MUTED, textAlign: 'center', marginTop: 60, fontWeight: '400' }}>No categories yet</Text>}
        ListFooterComponent={
          <Pressable
            onPress={() => { Haptics.selectionAsync(); openAddCat(); }}
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
            <Text style={{ fontSize: 15, fontWeight: '700', color: BLUE }}>Add Category</Text>
          </Pressable>
        }
        renderItem={({ item: c }) => {
          const catCol = (c.color ?? CAT_COLORS[c.slug]) ?? BLUE;
          const thumbUrl = c.imageUrl ? toDisplayUrl(c.imageUrl) : null;
          const productCount = c.productCount ?? 0;
          return (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); openEditCat(c); }}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                Alert.alert(c.name, 'Choose an action', [
                  { text: 'Edit', onPress: () => openEditCat(c) },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteCat(c) },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: CARD, borderRadius: 18,
                paddingVertical: 16, paddingHorizontal: 16,
                borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {/* Icon circle */}
              <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, backgroundColor: catCol + '33', borderColor: catCol + '55', overflow: 'hidden', flexShrink: 0 }}>
                {thumbUrl
                  ? <Image source={{ uri: thumbUrl }} style={{ width: 48, height: 48 }} resizeMode="cover" />
                  : <Feather name="grid" size={22} color={catCol} />}
              </View>
              {/* Content */}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>{c.name}</Text>
                {c.description ? (
                  <Text style={{ fontSize: 12, color: MUTED }} numberOfLines={1}>{c.description}</Text>
                ) : (
                  <Text style={{ fontSize: 12, color: MUTED }}>/{c.slug}</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: catCol + '18' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: catCol }}>{productCount} product{productCount !== 1 ? 's' : ''}</Text>
                  </View>
                  {!(c.isActive ?? true) && (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: MUTED + '18' }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: MUTED }}>Hidden</Text>
                    </View>
                  )}
                  {c.showOnHome && (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: AMBER + '22' }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: AMBER }}>Home</Text>
                    </View>
                  )}
                </View>
              </View>
              <Pressable onPress={() => deleteCat(c)} style={{ padding: 8 }} hitSlop={6}>
                <Feather name="trash-2" size={16} color={RED} />
              </Pressable>
              <Feather name="chevron-right" size={18} color={MUTED} />
            </Pressable>
          );
        }}
      />

      {/* Category modal */}
      <Modal visible={catModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCatModal(false)}>
        <View style={{ flex: 1, backgroundColor: CARD }}>
          <DragHandle />
          <View style={[modal.header, { paddingTop: 8 }]}>
            <Pressable onPress={() => setCatModal(false)} style={modal.closeBtn}><Feather name="x" size={18} color={TEXT} /></Pressable>
            <Text style={[modal.title, { fontWeight: '700' }]}>{editCat ? 'Edit Category' : 'New Category'}</Text>
            <Pressable onPress={saveCat} style={[modal.saveBtn, { backgroundColor: catSaving ? MUTED : BLUE }]} disabled={catSaving}>
              <Text style={[modal.saveBtnText, { fontWeight: '700' }]}>{catSaving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}>
            <Field label="Name" required>
              <TextInput value={catName} onChangeText={setCatName} placeholder="Coffee" placeholderTextColor={MUTED}
                style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]} />
            </Field>
            <Field label="Slug (URL key)">
              <TextInput value={catSlug} onChangeText={setCatSlug} placeholder="coffee" placeholderTextColor={MUTED}
                style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]} autoCapitalize="none" />
            </Field>
            <Field label="Description">
              <TextInput value={catDesc} onChangeText={setCatDesc} placeholder="Short description…" placeholderTextColor={MUTED}
                style={[form.input, { fontWeight: '400', color: TEXT, height: 80, textAlignVertical: 'top', paddingTop: 12 }]} multiline />
            </Field>

            <View style={{ height: 1, backgroundColor: BORDER }} />
            <SectionHeader title="Category Icon" icon="image" color={PINK} />
            <View style={{ gap: 10 }}>
              {catImageUrl ? (
                <View style={{ borderRadius: 14, overflow: 'hidden', height: 140, backgroundColor: BG }}>
                  <Image source={{ uri: toDisplayUrl(catImageUrl) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 6 }}>
                    <Pressable onPress={handlePickCategoryImage} style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, padding: 8 }}>
                      <Feather name="camera" size={14} color="#fff" />
                    </Pressable>
                    <Pressable onPress={() => setCatImageUrl('')} style={{ backgroundColor: 'rgba(220,0,0,0.7)', borderRadius: 20, padding: 8 }}>
                      <Feather name="trash-2" size={14} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable onPress={handlePickCategoryImage} disabled={catUploading}
                  style={{ height: 110, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BG }}>
                  {catUploading
                    ? <ActivityIndicator color={BLUE} />
                    : <>
                        <Feather name="upload" size={22} color={MUTED} />
                        <Text style={{ color: MUTED, fontSize: 13, fontWeight: '500' }}>Upload category icon</Text>
                        <Text style={{ color: MUTED, fontSize: 11, fontWeight: '400' }}>Shows on the customer category tiles and home category strip</Text>
                      </>
                  }
                </Pressable>
              )}
            </View>

            <View style={{ height: 1, backgroundColor: BORDER }} />
            <SectionHeader title="POS Colour" icon="droplet" color={PURPLE} />
            <View style={{ gap: 10 }}>
              <Text style={{ color: MUTED, fontSize: 12, fontWeight: '400' }}>
                Shown on the POS category tabs. Leave unset to use the automatic colour.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {PRESET_COLORS.map(c => {
                  const selected = catColor === c;
                  return (
                    <Pressable key={c} onPress={() => { setCatColor(selected ? null : c); Haptics.selectionAsync(); }}
                      style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c, borderWidth: selected ? 3 : 1.5, borderColor: selected ? NAVY : 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                      {selected && <Feather name="check" size={16} color="#fff" />}
                    </Pressable>
                  );
                })}
              </View>
              {catColor && (
                <Pressable onPress={() => { setCatColor(null); Haptics.selectionAsync(); }}
                  style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: RED + '12', borderWidth: 1, borderColor: RED + '25' }}>
                  <Text style={{ color: RED, fontSize: 12, fontWeight: '600' }}>Clear colour</Text>
                </Pressable>
              )}
            </View>

            <View style={{ height: 1, backgroundColor: BORDER }} />
            <SectionHeader title="Home Screen" icon="home" color={AMBER} />
            <Toggle label="Show on Home Screen" value={catShowOnHome} onChange={setCatShowOnHome} color={AMBER} desc="Feature this category in the home screen category strip" />
            {catShowOnHome && (
              <Field label="Home Display Order">
                <TextInput value={catHomeOrder} onChangeText={setCatHomeOrder} placeholder="0" placeholderTextColor={MUTED}
                  keyboardType="number-pad" style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]} />
                <Text style={{ color: MUTED, fontSize: 11, fontWeight: '400', marginTop: 4 }}>Lower numbers appear first. Also controls the order of product rows on the home screen.</Text>
              </Field>
            )}

            <View style={{ height: 1, backgroundColor: BORDER }} />
            <SectionHeader title="Visibility" icon="eye" color={GREEN} />
            <Field label="Sort Order">
              <TextInput value={catSortOrder} onChangeText={setCatSortOrder} placeholder="0" placeholderTextColor={MUTED}
                keyboardType="number-pad" style={[form.input, { fontWeight: '400', color: TEXT, height: 46 }]} />
              {recommendedCategorySort != null && (
                <Pressable onPress={() => { setCatSortOrder(String(recommendedCategorySort)); Haptics.selectionAsync(); }}
                  style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: BLUE + '12', borderWidth: 1, borderColor: BLUE + '25' }}>
                  <Text style={{ color: BLUE, fontSize: 12, fontWeight: '600' }}>
                    Use Butterfield recommended order ({recommendedCategorySort})
                  </Text>
                </Pressable>
              )}
            </Field>
            <Toggle label="Active" value={catIsActive} onChange={setCatIsActive} color={GREEN} desc="Inactive categories are hidden everywhere" />
            <Toggle label="Visible to customers" value={catShowPublic} onChange={setCatShowPublic} color={GREEN} desc="Show in the customer ordering portal and menu" />
            <Toggle label="Visible to wholesale" value={catShowWholesale} onChange={setCatShowWholesale} color={BLUE} desc="Show in the wholesale product catalog" />
            <Toggle
              label="POS only"
              value={!catShowPos}
              onChange={(v) => { setCatShowPos(!v); if (v) { setCatShowPublic(false); setCatShowWholesale(false); } }}
              color={PURPLE}
              desc="Hide from customer app and wholesale catalog — visible only in the POS screen"
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
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

export default CatalogTab;
