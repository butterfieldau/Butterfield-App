import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getToken } from '../lib/api';

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : '/api';

export interface AddressResult {
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  lat?: number;
  lng?: number;
  formatted?: string;
}

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

function getComponent(components: any[], type: string, short = false): string {
  const c = components.find((x: any) => x.types.includes(type));
  return c ? (short ? c.short_name : c.long_name) : '';
}

async function fetchPredictions(input: string): Promise<Prediction[]> {
  if (input.length < 2) return [];
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/places/autocomplete?input=${encodeURIComponent(input)}`,
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    );
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.predictions) ? json.predictions : [];
  } catch {
    return [];
  }
}

async function fetchPlaceDetails(placeId: string): Promise<AddressResult | null> {
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/places/details?place_id=${encodeURIComponent(placeId)}`,
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const r = json.result;
    if (!r) return null;
    const components: any[] = r.address_components ?? [];
    const streetNumber = getComponent(components, 'street_number');
    const route        = getComponent(components, 'route');
    const street       = [streetNumber, route].filter(Boolean).join(' ');
    const suburb =
      getComponent(components, 'locality') ||
      getComponent(components, 'sublocality_level_1') ||
      getComponent(components, 'sublocality') ||
      getComponent(components, 'administrative_area_level_2');
    const state    = getComponent(components, 'administrative_area_level_1', true);
    const postcode = getComponent(components, 'postal_code');
    const lat      = r.geometry?.location?.lat as number | undefined;
    const lng      = r.geometry?.location?.lng as number | undefined;
    return { street, suburb, state, postcode, lat, lng, formatted: r.formatted_address };
  } catch {
    return null;
  }
}

interface Props {
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  currentValue?: string;
  label?: string;
}

export function AddressSearchInput({ onSelect, placeholder = 'Search for your address…', currentValue, label }: Props) {
  const [modalVisible, setModalVisible] = useState(false);

  const openModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setModalVisible(true);
  };

  return (
    <>
      <Pressable onPress={openModal} style={styles.trigger}>
        <Feather name="search" size={16} color={BLUE} style={{ marginRight: 8 }} />
        <Text style={currentValue ? styles.triggerTextFilled : styles.triggerTextPlaceholder} numberOfLines={1}>
          {currentValue || placeholder}
        </Text>
        <Feather name="chevron-right" size={14} color={MUTED} />
      </Pressable>

      <SearchModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSelect={(result) => {
          setModalVisible(false);
          onSelect(result);
        }}
        placeholder={placeholder}
      />
    </>
  );
}

function SearchModal({
  visible,
  onClose,
  onSelect,
  placeholder,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: AddressResult) => void;
  placeholder: string;
}) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setPredictions([]);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  const handleChangeText = useCallback((text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (text.length < 2) { setPredictions([]); setLoading(false); return; }
    setLoading(true);
    debounceTimer.current = setTimeout(async () => {
      const results = await fetchPredictions(text);
      setPredictions(results);
      setLoading(false);
    }, 350);
  }, []);

  const handleSelect = async (prediction: Prediction) => {
    Haptics.selectionAsync();
    Keyboard.dismiss();
    setFetching(true);
    const details = await fetchPlaceDetails(prediction.place_id);
    setFetching(false);
    if (details) {
      onSelect(details);
    } else {
      onSelect({ street: prediction.structured_formatting.main_text, suburb: '', state: '', postcode: '' });
    }
  };

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.modal, { paddingTop: Platform.OS === 'ios' ? 0 : insets.top }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 8 }]}>
          <Text style={styles.modalTitle}>Search address</Text>
          <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={12}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
        </View>

        {/* Search input */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Feather name="search" size={17} color={loading ? BLUE : MUTED} style={{ marginRight: 10 }} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              value={query}
              onChangeText={handleChangeText}
              placeholder={placeholder}
              placeholderTextColor={MUTED}
              autoCapitalize="words"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {loading && <ActivityIndicator size="small" color={BLUE} style={{ marginLeft: 8 }} />}
          </View>
        </View>

        {/* Results */}
        {fetching ? (
          <View style={styles.centred}>
            <ActivityIndicator size="large" color={BLUE} />
            <Text style={styles.fetchingText}>Looking up address…</Text>
          </View>
        ) : (
          <FlatList
            data={predictions}
            keyExtractor={(item) => item.place_id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              query.length >= 2 && !loading ? (
                <View style={styles.emptyState}>
                  <Feather name="map-pin" size={28} color={MUTED} style={{ marginBottom: 10 }} />
                  <Text style={styles.emptyTitle}>No results found</Text>
                  <Text style={styles.emptySub}>Try a different search, or enter your address manually below.</Text>
                </View>
              ) : query.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="search" size={28} color={MUTED} style={{ marginBottom: 10 }} />
                  <Text style={styles.emptyTitle}>Start typing your address</Text>
                  <Text style={styles.emptySub}>We'll search across all Australian addresses.</Text>
                </View>
              ) : null
            }
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [
                  styles.resultRow,
                  index > 0 && styles.resultRowBorder,
                  pressed && { backgroundColor: '#F0F7FF' },
                ]}
              >
                <View style={styles.resultIcon}>
                  <Feather name="map-pin" size={15} color={BLUE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultMain} numberOfLines={1}>{item.structured_formatting.main_text}</Text>
                  <Text style={styles.resultSub} numberOfLines={1}>{item.structured_formatting.secondary_text}</Text>
                </View>
                <Feather name="chevron-right" size={14} color={MUTED} />
              </Pressable>
            )}
            contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          />
        )}

        {/* Manual entry fallback */}
        <View style={[styles.manualFooter, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={handleClose} style={styles.manualBtn}>
            <Feather name="edit-2" size={14} color={BLUE} style={{ marginRight: 6 }} />
            <Text style={styles.manualBtnText}>Can't find it? Enter address manually</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const BLUE = '#1493FF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const BG = '#EFF6FF';

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF5FF',
    borderWidth: 1.5,
    borderColor: '#B3D9FF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
  },
  triggerTextFilled: { flex: 1, fontSize: 14, fontWeight: '500', color: TEXT },
  triggerTextPlaceholder: { flex: 1, fontSize: 14, fontWeight: '400', color: MUTED },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: TEXT },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: { paddingHorizontal: 16, paddingVertical: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
  },
  searchInput: { flex: 1, fontSize: 16, fontWeight: '400', color: TEXT },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    gap: 12,
  },
  resultRowBorder: { borderTopWidth: 1, borderTopColor: BORDER },
  resultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EBF5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultMain: { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 2 },
  resultSub: { fontSize: 12, fontWeight: '400', color: MUTED },
  emptyState: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: TEXT, marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: 13, fontWeight: '400', color: MUTED, textAlign: 'center', lineHeight: 19 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  fetchingText: { fontSize: 14, color: MUTED },
  manualFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 14,
    paddingHorizontal: 20,
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#B3D9FF',
    backgroundColor: '#EBF5FF',
  },
  manualBtnText: { fontSize: 14, fontWeight: '600', color: BLUE },
});
