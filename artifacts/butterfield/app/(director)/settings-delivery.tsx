import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type RetailDeliverySlot,
  type DirectorDeliveryCategory,
  type DirectorDeliveryProduct,
} from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { BG, CARD, BLUE, NAVY, TEXT, MUTED, BORDER, GREEN, AMBER, RED, PURPLE, PINK, TEAL, ROSE, GOLD, GLASS_BG, GLASS_BORDER } from '@/components/director/directorColors';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface SlotDraft {
  deliveryDow: number;
  cutoffDow: number;
  cutoffHour: number;
  windowOpen: string;
  windowClose: string;
}

const BLANK_SLOT: SlotDraft = {
  deliveryDow: 1,
  cutoffDow: 0,
  cutoffHour: 21,
  windowOpen: '8am',
  windowClose: '5pm',
};

function computeOffset(deliveryDow: number, cutoffDow: number): number {
  let off = cutoffDow - deliveryDow;
  if (off >= 0) off -= 7;
  return off;
}

function fmtHour(h: number): string {
  if (h === 0)  return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function buildCutoffLabel(cutoffDow: number, cutoffHour: number) {
  return `${DAY_SHORT[cutoffDow]} ${fmtHour(cutoffHour)}`;
}

function buildSlotFromDraft(draft: SlotDraft, existingId?: string): RetailDeliverySlot {
  const id = existingId ?? `slot-${Date.now()}`;
  return {
    id,
    deliveryDow: draft.deliveryDow,
    deliveryLabel: DAY_FULL[draft.deliveryDow],
    cutoffDow: draft.cutoffDow,
    cutoffDayLabel: DAY_FULL[draft.cutoffDow],
    cutoffDayOffset: computeOffset(draft.deliveryDow, draft.cutoffDow),
    cutoffLabel: buildCutoffLabel(draft.cutoffDow, draft.cutoffHour),
    cutoffHour: draft.cutoffHour,
    windowOpen: draft.windowOpen,
    windowClose: draft.windowClose,
  };
}

function DayPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {DAY_SHORT.map((d, i) => {
          const sel = value === i;
          return (
            <TouchableOpacity key={i} onPress={() => onChange(i)} style={[styles.dayBtn, sel && styles.dayBtnSel]}>
              <Text style={[styles.dayBtnText, sel && styles.dayBtnTextSel]}>{d}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function SlotModal({
  visible,
  initial,
  onSave,
  onCancel,
}: {
  visible: boolean;
  initial: SlotDraft;
  onSave: (draft: SlotDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<SlotDraft>(initial);

  useEffect(() => {
    if (visible) setDraft(initial);
  }, [visible]);

  function field<K extends keyof SlotDraft>(k: K, v: SlotDraft[K]) {
    setDraft((p) => ({ ...p, [k]: v }));
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={styles.modalWrap}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Delivery Slot</Text>
          <TouchableOpacity onPress={onCancel} style={styles.modalClose}>
            <Feather name="x" size={22} color={TEXT} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">

          <DayPicker label="DELIVERY DAY" value={draft.deliveryDow} onChange={(v) => field('deliveryDow', v)} />
          <DayPicker label="ORDER CUTOFF DAY" value={draft.cutoffDow} onChange={(v) => field('cutoffDow', v)} />

          <View style={{ marginBottom: 16 }}>
            <Text style={styles.fieldLabel}>CUTOFF HOUR (0–23)</Text>
            <TextInput
              style={styles.fieldInput}
              value={String(draft.cutoffHour)}
              keyboardType="number-pad"
              onChangeText={(v) => {
                const n = parseInt(v);
                if (!isNaN(n) && n >= 0 && n <= 23) field('cutoffHour', n);
                else if (v === '') field('cutoffHour', 0);
              }}
              placeholder="21"
            />
            <Text style={styles.fieldHint}>Preview: {buildCutoffLabel(draft.cutoffDow, draft.cutoffHour)} — orders must be in by this time</Text>
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={styles.fieldLabel}>DELIVERY WINDOW</Text>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldHint}>Opens</Text>
                <TextInput style={styles.fieldInput} value={draft.windowOpen} onChangeText={(v) => field('windowOpen', v)} placeholder="8am" autoCapitalize="none" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldHint}>Closes</Text>
                <TextInput style={styles.fieldInput} value={draft.windowClose} onChangeText={(v) => field('windowClose', v)} placeholder="5pm" autoCapitalize="none" />
              </View>
            </View>
          </View>

          <View style={styles.previewBox}>
            <Text style={[styles.fieldHint, { fontWeight: '600', marginBottom: 4 }]}>SUMMARY</Text>
            <Text style={{ fontSize: 14, color: TEXT }}>
              Delivery on <Text style={{ fontWeight: '700' }}>{DAY_FULL[draft.deliveryDow]}s</Text>, {draft.windowOpen} – {draft.windowClose}
            </Text>
            <Text style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
              Order cutoff: <Text style={{ fontWeight: '600' }}>{buildCutoffLabel(draft.cutoffDow, draft.cutoffHour)}</Text>
            </Text>
          </View>

          <TouchableOpacity
            style={styles.saveBtnModal}
            onPress={() => {
              if (!draft.windowOpen.trim() || !draft.windowClose.trim()) {
                Alert.alert('Missing fields', 'Enter delivery window open and close times.');
                return;
              }
              onSave(draft);
            }}
          >
            <Feather name="check" size={16} color="#fff" />
            <Text style={styles.saveBtnText}>Save Slot</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function DirectorDeliverySettingsScreen() {
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['director', 'delivery-settings'],
    queryFn: () => api.director.deliverySettings(),
  });

  const settings = data?.data;

  const [enabled, setEnabled]             = useState(false);
  const [feeDollars, setFeeDollars]       = useState('12.00');
  const [slots, setSlots]                 = useState<RetailDeliverySlot[]>([]);
  const [blackoutDates, setBlackoutDates] = useState<string[]>([]);
  const [newBlackout, setNewBlackout]     = useState('');
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotDraft, setSlotDraft]         = useState<SlotDraft>(BLANK_SLOT);
  const [dirty, setDirty]                 = useState(false);
  const [expandedCats, setExpandedCats]   = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setFeeDollars((settings.feeCents / 100).toFixed(2));
    setSlots(settings.slots ?? []);
    setBlackoutDates(settings.blackoutDates ?? []);
    setDirty(false);
  }, [settings]);

  const categories: DirectorDeliveryCategory[] = settings?.categories ?? [];
  const products: DirectorDeliveryProduct[]     = settings?.products ?? [];

  const productsByCategory = useMemo(() => {
    const map = new Map<string, DirectorDeliveryProduct[]>();
    for (const p of products.filter((p) => p.isActive)) {
      const key = p.categoryId ?? p.category ?? '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [products]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => {
      const feeCents = Math.round((parseFloat(feeDollars) || 12) * 100);
      return api.director.updateDeliverySettings({ enabled, feeCents, slots, blackoutDates });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director', 'delivery-settings'] });
      qc.invalidateQueries({ queryKey: ['delivery-config'] });
      setDirty(false);
      Alert.alert('Saved', 'Delivery settings updated.');
    },
    onError: () => Alert.alert('Error', 'Failed to save. Please try again.'),
  });

  const { mutate: updateCategory } = useMutation({
    mutationFn: ({ id, isDeliveryAvailable }: { id: string; isDeliveryAvailable: boolean }) =>
      api.director.updateCategory(id, { isDeliveryAvailable } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director', 'delivery-settings'] });
      qc.invalidateQueries({ queryKey: ['delivery-config'] });
    },
    onError: () => Alert.alert('Error', 'Failed to update category.'),
  });

  const { mutate: updateProduct } = useMutation({
    mutationFn: ({ id, isPickupOnly }: { id: string; isPickupOnly: boolean }) =>
      api.director.updateProduct(id, { isPickupOnly } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director', 'delivery-settings'] });
      qc.invalidateQueries({ queryKey: ['delivery-config'] });
    },
    onError: () => Alert.alert('Error', 'Failed to update product.'),
  });

  function openAddSlot() {
    setEditingSlotId(null);
    setSlotDraft(BLANK_SLOT);
    setShowSlotModal(true);
  }

  function openEditSlot(slot: RetailDeliverySlot) {
    setEditingSlotId(slot.id);
    setSlotDraft({ deliveryDow: slot.deliveryDow, cutoffDow: slot.cutoffDow, cutoffHour: slot.cutoffHour, windowOpen: slot.windowOpen, windowClose: slot.windowClose });
    setShowSlotModal(true);
  }

  function handleSaveSlot(draft: SlotDraft) {
    if (editingSlotId) {
      setSlots((prev) => prev.map((s) => s.id === editingSlotId ? buildSlotFromDraft(draft, editingSlotId) : s));
    } else {
      setSlots((prev) => [...prev, buildSlotFromDraft(draft)]);
    }
    setShowSlotModal(false);
    setDirty(true);
  }

  function removeSlot(id: string) {
    Alert.alert('Remove Slot', 'Remove this delivery slot?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { setSlots((p) => p.filter((s) => s.id !== id)); setDirty(true); } },
    ]);
  }

  function addBlackout() {
    const trimmed = newBlackout.trim();
    if (!trimmed) return;
    let iso = trimmed;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      const [dd, mm, yyyy] = trimmed.split('/');
      iso = `${yyyy}-${mm}-${dd}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      Alert.alert('Invalid date', 'Enter a date in DD/MM/YYYY or YYYY-MM-DD format.');
      return;
    }
    if (!blackoutDates.includes(iso)) {
      setBlackoutDates((p) => [...p, iso].sort());
      setDirty(true);
    }
    setNewBlackout('');
  }

  function removeBlackout(d: string) {
    setBlackoutDates((p) => p.filter((x) => x !== d));
    setDirty(true);
  }

  function fmtBlackout(iso: string) {
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    const date = new Date(`${y}-${m}-${d}T00:00:00`);
    return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function toggleCatExpand(id: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return (
      <DirectorStandaloneScreen title="Delivery Settings">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <ActivityIndicator color={BLUE} size="large" />
          <Text style={{ color: MUTED, fontSize: 14 }}>Loading delivery settings…</Text>
        </View>
      </DirectorStandaloneScreen>
    );
  }

  if (isError) {
    return (
      <DirectorStandaloneScreen title="Delivery Settings">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <Feather name="alert-circle" size={40} color={RED} />
          <Text style={{ color: TEXT, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>Failed to load settings</Text>
          <Text style={{ color: MUTED, fontSize: 14, textAlign: 'center' }}>Check your connection and try again.</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={styles.saveBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </DirectorStandaloneScreen>
    );
  }

  const sectionOpacity = enabled ? 1 : 0.55;

  return (
    <DirectorStandaloneScreen title="Delivery Settings" subtitle="Retail delivery slots, fee & eligibility">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>

          {/* ── SERVICE STATUS ────────────────────────────────── */}
          <Text style={styles.section}>SERVICE</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={styles.rowTitle}>Retail delivery</Text>
                  <View style={[styles.statusBadge, { backgroundColor: enabled ? '#DCFCE7' : '#FEE2E2' }]}>
                    <View style={[styles.statusDot, { backgroundColor: enabled ? GREEN : RED }]} />
                    <Text style={[styles.statusBadgeText, { color: enabled ? '#15803D' : '#B91C1C' }]}>
                      {enabled ? 'LIVE' : 'OFFLINE'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.rowSub}>
                  {enabled
                    ? 'Delivery option is visible to customers in the cart.'
                    : 'Delivery is hidden globally. All customers see pickup only.'}
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={(v) => { setEnabled(v); setDirty(true); }}
                trackColor={{ false: BORDER, true: GREEN }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* ── DELIVERY FEE ─────────────────────────────────── */}
          <View style={[styles.card, { opacity: sectionOpacity }]}>
            {!enabled && (
              <View style={styles.dimNotice}>
                <Feather name="info" size={12} color={AMBER} />
                <Text style={styles.dimNoticeText}>Settings are saved but won't take effect until delivery is enabled above.</Text>
              </View>
            )}
            <Text style={styles.rowTitle}>Delivery fee (AUD)</Text>
            <Text style={styles.rowSub}>Flat fee charged per delivery order — Sydney / NSW only.</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: TEXT }}>$</Text>
              <TextInput
                style={[styles.fieldInput, { width: 110 }]}
                value={feeDollars}
                onChangeText={(v) => { setFeeDollars(v.replace(/[^0-9.]/g, '')); setDirty(true); }}
                keyboardType="decimal-pad"
                placeholder="12.00"
                onBlur={() => {
                  const n = parseFloat(feeDollars);
                  if (!isNaN(n)) setFeeDollars(n.toFixed(2));
                }}
              />
            </View>
          </View>

          {/* ── SLOTS ────────────────────────────────────────── */}
          <View style={[{ opacity: sectionOpacity }]}>
            <View style={styles.sectionRow}>
              <Text style={styles.section}>DELIVERY SLOTS</Text>
              <TouchableOpacity onPress={openAddSlot} style={styles.addBtn}>
                <Feather name="plus" size={14} color={BLUE} />
                <Text style={styles.addBtnText}>Add Slot</Text>
              </TouchableOpacity>
            </View>

            {slots.length === 0 ? (
              <View style={styles.emptyBox}>
                <Feather name="truck" size={22} color={MUTED} />
                <Text style={styles.emptyText}>No delivery slots configured.</Text>
                <Text style={[styles.emptyText, { fontSize: 12, marginTop: 2 }]}>Add at least one slot to accept deliveries.</Text>
              </View>
            ) : (
              slots.map((slot) => (
                <View key={slot.id} style={styles.slotCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.slotDay}>{slot.deliveryLabel}s</Text>
                    <Text style={styles.slotSub}>{slot.windowOpen} – {slot.windowClose}</Text>
                    <Text style={styles.slotCutoff}>Order by {slot.cutoffLabel}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => openEditSlot(slot)} style={styles.slotBtn}>
                      <Feather name="edit-2" size={14} color={BLUE} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeSlot(slot.id)} style={[styles.slotBtn, { borderColor: '#FCA5A5' }]}>
                      <Feather name="trash-2" size={14} color={RED} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* ── BLACKOUT DATES ───────────────────────────────── */}
          <View style={{ opacity: sectionOpacity }}>
            <Text style={[styles.section, { marginTop: 16 }]}>BLACKOUT DATES</Text>
            <View style={styles.card}>
              <Text style={styles.rowSub}>Dates on which delivery is unavailable (public holidays, closures, etc.).</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1 }]}
                  value={newBlackout}
                  onChangeText={setNewBlackout}
                  placeholder="DD/MM/YYYY or YYYY-MM-DD"
                  returnKeyType="done"
                  onSubmitEditing={addBlackout}
                />
                <TouchableOpacity onPress={addBlackout} style={styles.addDateBtn}>
                  <Feather name="plus" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
              {blackoutDates.length > 0 && (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {blackoutDates.map((d) => (
                    <View key={d} style={styles.blackoutChip}>
                      <Feather name="calendar" size={13} color={AMBER} />
                      <Text style={styles.blackoutText}>{fmtBlackout(d)}</Text>
                      <TouchableOpacity onPress={() => removeBlackout(d)} hitSlop={8}>
                        <Feather name="x" size={14} color={MUTED} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* ── SAVE BUTTON ──────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.saveBtn, (!dirty || isPending) && styles.saveBtnDisabled]}
            onPress={() => save()}
            disabled={!dirty || isPending}
          >
            {isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="save" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>

          {/* ── CATEGORY ELIGIBILITY ─────────────────────────── */}
          <Text style={[styles.section, { marginTop: 16 }]}>CATEGORY DELIVERY ELIGIBILITY</Text>
          <Text style={[styles.rowSub, { marginBottom: 8 }]}>
            Enable delivery per category. Expand a category to override individual products as pickup-only.
          </Text>
          {categories.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No categories found.</Text>
            </View>
          ) : (
            categories.map((cat) => {
              const catProducts = productsByCategory.get(cat.id) ?? productsByCategory.get(cat.slug) ?? [];
              const pickupOnlyCount = catProducts.filter((p) => p.isPickupOnly).length;
              const isExpanded = expandedCats.has(cat.id);

              return (
                <View key={cat.id} style={styles.catAccordion}>
                  <View style={[styles.catHeader]}>
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowTitle}>{cat.name}</Text>
                      <Text style={styles.rowSub}>
                        {cat.productCount} product{cat.productCount !== 1 ? 's' : ''}
                        {pickupOnlyCount > 0 ? ` · ${pickupOnlyCount} pickup-only override${pickupOnlyCount !== 1 ? 's' : ''}` : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Switch
                        value={cat.isDeliveryAvailable}
                        onValueChange={(v) => updateCategory({ id: cat.id, isDeliveryAvailable: v })}
                        trackColor={{ false: BORDER, true: BLUE }}
                        thumbColor="#fff"
                      />
                      {catProducts.length > 0 && (
                        <TouchableOpacity onPress={() => toggleCatExpand(cat.id)} hitSlop={8} style={styles.expandBtn}>
                          <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {isExpanded && catProducts.length > 0 && (
                    <View style={styles.productList}>
                      <Text style={[styles.fieldLabel, { paddingHorizontal: 14, paddingTop: 8 }]}>PRODUCT OVERRIDES — PICKUP ONLY</Text>
                      {catProducts.map((product, i) => (
                        <View
                          key={product.id}
                          style={[
                            styles.productRow,
                            i < catProducts.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER },
                          ]}
                        >
                          <View style={styles.rowLeft}>
                            <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 2 }}>
                            <Switch
                              value={product.isPickupOnly}
                              onValueChange={(v) => updateProduct({ id: product.id, isPickupOnly: v })}
                              trackColor={{ false: BORDER, true: AMBER }}
                              thumbColor="#fff"
                            />
                            {product.isPickupOnly && (
                              <Text style={{ fontSize: 9, color: AMBER, fontWeight: '700', letterSpacing: 0.5 }}>PICKUP ONLY</Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      <SlotModal
        visible={showSlotModal}
        initial={slotDraft}
        onSave={handleSaveSlot}
        onCancel={() => setShowSlotModal(false)}
      />
    </DirectorStandaloneScreen>
  );
}

const styles = StyleSheet.create({
  scroll:         { padding: 16, paddingBottom: 80 },
  section:        { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
  sectionRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 },
  card:           { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  row:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft:        { flex: 1, marginRight: 12 },
  rowTitle:       { fontSize: 15, fontWeight: '600', color: TEXT },
  rowSub:         { fontSize: 13, color: MUTED, lineHeight: 18 },
  statusBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusDot:      { width: 7, height: 7, borderRadius: 4 },
  statusBadgeText:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  dimNotice:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFFBEB', borderRadius: 8, padding: 8, marginBottom: 12, borderWidth: 1, borderColor: '#FDE68A' },
  dimNoticeText:  { flex: 1, fontSize: 12, color: '#92400E' },
  addBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#EBF5FF', borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  addBtnText:     { fontSize: 13, fontWeight: '600', color: BLUE },
  emptyBox:       { backgroundColor: CARD, borderRadius: 14, padding: 24, alignItems: 'center', gap: 6, marginBottom: 8 },
  emptyText:      { fontSize: 14, color: MUTED, textAlign: 'center' },
  slotCard:       { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  slotDay:        { fontSize: 16, fontWeight: '700', color: TEXT },
  slotSub:        { fontSize: 13, color: BLUE, fontWeight: '500', marginTop: 2 },
  slotCutoff:     { fontSize: 12, color: MUTED, marginTop: 2 },
  slotBtn:        { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  blackoutChip:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#FDE68A' },
  blackoutText:   { flex: 1, fontSize: 13, color: '#78350F', fontWeight: '500' },
  addDateBtn:     { width: 40, height: 40, borderRadius: 10, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  saveBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BLUE, borderRadius: 12, paddingVertical: 14, marginVertical: 8 },
  saveBtnDisabled:{ opacity: 0.4 },
  saveBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  retryBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  catAccordion:   { backgroundColor: CARD, borderRadius: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2, overflow: 'hidden' },
  catHeader:      { flexDirection: 'row', alignItems: 'center', padding: 14 },
  expandBtn:      { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  productList:    { borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#FAFAFA' },
  productRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  productName:    { fontSize: 14, fontWeight: '500', color: TEXT },
  // Modal
  modalWrap:      { flex: 1, backgroundColor: CARD },
  modalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, paddingTop: 60 },
  modalTitle:     { fontSize: 18, fontWeight: '700', color: TEXT },
  modalClose:     { padding: 4 },
  modalScroll:    { padding: 20, paddingBottom: 60 },
  fieldLabel:     { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 0.8, marginBottom: 8 },
  fieldInput:     { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: TEXT, backgroundColor: '#F9FAFB' },
  fieldHint:      { fontSize: 12, color: MUTED, marginTop: 4 },
  dayBtn:         { width: 42, height: 36, borderRadius: 8, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  dayBtnSel:      { backgroundColor: BLUE, borderColor: BLUE },
  dayBtnText:     { fontSize: 13, fontWeight: '600', color: MUTED },
  dayBtnTextSel:  { color: '#fff' },
  previewBox:     { backgroundColor: '#F0F9FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BAE6FD', marginBottom: 16 },
  saveBtnModal:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BLUE, borderRadius: 12, paddingVertical: 14 },
});
