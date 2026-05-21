import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';
const TIER_CFG: Record<string, { label: string; color: string; bg: string }> = {
  blue:     { label: 'Blue',     color: '#0C4DA2', bg: '#DBECFF' },
  bronze:   { label: 'Blue',     color: '#0C4DA2', bg: '#DBECFF' },
  silver:   { label: 'Silver',   color: '#374151', bg: '#F3F4F6' },
  gold:     { label: 'Gold',     color: '#92400E', bg: '#FDE68A' },
  black:    { label: 'Black',    color: '#0F172A', bg: '#E2E8F0' },
  platinum: { label: 'Black',    color: '#0F172A', bg: '#E2E8F0' },
};
const BADGE_CFG: Record<string, { label: string; bg: string; text: string }> = {
  vip:               { label: 'VIP',           bg: '#EDE9FE', text: '#5B21B6' },
  loyal:             { label: 'Loyal',          bg: '#DCFCE7', text: '#166534' },
  returning:         { label: 'Returning',      bg: '#EBF8FF', text: '#0369A1' },
  new:               { label: 'New',            bg: '#F3F4F6', text: '#6B7280' },
  high_spend:        { label: 'High Spend',     bg: '#FEF3C7', text: '#92400E' },
  frequent_buyer:    { label: 'Frequent',       bg: '#DBEAFE', text: '#1E40AF' },
  inactive:          { label: 'Inactive',       bg: '#FEE2E2', text: '#991B1B' },
  wholesale_partner: { label: 'Wholesale',      bg: '#D1FAE5', text: '#065F46' },
  needs_follow_up:   { label: 'Follow Up',      bg: '#FFF7ED', text: '#C2410C' },
  flagged:           { label: 'Flagged',        bg: '#FEE2E2', text: '#B91C1C' },
  at_risk:           { label: 'At Risk',        bg: '#FEF3C7', text: '#B45309' },
};
const MANUAL_BADGES = [
  'vip', 'high_spend', 'needs_follow_up', 'flagged', 'loyal', 'frequent_buyer', 'inactive', 'at_risk',
];
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string | null | undefined) {
  return new Date(iso ?? '').toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function locationStr(suburb?: string | null, state?: string | null) {
  if (suburb && state) return `${suburb} ${state}, Australia`;
  if (suburb) return `${suburb}, Australia`;
  if (state) return `${state}, Australia`;
  return null;
}
function isoToDdMmYyyy(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = iso.slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : '';
}
function ddMmYyyyToIso(s: string): string | null {
  const parts = s.trim().split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
}
function autoFormatBdEdit(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
}
const STATUS_ORDER_COLOR: Record<string, string> = {
  received: '#3B82F6', being_prepared: '#F59E0B', ready_for_pickup: GREEN,
  out_for_delivery: '#8B5CF6', completed: MUTED, cancelled: RED, refunded: RED,
};
function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
// ── Shopify-style list row ────────────────────────────────────────────────────
function ShopifyCustomerRow({ item, onPress, isLast }: { item: any; onPress: () => void; isLast: boolean }) {
  const loc = locationStr(item.suburb, item.state);
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={[row.wrap, !isLast && row.border]}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={row.name}>{item.name}</Text>
        {loc && <Text style={row.location}>{loc}</Text>}
        <Text style={row.meta}>
          {fmtAUD(item.totalSpentCents)}
          <Text style={row.metaDot}> • </Text>
          <Text>{item.orderCount} {item.orderCount === 1 ? 'order' : 'orders'}</Text>
        </Text>
      </View>
      <View style={[row.badge, item.emailMarketingOptIn ? row.badgeGreen : row.badgeGrey]}>
        <Text style={[row.badgeTx, { color: item.emailMarketingOptIn ? GREEN : MUTED }]}>
          {item.emailMarketingOptIn ? 'Subscribed' : 'Not subscribed'}
        </Text>
      </View>
    </Pressable>
  );
}
// ── Shopify-style customer detail modal ───────────────────────────────────────
export function ShopifyCustomerDetailModal({ customerId, onClose, onDelete }: { customerId: string; onClose: () => void; onDelete?: () => void }) {
  const insets  = useSafeAreaInsets();
  const qc      = useQueryClient();
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [togglingMarketing, setTogglingMarketing] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact]   = useState(false);
  const [eName,     setEName]     = useState('');
  const [ePhone,    setEPhone]    = useState('');
  const [eEmail,    setEEmail]    = useState('');
  const [eBirthday, setEBirthday] = useState('');
  const [ePayAtPickup, setEPayAtPickup] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['customer-detail', customerId],
    queryFn:  () => api.director.customers.get(customerId),
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const customer = data?.data;
  const startEdit = (c: any) => {
    setEName(c.name ?? '');
    setEPhone(c.phone ?? '');
    setEEmail(c.email ?? '');
    setEBirthday(isoToDdMmYyyy(c.profile?.birthday));
    setEPayAtPickup(Boolean(c.profile?.payAtPickupEnabled));
    setEditingContact(true);
  };
  const saveContact = async () => {
    setSavingContact(true);
    try {
      const birthdayISO = eBirthday.trim() ? ddMmYyyyToIso(eBirthday) : '';
      await api.director.customers.update(customerId, {
        name: eName.trim(), phone: ePhone.trim() || null, email: eEmail.trim(), birthday: birthdayISO, payAtPickupEnabled: ePayAtPickup,
      });
      setEditingContact(false);
      refetch();
      qc.invalidateQueries({ queryKey: ['director-customers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSavingContact(false); }
  };
  const addNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await api.director.customers.addNote(customerId, noteText.trim());
      setNoteText('');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setAddingNote(false); }
  };
  const deleteNote = (noteId: string) => {
    Alert.alert('Delete note', 'Remove this internal note?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.director.customers.deleteNote(customerId, noteId); refetch(); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };
  const toggleMarketing = async (val: boolean) => {
    if (!customer) return;
    setTogglingMarketing(true);
    try {
      await api.director.customers.updateMarketing(customerId, val);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setTogglingMarketing(false); }
  };
  const addBadge = (badge: string) => {
    Alert.alert('Add tag', `Add "${BADGE_CFG[badge]?.label ?? badge}" tag to this customer?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add', onPress: async () => {
        try { await api.director.customers.addBadge(customerId, badge); refetch(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
        catch (e: any) { Alert.alert('Error', (e as any).message); }
      }},
    ]);
  };
  const removeBadge = (badgeId: string, badge: string) => {
    Alert.alert('Remove tag', `Remove "${BADGE_CFG[badge]?.label ?? badge}" tag?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api.director.customers.deleteBadge(customerId, badgeId); refetch(); }
        catch (e: any) { Alert.alert('Error', (e as any).message); }
      }},
    ]);
  };
  const defaultAddr = customer?.addresses?.find((a: any) => a.isDefault) ?? customer?.addresses?.[0] ?? null;
  const loyaltyTier = customer?.profile?.loyaltyTier;
  const tierCfg     = TIER_CFG[loyaltyTier ?? ''] ?? null;
  const marketingOn = customer?.profile?.emailMarketingOptIn ?? false;
  const manualSet   = new Set((customer?.manualBadges ?? []).map((m: any) => m.badge));
  const allBadges   = customer?.badges ?? [];
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Header */}
        <View style={[det.header, { paddingTop: insets.top > 0 ? insets.top + 4 : 20, borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={det.headerBtn} hitSlop={10}>
            <Feather name="arrow-left" size={20} color={TEXT} />
          </Pressable>
          <Text style={det.headerTitle} numberOfLines={1}>
            {isLoading ? '' : (customer?.name ?? 'Customer')}
          </Text>
          <Pressable style={det.headerBtn} hitSlop={10}
            onPress={() => customer && Alert.alert(customer.name, 'Customer options', [
              { text: 'Change status', onPress: () => Alert.alert('Change Status', undefined, [
                { text: 'Active',    onPress: () => { api.director.customers.updateStatus(customerId, 'active');    refetch(); } },
                { text: 'Inactive',  onPress: () => { api.director.customers.updateStatus(customerId, 'inactive');  refetch(); } },
                { text: 'Suspended', onPress: () => { api.director.customers.updateStatus(customerId, 'suspended'); refetch(); } },
                { text: 'Cancel', style: 'cancel' },
              ])},
              { text: 'Promote to staff role…', onPress: () => Alert.alert(
                  'Promote Account',
                  `Convert ${customer.name}'s customer account to a staff role.\n\nThis grants internal app access and removes customer portal access.`,
                  [
                    { text: 'Staff member', onPress: async () => {
                        try {
                          await api.director.customers.promote(customerId, 'staff');
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          Alert.alert('Done', `${customer.name} is now a staff member.`);
                          onClose(); onDelete?.();
                        } catch (e: any) { Alert.alert('Error', e.message); }
                      }},
                    { text: 'Manager', onPress: async () => {
                          await api.director.customers.promote(customerId, 'manager');
                          Alert.alert('Done', `${customer.name} is now a manager.`);
                          onClose(); onDelete?.();
                        }},
                    { text: 'Director', onPress: async () => {
                          await api.director.customers.promote(customerId, 'director');
                          Alert.alert('Done', `${customer.name} is now a director.`);
                          onClose(); onDelete?.();
                        }},
                    { text: 'Cancel', style: 'cancel' },
                  ]
                )},
              { text: 'Edit contact info', onPress: () => customer && startEdit(customer) },
              { text: 'Delete account', style: 'destructive', onPress: () =>
                Alert.alert(
                  'Delete Customer',
                  `Permanently delete ${customer.name}?\n\nAll orders, loyalty points, and login access will be removed. This cannot be undone.`,
                  [{ text: 'Delete', style: 'destructive', onPress: async () => {
                      try {
                        await api.director.deleteUser(customerId);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        onClose();
                        onDelete?.();
                      } catch (e: any) { Alert.alert('Error', e.message); }
                    }},
                    { text: 'Cancel', style: 'cancel' },
                  ])
              },
              { text: 'Cancel', style: 'cancel' },
            ])}
          >
            <Feather name="more-horizontal" size={20} color={TEXT} />
          </Pressable>
        </View>
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={BLUE} size="large" />
          </View>
        ) : !customer ? (
            <Text style={{ color: MUTED }}>Customer not found.</Text>
        ) : (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
            {/* ── Hero section ── */}
            <View style={[det.heroSection, { borderBottomColor: BORDER }]}>
              <Text style={det.heroName}>{customer.name}</Text>
              <Text style={det.heroSub}>
                Since {fmtDate(customer.createdAt)}
                {defaultAddr ? ` • ${defaultAddr.suburb} ${defaultAddr.state}, Australia` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {marketingOn && (
                  <View style={[det.tag, { backgroundColor: '#DCFCE7' }]}>
                    <Text style={[det.tagTx, { color: '#166534' }]}>Email marketing</Text>
                  </View>
                )}
                {tierCfg && (
                  <View style={[det.tag, { backgroundColor: tierCfg.bg }]}>
                    <Text style={[det.tagTx, { color: tierCfg.color }]}>{tierCfg.label} tier</Text>
                  </View>
                )}
                {customer.status !== 'active' && (
                  <View style={[det.tag, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={[det.tagTx, { color: RED }]}>{customer.status}</Text>
                  </View>
                )}
              </View>
            </View>
            {/* ── Insights ── */}
            <View style={[det.section, { borderBottomColor: BORDER }]}>
              <Text style={det.sectionTitle}>Insights</Text>
              <Text style={{ fontSize: 13, color: MUTED, fontWeight: '400', lineHeight: 18, marginBottom: 14 }}>
                Butterfield tracks this customer's purchase history and loyalty to help you personalise their experience.
              </Text>
              {[
                { label: 'Total spend',      value: fmtAUD(customer.orderStats?.totalSpentCents ?? 0) },
                { label: 'Last order',       value: customer.orderStats?.lastOrderAt ? fmtDate(customer.orderStats.lastOrderAt) : 'Never' },
                { label: 'Total orders',     value: String(customer.orderStats?.orderCount ?? 0) },
                { label: 'Avg order',        value: customer.orderStats?.avgOrderCents ? fmtAUD(customer.orderStats.avgOrderCents) : '—' },
                { label: 'Stamps so far',    value: `${customer.profile?.stampCount ?? 0} / 6` },
                { label: '☕ Free coffees',  value: String((customer.profile as any)?.freeCoffeesEarned ?? 0) },
              ].map((r, i, arr) => (
                <View key={r.label} style={[det.infoRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                  <Text style={det.infoLabel}>{r.label}</Text>
                  <Text style={det.infoValue}>{r.value}</Text>
                </View>
              ))}
            </View>
            {/* ── Loyalty activity ── */}
            <View style={[det.section, { borderBottomColor: BORDER }]}>
              <Text style={det.sectionTitle}>Loyalty</Text>
              {[
                { label: 'Current points',   value: String(customer.profile?.loyaltyPoints ?? 0) },
                { label: 'Tier',             value: TIER_CFG[customer.profile?.loyaltyTier ?? '']?.label ?? 'Blue' },
                { label: 'Stamps',           value: `${customer.profile?.stampCount ?? 0} / 6` },
                { label: 'Points earned',    value: String((customer as any).loyaltyStats?.totalEarnedPoints ?? 0) },
                { label: 'Points redeemed',  value: String((customer as any).loyaltyStats?.totalRedeemedPoints ?? 0) },
              ].map((r, i, arr) => (
                <View key={r.label} style={[det.infoRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                  <Text style={det.infoLabel}>{r.label}</Text>
                  <Text style={det.infoValue}>{r.value}</Text>
                </View>
              ))}
              {((customer as any).loyaltyTransactions?.length ?? 0) > 0 && (
                <>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>
                    Recent activity
                  </Text>
                  {((customer as any).loyaltyTransactions as any[]).slice(0, 10).map((txn: any, i: number, arr: any[]) => {
                    const pts = txn.points ?? 0;
                    const isEarn = pts >= 0;
                    return (
                      <View key={txn.id ?? i} style={[det.infoRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                        <View style={{ flex: 1, gap: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '500', color: TEXT }}>
                            {txn.description ?? txn.type ?? 'Transaction'}
                          </Text>
                          <Text style={{ fontSize: 11, fontWeight: '400', color: MUTED }}>
                            {fmtDate(txn.createdAt)}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: isEarn ? GREEN : RED }}>
                          {isEarn ? '+' : ''}{pts} pts
                        </Text>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
            {/* ── Contact information ── */}
            <View style={[det.section, { borderBottomColor: BORDER }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={det.sectionTitle}>Contact information</Text>
                <Pressable onPress={() => startEdit(customer)} hitSlop={8}>
                  <Feather name="edit-2" size={16} color={BLUE} />
                </Pressable>
              </View>
              {editingContact ? (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                  <View style={{ gap: 10 }}>
                    {[
                      { label: 'Name',              value: eName,     set: setEName,     kb: 'default' as const },
                      { label: 'Email',             value: eEmail,    set: setEEmail,    kb: 'email-address' as const },
                      { label: 'Phone (optional)',  value: ePhone,    set: setEPhone,    kb: 'phone-pad' as const },
                      { label: 'Birthday DD/MM/YYYY', value: eBirthday, set: (v: string) => setEBirthday(autoFormatBdEdit(v)), kb: 'number-pad' as const },
                    ].map(f => (
                      <View key={f.label}>
                        <Text style={{ fontSize: 11, color: MUTED, fontWeight: '500', marginBottom: 4 }}>{f.label}</Text>
                        <TextInput
                          style={[det.editInput, { borderColor: BORDER, color: TEXT }]}
                          value={f.value} onChangeText={f.set}
                          keyboardType={f.kb} autoCapitalize="none" placeholderTextColor={MUTED} placeholder={f.label}
                        />
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                      <Pressable onPress={() => setEditingContact(false)} style={[det.actionBtn, { flex: 1, borderWidth: 1, borderColor: BORDER, backgroundColor: BG }]}>
                        <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                      </Pressable>
                      <Pressable onPress={saveContact} disabled={savingContact} style={[det.actionBtn, { flex: 1, backgroundColor: NAVY }]}>
                        {savingContact ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Save</Text>}
                      </Pressable>
                    </View>
                    <View style={[det.infoRow, { borderBottomWidth: 0, paddingHorizontal: 0, marginTop: 2 }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 14, color: TEXT, fontWeight: '500' }}>Allow pay at pickup</Text>
                        <Text style={{ fontSize: 12, color: MUTED, fontWeight: '400' }}>
                          Lets this customer choose pay later at pickup on eligible pickup orders.
                        </Text>
                      </View>
                      <Switch
                        value={ePayAtPickup}
                        onValueChange={setEPayAtPickup}
                        trackColor={{ false: BORDER, true: '#BBF7D0' }}
                        thumbColor={ePayAtPickup ? GREEN : '#9CA3AF'}
                      />
                    </View>
                  </View>
                </KeyboardAvoidingView>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                    <Pressable
                      onPress={() => Alert.alert('Email', customer.email)}
                      style={[det.contactBtn, { backgroundColor: BG, borderColor: BORDER }]}
                    >
                      <Feather name="mail" size={15} color={TEXT} />
                      <Text style={det.contactBtnTx}>Email details</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => customer.phone ? Alert.alert('Phone', customer.phone) : Alert.alert('No phone', 'No phone number on record.')}
                      style={[det.contactBtn, { backgroundColor: BG, borderColor: BORDER, opacity: customer.phone ? 1 : 0.5 }]}
                    >
                      <Feather name="phone" size={15} color={TEXT} />
                      <Text style={det.contactBtnTx}>Phone details</Text>
                    </Pressable>
                  </View>
                  {defaultAddr && (
                    <>
                      <Text style={[det.infoLabel, { marginBottom: 6 }]}>Default address</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, color: TEXT, fontWeight: '400', lineHeight: 22 }}>
                            {customer.name}{'\n'}
                            {defaultAddr.street}{defaultAddr.apt ? `, ${defaultAddr.apt}` : ''}{'\n'}
                            {defaultAddr.suburb} {defaultAddr.state} {defaultAddr.postcode}{'\n'}
                            Australia
                          </Text>
                        </View>
                        <Pressable onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} style={{ padding: 4 }}>
                          <Feather name="copy" size={16} color={MUTED} />
                        </Pressable>
                      </View>
                    </>
                  )}
                  {customer.profile?.birthday && (
                    <View style={[det.infoRow, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER }]}>
                      <Text style={det.infoLabel}>Birthday</Text>
                      <Text style={det.infoValue}>{isoToDdMmYyyy(customer.profile.birthday)}</Text>
                    </View>
                  )}
                  <View style={[det.infoRow, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER }]}>
                    <Text style={det.infoLabel}>Pay at pickup</Text>
                    <Text style={det.infoValue}>{customer.profile?.payAtPickupEnabled ? 'Enabled' : 'Disabled'}</Text>
                  </View>
                </>
              )}
            </View>
            {/* ── Note ── */}
            <View style={[det.section, { borderBottomColor: BORDER }]}>
              <Text style={[det.sectionTitle, { marginBottom: 12 }]}>Note</Text>
              {(customer.notes?.length ?? 0) === 0 && !addingNote && (
                <Pressable
                  onPress={() => setAddingNote(true)}
                  style={[det.infoRow, { borderBottomWidth: 0 }]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="plus-circle" size={16} color={BLUE} />
                    <Text style={{ fontSize: 14, color: BLUE, fontWeight: '500' }}>Add note</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={MUTED} />
                </Pressable>
              )}
              {(addingNote || (customer.notes?.length ?? 0) > 0) && (
                <View style={{ gap: 10 }}>
                  {customer.notes?.map((note: any) => (
                    <View key={note.id} style={[det.noteCard, { borderColor: BORDER }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <View>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: TEXT }}>{note.authorName}</Text>
                              <Text style={{ fontSize: 11, color: MUTED, fontWeight: '400' }}>{fmtDateTime(note.createdAt)}</Text>
                        </View>
                        <Pressable onPress={() => deleteNote(note.id)} hitSlop={8}>
                          <Feather name="trash-2" size={14} color={RED} />
                        </Pressable>
                      </View>
                      <Text style={{ fontSize: 14, color: TEXT, fontWeight: '400', lineHeight: 20 }}>{note.content}</Text>
                    </View>
                  ))}
                  <TextInput
                    style={[det.noteInput, { borderColor: BORDER, color: TEXT }]}
                    placeholder="Write a note about this customer…"
                    placeholderTextColor={MUTED}
                    value={noteText}
                    onChangeText={setNoteText}
                    multiline
                    numberOfLines={3}
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={() => { setAddingNote(false); setNoteText(''); }} style={[det.actionBtn, { flex: 1, borderWidth: 1, borderColor: BORDER, backgroundColor: BG }]}>
                      <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={addNote} disabled={addingNote || !noteText.trim()} style={[det.actionBtn, { flex: 1, backgroundColor: NAVY, opacity: !noteText.trim() ? 0.4 : 1 }]}>
                      {addingNote ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Save Note</Text>}
                    </Pressable>
                  </View>
                  {(customer.notes?.length ?? 0) > 0 && !addingNote && (
                    <Pressable onPress={() => setAddingNote(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 }}>
                      <Feather name="plus-circle" size={15} color={BLUE} />
                      <Text style={{ fontSize: 13, color: BLUE, fontWeight: '500' }}>Add another note</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
            {/* ── Tags / Badges ── */}
            <View style={[det.section, { borderBottomColor: BORDER }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Feather name="tag" size={16} color={MUTED} />
                <Text style={det.sectionTitle}>Tags</Text>
              </View>
              {allBadges.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {allBadges.map((b: string) => {
                    const cfg = BADGE_CFG[b] ?? { label: b, bg: BG, text: MUTED };
                    const mb  = customer.manualBadges.find((m: any) => m.badge === b);
                    if (mb) {
                      return (
                        <Pressable key={b} onPress={() => removeBadge(mb.id, b)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: cfg.bg, paddingLeft: 8, paddingRight: 5, paddingVertical: 4, borderRadius: 20 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.text }}>{cfg.label}</Text>
                          <Feather name="x" size={11} color={cfg.text} />
                        </Pressable>
                      );
                    }
                    return (
                      <View key={b} style={{ backgroundColor: cfg.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.text }}>{cfg.label}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: MUTED, fontWeight: '400', marginBottom: 8 }}>No tags yet.</Text>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
                <Text style={[det.infoLabel, { width: '100%', marginBottom: 4 }]}>Add tag:</Text>
                {MANUAL_BADGES.filter(b => !allBadges.includes(b)).map(b => (
                  <Pressable key={b} onPress={() => addBadge(b)}
                    style={{ backgroundColor: BADGE_CFG[b]?.bg ?? BG, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: BORDER }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: BADGE_CFG[b]?.text ?? MUTED }}>+ {BADGE_CFG[b]?.label ?? b}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {/* ── Marketing subscriptions ── */}
            <View style={[det.section, { borderBottomColor: BORDER }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Feather name="mail" size={16} color={MUTED} />
                <Text style={det.sectionTitle}>Marketing subscriptions</Text>
              </View>
              <View style={[det.infoRow, { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 14, color: TEXT, fontWeight: '500' }}>Email marketing</Text>
                  <Text style={{ fontSize: 12, color: MUTED, fontWeight: '400' }}>
                    {marketingOn ? 'Subscribed to marketing emails' : 'Not subscribed to marketing emails'}
                  </Text>
                </View>
                <Switch
                  value={marketingOn}
                  onValueChange={toggleMarketing}
                  disabled={togglingMarketing}
                  trackColor={{ false: '#D1D5DB', true: GREEN }}
                  thumbColor="#fff"
                  ios_backgroundColor="#D1D5DB"
                />
              </View>
            </View>
            {/* ── Order history ── */}
            <View style={det.section}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={det.sectionTitle}>Order history</Text>
                <Text style={{ fontSize: 13, color: BLUE, fontWeight: '600' }}>
                  {(customer.orders?.length ?? 0)} {customer.orders?.length === 1 ? 'order' : 'orders'}
                </Text>
              </View>
              {(customer.orders?.length ?? 0) === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                  <Feather name="shopping-bag" size={28} color={MUTED} />
                  <Text style={{ color: MUTED, fontWeight: '400' }}>No orders yet.</Text>
                </View>
              ) : (
                <View style={{ gap: 0 }}>
                  {customer.orders?.map((order: any, i: number) => {
                    const statusColor = STATUS_ORDER_COLOR[order.status] ?? MUTED;
                    const items: any[] = Array.isArray(order.items) ? order.items : [];
                    const isLast = i === (customer.orders.length - 1);
                    return (
                      <View key={order.id} style={[det.orderRow, !isLast && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: TEXT }}>
                            #{order.id.slice(0, 8).toUpperCase()}
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>{fmtAUD(order.totalCents)}</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: MUTED, fontWeight: '400', marginBottom: 6 }}>
                          {customer.name} · {items.length} item{items.length !== 1 ? 's' : ''} · {fmtDateTime(order.createdAt)}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          <View style={[det.statusPill, { backgroundColor: statusColor + '20' }]}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: statusColor }}>
                              {statusLabel(order.status)}
                            </Text>
                          </View>
                          {order.type && (
                            <View style={[det.statusPill, { backgroundColor: BG }]}>
                              <Text style={{ fontSize: 11, fontWeight: '400', color: MUTED }}>
                                {order.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
// ── Main screen ──────────────────────────────────────────────────────────────
export default function DirectorCustomersScreen() {
  const [search, setSearch]         = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-customers', search],
    queryFn:  () => api.director.customers.list({ search }),
  });
  const customers: any[] = (data as any)?.data ?? [];
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Search bar */}
      <View style={[scr.searchBar, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <View style={[scr.searchInput, { borderColor: BORDER }]}>
          <Feather name="search" size={16} color={MUTED} />
          <TextInput
            style={{ flex: 1, fontSize: 15, color: TEXT, fontWeight: '400' }}
            placeholder="Filter customers"
            placeholderTextColor={MUTED}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Feather name="x-circle" size={16} color={MUTED} />
            </Pressable>
          )}
        </View>
        <Pressable style={[scr.sortBtn, { borderColor: BORDER }]}>
          <Feather name="sliders" size={16} color={MUTED} />
        </Pressable>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={c => c.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
          style={{ backgroundColor: CARD }}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="users" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontWeight: '400', fontSize: 15 }}>
                {search ? 'No customers match your search.' : 'No customers yet.'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <ShopifyCustomerRow
              item={item}
              onPress={() => setSelectedId(item.id)}
              isLast={index === customers.length - 1}
            />
          )}
        />
      )}
      {selectedId && (
        <ShopifyCustomerDetailModal
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </View>
  );
}
// ── Styles ───────────────────────────────────────────────────────────────────
const row = StyleSheet.create({
  wrap:      { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD },
  border:    { borderBottomWidth: 1, borderBottomColor: BORDER },
  name:      { fontSize: 15, fontWeight: '700', color: TEXT },
  location:  { fontSize: 13, color: MUTED, fontWeight: '400' },
  meta:      { fontSize: 13, color: MUTED, fontWeight: '400' },
  metaDot:   { color: MUTED },
  badge:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  badgeGreen:{ backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  badgeGrey: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  badgeTx:   { fontSize: 12, fontWeight: '600' },
});
const scr = StyleSheet.create({
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  searchInput: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  sortBtn:     { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
});
const det = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, backgroundColor: CARD },
  headerBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: TEXT },
  heroSection:  { backgroundColor: CARD, paddingHorizontal: 20, paddingVertical: 20, borderBottomWidth: 1, gap: 2 },
  heroName:     { fontSize: 24, fontWeight: '700', color: TEXT },
  heroSub:      { fontSize: 13, color: MUTED, fontWeight: '400' },
  tag:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagTx:        { fontSize: 12, fontWeight: '600' },
  section:      { backgroundColor: CARD, marginTop: 8, paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  infoRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  infoLabel:    { fontSize: 13, color: MUTED, fontWeight: '400' },
  infoValue:    { fontSize: 14, color: TEXT, fontWeight: '600' },
  contactBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 10, borderWidth: 1 },
  contactBtnTx: { fontSize: 13, fontWeight: '500', color: TEXT },
  noteCard:     { borderWidth: 1, borderRadius: 10, padding: 12 },
  noteInput:    { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top', fontWeight: '400', color: TEXT },
  actionBtn:    { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  editInput:    { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '400', backgroundColor: BG },
  orderRow:     { paddingVertical: 14 },
  statusPill:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
});
