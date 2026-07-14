import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { Image } from 'expo-image';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { StoreDetail, StoreHour, StoreSummary } from '@/lib/api';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { AddressSearchInput } from '@/components/AddressSearchInput';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { sendTestPrint, sendOpenDrawer } from '@/lib/printer';
import { BG, CARD, BLUE, NAVY, TEXT, MUTED, BORDER, GREEN, AMBER, RED, PURPLE, PINK, TEAL, ROSE, GOLD, GLASS_BG, GLASS_BORDER } from '@/components/director/directorColors';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type StoreStatus = 'open' | 'coming_soon' | 'temporarily_closed' | 'closed';
const STATUS_OPTIONS: Array<{ value: StoreStatus; label: string; color: string }> = [
  { value: 'open',               label: 'Open',               color: GREEN  },
  { value: 'coming_soon',        label: 'Coming Soon',        color: BLUE   },
  { value: 'temporarily_closed', label: 'Temporarily Closed', color: AMBER  },
  { value: 'closed',             label: 'Closed',             color: RED    },
];
const STORE_EDITOR_TABS = ['Details', 'Hours', 'Geofence', 'Printer', 'Notes'] as const;

function statusColor(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color ?? MUTED;
}
function statusLabel(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.label ?? status;
}
function deletionTimeLabel(purgeAt?: string | null) {
  if (!purgeAt) return 'Scheduled for deletion';
  const diff = new Date(purgeAt).getTime() - Date.now();
  if (diff <= 0) return 'Deleting soon';
  const hours = Math.ceil(diff / (60 * 60 * 1000));
  if (hours >= 24) return 'Deletes within 24 hours';
  return `Deletes in ${hours}h`;
}

function defaultHours() {
  return DAYS.map((_, i) => ({
    dayOfWeek: i,
    isClosed: i === 0, // Sunday closed by default
    openTime: '07:00',
    closeTime: '17:00',
    notes: '',
    breakStart: '',
    breakEnd: '',
  }));
}

type HourRow = { dayOfWeek: number; isClosed: boolean; openTime: string; closeTime: string; notes: string; breakStart: string; breakEnd: string };

function parseBreakFromNotes(notes: string): { breakStart: string; breakEnd: string } {
  const m = notes?.match(/^Break (\d{2}:\d{2}) [–-] (\d{2}:\d{2})$/);
  if (m) return { breakStart: m[1], breakEnd: m[2] };
  return { breakStart: '', breakEnd: '' };
}

function serializeBreakToNotes(breakStart: string, breakEnd: string): string {
  const bs = breakStart.trim();
  const be = breakEnd.trim();
  if (bs && be) return `Break ${bs} – ${be}`;
  return '';
}

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  return error instanceof Error ? error.message : fallback;
}

// ── StoreCard ────────────────────────────────────────────────────────────────
function StoreCard({ store, onPress }: { store: StoreSummary; onPress: () => void }) {
  const isPendingDeletion = !!store.deletedAt;
  const sc = isPendingDeletion ? RED : statusColor(store.status ?? '');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={[s.storeIcon, { backgroundColor: sc + '33', borderColor: sc + '55' }]}>
          <Feather name="map-pin" size={18} color={sc} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.storeName}>{store.name}</Text>
          <Text style={s.storeSub} numberOfLines={1}>
            {[store.address, store.suburb, store.state].filter(Boolean).join(', ') || 'No address set'}
          </Text>
        </View>
        <View style={[s.badge, { backgroundColor: sc + '18' }]}>
          <Text style={[s.badgeText, { color: sc }]}>{isPendingDeletion ? 'Pending Delete' : statusLabel(store.status ?? '')}</Text>
        </View>
        <Feather name="chevron-right" size={16} color={MUTED} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, paddingLeft: 50 }}>
        {isPendingDeletion && <View style={[s.chip, { backgroundColor: '#FEF2F2' }]}><Feather name="trash-2" size={11} color={RED} /><Text style={[s.chipText, { color: RED }]}>{deletionTimeLabel(store.purgeAt)}</Text></View>}
        {store.pickupAvailable   && <View style={s.chip}><Feather name="shopping-bag" size={11} color={BLUE} /><Text style={s.chipText}>Pickup</Text></View>}
        {store.deliveryAvailable && <View style={s.chip}><Feather name="truck"        size={11} color={PURPLE} /><Text style={[s.chipText, { color: PURPLE }]}>Delivery</Text></View>}
        {store.geofenceRadius    && <View style={s.chip}><Feather name="radio"        size={11} color={MUTED} /><Text style={[s.chipText, { color: MUTED }]}>{store.geofenceRadius}m fence</Text></View>}
      </View>
    </Pressable>
  );
}

