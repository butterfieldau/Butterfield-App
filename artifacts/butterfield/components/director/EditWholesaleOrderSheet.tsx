import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView,
  Text, TextInput, View,
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
const AMBER  = '#F59E0B';

interface EditItem {
  productId: string;
  productName: string;
  qty: number;
  unitPriceCents: number;
}

export function EditWholesaleOrderSheet({ order, visible, onClose, onSaved }: {
  order: any | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [items, setItems] = useState<EditItem[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const { data: productsData } = useQuery({
    queryKey: ['director-products'],
    queryFn:  () => api.director.products(),
    staleTime: 60000,
    enabled: visible,
  });
  const allProducts = productsData?.data ?? [];

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return allProducts;
    return allProducts.filter((p: any) =>
      String(p.name ?? '').toLowerCase().includes(q) ||
      String(p.category ?? '').toLowerCase().includes(q)
    );
  }, [allProducts, productSearch]);

  useEffect(() => {
    if (order && visible) {
      const rawItems: any[] = Array.isArray(order.items) ? (order.items as any[]) : [];
      setItems(rawItems.map((i: any) => ({
        productId: String(i.productId ?? i.product_id ?? ''),
        productName: String(i.productName ?? i.name ?? i.description ?? ''),
        qty: Number(i.qty ?? i.quantity ?? 1),
        unitPriceCents: Number(i.unitPriceCents ?? i.unit_price_cents ?? i.unitPrice ?? 0),
      })).filter(i => i.productId));
      setNotes('');
      setProductSearch('');
    }
  }, [order, visible]);

  if (!order) return null;

  const isEditable = ['pending', 'processing'].includes(order.status) && !order.isPaid;
  const totalCents = items.reduce((s, i) => s + i.qty * i.unitPriceCents, 0) + (order.deliveryFeeCents ?? 0);

  const updateQty = (idx: number, delta: number) => {
    Haptics.selectionAsync();
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newQty = Math.max(0, item.qty + delta);
      return { ...item, qty: newQty };
    }).filter((_, i) => i !== idx || items[i].qty + delta > 0));
  };

  const updateUnitPrice = (idx: number, text: string) => {
    const cents = Math.round(parseFloat(text || '0') * 100);
    if (!isNaN(cents)) {
      setItems(prev => prev.map((item, i) => i === idx ? { ...item, unitPriceCents: cents } : item));
    }
  };

  const addProduct = (product: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const existing = items.findIndex(i => i.productId === product.id);
    if (existing >= 0) {
      setItems(prev => prev.map((item, i) => i === existing ? { ...item, qty: item.qty + 1 } : item));
    } else {
      const unitCents = Number(product.wholesalePriceCents ?? product.priceCents ?? 0);
      setItems(prev => [...prev, {
        productId: product.id,
        productName: product.name,
        qty: 1,
        unitPriceCents: unitCents,
      }]);
    }
  };

  const handleSave = async () => {
    const validItems = items.filter(i => i.qty > 0 && i.productId);
    if (validItems.length === 0) {
      Alert.alert('No items', 'Add at least one item before saving.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      await api.director.editWholesaleOrderItems(order.id, {
        items: validItems.map(i => ({ productId: i.productId, qty: i.qty, unitPriceCents: i.unitPriceCents, productName: i.productName })),
        notes: notes.trim() || undefined,
      });
      await qc.invalidateQueries({ queryKey: ['director-orders'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Order items have been updated.');
      onSaved();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Header */}
        <View style={{ backgroundColor: CARD, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={onClose} style={{ padding: 6, marginRight: 8 }}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>Edit Order</Text>
            <Text style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>
              #{order.orderNumber ?? order.poReference ?? order.id.slice(0, 8).toUpperCase()} · {order.customerName ?? ''}
            </Text>
          </View>
          {!isEditable && (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: AMBER, fontWeight: '700', fontSize: 11 }}>READ ONLY</Text>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {!isEditable && (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FDE68A', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="alert-circle" size={16} color={AMBER} />
              <Text style={{ color: '#92400E', fontWeight: '500', fontSize: 13, flex: 1 }}>
                {order.isPaid ? 'Paid orders cannot be edited — use Adjust / Credit to issue a partial refund.' : `Orders in "${order.status}" status cannot be edited.`}
              </Text>
            </View>
          )}

          {/* Current items */}
          <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, gap: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 10 }}>ORDER ITEMS</Text>
            {items.length === 0 && (
              <Text style={{ color: MUTED, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>No items. Add products below.</Text>
            )}
            {items.map((item, idx) => (
              <View key={item.productId + idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: idx < items.length - 1 ? 1 : 0, borderBottomColor: BORDER, gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TEXT, fontWeight: '500', fontSize: 13 }}>{item.productName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Text style={{ color: MUTED, fontSize: 11 }}>$</Text>
                    <TextInput
                      editable={isEditable}
                      style={{ color: TEXT, fontSize: 12, borderWidth: 1, borderColor: BORDER, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, minWidth: 60 }}
                      value={String(item.unitPriceCents / 100)}
                      keyboardType="decimal-pad"
                      onChangeText={t => updateUnitPrice(idx, t)}
                    />
                    <Text style={{ color: MUTED, fontSize: 11 }}>ea</Text>
                    <Text style={{ color: BLUE, fontWeight: '600', fontSize: 12, marginLeft: 4 }}>
                      = ${((item.qty * item.unitPriceCents) / 100).toFixed(2)}
                    </Text>
                  </View>
                </View>
                {isEditable ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable onPress={() => updateQty(idx, -1)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: item.qty === 1 ? '#FEE2E2' : '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={item.qty === 1 ? 'trash-2' : 'minus'} size={14} color={item.qty === 1 ? RED : TEXT} />
                    </Pressable>
                    <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15, minWidth: 24, textAlign: 'center' }}>{item.qty}</Text>
                    <Pressable onPress={() => updateQty(idx, 1)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="plus" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ) : (
                  <Text style={{ color: TEXT, fontWeight: '700', fontSize: 14 }}>×{item.qty}</Text>
                )}
              </View>
            ))}
          </View>

          {/* New product picker */}
          {isEditable && (
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 10 }}>ADD PRODUCTS</Text>
              {/* Search input */}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F7FA', borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 10, marginBottom: 10, gap: 6 }}>
                <Feather name="search" size={14} color={MUTED} />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: TEXT, paddingVertical: 8 }}
                  placeholder="Search products…"
                  placeholderTextColor={MUTED}
                  value={productSearch}
                  onChangeText={setProductSearch}
                  clearButtonMode="while-editing"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
              <View style={{ gap: 0 }}>
                {filteredProducts.length === 0 && (
                  <Text style={{ color: MUTED, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
                    {allProducts.length === 0 ? 'Loading products…' : 'No products match your search.'}
                  </Text>
                )}
                {filteredProducts.map((p: any) => (
                  <Pressable key={p.id} onPress={() => addProduct(p)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: TEXT, fontWeight: '500', fontSize: 13 }}>{p.name}</Text>
                      <Text style={{ color: MUTED, fontSize: 11 }}>${((p.wholesalePriceCents ?? p.priceCents ?? 0) / 100).toFixed(2)} / unit{p.category ? ` · ${p.category}` : ''}</Text>
                    </View>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: BLUE, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="plus" size={14} color={BLUE} />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Notes */}
          {isEditable && (
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 8 }}>REASON FOR CHANGE (INTERNAL)</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, fontSize: 14, color: TEXT, minHeight: 72, textAlignVertical: 'top' }}
                placeholder="e.g. Customer requested product substitution"
                placeholderTextColor={MUTED}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </View>
          )}

          {/* Summary */}
          <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 4 }}>ORDER TOTAL</Text>
            {(order.deliveryFeeCents ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: MUTED, fontSize: 13 }}>Delivery fee</Text>
                <Text style={{ color: TEXT, fontSize: 13 }}>${((order.deliveryFeeCents ?? 0) / 100).toFixed(2)}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
              <Text style={{ color: TEXT, fontWeight: '700', fontSize: 16 }}>New Total</Text>
              <Text style={{ color: BLUE, fontWeight: '700', fontSize: 18 }}>AUD ${(totalCents / 100).toFixed(2)}</Text>
            </View>
            {totalCents !== order.totalCents && (
              <Text style={{ color: MUTED, fontSize: 11, textAlign: 'right' }}>
                Previous: ${(order.totalCents / 100).toFixed(2)} (Δ {totalCents > order.totalCents ? '+' : ''}${((totalCents - order.totalCents) / 100).toFixed(2)})
              </Text>
            )}
          </View>
        </ScrollView>

        {/* Save button */}
        {isEditable && (
          <View style={{ padding: 16, paddingBottom: insets.bottom + 8, backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORDER }}>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{ height: 52, borderRadius: 14, backgroundColor: saving ? MUTED : GREEN, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="check" size={18} color="#fff" />}
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{saving ? 'Saving…' : 'Save Changes'}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

export default EditWholesaleOrderSheet;
