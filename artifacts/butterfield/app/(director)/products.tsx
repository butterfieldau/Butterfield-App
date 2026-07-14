import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { OptionsTab, ProductModal, CatalogTab } from '@/components/director';
import { styles } from '@/components/director/productsStyles';
import { BG, CARD, BLUE, NAVY, TEXT, MUTED, BORDER, GREEN, AMBER, RED, PURPLE, PINK, TEAL, ROSE, GOLD, GLASS_BG, GLASS_BORDER } from '@/components/director/directorColors';
import { DirectorSearchBar } from '@/components/DirectorSearchBar';
import { DirectorEmptyState } from '@/components/DirectorEmptyState';

// ─── Palette ──────────────────────────────────────────────────────────────────

// ─── Build a Box categories ────────────────────────────────────────────────────
const BOX_CATEGORIES = ['bundles', 'boxes'];

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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DirectorProductsScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const requestedTab: 'products' | 'catalog' | 'options' =
    tab === 'catalog' || tab === 'options' ? tab : 'products';
  const [activeTab, setActiveTab] = useState<'products' | 'catalog' | 'options'>(requestedTab);
  const [statusFilter, setStatusFilter] = useState<StatusOption>('All');
  const [catFilter, setCatFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('Name A → Z');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-products'],
    queryFn: () => api.director.products(),
    placeholderData: keepPreviousData,
  });
  const { refreshing: productsRefreshing, onRefresh: onRefreshProducts } = useRefreshControl(refetch);
  const { data: catsData } = useQuery({
    queryKey: ['director-categories'],
    queryFn: () => api.director.categories(),
  });
  const dbCategories: any[] = catsData?.data ?? [];
  const all: any[] = data?.data ?? [];

  const products = useMemo(() => {
    let list = [...all];
    if (statusFilter === 'Active')   list = list.filter(p => p.isActive && (p.isAvailable ?? true));
    else if (statusFilter === 'Draft')    list = list.filter(p => p.isActive && !(p.isAvailable ?? true));
    else if (statusFilter === 'Archived') list = list.filter(p => !p.isActive);
    if (catFilter !== 'all') list = list.filter(p => (p.category ?? '') === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q));
    }
    if (sortBy === 'Name A → Z')         list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'Name Z → A')    list.sort((a, b) => b.name.localeCompare(a.name));
    else if (sortBy === 'Price: Low → High')  list.sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));
    else if (sortBy === 'Price: High → Low')  list.sort((a, b) => (b.priceCents ?? 0) - (a.priceCents ?? 0));
    else if (sortBy === 'Newest First')  list.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    return list;
  }, [all, statusFilter, catFilter, sortBy, search]);

  const [openDropdown, setOpenDropdown] = useState<'sort' | null>(null);
  const toggleDropdown = (which: 'sort') => {
    Haptics.selectionAsync();
    setOpenDropdown(prev => (prev === which ? null : which));
  };
  const counts = useMemo(() => ({
    all:      all.length,
    active:   all.filter(p => p.isActive && (p.isAvailable ?? true)).length,
    draft:    all.filter(p => p.isActive && !(p.isAvailable ?? true)).length,
    archived: all.filter(p => !p.isActive).length,
  }), [all]);

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
        try { await api.director.archiveProduct(product.id); await qc.invalidateQueries({ queryKey: ['director-products'] }); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };
  const handleDeletePermanent = (product: any) => {
    Alert.alert(
      'Delete permanently?',
      `This will completely remove "${product.name}" from the system. This cannot be undone.\n\nIf the product appears in any past orders it cannot be deleted — archive it instead.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, delete permanently', style: 'destructive', onPress: () => {
          Alert.alert('Are you sure?', `"${product.name}" will be permanently deleted.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                await api.director.deleteProductPermanent(product.id);
                await qc.invalidateQueries({ queryKey: ['director-products'] });
              } catch (e: any) { Alert.alert('Cannot delete', e.message ?? 'Delete failed. Please try again.'); }
            }},
          ]);
        }},
      ],
    );
  };
  const handleRestore = async (product: any) => {
    Haptics.selectionAsync();
    try {
      await api.director.updateProduct(product.id, { isActive: true, isAvailable: true });
      await qc.invalidateQueries({ queryKey: ['director-products'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const handleSave = async (data: any) => {
    try {
      if (editTarget) { await api.director.updateProduct(editTarget.id, data); }
      else            { await api.director.createProduct(data); }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['director-products'] }),
        qc.invalidateQueries({ queryKey: ['director-categories'] }),
      ]);
      setModalOpen(false);
      setEditTarget(null);
    } catch (e: any) { Alert.alert('Error', e.message); throw e; }
  };
  const openEdit = (product: any) => { setEditTarget(product); setModalOpen(true); };
  const openAdd  = () => { setEditTarget(null); setModalOpen(true); };

  useEffect(() => {
    setActiveTab((prev) => (prev === requestedTab ? prev : requestedTab));
  }, [requestedTab]);
  useEffect(() => {
    if (search.trim()) setSearchOpen(true);
  }, [search]);

  const openProductActions = (product: any) => {
    const actions = [
      { text: 'Edit product', onPress: () => openEdit(product) },
      { text: product.isFeatured ? 'Remove featured' : 'Mark as featured', onPress: () => toggle(product, 'isFeatured', !product.isFeatured) },
      { text: product.isSoldOut ? 'Mark back in stock' : 'Mark sold out', onPress: () => toggle(product, 'isSoldOut', !product.isSoldOut) },
      { text: product.isAvailable ? 'Move to draft' : 'Make active', onPress: () => toggle(product, 'isAvailable', !product.isAvailable) },
      { text: product.isActive ? 'Archive' : 'Restore', style: (product.isActive ? 'destructive' : 'default') as any, onPress: () => product.isActive ? handleArchive(product) : handleRestore(product) },
      { text: 'Delete permanently', style: 'destructive' as const, onPress: () => handleDeletePermanent(product) },
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert(product.name, 'Choose an action', actions);
  };

  const TAB_ITEMS = [
    { id: 'products' as const, label: 'Products'   },
    { id: 'catalog'  as const, label: 'Categories' },
    { id: 'options'  as const, label: 'Options'    },
  ] as const;

  return (
    <DirectorTabScreen
      title="Products"
      headerRight={
        <Pressable
          onPress={() => { setSearchOpen(prev => !prev); Haptics.selectionAsync(); }}
          style={[styles.headerSearchBtn, searchOpen && styles.headerSearchBtnActive]}
        >
          <Feather name="search" size={18} color={searchOpen ? BLUE : MUTED} />
        </Pressable>
      }
      headerBottom={
        <View style={styles.pillTabRow}>
          {TAB_ITEMS.map(t => {
            const active = activeTab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => { setActiveTab(t.id); Haptics.selectionAsync(); }}
                style={[styles.pillTab, active && styles.pillTabActive]}
              >
                <Text style={[styles.pillTabText, active && styles.pillTabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      }
    >

      {/* ── Catalog / Options tabs ─────────────────────────────────────────── */}
      {activeTab === 'catalog' && <CatalogTab />}
      {activeTab === 'options'  && <OptionsTab />}

      {/* ── Products tab ──────────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <>
          {/* Search bar */}
          {(searchOpen || search.trim().length > 0) && (
            <DirectorSearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Search products, SKU, category…"
              onClear={() => { setSearch(''); setSearchOpen(false); }}
            />
          )}

          {/* Filter pills — black/white iOS style */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
          >
            {/* Status pills */}
            {STATUS_OPTIONS.map(opt => {
              const active = statusFilter === opt && catFilter === 'all';
              return (
                <Pressable
                  key={opt}
                  onPress={() => { setStatusFilter(opt); setCatFilter('all'); Haptics.selectionAsync(); }}
                  style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#000' : '#fff', borderWidth: 1, borderColor: active ? '#000' : '#E5E7EB' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: active ? '#fff' : '#000' }}>{opt}</Text>
                </Pressable>
              );
            })}
            {/* Separator */}
            <View style={{ width: 1, backgroundColor: '#E5E7EB', alignSelf: 'center', height: 20, marginHorizontal: 4 }} />
            {/* Category pills */}
            {dbCategories.map((c: any) => {
              const active = catFilter === c.slug;
              return (
                <Pressable
                  key={c.slug}
                  onPress={() => { setCatFilter(active ? 'all' : c.slug); setStatusFilter('All'); Haptics.selectionAsync(); }}
                  style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#000' : '#fff', borderWidth: 1, borderColor: active ? '#000' : '#E5E7EB' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: active ? '#fff' : '#000' }}>{c.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Product list — grouped white card */}
          {isLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
              <ActivityIndicator color={BLUE} />
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 170 }}
              refreshControl={<RefreshControl refreshing={productsRefreshing} onRefresh={onRefreshProducts} tintColor={BLUE} />}
              nestedScrollEnabled
            >
              <Text style={{ fontSize: 13, color: MUTED, fontWeight: '400', marginBottom: 10 }}>
                {products.length} product{products.length !== 1 ? 's' : ''}
              </Text>
              {products.length === 0 ? (
                <DirectorEmptyState
                  icon="package"
                  title={`No products${statusFilter !== 'All' ? ` in "${statusFilter}"` : catFilter !== 'all' ? ` in "${dbCategories.find((c: any) => c.slug === catFilter)?.name ?? catFilter}"` : ''}`}
                  description="Tap + New to add a product"
                  action={{ label: 'Add first product', onPress: openAdd }}
                />
              ) : (
                <View style={p$.listCard}>
                  {products.map((p, index) => {
                    const isLast    = index === products.length - 1;
                    const priceFmt  = `$${((p.priceCents ?? 0) / 100).toFixed(2)}`;
                    const isAvail   = p.isActive && (p.isAvailable ?? true) && !p.isSoldOut;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => { Haptics.selectionAsync(); openEdit(p); }}
                        onLongPress={() => openProductActions(p)}
                        style={({ pressed }) => [
                          p$.row,
                          !isLast && p$.rowBorder,
                          !p.isActive && { opacity: 0.45 },
                          pressed && { backgroundColor: '#F8F8F8' },
                        ]}
                      >
                        {/* Name + badges + price */}
                        <View style={{ flex: 1, gap: 3 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={p$.name} numberOfLines={1}>{p.name}</Text>
                            {p.isFeatured && (
                              <View style={{ backgroundColor: '#007AFF18', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#007AFF', letterSpacing: 0.5 }}>FEATURED</Text>
                              </View>
                            )}
                            {p.isNew && (
                              <View style={{ backgroundColor: '#FF950018', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#FF9500', letterSpacing: 0.5 }}>NEW</Text>
                              </View>
                            )}
                            {p.isSoldOut && (
                              <View style={{ backgroundColor: '#EF444418', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: '#EF4444', letterSpacing: 0.5 }}>SOLD OUT</Text>
                              </View>
                            )}
                          </View>
                          <Text style={p$.price}>{priceFmt}</Text>
                        </View>
                        {/* Toggle + chevron */}
                        <Switch
                          value={isAvail}
                          onValueChange={(val) => toggle(p, 'isAvailable', val)}
                          trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                          thumbColor="#fff"
                          ios_backgroundColor="#E5E5EA"
                          style={{ marginRight: 6 }}
                        />
                        <Feather name="chevron-right" size={18} color="#C7C7CC" />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          )}

          <ProductModal
            visible={modalOpen}
            onClose={() => { setModalOpen(false); setEditTarget(null); }}
            onSave={handleSave}
            initial={editTarget}
            editing={!!editTarget}
            categories={dbCategories}
          />

          {/* FAB — blue pill */}
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openAdd(); }}
            style={[styles.fab, { backgroundColor: BLUE, bottom: Math.max(insets.bottom + 88, 108) }]}
          >
            <Feather name="plus" size={24} color="#fff" />
          </Pressable>
        </>
      )}
    </DirectorTabScreen>
  );
}

const API_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? '';
function toDisplayUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_DOMAIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

const p$ = StyleSheet.create({
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    gap: 8,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  name:  { fontSize: 16, fontWeight: '600', color: '#1C1C1E', flexShrink: 1 },
  price: { fontSize: 14, color: '#8E8E93', fontWeight: '500' },
});