function StoreField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  editable = true,
  autoCapitalize = 'sentences',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad' | 'url' | 'decimal-pad' | 'numbers-and-punctuation';
  editable?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
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
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

// ── StoreEditorModal ─────────────────────────────────────────────────────────
function StoreEditorModal({
  store, visible, onClose, onSaved,
}: { store: StoreDetail | null; visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

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
  const [website,          setWebsite]           = useState('');
  const [imageUrl,         setImageUrl]          = useState('');
  const [status,           setStatus]            = useState<StoreStatus>('open');
  const [pickupAvailable,  setPickupAvailable]   = useState(true);
  const [deliveryAvailable,setDeliveryAvailable] = useState(false);
  const [publicNotes,      setPublicNotes]       = useState('');
  const [internalNotes,    setInternalNotes]     = useState('');
  const [printerIp,        setPrinterIp]         = useState('');
  const [printerPort,      setPrinterPort]       = useState('9100');
  const [printerBrand,     setPrinterBrand]      = useState<'epson' | 'star'>('epson');
  const [autoPrint,        setAutoPrint]         = useState(true);
  const [autoDrawer,       setAutoDrawer]        = useState(false);
  const [drawerPin,        setDrawerPin]         = useState<0|1>(0);
  const [drawerBusy,       setDrawerBusy]        = useState(false);
  const [testPrinting,     setTestPrinting]      = useState(false);
  const [testPrintResult,  setTestPrintResult]   = useState<{ ok: boolean; message: string } | null>(null);
  const [orderCutoffTime,  setOrderCutoffTime]   = useState('');
  const [dailySpecial,     setDailySpecial]      = useState('');
  const [hours,            setHours]             = useState<HourRow[]>(defaultHours());
  const [activeTab,        setActiveTab]         = useState<(typeof STORE_EDITOR_TABS)[number]>('Details');

  // Derived: are any printer fields changed from the last saved value?
  // Test print uses current form state; order printing uses what's in the DB.
  // If these differ, orders will print with the old (saved) brand until the director saves.
  const printerHasUnsavedChanges = store != null && (
    printerBrand  !== ((store.printerBrand as 'epson' | 'star') ?? 'epson') ||
    printerIp     !== (store.printerIp ?? '') ||
    printerPort   !== (store.printerPort != null ? String(store.printerPort) : '9100')
  );

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
      setWebsite(store.website ?? '');
      setImageUrl(store.imageUrl ?? '');
      setStatus((store.status ?? 'open') as StoreStatus);
      setPickupAvailable(store.pickupAvailable ?? true);
      setDeliveryAvailable(store.deliveryAvailable ?? false);
      setPublicNotes(store.publicNotes ?? '');
      setInternalNotes(store.internalNotes ?? '');
      setPrinterIp(store.printerIp ?? '');
      setPrinterPort(store.printerPort != null ? String(store.printerPort) : '9100');
      setPrinterBrand((store.printerBrand as 'epson' | 'star') ?? 'epson');
      setAutoPrint(store.autoPrint !== false);
      setAutoDrawer(store.autoDrawer ?? false);
      setDrawerPin(((store.drawerPin ?? 0) === 1 ? 1 : 0) as 0|1);
      setOrderCutoffTime(store.orderCutoffTime ?? '');
      setDailySpecial(store.dailySpecial ?? '');
    } else {
      setName(''); setAddressLine(''); setSuburb(''); setState(''); setPostcode('');
      setCountry('Australia'); setLatitude(''); setLongitude(''); setGeofenceRadius('100');
      setPhone(''); setEmail(''); setWebsite(''); setImageUrl(''); setStatus('open'); setPickupAvailable(true);
      setDeliveryAvailable(false); setPublicNotes(''); setInternalNotes('');
      setPrinterIp(''); setPrinterPort('9100'); setPrinterBrand('epson'); setAutoPrint(true); setAutoDrawer(false); setDrawerPin(0); setOrderCutoffTime(''); setDailySpecial('');
    }
    setTestPrintResult(null);
    setActiveTab('Details');
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
          r.data.forEach((h) => {
            const idx = base.findIndex(b => b.dayOfWeek === h.dayOfWeek);
            if (idx >= 0) {
              const { breakStart, breakEnd } = parseBreakFromNotes(h.notes ?? '');
              base[idx] = {
                ...base[idx],
                isClosed: h.isClosed ?? false,
                openTime: h.openTime ?? '07:00',
                closeTime: h.closeTime ?? '17:00',
                notes: h.notes ?? '',
                breakStart,
                breakEnd,
              };
            }
          });
          setHours(base);
        } else {
          setHours(defaultHours());
        }
      })
      .catch(() => setHours(defaultHours()));
  }, [visible, store?.id]);

  const updateHour = (dow: number, field: keyof HourRow, value: HourRow[keyof HourRow]) => {
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
        website: website.trim() || null,
        imageUrl: imageUrl.trim() || null,
        printerIp: printerIp.trim() || null,
        printerPort: parseInt(printerPort, 10) || 9100,
        printerBrand,
        autoPrint,
        autoDrawer,
        drawerPin,
        orderCutoffTime: orderCutoffTime.trim() || null,
        dailySpecial: dailySpecial.trim() || null,
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

      // Serialize break times into notes before saving
      const hoursWithNotes: StoreHour[] = hours.map(h => ({
        ...h,
        notes: serializeBreakToNotes(h.breakStart, h.breakEnd),
      }));
      await api.director.setStoreHours(savedId, hoursWithNotes);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      onClose();
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error, 'Failed to save store.'));
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
            await api.director.updateStore(store.id, { status: 'closed' });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            onSaved(); onClose();
          } catch (error) { Alert.alert('Error', getErrorMessage(error)); }
        }},
      ],
    );
  };

  const handleDelete = () => {
    if (!store?.id) return;
    Alert.alert(
      'Delete Store',
      `Delete "${store.name}"? It will leave the app and operations view now, but you can restore it for the next 24 hours before it is removed completely.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.director.deleteStore(store.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              onSaved();
              onClose();
            } catch (error) {
              Alert.alert('Error', getErrorMessage(error, 'Could not delete store.'));
            }
          },
        },
      ],
    );
  };

  const handleRestore = async () => {
    if (!store?.id) return;
    try {
      await api.director.restoreStore(store.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      onClose();
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error, 'Could not restore store.'));
    }
  };

  const handleUploadStoreImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo library access to upload a store image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const filename = asset.fileName ?? `store-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? 'image/jpeg';

      setUploadingImage(true);
      const upload = await api.storage.uploadFile(asset.uri, filename, mimeType);
      setImageUrl(upload.servingUrl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Upload failed', getErrorMessage(error, 'Unable to upload the store image right now.'));
    } finally {
      setUploadingImage(false);
    }
  };

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
          <View style={s.tabRow}>
            {STORE_EDITOR_TABS.map((tab) => (
              <Pressable
                key={tab}
                onPress={() => { setActiveTab(tab); Haptics.selectionAsync(); }}
                style={[s.tabChip, activeTab === tab && s.tabChipActive]}
              >
                <Text style={[s.tabChipText, activeTab === tab && s.tabChipTextActive]}>{tab}</Text>
              </Pressable>
            ))}
          </View>

          {activeTab === 'Details' && (
          <>
          {store?.deletedAt && (
            <View style={s.section}>
              <View style={[s.infoBanner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Feather name="trash-2" size={15} color={RED} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.infoBannerTitle, { color: '#991B1B' }]}>Store pending deletion</Text>
                  <Text style={[s.infoBannerText, { color: '#B91C1C' }]}>
                    {deletionTimeLabel(store.purgeAt)}. Restore this store any time before then.
                  </Text>
                </View>
              </View>
            </View>
          )}
          <View style={s.section}>
            <Text style={s.sectionTitle}>ADDRESS SEARCH</Text>
            <View style={[s.sectionCard, { paddingHorizontal: 14, paddingVertical: 12 }]}>
              <AddressSearchInput
                currentValue={addressLine ? `${addressLine}${suburb ? `, ${suburb}` : ''}` : undefined}
                placeholder="Search store address…"
                onSelect={(r) => {
                  Haptics.selectionAsync();
                  if (r.street) setAddressLine(r.street);
                  if (r.suburb) setSuburb(r.suburb);
                  if (r.state) setState(r.state);
                  if (r.postcode) setPostcode(r.postcode);
                  if (r.lat != null) setLatitude(r.lat.toFixed(6));
                  if (r.lng != null) setLongitude(r.lng.toFixed(6));
                }}
              />
              {latitude && longitude && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
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

          <View style={s.section}>
            <Text style={s.sectionTitle}>STORE DETAILS</Text>
            <View style={s.sectionCard}>
              <StoreField label="Store Name *" value={name} onChangeText={setName} placeholder="e.g. Butterfield Merrylands" />
              <StoreField label="Street Address" value={addressLine} onChangeText={setAddressLine} placeholder="123 Main St" />
              <StoreField label="Suburb" value={suburb} onChangeText={setSuburb} placeholder="Merrylands" />
              <View style={{ flexDirection: 'row', gap: 0 }}>
                <View style={{ flex: 1 }}><StoreField label="State" value={state} onChangeText={setState} placeholder="NSW" /></View>
                <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: BORDER }}><StoreField label="Postcode" value={postcode} onChangeText={setPostcode} placeholder="2160" keyboardType="number-pad" autoCapitalize="none" /></View>
              </View>
              <StoreField label="Phone" value={phone} onChangeText={setPhone} placeholder="+61 2 9000 0000" keyboardType="phone-pad" autoCapitalize="none" />
              <StoreField label="Email" value={email} onChangeText={setEmail} placeholder="merrylands@butterfield.com" keyboardType="email-address" autoCapitalize="none" />
              <StoreField label="Website" value={website} onChangeText={setWebsite} placeholder="https://butterfieldcookies.com.au" keyboardType="url" autoCapitalize="none" />
              <StoreField label="Store Image URL" value={imageUrl} onChangeText={setImageUrl} placeholder="https://..." keyboardType="url" autoCapitalize="none" />
              <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
                <Pressable
                  onPress={handleUploadStoreImage}
                  disabled={uploadingImage}
                  style={({ pressed }) => [
                    s.imageUploadBtn,
                    pressed && !uploadingImage && { opacity: 0.9 },
                    uploadingImage && { opacity: 0.6 },
                  ]}
                >
                  {uploadingImage ? (
                    <ActivityIndicator size="small" color={BLUE} />
                  ) : (
                    <Feather name="image" size={15} color={BLUE} />
                  )}
                  <Text style={s.imageUploadBtnText}>
                    {uploadingImage ? 'Uploading store photo...' : 'Upload Store Photo'}
                  </Text>
                </Pressable>
                <Text style={s.imageUploadHint}>You can upload a store photo or paste a direct image URL.</Text>
              </View>
              {imageUrl.trim() ? (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                  <Image source={{ uri: imageUrl.trim() }} style={{ width: '100%', height: 150, borderRadius: 14, backgroundColor: '#F3F4F6' }} contentFit="cover" />
                </View>
              ) : null}
            </View>
          </View>
          <View style={s.section}>
            <Text style={s.sectionTitle}>PICKUP & SERVICE</Text>
            <View style={s.sectionCard}>
              <View style={[s.toggleRow, { borderTopWidth: 0 }]}>
                <Feather name="shopping-bag" size={15} color={BLUE} />
                <Text style={s.toggleLabel}>Pickup Available</Text>
                <Switch value={pickupAvailable} onValueChange={setPickupAvailable} trackColor={{ false: BORDER, true: '#BBF7D0' }} thumbColor={pickupAvailable ? GREEN : '#9CA3AF'} />
              </View>
              <View style={[s.toggleRow, { borderTopWidth: 1, borderTopColor: BORDER }]}>
                <Feather name="truck" size={15} color={PURPLE} />
                <Text style={s.toggleLabel}>Delivery Available</Text>
                <Switch value={deliveryAvailable} onValueChange={setDeliveryAvailable} trackColor={{ false: BORDER, true: '#DDD6FE' }} thumbColor={deliveryAvailable ? PURPLE : '#9CA3AF'} />
              </View>
              <StoreField label="Pickup Order Cutoff" value={orderCutoffTime} onChangeText={setOrderCutoffTime} placeholder="e.g. 16:00" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
              <View style={{ borderTopWidth: 1, borderTopColor: BORDER }}>
                <StoreField label="Daily Special" value={dailySpecial} onChangeText={setDailySpecial} placeholder="e.g. Free cookie with large coffee" />
              </View>
            </View>
          </View>
          </>
          )}

          {activeTab === 'Geofence' && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>LOCATION & GEOFENCE</Text>
            <View style={s.sectionCard}>
              <View style={{ flexDirection: 'row', gap: 0 }}>
                <View style={{ flex: 1 }}><StoreField label="Latitude" value={latitude} onChangeText={setLatitude} placeholder="-33.8349" keyboardType="decimal-pad" autoCapitalize="none" /></View>
                <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: BORDER }}><StoreField label="Longitude" value={longitude} onChangeText={setLongitude} placeholder="150.9942" keyboardType="decimal-pad" autoCapitalize="none" /></View>
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
          )}

          {activeTab === 'Details' && (
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
            </View>
          </View>
          )}

          {activeTab === 'Hours' && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>OPENING HOURS</Text>
            <View style={s.sectionCard}>
              {hours.map((h, i) => (
                <View key={h.dayOfWeek} style={[i > 0 && { borderTopWidth: 1, borderTopColor: BORDER }]}>
                  {/* Open / close row */}
                  <View style={s.hourRow}>
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
                  {/* Break row — only shown when day is open */}
                  {!h.isClosed && (
                    <View style={s.breakRow}>
                      <Feather name="coffee" size={11} color={MUTED} style={{ marginTop: 1 }} />
                      <Text style={s.breakLabel}>Break</Text>
                      <TextInput
                        style={s.breakInput}
                        value={h.breakStart}
                        onChangeText={v => updateHour(h.dayOfWeek, 'breakStart', v)}
                        placeholder="––:––"
                        placeholderTextColor={MUTED}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                      <Text style={{ color: MUTED, fontSize: 11 }}>–</Text>
                      <TextInput
                        style={s.breakInput}
                        value={h.breakEnd}
                        onChangeText={v => updateHour(h.dayOfWeek, 'breakEnd', v)}
                        placeholder="––:––"
                        placeholderTextColor={MUTED}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                      <Text style={s.breakHint}>optional</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
          )}

          {activeTab === 'Printer' && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>PRINTER DETAILS</Text>
            <View style={s.sectionCard}>
              <StoreField label="Printer IP" value={printerIp} onChangeText={setPrinterIp} placeholder="192.168.1.20" keyboardType="decimal-pad" autoCapitalize="none" />
              <View style={{ borderTopWidth: 1, borderTopColor: BORDER }}>
                <StoreField label="Printer Port" value={printerPort} onChangeText={v => setPrinterPort(v.replace(/[^\d]/g, ''))} placeholder="9100" keyboardType="number-pad" autoCapitalize="none" />
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={[s.fieldLabel, { marginBottom: 8 }]}>Printer Brand</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['epson', 'star'] as const).map(brand => (
                    <Pressable
                      key={brand}
                      onPress={() => setPrinterBrand(brand)}
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                        borderWidth: 1.5,
                        borderColor: printerBrand === brand ? BLUE : BORDER,
                        backgroundColor: printerBrand === brand ? '#EFF6FF' : CARD,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: printerBrand === brand ? BLUE : TEXT }}>
                        {brand === 'epson' ? 'Epson / ESC-POS' : 'Star Micronics'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
                  {printerBrand === 'star'
                    ? 'Uses StarPRNT cut commands (ESC m). For Star mC-Print, TSP, and SP series.'
                    : 'Uses ESC/POS cut commands (GS V). For Epson TM series and compatible printers.'}
                </Text>
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[s.fieldLabel, { marginBottom: 2 }]}>Print Automatically?</Text>
                  <Text style={{ fontSize: 12, color: MUTED }}>
                    Auto-print receipt when an order is accepted (moved to Preparing)
                  </Text>
                </View>
                <Switch value={autoPrint} onValueChange={setAutoPrint} />
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[s.fieldLabel, { marginBottom: 2 }]}>Cash Drawer Connected?</Text>
                  <Text style={{ fontSize: 12, color: MUTED }}>
                    Open drawer embedded in receipt on cash payments
                  </Text>
                </View>
                <Switch value={autoDrawer} onValueChange={setAutoDrawer} />
              </View>
              {autoDrawer && (
                <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Text style={[s.fieldLabel, { marginBottom: 8 }]}>Drawer Pin</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {([0, 1] as const).map(pin => (
                      <Pressable
                        key={pin}
                        onPress={() => setDrawerPin(pin)}
                        style={{
                          flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                          borderWidth: 1.5,
                          borderColor: drawerPin === pin ? BLUE : BORDER,
                          backgroundColor: drawerPin === pin ? '#EFF6FF' : CARD,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: drawerPin === pin ? BLUE : TEXT }}>
                          {pin === 0 ? 'Pin 0 (Drawer 1)' : 'Pin 1 (Drawer 2)'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
                    Most printers use Pin 0. Use Pin 1 only if your drawer is on the second port.
                  </Text>
                </View>
              )}
              {printerHasUnsavedChanges && (
                <View style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                  marginHorizontal: 14, marginBottom: 8, padding: 10, borderRadius: 8,
                  backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D',
                }}>
                  <Feather name="alert-triangle" size={14} color={AMBER} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 }}>
                    <Text style={{ fontWeight: '600' }}>Unsaved changes</Text>
                    {' — Test Print uses the current form settings. Order printing uses the last saved values. Tap Save to apply your changes.'}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 11, color: MUTED, fontWeight: '400', paddingHorizontal: 14, paddingBottom: 4 }}>
                Orders for this store will print to this network printer.
              </Text>
              <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                <Pressable
                  onPress={async () => {
                    const ip = printerIp.trim();
                    if (!ip) {
                      setTestPrintResult({ ok: false, message: 'Enter a printer IP address first.' });
                      return;
                    }
                    setTestPrinting(true);
                    setTestPrintResult(null);
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    try {
                      await sendTestPrint(ip, parseInt(printerPort, 10) || 9100, printerBrand);
                      setTestPrintResult({ ok: true, message: 'Test receipt sent successfully.' });
                    } catch (err: any) {
                      setTestPrintResult({ ok: false, message: err?.message ?? 'Could not reach the printer.' });
                    } finally {
                      setTestPrinting(false);
                    }
                  }}
                  disabled={testPrinting}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, paddingVertical: 11, borderRadius: 10,
                    borderWidth: 1.5, borderColor: printerIp.trim() ? BLUE : BORDER,
                    backgroundColor: printerIp.trim() ? '#EFF6FF' : '#F9FAFB',
                    opacity: testPrinting ? 0.6 : 1,
                  }}
                >
                  {testPrinting
                    ? <ActivityIndicator size="small" color={BLUE} />
                    : <Feather name="printer" size={15} color={printerIp.trim() ? BLUE : MUTED} />
                  }
                  <Text style={{ fontSize: 13, fontWeight: '600', color: printerIp.trim() ? BLUE : MUTED }}>
                    {testPrinting ? 'Sending…' : 'Send Test Print'}
                  </Text>
                </Pressable>
                {testPrintResult && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    marginTop: 8, padding: 9, borderRadius: 8,
                    backgroundColor: testPrintResult.ok ? '#F0FDF4' : '#FEF2F2',
                  }}>
                    <Feather
                      name={testPrintResult.ok ? 'check-circle' : 'alert-circle'}
                      size={14}
                      color={testPrintResult.ok ? GREEN : RED}
                    />
                    <Text style={{ fontSize: 12, fontWeight: '500', color: testPrintResult.ok ? GREEN : RED, flex: 1 }}>
                      {testPrintResult.message}
                    </Text>
                  </View>
                )}
                {autoDrawer && (
                  <Pressable
                    onPress={async () => {
                      const ip = printerIp.trim();
                      if (!ip) { setTestPrintResult({ ok: false, message: 'Enter a printer IP address first.' }); return; }
                      setDrawerBusy(true);
                      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      try {
                        await sendOpenDrawer(ip, parseInt(printerPort, 10) || 9100, undefined, drawerPin, printerBrand);
                        setTestPrintResult({ ok: true, message: 'Cash drawer opened successfully.' });
                      } catch (err: any) {
                        setTestPrintResult({ ok: false, message: err?.message ?? 'Could not open the cash drawer.' });
                      } finally {
                        setDrawerBusy(false);
                      }
                    }}
                    disabled={drawerBusy}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      gap: 8, paddingVertical: 11, borderRadius: 10, marginTop: 8,
                      borderWidth: 1.5, borderColor: printerIp.trim() ? GREEN : BORDER,
                      backgroundColor: printerIp.trim() ? '#F0FDF4' : '#F9FAFB',
                      opacity: drawerBusy ? 0.6 : 1,
                    }}
                  >
                    {drawerBusy
                      ? <ActivityIndicator size="small" color={GREEN} />
                      : <Feather name="unlock" size={15} color={printerIp.trim() ? GREEN : MUTED} />
                    }
                    <Text style={{ fontSize: 13, fontWeight: '600', color: printerIp.trim() ? GREEN : MUTED }}>
                      {drawerBusy ? 'Opening…' : 'Open Drawer'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
          )}

          {activeTab === 'Notes' && (
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
          )}

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
            {store && !store.deletedAt && (
              <>
              <Pressable style={s.deactivateBtn} onPress={handleDeactivate}>
                <Feather name="slash" size={14} color={AMBER} />
                <Text style={s.deactivateBtnText}>Close Store</Text>
              </Pressable>
              <Pressable style={s.deleteBtn} onPress={handleDelete}>
                <Feather name="trash-2" size={14} color={RED} />
                <Text style={s.deleteBtnText}>Delete Store</Text>
              </Pressable>
              </>
            )}
            {store?.deletedAt && (
              <Pressable style={s.restoreBtn} onPress={handleRestore}>
                <Feather name="rotate-ccw" size={14} color={GREEN} />
                <Text style={s.restoreBtnText}>Restore Store</Text>
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
  const qc = useQueryClient();
  const [editingStore, setEditingStore] = useState<StoreDetail | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-stores'],
    queryFn: () => api.director.storesList(),
  });
  const { refreshing, onRefresh: onRefreshStores } = useRefreshControl(
    async () => { await refetch(); await qc.invalidateQueries({ queryKey: ['director-stores'] }); },
  );

  const stores: StoreSummary[] = data?.data ?? [];

  const openAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingStore(null);
    setShowEditor(true);
  };

  const openEdit = (store: StoreSummary) => {
    Haptics.selectionAsync();
    setEditingStore(store);
    setShowEditor(true);
  };

  return (
    <DirectorStandaloneScreen
      title="Store Locations"
      subtitle={`${stores.length} location${stores.length !== 1 ? 's' : ''} configured`}
      headerRight={
        <Pressable style={s.addBtn} onPress={openAdd}>
          <Feather name="plus" size={18} color="#fff" />
          <Text style={s.addBtnText}>Add Store</Text>
        </Pressable>
      }
    >

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      ) : stores.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: BLUE + '33', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: BLUE + '55' }}>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefreshStores} tintColor={BLUE} />}
          renderItem={({ item }) => (
            <StoreCard store={item} onPress={() => openEdit(item)} />
          )}
        />
      )}

      <StoreEditorModal
        store={editingStore}
        visible={showEditor}
        onClose={() => setShowEditor(false)}
        onSaved={onRefreshStores}
      />
    </DirectorStandaloneScreen>
  );
}

