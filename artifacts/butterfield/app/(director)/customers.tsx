import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Theme ────────────────────────────────────────────────────────────────────
const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';
const PURPLE = '#8B5CF6';

// ── Badge config ─────────────────────────────────────────────────────────────
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

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  active:    { label: 'Active',    color: GREEN  },
  inactive:  { label: 'Inactive',  color: MUTED  },
  suspended: { label: 'Suspended', color: RED    },
};

const FILTERS = [
  { key: 'all',        label: 'All'       },
  { key: 'retail',     label: 'Retail'    },
  { key: 'wholesale',  label: 'Wholesale' },
  { key: 'vip',        label: 'VIP'       },
  { key: 'loyal',      label: 'Loyal'     },
  { key: 'high_spend', label: 'High Spend'},
  { key: 'inactive',   label: 'Inactive'  },
  { key: 'flagged',    label: 'Flagged'   },
];

const MANUAL_BADGES = [
  'vip', 'high_spend', 'needs_follow_up', 'flagged', 'loyal', 'frequent_buyer', 'inactive', 'at_risk',
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtBirthday(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
  } catch { return iso; }
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

// ── Badge chip ───────────────────────────────────────────────────────────────
function BadgeChip({ badge, small }: { badge: string; small?: boolean }) {
  const cfg = BADGE_CFG[badge] ?? { label: badge, bg: BG, text: MUTED };
  return (
    <View style={[chip.pill, { backgroundColor: cfg.bg, paddingHorizontal: small ? 6 : 8, paddingVertical: small ? 2 : 3 }]}>
      <Text style={[chip.text, { color: cfg.text, fontSize: small ? 10 : 11 }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Insight tile ─────────────────────────────────────────────────────────────
function InsightTile({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={[ins.tile, { backgroundColor: CARD, borderColor: BORDER }]}>
      <Text style={[ins.val, { color }]}>{value}</Text>
      <Text style={ins.label}>{label}</Text>
    </View>
  );
}

// ── Customer card ─────────────────────────────────────────────────────────────
function CustomerCard({ item, onPress }: { item: any; onPress: () => void }) {
  const avatarBg = item.wholesaleAccount ? '#DCFCE7' : '#EBF8FF';
  const avatarTx = item.wholesaleAccount ? '#166534' : '#0369A1';
  const topBadges = item.badges.slice(0, 3);
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={[card.wrap, { backgroundColor: CARD, borderColor: BORDER }]}
    >
      <View style={card.row}>
        <View style={[card.avatar, { backgroundColor: avatarBg }]}>
          <Text style={[card.avatarTx, { color: avatarTx }]}>{initials(item.name)}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={card.name}>{item.name}</Text>
            {item.status !== 'active' && (
              <View style={[chip.pill, { backgroundColor: '#FEE2E2' }]}>
                <Text style={[chip.text, { color: RED, fontSize: 10 }]}>{item.status}</Text>
              </View>
            )}
          </View>
          <Text style={card.email}>{item.email}{item.phone ? ` · ${item.phone}` : ''}</Text>
          {topBadges.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
              {topBadges.map((b: string) => <BadgeChip key={b} badge={b} small />)}
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <Text style={card.spent}>{fmtAUD(item.totalSpentCents)}</Text>
          <Text style={card.orders}>{item.orderCount} orders</Text>
          <Feather name="chevron-right" size={14} color={MUTED} />
        </View>
      </View>
    </Pressable>
  );
}

// ── Customer detail modal ────────────────────────────────────────────────────
function CustomerModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const insets  = useSafeAreaInsets();
  const qc      = useQueryClient();
  const [tab, setTab]         = useState<'overview' | 'orders' | 'notes'>('overview');
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [editStatus, setEditStatus] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails]   = useState(false);
  const [eName,     setEName]     = useState('');
  const [ePhone,    setEPhone]    = useState('');
  const [eEmail,    setEEmail]    = useState('');
  const [eBirthday, setEBirthday] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['customer-detail', customerId],
    queryFn:  () => api.director.customers.get(customerId),
  });

  const customer = data?.data;

  const addNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await api.director.customers.addNote(customerId, noteText.trim());
      setNoteText('');
      refetch();
      qc.invalidateQueries({ queryKey: ['director-customers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setAddingNote(false); }
  };

  const deleteNote = (noteId: string) => {
    Alert.alert('Delete note', 'Remove this internal note?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.director.customers.deleteNote(customerId, noteId);
          refetch();
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const addBadge = (badge: string) => {
    Alert.alert('Add badge', `Add "${BADGE_CFG[badge]?.label ?? badge}" badge to this customer?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add', onPress: async () => {
        try {
          await api.director.customers.addBadge(customerId, badge);
          refetch();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const removeBadge = (badgeId: string, badge: string) => {
    Alert.alert('Remove badge', `Remove "${BADGE_CFG[badge]?.label ?? badge}" badge?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.director.customers.deleteBadge(customerId, badgeId);
          refetch();
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const changeStatus = (status: string) => {
    Alert.alert('Change status', `Set account to "${status}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        try {
          await api.director.customers.updateStatus(customerId, status);
          refetch();
          qc.invalidateQueries({ queryKey: ['director-customers'] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const startEditDetails = (c: any) => {
    setEName(c.name ?? '');
    setEPhone(c.phone ?? '');
    setEEmail(c.email ?? '');
    setEBirthday(isoToDdMmYyyy(c.profile?.birthday));
    setEditingDetails(true);
  };

  const saveDetails = async () => {
    setSavingDetails(true);
    try {
      const birthdayISO = eBirthday.trim() ? ddMmYyyyToIso(eBirthday) : '';
      await api.director.customers.update(customerId, {
        name:     eName.trim(),
        phone:    ePhone.trim() || null,
        email:    eEmail.trim(),
        birthday: birthdayISO,
      });
      setEditingDetails(false);
      refetch();
      qc.invalidateQueries({ queryKey: ['director-customers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSavingDetails(false); }
  };

  const TABS = [
    { key: 'overview', label: 'Overview', icon: 'user' },
    { key: 'orders',   label: 'Orders',   icon: 'shopping-bag' },
    { key: 'notes',    label: 'Notes',    icon: 'file-text' },
  ] as const;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={[mdl.header, { paddingTop: insets.top > 0 ? insets.top + 4 : 20, borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={mdl.closeBtn}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
          <Text style={mdl.title} numberOfLines={1}>
            {isLoading ? 'Loading…' : customer?.name ?? 'Customer Profile'}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={BLUE} size="large" />
          </View>
        ) : !customer ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: MUTED }}>Customer not found.</Text>
          </View>
        ) : (
          <>
            {/* Tab bar */}
            <View style={[mdl.tabBar, { borderBottomColor: BORDER }]}>
              {TABS.map(t => (
                <Pressable
                  key={t.key}
                  onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
                  style={[mdl.tabBtn, tab === t.key && mdl.tabBtnActive]}
                >
                  <Feather name={t.icon as any} size={14} color={tab === t.key ? BLUE : MUTED} />
                  <Text style={[mdl.tabTxt, { color: tab === t.key ? BLUE : MUTED }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

              {/* ── OVERVIEW TAB ─────────────────────────────────── */}
              {tab === 'overview' && (
                <>
                  {/* Identity card */}
                  <View style={[sec.card, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                      <View style={[sec.bigAvatar, { backgroundColor: customer.wholesaleAccount ? '#DCFCE7' : '#EBF8FF' }]}>
                        <Text style={[sec.bigAvatarTx, { color: customer.wholesaleAccount ? '#166534' : '#0369A1' }]}>
                          {initials(editingDetails ? eName : customer.name)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        {editingDetails ? (
                          <>
                            <TextInput style={[mdl.editInput, { borderColor: BORDER, color: TEXT }]} value={eName} onChangeText={setEName} placeholder="Full name" placeholderTextColor={MUTED} />
                            <TextInput style={[mdl.editInput, { borderColor: BORDER, color: TEXT }]} value={eEmail} onChangeText={setEEmail} placeholder="Email" placeholderTextColor={MUTED} keyboardType="email-address" autoCapitalize="none" />
                            <TextInput style={[mdl.editInput, { borderColor: BORDER, color: TEXT }]} value={ePhone} onChangeText={setEPhone} placeholder="Phone (optional)" placeholderTextColor={MUTED} keyboardType="phone-pad" />
                            <TextInput style={[mdl.editInput, { borderColor: BORDER, color: TEXT }]} value={eBirthday} onChangeText={v => setEBirthday(autoFormatBdEdit(v))} placeholder="Birthday DD/MM/YYYY" placeholderTextColor={MUTED} keyboardType="number-pad" maxLength={10} />
                          </>
                        ) : (
                          <>
                            <Text style={sec.bigName}>{customer.name}</Text>
                            <Text style={sec.sub}>{customer.email}</Text>
                            {customer.phone && <Text style={sec.sub}>{customer.phone}</Text>}
                            {customer.profile?.birthday
                              ? <Text style={sec.sub}>🎂 {fmtBirthday(customer.profile.birthday)}</Text>
                              : <Text style={[sec.sub, { color: MUTED, fontStyle: 'italic' }]}>No birthday set</Text>
                            }
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                              <View style={[chip.pill, { backgroundColor: (STATUS_CFG[customer.status]?.color ?? MUTED) + '20' }]}>
                                <Text style={[chip.text, { color: STATUS_CFG[customer.status]?.color ?? MUTED }]}>
                                  {STATUS_CFG[customer.status]?.label ?? customer.status}
                                </Text>
                              </View>
                              <Pressable
                                onPress={() => Alert.alert('Change Status', 'Select new status', [
                                  { text: 'Active',    onPress: () => changeStatus('active')    },
                                  { text: 'Inactive',  onPress: () => changeStatus('inactive')  },
                                  { text: 'Suspended', onPress: () => changeStatus('suspended') },
                                  { text: 'Cancel', style: 'cancel' },
                                ])}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                              >
                                <Text style={{ color: BLUE, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Change</Text>
                                <Feather name="edit-2" size={11} color={BLUE} />
                              </Pressable>
                            </View>
                          </>
                        )}
                      </View>
                      {/* Edit / Save / Cancel */}
                      {editingDetails ? (
                        <View style={{ gap: 6 }}>
                          <Pressable onPress={saveDetails} disabled={savingDetails}
                            style={[mdl.smBtn, { backgroundColor: NAVY }]}>
                            {savingDetails
                              ? <ActivityIndicator size="small" color="#fff" />
                              : <Text style={mdl.smBtnTxt}>Save</Text>}
                          </Pressable>
                          <Pressable onPress={() => setEditingDetails(false)}
                            style={[mdl.smBtn, { backgroundColor: BG, borderWidth: 1, borderColor: BORDER }]}>
                            <Text style={[mdl.smBtnTxt, { color: TEXT }]}>Cancel</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable onPress={() => startEditDetails(customer)}
                          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#EBF8FF', alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name="edit-2" size={14} color={BLUE} />
                        </Pressable>
                      )}
                    </View>

                    <View style={[sec.divider, { borderTopColor: BORDER }]}>
                      <Text style={sec.metaLabel}>Customer since</Text>
                      <Text style={sec.metaVal}>{fmtDate(customer.createdAt)}</Text>
                    </View>
                    {customer.lastLogin && (
                      <View style={sec.metaRow}>
                        <Text style={sec.metaLabel}>Last login</Text>
                        <Text style={sec.metaVal}>{fmtDateTime(customer.lastLogin)}</Text>
                      </View>
                    )}
                    <View style={sec.metaRow}>
                      <Text style={sec.metaLabel}>Account type</Text>
                      <Text style={sec.metaVal}>{customer.wholesaleAccount ? 'Wholesale' : 'Retail'}</Text>
                    </View>
                  </View>

                  {/* Badges */}
                  <View style={[sec.card, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Text style={sec.sectionTitle}>Badges</Text>
                    {(() => {
                      const manualSet = new Set(customer.manualBadges.map((m: any) => m.badge));
                      const autoBadges   = customer.badges.filter((b: string) => !manualSet.has(b));
                      const manualBadges = customer.badges.filter((b: string) =>  manualSet.has(b));
                      return (
                        <>
                          {autoBadges.length > 0 && (
                            <>
                              <Text style={[sec.metaLabel, { marginBottom: 6 }]}>⚡ Auto-assigned</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                {autoBadges.map((b: string) => <BadgeChip key={b} badge={b} />)}
                              </View>
                            </>
                          )}
                          {manualBadges.length > 0 && (
                            <>
                              <Text style={[sec.metaLabel, { marginBottom: 6 }]}>✋ Manual — tap to remove</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {manualBadges.map((b: string) => {
                                  const mb  = customer.manualBadges.find((m: any) => m.badge === b);
                                  const cfg = BADGE_CFG[b] ?? { label: b, bg: BG, text: MUTED };
                                  return (
                                    <Pressable key={b} onPress={() => mb && removeBadge(mb.id, b)}
                                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: cfg.bg, paddingLeft: 8, paddingRight: 5, paddingVertical: 4, borderRadius: 20 }}>
                                      <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: cfg.text }}>{cfg.label}</Text>
                                      <Feather name="x" size={11} color={cfg.text} />
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </>
                          )}
                          {customer.badges.length === 0 && <Text style={{ color: MUTED, fontSize: 13, marginBottom: 4 }}>No badges yet.</Text>}
                        </>
                      );
                    })()}
                    <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER, gap: 8 }}>
                      <Text style={sec.metaLabel}>Add manual badge:</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {MANUAL_BADGES.filter(b => !customer.badges.includes(b)).map(b => (
                          <Pressable key={b} onPress={() => addBadge(b)}
                            style={[chip.pill, { backgroundColor: BADGE_CFG[b]?.bg ?? BG, borderWidth: 1, borderColor: BORDER }]}>
                            <Text style={[chip.text, { color: BADGE_CFG[b]?.text ?? MUTED }]}>+ {BADGE_CFG[b]?.label ?? b}</Text>
                          </Pressable>
                        ))}
                        {MANUAL_BADGES.filter(b => !customer.badges.includes(b)).length === 0 && (
                          <Text style={{ fontSize: 12, color: MUTED, fontFamily: 'Inter_400Regular' }}>All badges assigned.</Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Order stats */}
                  <View style={[sec.card, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Text style={sec.sectionTitle}>Order Activity</Text>
                    <View style={sec.statsGrid}>
                      {[
                        { label: 'Total Orders',  value: customer.orderStats.orderCount },
                        { label: 'Total Spent',   value: fmtAUD(customer.orderStats.totalSpentCents) },
                        { label: 'Avg Order',     value: fmtAUD(customer.orderStats.avgOrderCents) },
                        { label: 'Cancelled',     value: customer.orderStats.cancelledCount },
                        { label: 'Refunded',      value: customer.orderStats.refundedCount },
                        { label: 'Days Since',    value: customer.orderStats.daysSinceLastOrder != null ? `${customer.orderStats.daysSinceLastOrder}d` : '—' },
                      ].map(s => (
                        <View key={s.label} style={[sec.statTile, { backgroundColor: BG }]}>
                          <Text style={sec.statVal}>{s.value}</Text>
                          <Text style={sec.statLabel}>{s.label}</Text>
                        </View>
                      ))}
                    </View>
                    {customer.orderStats.lastOrderAt && (
                      <View style={[sec.metaRow, { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER }]}>
                        <Text style={sec.metaLabel}>Last order</Text>
                        <Text style={sec.metaVal}>{fmtDateTime(customer.orderStats.lastOrderAt)}</Text>
                      </View>
                    )}
                    {customer.orderStats.topProducts?.length > 0 && (
                      <>
                        <Text style={[sec.metaLabel, { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER }]}>Most ordered</Text>
                        {customer.orderStats.topProducts.map((p: any) => (
                          <View key={p.name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                            <Text style={{ fontSize: 13, color: TEXT, fontFamily: 'Inter_400Regular' }}>{p.name}</Text>
                            <Text style={{ fontSize: 13, color: MUTED, fontFamily: 'Inter_600SemiBold' }}>{p.qty}×</Text>
                          </View>
                        ))}
                      </>
                    )}
                  </View>

                  {/* Loyalty */}
                  {customer.profile && (
                    <View style={[sec.card, { backgroundColor: CARD, borderColor: BORDER }]}>
                      <Text style={sec.sectionTitle}>Loyalty & Rewards</Text>
                      <View style={sec.statsGrid}>
                        {[
                          { label: 'Points',     value: customer.profile.loyaltyPoints },
                          { label: 'Tier',       value: customer.profile.loyaltyTier?.charAt(0).toUpperCase() + customer.profile.loyaltyTier?.slice(1) },
                          { label: 'Stamps',     value: `${customer.profile.stampCount}/10` },
                          { label: 'Visits',     value: customer.profile.totalVisits },
                        ].map(s => (
                          <View key={s.label} style={[sec.statTile, { backgroundColor: BG }]}>
                            <Text style={sec.statVal}>{s.value}</Text>
                            <Text style={sec.statLabel}>{s.label}</Text>
                          </View>
                        ))}
                      </View>
                      {customer.profile.referralCode && (
                        <View style={[sec.metaRow, { marginTop: 10 }]}>
                          <Text style={sec.metaLabel}>Referral code</Text>
                          <Text style={[sec.metaVal, { fontFamily: 'Inter_700Bold', letterSpacing: 1 }]}>{customer.profile.referralCode}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Addresses */}
                  {customer.addresses?.length > 0 && (
                    <View style={[sec.card, { backgroundColor: CARD, borderColor: BORDER }]}>
                      <Text style={sec.sectionTitle}>Saved Addresses</Text>
                      {customer.addresses.map((a: any) => (
                        <View key={a.id} style={[sec.addrRow, { borderTopColor: BORDER }]}>
                          <View style={[chip.pill, { backgroundColor: a.isDefault ? '#EBF8FF' : BG }]}>
                            <Text style={[chip.text, { color: a.isDefault ? BLUE : MUTED }]}>{a.label}{a.isDefault ? ' ✓' : ''}</Text>
                          </View>
                          <Text style={{ fontSize: 13, color: TEXT, fontFamily: 'Inter_400Regular' }}>
                            {a.street}{a.apt ? `, ${a.apt}` : ''}, {a.suburb} {a.postcode} {a.state}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Wholesale account */}
                  {customer.wholesaleAccount && (
                    <View style={[sec.card, { backgroundColor: CARD, borderColor: BORDER }]}>
                      <Text style={sec.sectionTitle}>Wholesale Account</Text>
                      {[
                        { label: 'Company',        value: customer.wholesaleAccount.companyName },
                        { label: 'ABN',            value: customer.wholesaleAccount.abn ?? '—' },
                        { label: 'Status',         value: customer.wholesaleAccount.status },
                        { label: 'Pricing Tier',   value: customer.wholesaleAccount.pricingTier },
                        { label: 'Credit Limit',   value: fmtAUD(customer.wholesaleAccount.creditLimitCents) },
                        { label: 'Payment Terms',  value: customer.wholesaleAccount.paymentTerms },
                        { label: 'Account Mgr',    value: customer.wholesaleAccount.accountManager },
                      ].map(r => (
                        <View key={r.label} style={sec.metaRow}>
                          <Text style={sec.metaLabel}>{r.label}</Text>
                          <Text style={sec.metaVal}>{r.value}</Text>
                        </View>
                      ))}
                      {customer.wholesaleAccount.internalNotes && (
                        <View style={{ marginTop: 10, padding: 10, backgroundColor: '#FFFBEB', borderRadius: 8 }}>
                          <Text style={{ fontSize: 12, color: AMBER, fontFamily: 'Inter_600SemiBold', marginBottom: 4 }}>Internal Notes</Text>
                          <Text style={{ fontSize: 13, color: TEXT, fontFamily: 'Inter_400Regular' }}>{customer.wholesaleAccount.internalNotes}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}

              {/* ── ORDERS TAB ───────────────────────────────────── */}
              {tab === 'orders' && (
                <>
                  {customer.orders?.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 60, gap: 12 }}>
                      <Feather name="shopping-bag" size={36} color={MUTED} />
                      <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular' }}>No orders yet.</Text>
                    </View>
                  ) : (
                    customer.orders?.map((order: any) => {
                      const statusColor = STATUS_ORDER_COLOR[order.status] ?? MUTED;
                      const items: any[] = Array.isArray(order.items) ? order.items : [];
                      return (
                        <View key={order.id} style={[sec.card, { backgroundColor: CARD, borderColor: BORDER }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: TEXT }}>
                                #{order.id.slice(0, 8).toUpperCase()}
                              </Text>
                              <Text style={{ fontSize: 11, color: MUTED, fontFamily: 'Inter_400Regular' }}>
                                {fmtDateTime(order.createdAt)} · {order.type}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                              <View style={[chip.pill, { backgroundColor: statusColor + '20' }]}>
                                <Text style={[chip.text, { color: statusColor }]}>{statusLabel(order.status)}</Text>
                              </View>
                              <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: TEXT }}>{fmtAUD(order.totalCents)}</Text>
                            </View>
                          </View>
                          {items.slice(0, 4).map((item: any, i: number) => (
                            <Text key={i} style={{ fontSize: 12, color: MUTED, fontFamily: 'Inter_400Regular' }}>
                              {item.quantity ?? 1}× {item.name ?? 'Item'}
                            </Text>
                          ))}
                          {items.length > 4 && <Text style={{ fontSize: 12, color: MUTED }}>+{items.length - 4} more…</Text>}
                        </View>
                      );
                    })
                  )}
                </>
              )}

              {/* ── NOTES TAB ────────────────────────────────────── */}
              {tab === 'notes' && (
                <>
                  {/* Add note */}
                  <View style={[sec.card, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Text style={sec.sectionTitle}>Add Internal Note</Text>
                    <TextInput
                      style={[mdl.noteInput, { borderColor: BORDER, color: TEXT }]}
                      placeholder="Write a note about this customer…"
                      placeholderTextColor={MUTED}
                      value={noteText}
                      onChangeText={setNoteText}
                      multiline
                      numberOfLines={3}
                    />
                    <Pressable
                      onPress={addNote}
                      disabled={addingNote || !noteText.trim()}
                      style={[mdl.addNoteBtn, { backgroundColor: NAVY, opacity: addingNote || !noteText.trim() ? 0.5 : 1 }]}
                    >
                      {addingNote
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' }}>Save Note</Text>
                      }
                    </Pressable>
                  </View>

                  {customer.notes?.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 40, gap: 10 }}>
                      <Feather name="file-text" size={32} color={MUTED} />
                      <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular' }}>No internal notes yet.</Text>
                    </View>
                  ) : (
                    customer.notes?.map((note: any) => (
                      <View key={note.id} style={[sec.card, { backgroundColor: CARD, borderColor: BORDER }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                          <View>
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: TEXT }}>{note.authorName}</Text>
                            <Text style={{ fontSize: 11, color: MUTED, fontFamily: 'Inter_400Regular' }}>{fmtDateTime(note.createdAt)}</Text>
                          </View>
                          <Pressable onPress={() => deleteNote(note.id)} style={{ padding: 4 }}>
                            <Feather name="trash-2" size={14} color={RED} />
                          </Pressable>
                        </View>
                        <Text style={{ fontSize: 14, color: TEXT, fontFamily: 'Inter_400Regular', lineHeight: 20 }}>{note.content}</Text>
                      </View>
                    ))
                  )}
                </>
              )}
            </ScrollView>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function DirectorCustomersScreen() {
  const insets = useSafeAreaInsets();
  const qc     = useQueryClient();
  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState('all');
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(true);

  const { data: insightsData }  = useQuery({ queryKey: ['customer-insights'],  queryFn: () => api.director.customers.insights() });
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-customers', search, filter],
    queryFn:  () => api.director.customers.list({ search, filter }),
  });

  const customers: any[] = data?.data ?? [];
  const insights  = insightsData?.data;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Search bar */}
      <View style={[scr.searchBar, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <View style={[scr.searchInput, { borderColor: BORDER }]}>
          <Feather name="search" size={16} color={MUTED} />
          <TextInput
            style={{ flex: 1, fontSize: 15, color: TEXT, fontFamily: 'Inter_400Regular' }}
            placeholder="Search by name, email, phone, company…"
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
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[scr.filterRow, { backgroundColor: CARD, borderBottomColor: BORDER }]}
        contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 6 }}
      >
        {FILTERS.map(f => (
          <Pressable
            key={f.key}
            onPress={() => { setFilter(f.key); Haptics.selectionAsync(); }}
            style={[scr.filterChip, { backgroundColor: filter === f.key ? BLUE : BG, borderColor: filter === f.key ? BLUE : BORDER }]}
          >
            <Text style={{ color: filter === f.key ? '#fff' : MUTED, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Insights strip */}
      {showInsights && insights && (
        <View style={scr.insightStrip}>
          <InsightTile label="Total"     value={insights.totalCustomers} color={TEXT}   />
          <InsightTile label="New / wk"  value={insights.newThisWeek}    color={BLUE}   />
          <InsightTile label="Wholesale" value={insights.totalWholesale}  color={GREEN}  />
          <InsightTile label="Showing"   value={customers.length}         color={PURPLE} />
        </View>
      )}

      {/* Customer list */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={c => c.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="users" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 15 }}>
                {search ? 'No customers match your search.' : 'No customers yet.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <CustomerCard item={item} onPress={() => setSelectedId(item.id)} />
          )}
        />
      )}

      {selectedId && (
        <CustomerModal
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const chip = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  text: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});

const ins = StyleSheet.create({
  tile:  { flex: 1, backgroundColor: CARD, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  val:   { fontSize: 18, fontFamily: 'Inter_700Bold' },
  label: { fontSize: 10, color: MUTED, fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: 'center' },
});

const card = StyleSheet.create({
  wrap:     { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  row:      { flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center' },
  avatar:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarTx: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  name:     { fontSize: 14, fontFamily: 'Inter_700Bold', color: TEXT },
  email:    { fontSize: 12, color: MUTED, fontFamily: 'Inter_400Regular' },
  spent:    { fontSize: 13, fontFamily: 'Inter_700Bold', color: TEXT },
  orders:   { fontSize: 11, color: MUTED, fontFamily: 'Inter_400Regular' },
});

const sec = StyleSheet.create({
  card:        { backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1 },
  sectionTitle:{ fontSize: 13, fontFamily: 'Inter_700Bold', color: TEXT, marginBottom: 10, letterSpacing: 0.2 },
  bigAvatar:   { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  bigAvatarTx: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  bigName:     { fontSize: 18, fontFamily: 'Inter_700Bold', color: TEXT },
  sub:         { fontSize: 13, color: MUTED, fontFamily: 'Inter_400Regular' },
  divider:     { borderTopWidth: 1, marginTop: 12, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  metaLabel:   { fontSize: 12, color: MUTED, fontFamily: 'Inter_500Medium' },
  metaVal:     { fontSize: 13, color: TEXT, fontFamily: 'Inter_600SemiBold', textAlign: 'right', flex: 1, marginLeft: 12 },
  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statTile:    { width: '30%', flexGrow: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  statVal:     { fontSize: 16, fontFamily: 'Inter_700Bold', color: TEXT },
  statLabel:   { fontSize: 10, color: MUTED, fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: 'center' },
  addrRow:     { borderTopWidth: 1, paddingTop: 10, marginTop: 4, gap: 4 },
});

const scr = StyleSheet.create({
  searchBar:   { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  searchInput: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  filterRow:   { borderBottomWidth: 1 },
  filterChip:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  insightStrip:{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
});

const mdl = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  closeBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:      { flex: 1, fontSize: 16, fontFamily: 'Inter_700Bold', color: TEXT, textAlign: 'center' },
  tabBar:     { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12 },
  tabBtnActive:{ borderBottomWidth: 2, borderBottomColor: BLUE },
  tabTxt:     { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  noteInput:  { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top', fontFamily: 'Inter_400Regular', marginBottom: 10 },
  addNoteBtn: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  editInput:  { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, fontFamily: 'Inter_400Regular', backgroundColor: BG },
  smBtn:      { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 60 },
  smBtnTxt:   { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
});
