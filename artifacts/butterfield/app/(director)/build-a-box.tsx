import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type BuildABoxSize, type BuildABoxProductConfig } from '@/lib/api';

const NAVY   = '#1A2B4A';
const BLUE   = '#40C0F2';
const BG     = '#F4F6FA';
const CARD   = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT   = '#111827';
const MUTED  = '#6B7280';
const GREEN  = '#16A34A';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function parseDollars(raw: string): number {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function centsToDisplay(cents: number): string {
  return cents > 0 ? (cents / 100).toFixed(2) : '';
}

export default function BuildABoxSettingsScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-build-a-box-config'],
    queryFn: () => api.director.buildABoxConfig(),
  });

  const [sizes, setSizes] = useState<BuildABoxSize[]>([]);
  const [products, setProducts] = useState<BuildABoxProductConfig[]>([]);
  const [sizesDirty, setSizesDirty] = useState(false);
  const [productsDirty, setProductsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'sizes' | 'cookies'>('sizes');

  const [rawSizePrices, setRawSizePrices] = useState<string[]>([]);
  const [rawPremiumPrices, setRawPremiumPrices] = useState<Record<string, string>>({});
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  useEffect(() => {
    if (data?.data) {
      const loadedSizes = data.data.sizes ?? [];
      const loadedProducts = data.data.products ?? [];
      setSizes(loadedSizes);
      setProducts(loadedProducts);
      setRawSizePrices(loadedSizes.map(s => centsToDisplay(s.priceCents)));
      const premiumMap: Record<string, string> = {};
      for (const p of loadedProducts) {
        premiumMap[p.id] = centsToDisplay(p.premiumCents);
      }
      setRawPremiumPrices(premiumMap);
      setSizesDirty(false);
      setProductsDirty(false);
    }
  }, [data]);

  const addSize = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSizes(prev => [...prev, { size: 0, label: '', priceCents: 0, imageUrl: undefined }]);
    setRawSizePrices(prev => [...prev, '']);
    setSizesDirty(true);
  };

  const pickSizeImage = async (idx: number) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload a box image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const filename = asset.fileName ?? `box-size-${idx}-${Date.now()}.jpg`;
    const contentType = asset.mimeType ?? 'image/jpeg';
    setUploadingIdx(idx);
    try {
      const { servingUrl } = await api.storage.uploadProductImage(asset.uri, filename, contentType, 'build-a-box', `size-${idx}`);
      setSizes(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx]!, imageUrl: servingUrl };
        return next;
      });
      setSizesDirty(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload image.');
    } finally {
      setUploadingIdx(null);
    }
  };

  const removeSizeImage = (idx: number) => {
    setSizes(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx]!, imageUrl: undefined };
      return next;
    });
    setSizesDirty(true);
  };

  const removeSize = (idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSizes(prev => prev.filter((_, i) => i !== idx));
    setRawSizePrices(prev => prev.filter((_, i) => i !== idx));
    setSizesDirty(true);
  };

  const updateSize = (idx: number, field: keyof BuildABoxSize, raw: string) => {
    setSizes(prev => {
      const next = [...prev];
      if (field === 'label') {
        next[idx] = { ...next[idx]!, label: raw };
      } else if (field === 'size') {
        const n = parseInt(raw, 10);
        next[idx] = { ...next[idx]!, size: isNaN(n) ? 0 : n };
      }
      return next;
    });
    setSizesDirty(true);
  };

  const commitSizePrice = (idx: number) => {
    const raw = rawSizePrices[idx] ?? '';
    const cents = parseDollars(raw);
    setSizes(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx]!, priceCents: cents };
      return next;
    });
    setRawSizePrices(prev => {
      const next = [...prev];
      next[idx] = centsToDisplay(cents);
      return next;
    });
    setSizesDirty(true);
  };

  const updateProduct = (id: string, field: 'excluded' | 'premiumCents', value: boolean | string) => {
    if (field === 'excluded') {
      setProducts(prev =>
        prev.map(p => p.id !== id ? p : { ...p, excluded: value as boolean }),
      );
    }
    setProductsDirty(true);
  };

  const commitPremiumPrice = (id: string) => {
    const raw = rawPremiumPrices[id] ?? '';
    const cents = parseDollars(raw);
    setProducts(prev =>
      prev.map(p => p.id !== id ? p : { ...p, premiumCents: cents }),
    );
    setRawPremiumPrices(prev => ({ ...prev, [id]: centsToDisplay(cents) }));
    setProductsDirty(true);
  };

  const saveSizes = async () => {
    const committed = sizes.map((s, idx) => ({
      ...s,
      priceCents: parseDollars(rawSizePrices[idx] ?? ''),
    }));
    setRawSizePrices(committed.map(s => centsToDisplay(s.priceCents)));
    setSizes(committed);

    for (const s of committed) {
      if (!s.label.trim()) {
        Alert.alert('Validation', 'Each box size must have a label.');
        return;
      }
      if (s.size <= 0) {
        Alert.alert('Validation', `"${s.label}" must have a slot count greater than 0.`);
        return;
      }
      if (s.priceCents < 0) {
        Alert.alert('Validation', `"${s.label}" price cannot be negative.`);
        return;
      }
    }
    setSaving(true);
    try {
      await api.director.updateBuildABoxConfig({ sizes: committed });
      await qc.invalidateQueries({ queryKey: ['director-build-a-box-config'] });
      setSizesDirty(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Box sizes updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save box sizes.');
    } finally {
      setSaving(false);
    }
  };

  const saveCookies = async () => {
    const committedPremium: Record<string, string> = {};
    const committedProducts = products.map(p => {
      const cents = parseDollars(rawPremiumPrices[p.id] ?? '');
      committedPremium[p.id] = centsToDisplay(cents);
      return { ...p, premiumCents: cents };
    });
    setRawPremiumPrices(committedPremium);
    setProducts(committedProducts);

    setSaving(true);
    try {
      await api.director.updateBuildABoxConfig({ products: committedProducts });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['director-build-a-box-config'] }),
        qc.invalidateQueries({ queryKey: ['products'] }),
      ]);
      setProductsDirty(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Cookie settings updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save cookie settings.');
    } finally {
      setSaving(false);
    }
  };

  const excludedCount = products.filter(p => p.excluded).length;
  const premiumCount = products.filter(p => p.premiumCents > 0).length;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ── */}
      <View style={{
        backgroundColor: NAVY,
        paddingTop: Math.max(insets.top, 16) + 4,
        paddingBottom: 14,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={18} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3 }}>Build a Box</Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>
            {sizes.length} size tier{sizes.length !== 1 ? 's' : ''} · {excludedCount} excluded · {premiumCount} premium
          </Text>
        </View>
        <View style={{ backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 }}>DIRECTOR</Text>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={{
        flexDirection: 'row',
        backgroundColor: CARD,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
        paddingHorizontal: 16,
        gap: 4,
      }}>
        {(['sizes', 'cookies'] as const).map(tab => {
          const active = activeTab === tab;
          const label = tab === 'sizes' ? 'Box Sizes' : 'Cookies';
          const dirty = tab === 'sizes' ? sizesDirty : productsDirty;
          return (
            <Pressable
              key={tab}
              onPress={() => { setActiveTab(tab); Haptics.selectionAsync(); }}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderBottomWidth: 2,
                borderBottomColor: active ? BLUE : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? NAVY : MUTED }}>
                {label}
              </Text>
              {dirty && (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: AMBER }} />
              )}
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={{ color: MUTED, fontSize: 14 }}>Loading…</Text>
        </View>
      ) : (
        <>
          {/* ── Box Sizes Tab ── */}
          {activeTab === 'sizes' && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom + 80, 100) }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ fontSize: 12, color: MUTED, fontWeight: '500', letterSpacing: 0.4, marginBottom: 10 }}>
                BOX SIZE TIERS
              </Text>
              <Text style={{ fontSize: 13, color: MUTED, marginBottom: 16, lineHeight: 18 }}>
                Each tier appears on the customer size-picker. Slot count controls how many cookies can be chosen.
              </Text>

              {sizes.map((s, idx) => (
                <View key={idx} style={{
                  backgroundColor: CARD,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: BORDER,
                  padding: 14,
                  marginBottom: 10,
                  gap: 10,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: NAVY }}>Size {idx + 1}</Text>
                    <Pressable
                      onPress={() => removeSize(idx)}
                      hitSlop={8}
                      style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Feather name="trash-2" size={13} color={RED} />
                    </Pressable>
                  </View>
                  {/* ── Photo ── */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {s.imageUrl ? (
                      <Image
                        source={{ uri: s.imageUrl }}
                        style={{ width: 64, height: 64, borderRadius: 10, borderWidth: 1, borderColor: BORDER }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{
                        width: 64, height: 64, borderRadius: 10, borderWidth: 1.5,
                        borderColor: BORDER, borderStyle: 'dashed',
                        backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Feather name="image" size={20} color={MUTED} />
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 6 }}>
                      <Pressable
                        onPress={() => pickSizeImage(idx)}
                        disabled={uploadingIdx === idx}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          backgroundColor: '#EBF7FD', borderRadius: 8,
                          paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start',
                        }}
                      >
                        {uploadingIdx === idx ? (
                          <ActivityIndicator size="small" color={BLUE} />
                        ) : (
                          <Feather name="upload" size={13} color={BLUE} />
                        )}
                        <Text style={{ fontSize: 12, fontWeight: '600', color: BLUE }}>
                          {uploadingIdx === idx ? 'Uploading…' : s.imageUrl ? 'Change photo' : 'Upload photo'}
                        </Text>
                      </Pressable>
                      {s.imageUrl ? (
                        <Pressable
                          onPress={() => removeSizeImage(idx)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                          hitSlop={8}
                        >
                          <Feather name="x" size={11} color={RED} />
                          <Text style={{ fontSize: 11, color: RED, fontWeight: '500' }}>Remove photo</Text>
                        </Pressable>
                      ) : (
                        <Text style={{ fontSize: 11, color: MUTED }}>Optional · shown on size picker</Text>
                      )}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 2, gap: 4 }}>
                      <Text style={{ fontSize: 11, color: MUTED, fontWeight: '500' }}>LABEL</Text>
                      <TextInput
                        value={s.label}
                        onChangeText={v => updateSize(idx, 'label', v)}
                        placeholder="e.g. 6-Pack"
                        style={inputStyle}
                        placeholderTextColor={MUTED}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontSize: 11, color: MUTED, fontWeight: '500' }}>SLOTS</Text>
                      <TextInput
                        value={s.size > 0 ? String(s.size) : ''}
                        onChangeText={v => updateSize(idx, 'size', v)}
                        placeholder="6"
                        keyboardType="number-pad"
                        style={inputStyle}
                        placeholderTextColor={MUTED}
                      />
                    </View>
                    <View style={{ flex: 1.5, gap: 4 }}>
                      <Text style={{ fontSize: 11, color: MUTED, fontWeight: '500' }}>PRICE (AUD)</Text>
                      <TextInput
                        value={rawSizePrices[idx] ?? ''}
                        onChangeText={v => {
                          setRawSizePrices(prev => {
                            const next = [...prev];
                            next[idx] = v;
                            return next;
                          });
                          setSizesDirty(true);
                        }}
                        onBlur={() => commitSizePrice(idx)}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        style={inputStyle}
                        placeholderTextColor={MUTED}
                      />
                    </View>
                  </View>
                  {s.label.trim() && s.size > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name="check-circle" size={12} color={GREEN} />
                      <Text style={{ fontSize: 12, color: GREEN }}>
                        {s.label} — {s.size} slots — {fmt(s.priceCents)}
                      </Text>
                    </View>
                  )}
                </View>
              ))}

              <Pressable
                onPress={addSize}
                style={{
                  borderRadius: 14, borderWidth: 1.5, borderColor: BLUE, borderStyle: 'dashed',
                  paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                  backgroundColor: '#EBF7FD', marginBottom: 20,
                }}
              >
                <Feather name="plus-circle" size={16} color={BLUE} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: BLUE }}>Add Size Tier</Text>
              </Pressable>

              <Pressable
                onPress={saveSizes}
                disabled={saving || !sizesDirty}
                style={{
                  backgroundColor: sizesDirty ? NAVY : BORDER,
                  borderRadius: 14, paddingVertical: 16,
                  alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="save" size={16} color={sizesDirty ? '#fff' : MUTED} />
                )}
                <Text style={{ fontSize: 15, fontWeight: '700', color: sizesDirty ? '#fff' : MUTED }}>
                  {saving ? 'Saving…' : sizesDirty ? 'Save Box Sizes' : 'No Changes'}
                </Text>
              </Pressable>
            </ScrollView>
          )}

          {/* ── Cookies Tab ── */}
          {activeTab === 'cookies' && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom + 80, 100) }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ fontSize: 12, color: MUTED, fontWeight: '500', letterSpacing: 0.4, marginBottom: 10 }}>
                COOKIE PICKER SETTINGS
              </Text>
              <Text style={{ fontSize: 13, color: MUTED, marginBottom: 16, lineHeight: 18 }}>
                Excluded cookies won't appear in the Build a Box picker. Premium add-ons add to the box total (e.g. +$2.00 for premium ingredients).
              </Text>

              {products.length === 0 && (
                <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
                  <Feather name="package" size={36} color={MUTED} />
                  <Text style={{ fontSize: 15, color: MUTED }}>No cookie products found</Text>
                  <Text style={{ fontSize: 13, color: MUTED, textAlign: 'center', maxWidth: 260 }}>
                    Add products with category "cookies" to manage them here.
                  </Text>
                </View>
              )}

              {products.map(p => (
                <View key={p.id} style={{
                  backgroundColor: p.excluded ? '#FFF7F7' : CARD,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: p.excluded ? '#FECACA' : BORDER,
                  padding: 14,
                  marginBottom: 10,
                  gap: 12,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: p.excluded ? MUTED : TEXT }} numberOfLines={1}>
                        {p.name}
                      </Text>
                      {p.excluded && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <Feather name="eye-off" size={11} color={RED} />
                          <Text style={{ fontSize: 11, color: RED, fontWeight: '500' }}>Hidden from picker</Text>
                        </View>
                      )}
                      {!p.excluded && p.premiumCents > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <Feather name="tag" size={11} color={AMBER} />
                          <Text style={{ fontSize: 11, color: AMBER, fontWeight: '500' }}>+{fmt(p.premiumCents)} premium</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                    <View style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center',
                      backgroundColor: p.excluded ? '#FEE2E2' : '#F3F4F6',
                      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                      gap: 8,
                    }}>
                      <Feather name="eye-off" size={14} color={p.excluded ? RED : MUTED} />
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: p.excluded ? RED : MUTED }}>Excluded</Text>
                      <Switch
                        value={p.excluded}
                        onValueChange={v => { Haptics.selectionAsync(); updateProduct(p.id, 'excluded', v); }}
                        trackColor={{ false: '#E5E7EB', true: '#FCA5A5' }}
                        thumbColor={p.excluded ? RED : '#9CA3AF'}
                        ios_backgroundColor="#E5E7EB"
                      />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontSize: 11, color: MUTED, fontWeight: '500' }}>PREMIUM ADD-ON (AUD)</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 14, color: MUTED }}>$</Text>
                        <TextInput
                          value={rawPremiumPrices[p.id] ?? ''}
                          onChangeText={v => {
                            setRawPremiumPrices(prev => ({ ...prev, [p.id]: v }));
                            setProductsDirty(true);
                          }}
                          onBlur={() => commitPremiumPrice(p.id)}
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                          editable={!p.excluded}
                          style={[inputStyle, { flex: 1, opacity: p.excluded ? 0.4 : 1 }]}
                          placeholderTextColor={MUTED}
                        />
                      </View>
                      <Text style={{ fontSize: 10, color: MUTED }}>$0 = no extra charge</Text>
                    </View>
                  </View>
                </View>
              ))}

              {products.length > 0 && (
                <Pressable
                  onPress={saveCookies}
                  disabled={saving || !productsDirty}
                  style={{
                    backgroundColor: productsDirty ? NAVY : BORDER,
                    borderRadius: 14, paddingVertical: 16, marginTop: 4,
                    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                  }}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="save" size={16} color={productsDirty ? '#fff' : MUTED} />
                  )}
                  <Text style={{ fontSize: 15, fontWeight: '700', color: productsDirty ? '#fff' : MUTED }}>
                    {saving ? 'Saving…' : productsDirty ? 'Save Cookie Settings' : 'No Changes'}
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const inputStyle = {
  backgroundColor: '#F9FAFB',
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 14,
  color: TEXT,
} as const;