const s = StyleSheet.create({
  header:         { paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: BG },
  headerTitle:    { fontWeight: '700', fontSize: 28, color: TEXT },
  headerSub:      { fontWeight: '400', fontSize: 13, color: MUTED, marginTop: 2 },
  addBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  addBtnText:     { fontWeight: '600', fontSize: 13, color: '#fff' },
  card:           { backgroundColor: CARD, borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  storeIcon:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  storeName:      { fontWeight: '600', fontSize: 15, color: TEXT },
  storeSub:       { fontWeight: '400', fontSize: 12, color: MUTED, marginTop: 2 },
  badge:          { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:      { fontWeight: '600', fontSize: 10 },
  chip:           { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BLUE + '12', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  chipText:       { fontWeight: '500', fontSize: 11, color: BLUE },
  // Modal
  modalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER },
  modalTitle:     { fontWeight: '700', fontSize: 18, color: TEXT },
  tabRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  tabChip:        { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  tabChipActive:  { backgroundColor: '#000', borderColor: '#000' },
  tabChipText:    { fontWeight: '600', fontSize: 12, color: TEXT },
  tabChipTextActive: { color: '#fff' },
  section:        { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle:   { fontWeight: '600', fontSize: 11, color: MUTED, letterSpacing: 1.2, marginBottom: 8, paddingHorizontal: 4 },
  sectionCard:    { backgroundColor: CARD, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
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
  breakRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingBottom: 8, paddingTop: 0 },
  breakLabel:     { fontWeight: '500', fontSize: 11, color: MUTED, width: 36 },
  breakInput:     { fontWeight: '400', fontSize: 12, color: TEXT, borderWidth: 1, borderColor: BORDER, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3, width: 52, textAlign: 'center' },
  breakHint:      { fontWeight: '400', fontSize: 10, color: MUTED, marginLeft: 4, fontStyle: 'italic' },
  searchDropdown: { backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER },
  searchResult:   { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'flex-start' },
  searchResultText:{ fontWeight: '400', fontSize: 13, color: TEXT, flex: 1 },
  saveBtn:        { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  saveBtnText:    { fontWeight: '600', fontSize: 16, color: '#fff' },
  deactivateBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 14, borderWidth: 1.5, borderColor: AMBER },
  deactivateBtnText:{ fontWeight: '600', fontSize: 14, color: AMBER },
  deleteBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 14, borderWidth: 1.5, borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  deleteBtnText:  { fontWeight: '600', fontSize: 14, color: RED },
  restoreBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 14, borderWidth: 1.5, borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  restoreBtnText: { fontWeight: '600', fontSize: 14, color: GREEN },
  imageUploadBtn: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  imageUploadBtnText: { fontWeight: '600', fontSize: 14, color: BLUE },
  imageUploadHint: { fontWeight: '400', fontSize: 12, color: MUTED, lineHeight: 17 },
  infoBanner:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  infoBannerTitle:{ fontWeight: '700', fontSize: 14 },
  infoBannerText: { fontWeight: '400', fontSize: 12, lineHeight: 18 },
});
