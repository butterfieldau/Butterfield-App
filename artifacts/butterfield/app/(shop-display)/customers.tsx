import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet,
  Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { api } from '@/lib/api';
import type { ShopDisplayCustomer } from '@/lib/api';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const AMBER  = '#F59E0B';
const GREEN  = '#16A34A';

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  bronze:   { bg: '#FEF3C7', text: '#92400E' },
  silver:   { bg: '#F3F4F6', text: '#374151' },
  gold:     { bg: '#FEF9C3', text: '#713F12' },
  platinum: { bg: '#EDE9FE', text: '#5B21B6' },
};

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function formatSpend(cents: number): string {
  if (cents >= 100000) return `$${(cents / 100).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ShopDisplayCustomersScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const searchRef = useRef<TextInput>(null);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ShopDisplayCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<ShopDisplayCustomer | null>(null);

  const debouncedSearch = useDebouncedValue(search, 350);

  useEffect(() => {
    const q = debouncedSearch.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    api.shopDisplay.customers(q)
      .then((res) => {
        setResults(res.data ?? []);
        setSearched(true);
      })
      .catch((err) => {
        const msg = err?.message ?? String(err);
        if (msg.includes('not enabled') || msg.includes('403')) {
          setError('Customer lookup is not enabled for this display. Contact your director.');
        } else {
          setError('Unable to search right now. Try again.');
        }
        setResults([]);
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  if (error && results.length === 0 && !searched) {
    return (
      <View style={s.center}>
        <Feather name="lock" size={40} color={MUTED} />
        <Text style={s.emptyTitle}>Customer lookup not enabled</Text>
        <Text style={s.emptyText}>{error}</Text>
      </View>
    );
  }

  const renderCustomer = ({ item }: { item: ShopDisplayCustomer }) => {
    const tierColors = TIER_COLORS[item.loyaltyTier] ?? TIER_COLORS.bronze;
    const isSelected = selectedCustomer?.id === item.id;

    return (
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setSelectedCustomer(isSelected ? null : item);
        }}
        style={[s.customerCard, isSelected && s.customerCardSelected]}
      >
        <View style={s.customerTop}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(item.name ?? '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.customerName} numberOfLines={1}>{item.name}</Text>
            <Text style={s.customerEmail} numberOfLines={1}>{item.email}</Text>
            {item.phone ? <Text style={s.customerPhone}>{item.phone}</Text> : null}
          </View>
          <View style={[s.tierBadge, { backgroundColor: tierColors.bg }]}>
            <Text style={[s.tierText, { color: tierColors.text }]}>
              {item.loyaltyTier.charAt(0).toUpperCase() + item.loyaltyTier.slice(1)}
            </Text>
          </View>
        </View>

        {isSelected && (
          <View style={s.detailSection}>
            <View style={s.statRow}>
              <View style={s.statCard}>
                <Feather name="star" size={14} color={AMBER} />
                <Text style={s.statValue}>{item.loyaltyPoints.toLocaleString()}</Text>
                <Text style={s.statLabel}>Points</Text>
              </View>
              <View style={s.statCard}>
                <Feather name="coffee" size={14} color={NAVY} />
                <Text style={s.statValue}>{item.stampCount}</Text>
                <Text style={s.statLabel}>Stamps</Text>
              </View>
              {item.freeCoffeeRewards > 0 && (
                <View style={[s.statCard, { backgroundColor: '#F0FFF4' }]}>
                  <Feather name="gift" size={14} color={GREEN} />
                  <Text style={[s.statValue, { color: GREEN }]}>{item.freeCoffeeRewards}</Text>
                  <Text style={s.statLabel}>Free coffees</Text>
                </View>
              )}
              <View style={s.statCard}>
                <Feather name="shopping-bag" size={14} color={BLUE} />
                <Text style={s.statValue}>{item.totalVisits}</Text>
                <Text style={s.statLabel}>Visits</Text>
              </View>
              {item.totalSpentCents > 0 && (
                <View style={s.statCard}>
                  <Feather name="dollar-sign" size={14} color={NAVY} />
                  <Text style={s.statValue}>{formatSpend(item.totalSpentCents)}</Text>
                  <Text style={s.statLabel}>Total spent</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={s.searchContainer}>
        <View style={s.searchBox}>
          <Feather name="search" size={18} color={MUTED} />
          <TextInput
            ref={searchRef}
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, email or phone…"
            placeholderTextColor={MUTED}
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {loading && <ActivityIndicator color={BLUE} size="small" />}
        </View>
        {search.trim().length >= 2 && (
          <Text style={s.resultCount}>
            {loading ? 'Searching…' : `${results.length} result${results.length !== 1 ? 's' : ''}`}
          </Text>
        )}
      </View>

      {error && (
        <View style={s.errorBanner}>
          <Feather name="alert-circle" size={14} color="#B91C1C" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
        numColumns={isWide ? 2 : 1}
        columnWrapperStyle={isWide ? { gap: 12 } : undefined}
        renderItem={renderCustomer}
        ListEmptyComponent={
          !loading ? (
            <View style={s.emptyWrap}>
              {search.trim().length < 2 ? (
                <>
                  <Feather name="users" size={44} color={MUTED} />
                  <Text style={s.emptyTitle}>Customer Lookup</Text>
                  <Text style={s.emptyText}>Search by name, email or phone to view a customer's loyalty profile.</Text>
                </>
              ) : searched ? (
                <>
                  <Feather name="user-x" size={44} color={MUTED} />
                  <Text style={s.emptyTitle}>No customers found</Text>
                  <Text style={s.emptyText}>Try a different name, email or phone number.</Text>
                </>
              ) : null}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: BG, padding: 32 },
  searchContainer:  { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 6 },
  searchBox:        { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderWidth: 1, borderColor: BORDER },
  searchInput:      { flex: 1, fontSize: 16, color: TEXT, fontWeight: '500' },
  resultCount:      { color: MUTED, fontSize: 12, fontWeight: '600', marginLeft: 4 },
  errorBanner:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 10, backgroundColor: '#FEE2E2', borderRadius: 12 },
  errorText:        { color: '#B91C1C', fontSize: 13, fontWeight: '600', flex: 1 },
  customerCard:     { flex: 1, backgroundColor: CARD, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: BORDER, gap: 0 },
  customerCardSelected: { borderColor: BLUE, shadowColor: BLUE, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 },
  customerTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar:           { width: 44, height: 44, borderRadius: 22, backgroundColor: `${BLUE}18`, alignItems: 'center', justifyContent: 'center' },
  avatarText:       { fontSize: 18, fontWeight: '800', color: BLUE },
  customerName:     { fontSize: 16, fontWeight: '800', color: TEXT },
  customerEmail:    { fontSize: 13, color: MUTED, fontWeight: '500' },
  customerPhone:    { fontSize: 13, color: MUTED, fontWeight: '500' },
  tierBadge:        { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  tierText:         { fontSize: 12, fontWeight: '800' },
  detailSection:    { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: BORDER },
  statRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard:         { alignItems: 'center', backgroundColor: BG, borderRadius: 14, padding: 10, gap: 4, minWidth: 70 },
  statValue:        { fontSize: 18, fontWeight: '800', color: TEXT },
  statLabel:        { fontSize: 11, color: MUTED, fontWeight: '600' },
  emptyWrap:        { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle:       { fontSize: 18, fontWeight: '700', color: TEXT, textAlign: 'center' },
  emptyText:        { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
});
