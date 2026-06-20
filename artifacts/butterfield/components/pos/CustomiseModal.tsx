import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import styles from './posStyles';
import { DARK, MUTED, MID, WHITE, fmtCents, uuid } from './types';
import type { ProductDetail, SelectedOption, TicketItem } from './types';

export default function CustomiseModal({ data, onClose, onAdd }: {
  data: { product: ProductDetail; editItem?: TicketItem };
  onClose: () => void;
  onAdd: (item: TicketItem) => void;
}) {
  const { product, editItem } = data;
  const basePriceCents = product.salePriceCents ?? product.priceCents ?? 0;
  const hasVariants = product.variants.length > 0;

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    editItem?.variantId ?? (hasVariants ? product.variants[0]?.id ?? null : null)
  );
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    if (editItem) {
      for (const o of editItem.selectedOptions) {
        if (!init[o.groupId]) init[o.groupId] = [];
        init[o.groupId]!.push(o.optionId);
      }
    } else {
      for (const g of product.optionGroups) {
        const defaults = g.options.filter(o => o.isDefault).map(o => o.id);
        if (defaults.length > 0) init[g.id] = g.selectionType === 'single' ? [defaults[0]!] : defaults;
      }
    }
    return init;
  });
  const [quantity, setQuantity] = useState(editItem?.quantity ?? 1);
  const [notes, setNotes] = useState(editItem?.notes ?? '');

  const selectedVariant = product.variants.find(v => v.id === selectedVariantId) ?? null;
  const variantPrice = selectedVariant?.priceCents ?? basePriceCents;

  const optionDelta = product.optionGroups.reduce((sum, g) => {
    const sel = selectedOptions[g.id] ?? [];
    return sum + g.options.filter(o => sel.includes(o.id)).reduce((s, o) => s + o.priceAdjustmentCents, 0);
  }, 0);

  const unitPriceCents = variantPrice + optionDelta;

  const toggleOption = (groupId: string, optionId: string, selectionType: 'single' | 'multi', isRequired: boolean) => {
    setSelectedOptions(prev => {
      const current = prev[groupId] ?? [];
      if (selectionType === 'single') {
        if (!isRequired && current.includes(optionId)) return { ...prev, [groupId]: [] };
        return { ...prev, [groupId]: [optionId] };
      } else {
        const next = current.includes(optionId)
          ? current.filter(id => id !== optionId)
          : [...current, optionId];
        return { ...prev, [groupId]: next };
      }
    });
  };

  const handleAdd = () => {
    const allSelectedOptions: SelectedOption[] = product.optionGroups.flatMap(g => {
      const sel = selectedOptions[g.id] ?? [];
      return g.options.filter(o => sel.includes(o.id)).map(o => ({
        groupId: g.id, groupName: g.name, optionId: o.id,
        optionName: o.name, priceAdjustmentCents: o.priceAdjustmentCents,
      }));
    });
    onAdd({
      localId: editItem?.localId ?? uuid(),
      productId: product.id,
      productName: product.name,
      category: product.category ?? '',
      variantId: selectedVariant?.id ?? null,
      variantName: selectedVariant?.name ?? null,
      variantPriceCents: selectedVariant?.priceCents,
      selectedOptions: allSelectedOptions,
      quantity,
      unitPriceCents,
      notes,
    });
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.customiseRoot}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={DARK} />
          </Pressable>
          <Text style={styles.sheetTitle} numberOfLines={1}>{product.name}</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          {hasVariants && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Size / Variant</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {product.variants.map(v => {
                  const isSelected = selectedVariantId === v.id;
                  return (
                    <Pressable key={v.id} onPress={() => setSelectedVariantId(v.id)} style={[styles.variantChip, isSelected && styles.variantChipActive]}>
                      <Text style={[styles.variantChipText, isSelected && { color: WHITE }]}>
                        {v.name} · {fmtCents(v.priceCents)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {product.optionGroups.map(group => (
            <View key={group.id} style={styles.section}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.sectionTitle}>{group.name}</Text>
                {group.isRequired && <Text style={styles.requiredBadge}>Required</Text>}
              </View>
              {group.description ? <Text style={styles.sectionSubtitle}>{group.description}</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {group.options.map(opt => {
                  const isSelected = (selectedOptions[group.id] ?? []).includes(opt.id);
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => toggleOption(group.id, opt.id, group.selectionType, group.isRequired)}
                      style={[styles.optionPill, isSelected && styles.optionPillActive]}
                    >
                      <Text style={[styles.optionPillLabel, isSelected && { color: WHITE, fontWeight: '600' }]}>{opt.name}</Text>
                      {opt.priceAdjustmentCents !== 0 && (
                        <Text style={[styles.optionPillSub, isSelected && { color: 'rgba(255,255,255,0.75)' }]}>
                          {opt.priceAdjustmentCents > 0 ? '+' : ''}{fmtCents(opt.priceAdjustmentCents)}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quantity</Text>
            <View style={styles.quantityStepper}>
              <Pressable onPress={() => setQuantity(q => Math.max(1, q - 1))} style={styles.stepperBtn}>
                <Feather name="minus" size={18} color={MID} />
              </Pressable>
              <Text style={styles.stepperQty}>{quantity}</Text>
              <Pressable onPress={() => setQuantity(q => Math.min(99, q + 1))} style={styles.stepperBtn}>
                <Feather name="plus" size={18} color={DARK} />
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Special Instructions</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="e.g. No ice, extra hot…"
              placeholderTextColor={MUTED}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={2}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>

        <View style={styles.sheetFooter}>
          <View>
            <Text style={styles.sheetPriceLabel}>Unit price</Text>
            <Text style={styles.sheetPrice}>{fmtCents(unitPriceCents)}</Text>
          </View>
          <TouchableOpacity onPress={handleAdd} style={styles.addToOrderBtn} activeOpacity={0.85}>
            <Text style={styles.addToOrderBtnText}>
              {editItem ? 'Update Item' : `Add ${quantity > 1 ? `${quantity}x ` : ''}· ${fmtCents(unitPriceCents * quantity)}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
