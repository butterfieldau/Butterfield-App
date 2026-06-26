import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable,
  ScrollView, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';

interface CartItem {
  productId: string;
  productName: string;
  qty: number;
  unitPriceCents: number;
}

export function CreateWholesaleOrderSheet({ visible, onClose, onCreated, preselectedAccountId }: {
  visible: boolean;
  onClose: () => void;
  onCreated: (order: any) => void;
  preselectedAccountId?: string;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [accountId, setAccountId] = useState(preselectedAccountId ?? '');
  const [accountSearch, setAccountSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [poReference, setPoReference] = useState('');
  const [notes, setNotes] = useState('');
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'delivery'>('pickup');
  const [scheduledDate, setScheduledDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'account' | 'items' | 'summary'>('account');

  const { data: wholesaleData } = useQuery({
    queryKey: ['director-wholesale'],
    queryFn:  () => api.director.wholesale(),
    staleTime: 30000,
    enabled: visible,
  });
  const accounts: any[] = (wholesaleData?.data ?? []).filter((a: any) => a.status === 'approved');

  const { data: productsData } = useQuery({
    queryKey: ['director-products'],
    queryFn:  () => api.director.products(),
    staleTime: 60000,
    enabled: visible && step === 'items',
  });
  const allProducts: any[] = (productsData?.data ?? []).filter((p: any) => p.isActive !== false);

  // Pricing tiers — used to show tier-discounted display prices per product
  const { data: tiersData } = useQuery({
    queryKey: ['director-tiers'],
    queryFn:  () => api.director.tiers(),
    staleTime: 300000,
    enabled: visible,
  });
  const allTiers: any[] = tiersData?.data ?? [];

  // Derive the selected account's tier discount percentage
  const selectedTierDiscountPct = React.useMemo(() => {
    if (!accountId) return 0;
    const account = accounts.find((a: any) => a.id === accountId);
    if (!account) return 0;
    const tier = account.tierId
      ? allTiers.find((t: any) => t.id === account.tierId)
      : allTiers.find((t: any) =>
          t.name?.toLowerCase() === String(account.pricingTier ?? '').toLowerCase());
    return Number(tier?.defaultDiscountPct ?? 0);
  }, [accountId, accounts, allTiers]);

  const filteredProducts = productSearch.trim()
    ? allProducts.filter((p: any) =>
        String(p.name ?? '').toLowerCase().includes(productSearch.toLowerCase()) ||
        String(p.category ?? '').toLowerCase().includes(productSearch.toLowerCase()))
    : allProducts;

  useEffect(() => {
    if (visible) {
      setAccountId(preselectedAccountId ?? '');
      setAccountSearch('');
      setProductSearch('');
      setCart([]);
      setPoReference('');
      setNotes('');
      setDeliveryType('pickup');
      setScheduledDate('');
      setStep(preselectedAccountId ? 'items' : 'account');
    }
  }, [visible, preselectedAccountId]);

  const selectedAccount = accounts.find((a: any) => a.id === accountId);

  const filteredAccounts = accountSearch.trim()
    ? accounts.filter((a: any) =>
        (a.companyName ?? '').toLowerCase().includes(accountSearch.toLowerCase()) ||
        (a.email ?? '').toLowerCase().includes(accountSearch.toLowerCase()))
    : accounts;

  const addToCart = (product: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const existing = cart.findIndex(i => i.productId === product.id);
    if (existing >= 0) {
      setCart(prev => prev.map((item, i) => i === existing ? { ...item, qty: item.qty + 1 } : item));
    } else {
      const baseCents = Number(product.wholesalePriceCents ?? product.priceCents ?? 0);
      // Use tier-discounted price for display/initial cart price; backend will re-verify
      const unitCents = selectedTierDiscountPct > 0
        ? Math.round(baseCents * (1 - selectedTierDiscountPct / 100))
        : baseCents;
      setCart(prev => [...prev, { productId: product.id, productName: product.name, qty: 1, unitPriceCents: unitCents }]);
    }
  };

  const updateQty = (idx: number, delta: number) => {
    Haptics.selectionAsync();
    setCart(prev => prev.map((item, i) => i !== idx ? item : { ...item, qty: Math.max(0, item.qty + delta) }).filter(i => i.qty > 0));
  };

  const totalCents = cart.reduce((s, i) => s + i.qty * i.unitPriceCents, 0);

  const handleCreate = async () => {
    if (!accountId) { Alert.alert('Select account', 'Please select a wholesale account first.'); return; }
    if (cart.length === 0) { Alert.alert('No items', 'Add at least one product to the order.'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const result = await api.director.createWholesaleOrder({
        accountId,
        items: cart.map(i => ({ productId: i.productId, qty: i.qty, unitPriceCents: i.unitPriceCents, productName: i.productName })),
        poReference: poReference.trim() || undefined,
        notes: notes.trim() || undefined,
        deliveryType,
        scheduledDate: scheduledDate.trim() || undefined,
      });
      await qc.invalidateQueries({ queryKey: ['director-orders'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated(result.data);
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not create order.');
    } finally {
      setSaving(false);
    }
  };

  const StepIndicator = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 6 }}>
      {(['account', 'items', 'summary'] as const).map((s, idx) => {
        const stepIdx = ['account', 'items', 'summary'].indexOf(step);
        const sIdx = idx;
        const done = sIdx < stepIdx;
        const active = sIdx === stepIdx;
        return (
          <React.Fragment key={s}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: done ? GREEN : active ? BLUE : '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                {done ? <Feather name="check" size={12} color="#fff" /> : <Text style={{ color: active ? '#fff' : MUTED, fontSize: 11, fontWeight: '700' }}>{idx + 1}</Text>}
              </View>
              <Text style={{ fontSize: 11, fontWeight: active ? '700' : '400', color: active ? BLUE : MUTED }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </View>
            {idx < 2 && <View style={{ flex: 1, height: 1, backgroundColor: done ? GREEN : BORDER }} />}
          </React.Fragment>
        );
      })}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Header */}
        <View style={{ backgroundColor: CARD, paddingTop: insets.top + 8, paddingBottom: 0, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: BORDER }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 10 }}>
            <Pressable onPress={onClose} style={{ padding: 6, marginRight: 8 }}>
              <Feather name="x" size={20} color={TEXT} />
            </Pressable>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: TEXT }}>New Wholesale Order</Text>
            {cart.length > 0 && (
              <View style={{ backgroundColor: BLUE, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{cart.length} items · ${(totalCents / 100).toFixed(2)}</Text>
              </View>
            )}
          </View>
          <StepIndicator />
        </View>

        {/* Step: Account */}
        {step === 'account' && (
          <View style={{ flex: 1 }}>
            <View style={{ padding: 14, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
                <Feather name="search" size={16} color={MUTED} />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: TEXT }}
                  placeholder="Search accounts…"
                  placeholderTextColor={MUTED}
                  value={accountSearch}
                  onChangeText={setAccountSearch}
                  autoFocus
                />
              </View>
            </View>
            <FlatList
              data={filteredAccounts}
              keyExtractor={(a: any) => a.id}
              contentContainerStyle={{ padding: 14, paddingTop: 0, gap: 8 }}
              ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: 40 }}><Feather name="users" size={32} color={BORDER} /><Text style={{ color: MUTED, marginTop: 10, fontSize: 14 }}>No approved accounts found</Text></View>}
              renderItem={({ item: acct }) => (
                <Pressable
                  onPress={() => { setAccountId(acct.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep('items'); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Select account ${acct.companyName ?? acct.email}`}
                  style={{ backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: accountId === acct.id ? BLUE : BORDER, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: BLUE, fontWeight: '700', fontSize: 13 }}>{(acct.companyName ?? '?').slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14 }}>{acct.companyName ?? acct.email}</Text>
                    <Text style={{ color: MUTED, fontSize: 12 }}>{acct.pricingTier ?? 'Standard'} · {acct.abn ? `ABN ${acct.abn}` : 'No ABN'}</Text>
                  </View>
                  {accountId === acct.id && <Feather name="check-circle" size={18} color={GREEN} />}
                </Pressable>
              )}
            />
            {/* Footer: Continue button appears once an account is selected */}
            {accountId && (
              <View style={{ padding: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep('items'); }}
                  accessibilityRole="button"
                  accessibilityLabel="Continue to items"
                  style={{ height: 48, backgroundColor: BLUE, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Continue</Text>
                  <Feather name="arrow-right" size={16} color="#fff" />
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Step: Items */}
        {step === 'items' && (
          <View style={{ flex: 1 }}>
            {selectedAccount && (
              <Pressable onPress={() => setStep('account')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingHorizontal: 16, backgroundColor: '#EFF6FF', borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <Feather name="briefcase" size={14} color={BLUE} />
                <Text style={{ color: BLUE, fontWeight: '600', fontSize: 13 }}>{selectedAccount.companyName}</Text>
                <Feather name="chevron-down" size={13} color={BLUE} />
              </Pressable>
            )}
            {/* Product search bar */}
            <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
                <Feather name="search" size={15} color={MUTED} />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: TEXT }}
                  placeholder="Search products…"
                  placeholderTextColor={MUTED}
                  value={productSearch}
                  onChangeText={setProductSearch}
                  clearButtonMode="while-editing"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
            </View>
            <FlatList
              data={filteredProducts}
              keyExtractor={(p: any) => p.id}
              contentContainerStyle={{ padding: 14, paddingTop: 8, gap: 8, paddingBottom: 100 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 40 }}>
                  <Feather name="package" size={32} color={BORDER} />
                  <Text style={{ color: MUTED, marginTop: 10, fontSize: 14 }}>
                    {allProducts.length === 0 ? 'Loading products…' : 'No products match your search.'}
                  </Text>
                </View>
              }
              renderItem={({ item: product }) => {
                const cartItem = cart.find(i => i.productId === product.id);
                const baseCents = Number(product.wholesalePriceCents ?? product.priceCents ?? 0);
                const unitCents = selectedTierDiscountPct > 0
                  ? Math.round(baseCents * (1 - selectedTierDiscountPct / 100))
                  : baseCents;
                return (
                  <View style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: cartItem ? BLUE + '40' : BORDER }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: TEXT, fontWeight: '600', fontSize: 13 }}>{product.name}</Text>
                      <Text style={{ color: MUTED, fontSize: 12 }}>
                        ${(unitCents / 100).toFixed(2)} / unit · {product.category ?? 'General'}
                        {selectedTierDiscountPct > 0 && (
                          <Text style={{ color: BLUE }}> ({selectedTierDiscountPct}% tier)</Text>
                        )}
                      </Text>
                    </View>
                    {cartItem ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Pressable onPress={() => updateQty(cart.indexOf(cartItem), -1)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: cartItem.qty === 1 ? '#FEE2E2' : '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name={cartItem.qty === 1 ? 'trash-2' : 'minus'} size={13} color={cartItem.qty === 1 ? RED : TEXT} />
                        </Pressable>
                        <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15, minWidth: 22, textAlign: 'center' }}>{cartItem.qty}</Text>
                        <Pressable onPress={() => addToCart(product)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name="plus" size={13} color="#fff" />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => addToCart(product)}
                        accessibilityLabel={`Add ${product.name} to order`}
                        accessibilityRole="button"
                        style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: BLUE, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Feather name="plus" size={16} color={BLUE} />
                      </Pressable>
                    )}
                  </View>
                );
              }}
            />
            {cart.length > 0 && (
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: insets.bottom + 8, backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORDER }}>
                <Pressable onPress={() => setStep('summary')}
                  style={{ height: 52, borderRadius: 14, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                  <Feather name="arrow-right" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Review Order ({cart.length} items · ${(totalCents / 100).toFixed(2)})</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Step: Summary */}
        {step === 'summary' && (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
            {/* Account summary */}
            {selectedAccount && (
              <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: BLUE, fontWeight: '700', fontSize: 14 }}>{(selectedAccount.companyName ?? '?').slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15 }}>{selectedAccount.companyName}</Text>
                  <Text style={{ color: MUTED, fontSize: 12 }}>{selectedAccount.pricingTier ?? 'Standard'}</Text>
                </View>
                <Pressable onPress={() => setStep('account')} style={{ padding: 6 }}>
                  <Feather name="edit-2" size={15} color={BLUE} />
                </Pressable>
              </View>
            )}

            {/* Items summary */}
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6 }}>ITEMS</Text>
                <Pressable onPress={() => setStep('items')}><Text style={{ color: BLUE, fontSize: 12, fontWeight: '600' }}>Edit</Text></Pressable>
              </View>
              {cart.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < cart.length - 1 ? 1 : 0, borderBottomColor: BORDER }}>
                  <Text style={{ color: TEXT, fontWeight: '500', fontSize: 13, flex: 1 }}>{item.productName} ×{item.qty}</Text>
                  <Text style={{ color: MUTED, fontSize: 13 }}>${((item.qty * item.unitPriceCents) / 100).toFixed(2)}</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: BORDER }}>
                <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15 }}>Total</Text>
                <Text style={{ color: BLUE, fontWeight: '700', fontSize: 17 }}>AUD ${(totalCents / 100).toFixed(2)}</Text>
              </View>
            </View>

            {/* Delivery type */}
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 10 }}>FULFILMENT</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['pickup', 'delivery'] as const).map(dt => (
                  <Pressable key={dt} onPress={() => { setDeliveryType(dt); Haptics.selectionAsync(); }}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: deliveryType === dt ? BLUE : BORDER, backgroundColor: deliveryType === dt ? '#EFF6FF' : '#F9FAFB' }}>
                    <Feather name={dt === 'pickup' ? 'shopping-bag' : 'truck'} size={16} color={deliveryType === dt ? BLUE : MUTED} />
                    <Text style={{ color: deliveryType === dt ? BLUE : MUTED, fontWeight: '700', fontSize: 13, textTransform: 'capitalize' }}>{dt}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Scheduled date */}
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 8 }}>SCHEDULED DELIVERY DATE (OPTIONAL)</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, fontSize: 14, color: TEXT }}
                placeholder="e.g. 2025-08-15 (YYYY-MM-DD)"
                placeholderTextColor={MUTED}
                value={scheduledDate}
                onChangeText={setScheduledDate}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            {/* PO reference */}
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 8 }}>PO REFERENCE</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, fontSize: 14, color: TEXT }}
                placeholder="e.g. PO-2024-001 (optional)"
                placeholderTextColor={MUTED}
                value={poReference}
                onChangeText={setPoReference}
              />
            </View>

            {/* Notes */}
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 8 }}>NOTES (OPTIONAL)</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, fontSize: 14, color: TEXT, minHeight: 72, textAlignVertical: 'top' }}
                placeholder="Special instructions or delivery notes…"
                placeholderTextColor={MUTED}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </View>
          </ScrollView>
        )}

        {/* Footer for summary step */}
        {step === 'summary' && (
          <View style={{ padding: 16, paddingBottom: insets.bottom + 8, backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORDER }}>
            <Pressable
              onPress={handleCreate}
              disabled={saving}
              style={{ height: 52, borderRadius: 14, backgroundColor: saving ? MUTED : GREEN, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="plus-circle" size={18} color="#fff" />}
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                {saving ? 'Creating Order…' : `Create Order — $${(totalCents / 100).toFixed(2)}`}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

export default CreateWholesaleOrderSheet;
