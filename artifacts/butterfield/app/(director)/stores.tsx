import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#16A34A';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';
const PURPLE = '#8B5CF6';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_OPTIONS = [
  { value: 'open',               label: 'Open',               color: GREEN  },
  { value: 'coming_soon',        label: 'Coming Soon',        color: BLUE   },
  { value: 'temporarily_closed', label: 'Temporarily Closed', color: AMBER  },
  { value: 'closed',             label: 'Closed',             color: RED    },
];

function statusColor(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color ?? MUTED;
}
function statusLabel(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.label ?? status;
}

function defaultHours() {
  return DAYS.map((_, i) => ({
    dayOfWeek: i,
    isClosed: i === 0, // Sunday closed by default
    openTime: '07:00',
    closeTime: '17:00',
    notes: '',
  }));
}

type HourRow = { dayOfWeek: number; isClosed: boolean; openTime: string; closeTime: string; notes: string };

// ── Nominatim address search ─────────────────────────────────────────────────
async function nominatimSearch(q: string): Promise<any[]> {
  if (q.length < 3) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}&addressdetails=1&countrycodes=au`;
    const res = await fetch(url, { headers: { 'User-Agent': 'ButterfieldCookiesDirector/1.0' } });
    return res.ok ? res.json() : [];
  } catch { return []; }
}

// ── StoreCard ────────────────────────────────────────────────────────────────
function StoreCard({ store, onPress }: { store: any; onPress: () => void }) {
  const sc = statusColor(store.status);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={[s.storeIcon, { backgroundColor: sc + '18' }]}>
          <Feather name="map-pin" size={18} color={sc} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.storeName}>{store.name}</Text>
          <Text style={s.storeSub} numberOfLines={1}>
            {[store.address, store.suburb, store.state].filter(Boolean).join(', ') || 'No address set'}
          </Text>
        </View>
        <View style={[s.badge, { backgroundColor: sc + '18' }]}>
          <Text style={[s.badgeText, { color: sc }]}>{statusLabel(store.status)}</Text>
        </View>
        <Feather name="chevron-right" size={16} color={MUTED} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, paddingLeft: 50 }}>
        {store.pickupAvailable   && <View style={s.chip}><Feather name="shopping-bag" size={11} color={BLUE} /><Text style={s.chipText}>Pickup</Text></View>}
        {store.deliveryAvailable && <View style={s.chip}><Feather name="truck"        size={11} color={PURPLE} /><Text style={[s.chipText, { color: PURPLE }]}>Delivery</Text></View>}
        {store.geofenceRadius    && <View style={s.chip}><Feather name="radio"        size={11} color={MUTED} /><Text style={[s.chipText, { color: MUTED }]}>{store.geofenceRadius}m fence</Text></View>}
      </View>
    </Pressable>
  );
}

// ── StoreEditorModal ─────────────────────────────────────────────────────────
function StoreEditorModal({
  store, visible, onClose, onSaved,
}: { store: any | null; visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name,             setName]             = useState('');
  const [addressLine,      setAddressLine]       = useState('');
  const [suburb,           setSuburb]            = useState('');
  const [state,            setState]             = useState('');
  const [postcode,         setPostcode]          = useState('');
  const [country,          setCountry]           = useState('Australia');
  const [latitude,         setLatitude]          = useState('');
  const [longitude,        setLongitude]         = useState('');
  const [geofenceRadius,   setGeofenceRadius]    = useState('100');
  const [phone,            setPhone]             = useState('');
  const [email,            setEmail]             = useState('');
  const [status,           setStatus]            = useState<string>('open');
  const [pickupAvailable,  setPickupAvailable]   = useState(true);
  const [deliveryAvailable,setDeliveryAvailable] = useState(false);
  const [publicNotes,      setPublicNotes]       = useState('');
  const [internalNotes,    setInternalNotes]     = useState('');
  const [hours,            setHours]             = useState<HourRow[]>(defaultHours());

  // Nominatim search
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Populate from existing store
  useEffect(() => {
    if (!visible) return;
    if (store) {
      setName(store.name ?? '');
      setAddressLine(store.address ?? '');
      setSuburb(store.suburb ?? '');
      setState(store.state ?? '');
      setPostcode(store.postcode ?? '');
      setCountry(store.country ?? 'Australia');
      setLatitude(store.latitude != null ? String(store.latitude) : '');
      setLongitude(store.longitude != null ? String(store.longitude) : '');
      setGeofenceRadius(String(store.geofenceRadius ?? 100));
      setPhone(store.phone ?? '');
      setEmail(store.email ?? '');
      setStatus(store.status ?? 'open');
      setPickupAvailable(store.pickupAvailable ?? true);
      setDeliveryAvailable(store.deliveryAvailable ?? false);
      setPublicNotes(store.publicNotes ?? '');
      setInternalNotes(store.internalNotes ?? '');
    } else {
      setName(''); setAddressLine(''); setSuburb(''); setState(''); setPostcode('');
      setCountry('Australia'); setLatitude(''); setLongitude(''); setGeofenceRadius('100');
      setPhone(''); setEmail(''); setStatus('open'); setPickupAvailable(true);
      setDeliveryAvailable(false); setPublicNotes(''); setInternalNotes('');
    }
    setSearchQuery(''); setSearchResults([]);
  }, [visible, store]);

  // Fetch opening hours when editing
  useEffect(() => {
    if (!visible || !store?.id) {
      setHours(defaultHours());
      return;
    }
    api.director.storeHours(store.id)
      .then(r => {
        if (r.data && r.data.length > 0) {
          const base = defaultHours();
          r.data.forEach((h: any) => {
            const idx = base.findIndex(b => b.dayOfWeek === h.dayOfWeek);
            if (idx >= 0) base[idx] = { ...base[idx], isClosed: h.isClosed, openTime: h.openTime ?? '07:00', closeTime: h.closeTime ?? '17:00', notes: h.notes ?? '' };
          });
          setHours(base);
        } else {
          setHours(defaultHours());
        }
      })
      .catch(() => setHours(defaultHours()));
  }, [visible, store?.id]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 3) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      const results = await nominatimSearch(q);
      setSearchResults(results);
      setSearchLoading(false);
    }, 600);
  }, []);

  const applyResult = (r: any) => {
    Haptics.selectionAsync();
    const addr = r.address ?? {};
    const road  = [addr.house_number, addr.road].filter(Boolean).join(' ');
    if (!name) setName(addr.amenity ?? addr.shop ?? addr.building ?? r.display_name.split(',')[0] ?? '');
    setAddressLine(road || (r.display_name.split(',')[0] ?? ''));
    setSuburb(addr.suburb ?? addr.town ?? addr.city_district ?? addr.city ?? '');
    setState(addr.state ?? '');
    setPostcode(addr.postcode ?? '');
    setCountry(addr.country ?? 'Australia');
    setLatitude(parseFloat(r.lat).toFixed(6));
    setLongitude(parseFloat(r.lon).toFixed(6));
    setSearchQuery(r.display_name);
    setSearchResults([]);
  };

  const updateHour = (dow: number, field: keyof HourRow, value: any) => {
    setHours(prev => prev.map(h => h.dayOfWeek === dow ? { ...h, [field]: value } : h));
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Store name is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        address: addressLine.trim() || null,
        suburb: suburb.trim() || null,
        state: state.trim() || null,
        postcode: postcode.trim() || null,
        country: country.trim() || 'Australia',
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        geofenceRadius: parseInt(geofenceRadius) || 100,
        phone: phone.trim() || null,
        email: email.trim() || null,
        status,
        pickupAvailable,
        deliveryAvailable,
        publicNotes: publicNotes.trim() || null,
        internalNotes: internalNotes.trim() || null,
      };

      let savedId: string;
      if (store?.id) {
        const r = await api.director.updateStore(store.id, payload);
        savedId = r.data.id;
      } else {
        const r = await api.director.createStore(payload);
        savedId = r.data.id;
      }

      // Save opening hours
      await api.director.setStoreHours(savedId, hours);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save store.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = () => {
    if (!store?.id) return;
    Alert.alert(
      'Deactivate Store',
      `Set "${store.name}" status to Closed? Historical data is preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Deactivate', style: 'destructive', onPress: async () => {
          try {
            await api.director.deleteStore(store.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            onSaved(); onClose();
          } catch (e: any) { Alert.alert('Error', e.message); }
        }},
      ],
    );
  };

  const Field = ({ label, value, onChangeText, placeholder, keyboardType, editable = true }: any) => (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.fieldInput, !editable && { color: MUTED, backgroundColor: BG }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ''}
        placeholderTextColor={MUTED}
        keyboardType={keyboardType ?? 'default'}
        editable={editable}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.modalHeader}>
          <Pressable onPress={onClose} hitSlop={12}><Feather name="x" size={22} color={TEXT} /></Pressable>
          <Text style={s.modalTitle}>{store ? 'Edit Store' : 'New Store'}</Text>
          {saving
            ? <ActivityIndicator size="small" color={BLUE} />
            : <Pressable onPress={handleSave} hitSlop={12}>
                <Text style={{ color: BLUE, fontWeight: '600', fontSize: 16 }}>Save</Text>
              </Pressable>
          }
        </View>

        <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">

          {/* ── Address search ─── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>ADDRESS SEARCH</Text>
            <View style={[s.sectionCard, { overflow: 'visible', zIndex: 100 }]}>
              <View style={{ position: 'relative' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                  <Feather name="search" size={16} color={MUTED} />
                  <TextInput
                    style={{ flex: 1, fontWeight: '400', fontSize: 15, color: TEXT }}
                    value={searchQuery}
                    onChangeText={handleSearch}
                    placeholder="Search address or place name…"
                    placeholderTextColor={MUTED}
                    returnKeyType="search"
                  />
                  {searchLoading && <ActivityIndicator size="small" color={BLUE} />}
                  {searchQuery.length > 0 && !searchLoading && (
                    <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]); }} hitSlop={8}>
                      <Feather name="x" size={15} color={MUTED} />
                    </Pressable>
                  )}
                </View>
                {searchResults.length > 0 && (
                  <View style={s.searchDropdown}>
                    {searchResults.map((r, i) => (
                      <Pressable
                        key={r.place_id}
                        onPress={() => applyResult(r)}
                        style={[s.searchResult, i > 0 && { borderTopWidth: 1, borderTopColor: BORDER }]}
                      >
                        <Feather name="map-pin" size={13} color={BLUE} style={{ marginTop: 2 }} />
                        <Text style={s.searchResultText} numberOfLines={2}>{r.display_name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
              {latitude && longitude && (
                <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
                  <View style={{ flex: 1, backgroundColor: BG, borderRadius: 8, padding: 8 }}>
                    <Text style={{ fontSize: 10, color: MUTED, fontWeight: '500' }}>LATITUDE</Text>
                    <Text style={{ fontSize: 13, color: TEXT, fontWeight: '600', marginTop: 2 }}>{latitude}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: BG, borderRadius: 8, padding: 8 }}>
                    <Text style={{ fontSize: 10, color: MUTED, fontWeight: '500' }}>LONGITUDE</Text>
                    <Text style={{ fontSize: 13, color: TEXT, fontWeight: '600', marginTop: 2 }}>{longitude}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* ── Store details ─── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>STORE DETAILS</Text>
            <View style={s.sectionCard}>
              <Field label="Store Name *"    value={name}        onChangeText={setName}     placeholder="e.g. Butterfield Merrylands" />
              <Field label="Street Address"  value={addressLine} onChangeText={setAddressLine} placeholder="123 Main St" />
              <Field label="Suburb"          value={suburb}      onChangeText={setSuburb}   placeholder="Merrylands" />
              <View style={{ flexDirection: 'row', gap: 0 }}>
                <View style={{ flex: 1 }}><Field label="State" value={state} onChangeText={setState} placeholder="NSW" /></View>
                <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: BORDER }}><Field label="Postcode" value={postcode} onChangeText={setPostcode} placeholder="2160" keyboardType="number-pad" /></View>
              </View>
              <Field label="Phone"           value={phone}       onChangeText={setPhone}    placeholder="+61 2 9000 0000" keyboardType="phone-pad" />
              <Field label="Email"           value={email}       onChangeText={setEmail}    placeholder="merrylands@butterfield.com" keyboardType="email-address" />
            </View>
          </View>

          {/* ── Location / geofence ─── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>LOCATION & GEOFENCE</Text>
            <View style={s.sectionCard}>
              <View style={{ flexDirection: 'row', gap: 0 }}>
                <View style={{ flex: 1 }}><Field label="Latitude"  value={latitude}  onChangeText={setLatitude}  placeholder="-33.8349" keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: BORDER }}><Field label="Longitude" value={longitude} onChangeText={setLongitude} placeholder="150.9942" keyboardType="decimal-pad" /></View>
              </View>
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>Geofence Radius</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <TextInput
                    style={[s.fieldInput, { flex: 1 }]}
                    value={geofenceRadius}
                    onChangeText={v => setGeofenceRadius(v.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    placeholder="100"
                    placeholderTextColor={MUTED}
                  />
                  <Text style={{ color: MUTED, fontWeight: '400', fontSize: 14, paddingRight: 14 }}>metres</Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: MUTED, fontWeight: '400', paddingHorizontal: 14, paddingBottom: 10 }}>
                Staff must be within this radius to clock in/out at this location.
              </Text>
            </View>
          </View>

          {/* ── Status ─── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>STATUS & SERVICES</Text>
            <View style={s.sectionCard}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 14 }}>
                {STATUS_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.value}
                    onPress={() => { Haptics.selectionAsync(); setStatus(opt.value); }}
                    style={[s.statusBtn, status === opt.value && { backgroundColor: opt.color, borderColor: opt.color }]}
                  >
                    <Text style={[s.statusBtnText, status === opt.value && { color: '#fff' }]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={[s.toggleRow, { borderTopWidth: 1, borderTopColor: BORDER }]}>
                <Feather name="shopping-bag" size={15} color={BLUE} />
                <Text style={s.toggleLabel}>Pickup Available</Text>
                <Switch value={pickupAvailable} onValueChange={setPickupAvailable} trackColor={{ false: BORDER, true: '#BBF7D0' }} thumbColor={pickupAvailable ? GREEN : '#9CA3AF'} />
              </View>
              <View style={[s.toggleRow, { borderTopWidth: 1, borderTopColor: BORDER }]}>
                <Feather name="truck" size={15} color={PURPLE} />
                <Text style={s.toggleLabel}>Delivery Available</Text>
                <Switch value={deliveryAvailable} onValueChange={setDeliveryAvailable} trackColor={{ false: BORDER, true: '#DDD6FE' }} thumbColor={deliveryAvailable ? PURPLE : '#9CA3AF'} />
              </View>
            </View>
          </View>

          {/* ── Opening hours ─── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>OPENING HOURS</Text>
            <View style={s.sectionCard}>
              {hours.map((h, i) => (
                <View key={h.dayOfWeek} style={[s.hourRow, i > 0 && { borderTopWidth: 1, borderTopColor: BORDER }]}>
                  <Text style={s.hourDay}>{SHORT_DAYS[h.dayOfWeek]}</Text>
                  <Switch
                    value={!h.isClosed}
                    onValueChange={v => updateHour(h.dayOfWeek, 'isClosed', !v)}
                    trackColor={{ false: BORDER, true: '#BBF7D0' }}
                    thumbColor={!h.isClosed ? GREEN : '#9CA3AF'}
                    style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                  />
                  {h.isClosed ? (
                    <Text style={{ flex: 1, color: MUTED, fontWeight: '400', fontSize: 13, textAlign: 'center' }}>Closed</Text>
                  ) : (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        style={s.timeInput}
                        value={h.openTime}
                        onChangeText={v => updateHour(h.dayOfWeek, 'openTime', v)}
                        placeholder="07:00"
                        placeholderTextColor={MUTED}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                      <Text style={{ color: MUTED, fontSize: 12 }}>–</Text>
                      <TextInput
                        style={s.timeInput}
                        value={h.closeTime}
                        onChangeText={v => updateHour(h.dayOfWeek, 'closeTime', v)}
                        placeholder="17:00"
                        placeholderTextColor={MUTED}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* ── Notes ─── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>NOTES</Text>
            <View style={s.sectionCard}>
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>Public Notes</Text>
                <TextInput
                  style={[s.fieldInput, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={publicNotes}
                  onChangeText={setPublicNotes}
                  placeholder="Shown to customers (e.g. free parking)"
                  placeholderTextColor={MUTED}
                  multiline
                />
              </View>
              <View style={[s.fieldRow, { borderTopWidth: 1, borderTopColor: BORDER }]}>
                <Text style={s.fieldLabel}>Internal Notes</Text>
                <TextInput
                  style={[s.fieldInput, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={internalNotes}
                  onChangeText={setInternalNotes}
                  placeholder="Director/staff only (e.g. alarm code, contact)"
                  placeholderTextColor={MUTED}
                  multiline
                />
              </View>
            </View>
          </View>

          {/* ── Actions ─── */}
          <View style={[s.section, { gap: 10 }]}>
            <Pressable
              style={[s.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.saveBtnText}>{store ? 'Save Changes' : 'Create Store'}</Text>
              }
            </Pressable>
            {store && (
              <Pressable style={s.deactivateBtn} onPress={handleDeactivate}>
                <Feather name="slash" size={14} color={AMBER} />
                <Text style={s.deactivateBtnText}>Deactivate Store</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function DirectorStoresScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [editingStore, setEditingStore] = useState<any | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-stores'],
    queryFn: () => api.director.storesList(),
  });

  const stores: any[] = data?.data ?? [];

  const handleRefresh = useCallback(() => {
    refetch();
    qc.invalidateQueries({ queryKey: ['director-stores'] });
  }, [refetch, qc]);

  const openAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingStore(null);
    setShowEditor(true);
  };

  const openEdit = (store: any) => {
    Haptics.selectionAsync();
    setEditingStore(store);
    setShowEditor(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: 20 }]}>
        <View>
          <Text style={s.headerTitle}>Store Locations</Text>
          <Text style={s.headerSub}>{stores.length} location{stores.length !== 1 ? 's' : ''} configured</Text>
        </View>
        <Pressable style={s.addBtn} onPress={openAdd}>
          <Feather name="plus" size={18} color="#fff" />
          <Text style={s.addBtnText}>Add Store</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      ) : stores.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="map-pin" size={28} color={BLUE} />
          </View>
          <Text style={{ fontWeight: '700', fontSize: 18, color: TEXT, textAlign: 'center' }}>No stores yet</Text>
          <Text style={{ fontWeight: '400', fontSize: 14, color: MUTED, textAlign: 'center' }}>Add your first Butterfield location to enable geofence clock-in and public store listings.</Text>
          <Pressable style={s.addBtn} onPress={openAdd}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={s.addBtnText}>Add First Store</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={stores}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={BLUE} />}
          renderItem={({ item }) => (
            <StoreCard store={item} onPress={() => openEdit(item)} />
          )}
        />
      )}

      <StoreEditorModal
        store={editingStore}
        visible={showEditor}
        onClose={() => setShowEditor(false)}
        onSaved={handleRefresh}
      />
    </View>
  );
}

