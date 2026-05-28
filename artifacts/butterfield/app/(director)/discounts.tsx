import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG    = '#EFF6FF';
const CARD  = '#FFFFFF';
const CARD2 = '#F3F4F6';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER      = '#E5E7EB';
const GLASS_BG    = 'rgba(255,255,255,0.6)';
const GLASS_BORDER= 'rgba(255,255,255,0.85)';
const NAVY  = '#1A2B4A';
const RED   = '#D20001';
const GREEN = '#16A34A';
const BLUE  = '#1493FF';
const GOLD  = '#B45309';

// ── Date helpers (Australian format DD/MM/YYYY ↔ ISO) ──────────────────────
function isoToAU(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return [
    String(d.getUTCDate()).padStart(2, '0'),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCFullYear()),
  ].join('/');
}

type DiscountType = 'percentage' | 'fixed_amount' | 'free_delivery';

interface DiscountCode {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountCents: number | null;
  minOrderCents: number;
  startDate: string | null;
  expiresAt: string | null;
  isActive: boolean;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number;
  usageCount: number;
  customerEligibility: string;
  wholesaleEligible: boolean;
  orderTypeEligibility: string;
  stackable: boolean;
  internalNotes: string | null;
  createdAt: string;
}

const BLANK: Partial<DiscountCode> = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: 10,
  maxDiscountCents: null,
  minOrderCents: 0,
  startDate: null,
  expiresAt: null,
  isActive: true,
  usageLimitTotal: null,
  usageLimitPerCustomer: 1,
  customerEligibility: 'all',
  wholesaleEligible: false,
  orderTypeEligibility: 'both',
  stackable: false,
  internalNotes: '',
};

function fmtDiscount(dc: DiscountCode) {
  if (dc.discountType === 'percentage') return `${dc.discountValue}% off`;
  if (dc.discountType === 'fixed_amount') return `AUD ${(dc.discountValue / 100).toFixed(2)} off`;
  return 'Free delivery';
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <View style={[s.pill, { backgroundColor: active ? '#DCFCE7' : '#FEE2E2', borderColor: active ? '#86EFAC' : '#FECACA' }]}>
      <View style={[s.pillDot, { backgroundColor: active ? GREEN : RED }]} />
      <Text style={[s.pillText, { color: active ? '#15803D' : '#DC2626' }]}>{active ? 'Active' : 'Inactive'}</Text>
    </View>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  multiline,
  note,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  multiline?: boolean;
  note?: string;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { height: 72, textAlignVertical: 'top', paddingTop: 10 }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={MUTED}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
      />
      {note ? <Text style={s.fieldNote}>{note}</Text> : null}
    </View>
  );
}

function TypeButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.typeBtn, selected && { backgroundColor: BLUE, borderColor: BLUE }]}
    >
      <Text style={[s.typeBtnText, selected && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export default function DirectorDiscountsScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [form, setForm] = useState<Partial<DiscountCode>>(BLANK);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [expiryDisplay, setExpiryDisplay] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-discount-codes'],
    queryFn: async () => {
      const res = await (api as any).director.discountCodes();
      return res.data as DiscountCode[];
    },
  });

  const codes = (data ?? []).filter((dc) => {
    if (filter === 'active') return dc.isActive;
    if (filter === 'inactive') return !dc.isActive;
    return true;
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...BLANK });
    setExpiryDisplay('');
    setModalVisible(true);
  };

  const openEdit = (dc: DiscountCode) => {
    setEditing(dc);
    setForm({ ...dc });
    setExpiryDisplay(isoToAU(dc.expiresAt));
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditing(null);
    setForm({ ...BLANK });
    setExpiryDisplay('');
  };

  const save = async () => {
    if (!form.code?.trim()) { Alert.alert('Code required', 'Please enter a discount code.'); return; }
    if (!form.discountValue && form.discountType !== 'free_delivery') { Alert.alert('Value required', 'Please enter a discount value.'); return; }
    setSaving(true);
    try {
      const payload = {
        code: form.code!.trim().toUpperCase(),
        description: form.description || null,
        discountType: form.discountType,
        // discountValue is already in cents for fixed_amount (set by onChange * 100)
        discountValue: Number(form.discountValue ?? 0),
        // maxDiscountCents and minOrderCents already in cents from onChange handler
        maxDiscountCents: form.maxDiscountCents ? Number(form.maxDiscountCents) : null,
        minOrderCents: Number(form.minOrderCents ?? 0),
        expiresAt: form.expiresAt || null,
        startDate: form.startDate || null,
        isActive: form.isActive !== false,
        usageLimitTotal: form.usageLimitTotal ? Number(form.usageLimitTotal) : null,
        usageLimitPerCustomer: form.usageLimitPerCustomer ? Number(form.usageLimitPerCustomer) : 1,
        customerEligibility: form.customerEligibility ?? 'all',
        wholesaleEligible: form.wholesaleEligible ?? false,
        orderTypeEligibility: form.orderTypeEligibility ?? 'both',
        stackable: form.stackable ?? false,
        internalNotes: form.internalNotes || null,
      };
      if (editing) {
        await (api as any).director.updateDiscountCode(editing.id, payload);
      } else {
        await (api as any).director.createDiscountCode(payload);
      }
      await qc.invalidateQueries({ queryKey: ['director-discount-codes'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeModal();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save discount code.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (dc: DiscountCode) => {
    try {
      await (api as any).director.updateDiscountCode(dc.id, { isActive: !dc.isActive });
      qc.invalidateQueries({ queryKey: ['director-discount-codes'] });
      Haptics.selectionAsync();
    } catch {
      Alert.alert('Error', 'Could not update status.');
    }
  };

  const confirmDelete = (dc: DiscountCode) => {
    Alert.alert(
      'Delete code',
      `Delete "${dc.code}"? This cannot be undone and will not affect past orders.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await (api as any).director.deleteDiscountCode(dc.id);
              qc.invalidateQueries({ queryKey: ['director-discount-codes'] });
            } catch {
              Alert.alert('Error', 'Could not delete discount code.');
            }
          },
        },
      ],
    );
  };

  const setField = <K extends keyof DiscountCode>(key: K, val: any) =>
    setForm((f) => ({ ...f, [key]: val }));

  const discountValueDisplay =
    form.discountType === 'percentage'
      ? String(form.discountValue ?? '')
      : form.discountType === 'fixed_amount'
        ? form.discountValue
          ? String(Number(form.discountValue) / 100)
          : ''
        : '';

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>Discount Codes</Text>
            <Text style={s.headerSub}>Create and manage promotional codes</Text>
          </View>
          <Pressable onPress={openCreate} style={s.addBtn}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={s.addBtnText}>New Code</Text>
          </Pressable>
        </View>

        <View style={s.filterRow}>
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[s.filterChip, filter === f && { backgroundColor: BLUE, borderColor: BLUE }]}
            >
              <Text style={[s.filterChipText, filter === f && { color: '#fff' }]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={MUTED} />}
        >
          {codes.length === 0 && (
            <View style={s.emptyWrap}>
              <Feather name="tag" size={36} color={MUTED} />
              <Text style={s.emptyText}>No discount codes yet</Text>
              <Text style={s.emptySub}>Tap "New Code" to create your first code</Text>
            </View>
          )}
          {codes.map((dc) => (
            <View key={dc.id} style={s.card}>
              <View style={s.cardTop}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={s.codeRow}>
                    <Text style={s.codeText}>{dc.code}</Text>
                    <StatusPill active={dc.isActive} />
                  </View>
                  <Text style={s.discountLabel}>{fmtDiscount(dc)}</Text>
                  {dc.description ? <Text style={s.descText}>{dc.description}</Text> : null}
                </View>
                <View style={s.cardActions}>
                  <Pressable onPress={() => openEdit(dc)} style={s.iconBtn}>
                    <Feather name="edit-2" size={15} color={MUTED} />
                  </Pressable>
                  <Pressable onPress={() => confirmDelete(dc)} style={s.iconBtn}>
                    <Feather name="trash-2" size={15} color={RED} />
                  </Pressable>
                </View>
              </View>

              <View style={s.cardMeta}>
                <View style={s.metaItem}>
                  <Feather name="bar-chart-2" size={12} color={MUTED} />
                  <Text style={s.metaText}>
                    {dc.usageCount} used
                    {dc.usageLimitTotal ? ` / ${dc.usageLimitTotal} max` : ''}
                  </Text>
                </View>
                {dc.minOrderCents > 0 && (
                  <View style={s.metaItem}>
                    <Feather name="shopping-bag" size={12} color={MUTED} />
                    <Text style={s.metaText}>Min AUD {(dc.minOrderCents / 100).toFixed(2)}</Text>
                  </View>
                )}
                {dc.expiresAt && (
                  <View style={s.metaItem}>
                    <Feather name="clock" size={12} color={MUTED} />
                    <Text style={s.metaText}>Expires {fmtDate(dc.expiresAt)}</Text>
                  </View>
                )}
                {dc.orderTypeEligibility !== 'both' && (
                  <View style={s.metaItem}>
                    <Feather name={dc.orderTypeEligibility === 'delivery' ? 'truck' : 'map-pin'} size={12} color={MUTED} />
                    <Text style={s.metaText}>{dc.orderTypeEligibility === 'delivery' ? 'Delivery only' : 'Pickup only'}</Text>
                  </View>
                )}
              </View>

              <View style={s.cardToggleRow}>
                <Text style={[s.metaText, { flex: 1 }]}>Active</Text>
                <Switch
                  value={dc.isActive}
                  onValueChange={() => toggleActive(dc)}
                  trackColor={{ false: BORDER, true: '#14532D' }}
                  thumbColor={dc.isActive ? GREEN : MUTED}
                />
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[s.modalHeader, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 12 }]}>
            <Text style={s.modalTitle}>{editing ? 'Edit Code' : 'New Discount Code'}</Text>
            <Pressable onPress={closeModal} style={s.iconBtn}>
              <Feather name="x" size={22} color={TEXT} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
            <FormField
              label="Code"
              value={form.code ?? ''}
              onChange={(v) => setField('code', v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="SUMMER25"
              note="Letters and numbers only. Will be auto-uppercased."
            />

            <FormField
              label="Description (optional)"
              value={form.description ?? ''}
              onChange={(v) => setField('description', v)}
              placeholder="Summer sale — 25% off all orders"
            />

            <View style={s.field}>
              <Text style={s.fieldLabel}>Discount type</Text>
              <View style={s.typeRow}>
                <TypeButton label="Percentage" selected={form.discountType === 'percentage'} onPress={() => { setField('discountType', 'percentage'); setField('discountValue', 10); }} />
                <TypeButton label="Fixed amount" selected={form.discountType === 'fixed_amount'} onPress={() => { setField('discountType', 'fixed_amount'); setField('discountValue', 500); }} />
                <TypeButton label="Free delivery" selected={form.discountType === 'free_delivery'} onPress={() => { setField('discountType', 'free_delivery'); setField('discountValue', 0); }} />
              </View>
            </View>

            {form.discountType !== 'free_delivery' && (
              <FormField
                label={form.discountType === 'percentage' ? 'Discount % (e.g. 10 for 10%)' : 'Discount amount AUD (e.g. 5.00)'}
                value={discountValueDisplay}
                onChange={(v) => {
                  if (form.discountType === 'percentage') {
                    setField('discountValue', v === '' ? '' : Number(v));
                  } else {
                    setField('discountValue', v === '' ? '' : Math.round(parseFloat(v) * 100));
                  }
                }}
                keyboardType="decimal-pad"
              />
            )}

            {form.discountType === 'percentage' && (
              <FormField
                label="Max discount AUD (optional, e.g. 20.00)"
                value={form.maxDiscountCents ? String(form.maxDiscountCents / 100) : ''}
                onChange={(v) => setField('maxDiscountCents', v === '' ? null : Math.round(parseFloat(v) * 100))}
                keyboardType="decimal-pad"
                note="Leave blank for no cap"
              />
            )}

            <FormField
              label="Minimum order AUD (optional)"
              value={form.minOrderCents ? String(form.minOrderCents / 100) : ''}
              onChange={(v) => setField('minOrderCents', v === '' ? 0 : Math.round(parseFloat(v) * 100))}
              keyboardType="decimal-pad"
            />

            <FormField
              label="Total usage limit (optional)"
              value={form.usageLimitTotal ? String(form.usageLimitTotal) : ''}
              onChange={(v) => setField('usageLimitTotal', v === '' ? null : parseInt(v, 10))}
              keyboardType="numeric"
              note="Leave blank for unlimited"
            />

            <FormField
              label="Per-customer usage limit"
              value={String(form.usageLimitPerCustomer ?? 1)}
              onChange={(v) => setField('usageLimitPerCustomer', parseInt(v, 10) || 1)}
              keyboardType="numeric"
            />

            <View style={s.field}>
              <Text style={s.fieldLabel}>Order type eligibility</Text>
              <View style={s.typeRow}>
                {(['both', 'pickup', 'delivery'] as const).map((t) => (
                  <TypeButton key={t} label={t.charAt(0).toUpperCase() + t.slice(1)} selected={form.orderTypeEligibility === t} onPress={() => setField('orderTypeEligibility', t)} />
                ))}
              </View>
            </View>

            <View style={s.field}>
              <Text style={s.fieldLabel}>Customer eligibility</Text>
              <View style={s.typeRow}>
                {(['all', 'first_order', 'loyalty'] as const).map((t) => (
                  <TypeButton key={t} label={t === 'all' ? 'All' : t === 'first_order' ? 'First order' : 'Loyalty'} selected={form.customerEligibility === t} onPress={() => setField('customerEligibility', t)} />
                ))}
              </View>
            </View>

            <View style={s.field}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={s.fieldLabel}>Wholesale eligible</Text>
                  <Text style={s.fieldNote}>Allow wholesale accounts to use this code</Text>
                </View>
                <Switch
                  value={form.wholesaleEligible ?? false}
                  onValueChange={(v) => setField('wholesaleEligible', v)}
                  trackColor={{ false: BORDER, true: '#14532D' }}
                  thumbColor={form.wholesaleEligible ? GREEN : MUTED}
                />
              </View>
            </View>

            <View style={s.field}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={s.fieldLabel}>Active</Text>
                  <Text style={s.fieldNote}>Code can be used immediately</Text>
                </View>
                <Switch
                  value={form.isActive !== false}
                  onValueChange={(v) => setField('isActive', v)}
                  trackColor={{ false: BORDER, true: '#14532D' }}
                  thumbColor={form.isActive !== false ? GREEN : MUTED}
                />
              </View>
            </View>

            <FormField
              label="Expiry date (optional, DD/MM/YYYY)"
              value={expiryDisplay}
              onChange={(v) => {
                // Strip non-digits, limit to 8
                const digits = v.replace(/\D/g, '').slice(0, 8);
                // Auto-insert slashes: DD/MM/YYYY
                let formatted = digits;
                if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
                setExpiryDisplay(formatted);
                if (digits.length === 8) {
                  const iso = `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
                  const d = new Date(iso);
                  setField('expiresAt', isNaN(d.getTime()) ? null : iso);
                } else {
                  setField('expiresAt', null);
                }
              }}
              placeholder="31/12/2025"
              keyboardType="numeric"
            />

            <FormField
              label="Internal notes (optional)"
              value={form.internalNotes ?? ''}
              onChange={(v) => setField('internalNotes', v)}
              placeholder="Notes visible only to directors"
              multiline
            />
          </ScrollView>

          <View style={[s.modalFooter, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable onPress={closeModal} style={s.cancelBtn}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={[s.saveBtn, saving && { opacity: 0.7 }]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{editing ? 'Save changes' : 'Create code'}</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG },
  header:       { paddingHorizontal: 16, paddingBottom: 0, backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerRow:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 14, gap: 12 },
  headerTitle:  { fontSize: 20, fontWeight: '700', color: TEXT },
  headerSub:    { fontSize: 13, color: MUTED, marginTop: 2 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: RED, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText:   { fontSize: 13, fontWeight: '600', color: '#fff' },
  filterRow:    { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  filterChip:   { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  filterChipText:{ fontSize: 12, fontWeight: '600', color: MUTED },
  loadingWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap:    { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 60 },
  emptyText:    { fontSize: 18, fontWeight: '600', color: TEXT },
  emptySub:     { fontSize: 13, color: MUTED, textAlign: 'center' },
  card:         { backgroundColor: GLASS_BG, borderRadius: 16, borderWidth: 1, borderColor: GLASS_BORDER, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  cardTop:      { flexDirection: 'row', padding: 14, gap: 10 },
  codeRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeText:     { fontSize: 18, fontWeight: '800', color: TEXT, letterSpacing: 1 },
  discountLabel:{ fontSize: 14, fontWeight: '600', color: BLUE },
  descText:     { fontSize: 12, color: MUTED, lineHeight: 17 },
  cardActions:  { gap: 8 },
  iconBtn:      { padding: 6 },
  cardMeta:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 14, paddingBottom: 12 },
  metaItem:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText:     { fontSize: 12, color: MUTED },
  cardToggleRow:{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: BORDER },
  pill:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  pillDot:      { width: 6, height: 6, borderRadius: 3 },
  pillText:     { fontSize: 11, fontWeight: '600' },
  // Modal
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  modalTitle:   { fontSize: 18, fontWeight: '700', color: TEXT },
  modalFooter:  { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER },
  cancelBtn:    { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: CARD2, borderWidth: 1, borderColor: BORDER },
  cancelBtnText:{ fontSize: 15, fontWeight: '600', color: MUTED },
  saveBtn:      { flex: 2, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: RED },
  saveBtnText:  { fontSize: 15, fontWeight: '600', color: '#fff' },
  // Form
  field:        { gap: 6 },
  fieldLabel:   { fontSize: 12, fontWeight: '600', color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' },
  fieldNote:    { fontSize: 11, color: MUTED },
  input:        { backgroundColor: CARD2, borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: TEXT },
  typeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD2 },
  typeBtnText:  { fontSize: 12, fontWeight: '600', color: MUTED },
});
