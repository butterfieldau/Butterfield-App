import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { OptionsTab, ProductModal, CatalogTab } from '@/components/director';
import { styles } from '@/components/director/productsStyles';

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
    { id: 'products' as const, label: 'Products',   icon: 'package' },
    { id: 'catalog'  as const, label: 'Categories', icon: 'grid'    },
    { id: 'options'  as const, label: 'Options',    icon: 'sliders' },
  ] as const;

  return (
    <DirectorTabScreen
      title="Products"
      headerRight={
        <Pressable
          onPress={() => { setSearchOpen(prev => !prev); Haptics.selectionAsync(); }}
          style={[styles.headerSearchBtn, searchOpen && styles.headerSearchBtnActive]}
        >
          <Feather name="search" size={18} color={searchOpen ? BLUE : NAVY} />
        </Pressable>
      }
    >
      {/* ── Top tab bar ───────────────────────────────────────────────────── */}
      <View style={styles.tileTabRow}>
        {TAB_ITEMS.map(t => {
          const active = activeTab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => { setActiveTab(t.id); Haptics.selectionAsync(); }}
              style={[styles.tileTabBtn, active && styles.tileTabBtnActive]}
            >
              <Feather name={t.icon as any} size={15} color={active ? NAVY : MUTED} />
              <Text style={[styles.tileTabText, active && styles.tileTabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Catalog / Options tabs ─────────────────────────────────────────── */}
      {activeTab === 'catalog'  && <CatalogTab />}
      {activeTab === 'options'  && <OptionsTab />}

      {/* ── Products tab ──────────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <>
          {/* Search bar */}
          {(searchOpen || search.trim()) && (
            <View style={styles.searchBar}>
              <Feather name="search" size={16} color={MUTED} />
              <TextInput
                value={search} onChangeText={setSearch}
                placeholder="Search products, SKU, category…"
                placeholderTextColor={MUTED}
                style={[styles.searchInput, { fontWeight: '400', color: TEXT }]}
                clearButtonMode="while-editing"
              />
              <Pressable onPress={() => { setSearch(''); setSearchOpen(false); }} hitSlop={8}>
                <Feather name="x" size={16} color={MUTED} />
              </Pressable>
            </View>
          )}

          {/* Stats strip */}
          <View style={styles.statsStrip}>
            {[
              { label: 'Total',  count: counts.all,    color: BLUE  },
              { label: 'Active', count: counts.active, color: GREEN },
              { label: 'Drafts', count: counts.draft,  color: AMBER },
            ].map(s => (
              <View key={s.label} style={[styles.statBadge, { backgroundColor: s.color + '18' }]}>
                <Text style={[styles.statBadgeText, { color: s.color }]}>{s.label} {s.count}</Text>
              </View>
            ))}
          </View>

          {/* Filter pill row */}
          <View style={styles.filterRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillRow}>
              {/* Status pills */}
              {STATUS_OPTIONS.map(opt => {
                const isActive = statusFilter === opt && catFilter === 'all';
                const isStat   = statusFilter === opt;
                const active   = isStat && catFilter === 'all';
                const count    = opt === 'All' ? counts.all : opt === 'Active' ? counts.active : opt === 'Draft' ? counts.draft : counts.archived;
                const col      = opt === 'All' ? NAVY : opt === 'Active' ? GREEN : opt === 'Draft' ? AMBER : MUTED;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => { setStatusFilter(opt); setCatFilter('all'); Haptics.selectionAsync(); }}
                    style={[styles.filterPill, { backgroundColor: isStat && catFilter === 'all' ? col : CARD, borderColor: isStat && catFilter === 'all' ? col : BORDER }]}
                  >
                    <Text style={[styles.filterPillText, { color: active ? '#fff' : MUTED }]}>{opt}</Text>
                    <Text style={[styles.filterPillCount, { color: active ? '#fff' : MUTED }]}>{count}</Text>
                  </Pressable>
                );
              })}
              {/* Separator dot */}
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: 'center', marginHorizontal: 4 }} />
              {/* Category pills */}
              {dbCategories.map((c: any) => {
                const col    = CAT_COLORS[c.slug] ?? MUTED;
                const active = catFilter === c.slug;
                return (
                  <Pressable
                    key={c.slug}
                    onPress={() => { setCatFilter(active ? 'all' : c.slug); setStatusFilter('All'); Haptics.selectionAsync(); }}
                    style={[styles.filterPill, { backgroundColor: active ? col : CARD, borderColor: active ? col : BORDER }]}
                  >
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: active ? '#fff' : col }} />
                    <Text style={[styles.filterPillText, { color: active ? '#fff' : MUTED }]}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {/* Sort button */}
            <Pressable
              onPress={() => toggleDropdown('sort')}
              style={[styles.sortBtn, sortBy !== 'Name A → Z' && styles.sortBtnActive]}
            >
              <Feather name="sliders" size={16} color={sortBy !== 'Name A → Z' ? NAVY : MUTED} />
            </Pressable>
          </View>

          {/* Sort dropdown */}
          <View style={{ zIndex: 20 }}>
            {openDropdown !== null && (
              <Pressable onPress={() => setOpenDropdown(null)}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: -4000, zIndex: 19 }} />
            )}
            {openDropdown === 'sort' && (
              <View style={[styles.dropPanel, { zIndex: 21 }]}>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
                  <Text style={styles.dropSectionLabel}>SORT ORDER</Text>
                  {SORT_OPTIONS.map(opt => {
                    const active = sortBy === opt;
                    return (
                      <Pressable key={opt} onPress={() => { setSortBy(opt); setOpenDropdown(null); Haptics.selectionAsync(); }}
                        style={[styles.dropOption, active && styles.dropOptionActive]}>
                        <Text style={[styles.dropOptionText, active && { color: NAVY, fontWeight: '600' }]}>{opt}</Text>
                        {active && <Feather name="check" size={14} color={NAVY} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Product list */}
          {isLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={BLUE} />
            </View>
          ) : (
            <FlatList
              data={products}
              keyExtractor={p => p.id}
              refreshControl={<RefreshControl refreshing={productsRefreshing} onRefresh={onRefreshProducts} tintColor={BLUE} />}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 170 }}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <Text style={[styles.resultCount, { fontWeight: '400', color: MUTED }]}>
                  {products.length} product{products.length !== 1 ? 's' : ''}
                  {sortBy !== 'Name A → Z' ? ` · ${sortBy}` : ''}
                </Text>
              }
              ListEmptyComponent={
                <View style={{ alignItems: 'center', marginTop: 60, gap: 14 }}>
                  <View style={{ backgroundColor: BORDER, width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="package" size={28} color={MUTED} />
                  </View>
                  <Text style={{ color: MUTED, fontWeight: '500', fontSize: 15 }}>
                    No products {statusFilter !== 'All' ? `in "${statusFilter}"` : catFilter !== 'all' ? `in "${dbCategories.find(c => c.slug === catFilter)?.name ?? catFilter}"` : ''}
                  </Text>
                  <Pressable onPress={openAdd} style={styles.emptyAddBtn}>
                    <Feather name="plus" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Add first product</Text>
                  </Pressable>
                </View>
              }
              renderItem={({ item: p }) => {
                const catColor  = CAT_COLORS[p.category] ?? MUTED;
                const priceFmt  = `$${((p.priceCents ?? 0) / 100).toFixed(2)}`;
                const statusDot = !p.isActive
                  ? RED
                  : !(p.isAvailable ?? true)
                  ? AMBER
                  : p.isSoldOut
                  ? RED
                  : GREEN;
                const statusLabel = !p.isActive ? 'Archived' : !(p.isAvailable ?? true) ? 'Draft' : p.isSoldOut ? 'Sold out' : 'Active';
                const catLabel = dbCategories.find(c => c.slug === p.category)?.name ?? p.category ?? 'Uncategorised';

                return (
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); openEdit(p); }}
                    onLongPress={() => openProductActions(p)}
                    style={({ pressed }) => [styles.shelfCard, { opacity: pressed ? 0.8 : 1 }]}
                  >
                    {/* Left: Thumbnail */}
                    {p.imageUrl ? (
                      <Image source={{ uri: toDisplayUrl(p.imageUrl) }}
                        style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: '#F3F4F6', flexShrink: 0 }}
                        resizeMode="cover" />
                    ) : (
                      <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: catColor + '18', borderWidth: 1.5, borderColor: catColor + '30', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Feather name="package" size={22} color={catColor} />
                      </View>
                    )}
                    {/* Middle: Name + Category */}
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }} numberOfLines={1}>{p.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: catColor }} />
                        <Text style={{ fontSize: 12, color: MUTED, fontWeight: '400' }}>{catLabel}</Text>
                      </View>
                    </View>
                    {/* Right: Price + status dot + chevron */}
                    <View style={{ alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: GREEN }}>{priceFmt}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: statusDot }} />
                        <Text style={{ fontSize: 11, fontWeight: '500', color: MUTED }}>{statusLabel}</Text>
                      </View>
                    </View>
                    <Feather name="chevron-right" size={16} color={MUTED} style={{ flexShrink: 0 }} />
                  </Pressable>
                );
              }}
            />
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