const s = StyleSheet.create({
  header:         { paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: BG },
  headerTitle:    { fontWeight: '700', fontSize: 26, color: TEXT },
  headerSub:      { fontWeight: '400', fontSize: 13, color: MUTED, marginTop: 2 },
  addBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: NAVY, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  addBtnText:     { fontWeight: '600', fontSize: 13, color: '#fff' },
  card:           { backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  storeIcon:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  storeName:      { fontWeight: '600', fontSize: 15, color: TEXT },
  storeSub:       { fontWeight: '400', fontSize: 12, color: MUTED, marginTop: 2 },
  badge:          { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:      { fontWeight: '600', fontSize: 10 },
  chip:           { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BLUE + '12', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  chipText:       { fontWeight: '500', fontSize: 11, color: BLUE },
  // Modal
  modalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER },
  modalTitle:     { fontWeight: '700', fontSize: 18, color: TEXT },
  section:        { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle:   { fontWeight: '600', fontSize: 11, color: MUTED, letterSpacing: 1.2, marginBottom: 8, paddingHorizontal: 4 },
  sectionCard:    { backgroundColor: CARD, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, overflow: 'hidden' },
  fieldRow:       { paddingHorizontal: 14, paddingVertical: 12 },
  fieldLabel:     { fontWeight: '500', fontSize: 11, color: MUTED, marginBottom: 4 },
  fieldInput:     { fontWeight: '400', fontSize: 15, color: TEXT },
  toggleRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  toggleLabel:    { fontWeight: '500', fontSize: 15, color: TEXT, flex: 1 },
  statusBtn:      { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: BORDER },
  statusBtnText:  { fontWeight: '500', fontSize: 13, color: TEXT },
  hourRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  hourDay:        { fontWeight: '600', fontSize: 13, color: TEXT, width: 36 },
  timeInput:      { fontWeight: '400', fontSize: 14, color: TEXT, borderWidth: 1, borderColor: BORDER, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, flex: 1, textAlign: 'center' },
  searchDropdown: { backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER },
  searchResult:   { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'flex-start' },
  searchResultText:{ fontWeight: '400', fontSize: 13, color: TEXT, flex: 1 },
  saveBtn:        { backgroundColor: NAVY, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  saveBtnText:    { fontWeight: '600', fontSize: 16, color: '#fff' },
  deactivateBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 14, borderWidth: 1.5, borderColor: AMBER },
  deactivateBtnText:{ fontWeight: '600', fontSize: 14, color: AMBER },
});
