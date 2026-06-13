import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, KeyboardAvoidingView,
  Linking, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type CrmCustomer, type CrmCustomerDetail, type CrmInsights,
  type CrmNote, type CrmBadge, type CrmTimelineEvent,
  type LoyaltyTransaction,
} from '@/lib/api';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';
const PURPLE = '#8B5CF6';
const SCREEN_WIDTH = Dimensions.get('window').width;

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
  issue:             { label: 'Issue',          bg: '#FEE2E2', text: '#DC2626' },
  regular:           { label: 'Regular',        bg: '#DCFCE7', text: '#15803D' },
  birthday_offer:    { label: 'Birthday Offer', bg: '#FDF4FF', text: '#9333EA' },
};

const ALL_MANUAL_BADGES = [
  'vip', 'high_spend', 'needs_follow_up', 'flagged', 'loyal', 'frequent_buyer',
  'inactive', 'at_risk', 'issue', 'regular', 'birthday_offer',
];

const SEGMENT_CHIPS = [
  { key: '', label: 'All' },
  { key: 'vip', label: 'VIP' },
  { key: 'high_spend', label: 'High Spend' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'new', label: 'New' },
  { key: 'coffee_regular', label: 'Coffee' },
  { key: 'rewards_member', label: 'Rewards' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'pickup', label: 'Pickup' },
  { key: 'wholesale', label: 'Wholesale' },
];

const SEGMENT_LABEL: Record<string, string> = {
  vip: 'VIP', high_spend: 'High Spenders', inactive: 'Inactive', new: 'New',
  coffee_regular: 'Coffee Regulars', rewards_member: 'Rewards Members',
  delivery: 'Delivery', pickup: 'Pickup', wholesale: 'Wholesale',
};

const TIMELINE_ICON: Record<string, { icon: string; color: string }> = {
  order:        { icon: 'shopping-bag', color: BLUE },
  loyalty:      { icon: 'star',         color: AMBER },
  note_deleted: { icon: 'trash-2',      color: RED },
  stamp:        { icon: 'coffee',       color: '#92400E' },
  notification: { icon: 'bell',         color: PURPLE },
  note:         { icon: 'file-text',    color: NAVY },
};

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
function isoToDdMmYyyy(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = iso.slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : '';
}
function ddMmYyyyToIso(s: string): string | null {
  const parts = s.trim().split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}
function autoFormatBd(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// ── Timeline ──────────────────────────────────────────────────────────────────
function TimelineSection({ customerId }: { customerId: string }) {
  const PAGE = 30;
  const [offset, setOffset]           = useState(0);
  const [allEvents, setAllEvents]     = useState<CrmTimelineEvent[]>([]);
  const [hasMore, setHasMore]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-timeline', customerId, 0],
    queryFn:  () => api.director.customers.timeline(customerId, { limit: PAGE, offset: 0 }),
  });

  useEffect(() => {
    if (data?.data) {
      setAllEvents(data.data);
      setOffset(data.data.length);
      setHasMore(data.data.length === PAGE);
    }
  }, [data]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await api.director.customers.timeline(customerId, { limit: PAGE, offset });
      const batch = res.data ?? [];
      setAllEvents(prev => [...prev, ...batch]);
      setOffset(prev => prev + batch.length);
      setHasMore(batch.length === PAGE);
    } finally {
      setLoadingMore(false);
    }
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginVertical: 20 }} />;

  if (allEvents.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
        <Feather name="clock" size={28} color={MUTED} />
        <Text style={{ color: MUTED, fontSize: 14 }}>No activity yet.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 0 }}>
      {allEvents.map((ev, i) => {
        const cfg = TIMELINE_ICON[ev.type] ?? { icon: 'circle', color: MUTED };
        return (
          <View key={`${ev.type}-${ev.date}-${i}`} style={[det.timelineRow, i < allEvents.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
            <View style={{ alignItems: 'center', gap: 0 }}>
              <View style={[det.timelineIcon, { backgroundColor: cfg.color + '33', borderColor: cfg.color + '55' }]}>
                <Feather name={cfg.icon as any} size={14} color={cfg.color} />
              </View>
              {i < allEvents.length - 1 && <View style={det.timelineLine} />}
            </View>
            <View style={{ flex: 1, gap: 2, paddingBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: TEXT, lineHeight: 18 }}>{ev.summary}</Text>
              <Text style={{ fontSize: 11, color: MUTED }}>{fmtDateTime(ev.date)}</Text>
              {ev.type === 'note' && ev.meta?.content && (
                <Text style={{ fontSize: 12, color: MUTED, fontStyle: 'italic', lineHeight: 16 }} numberOfLines={2}>
                  "{ev.meta.content}"
                </Text>
              )}
            </View>
          </View>
        );
      })}
      {hasMore && (
        <Pressable
          onPress={() => { Haptics.selectionAsync(); loadMore(); }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderTopWidth: 1, borderTopColor: BORDER }}
        >
          {loadingMore
            ? <ActivityIndicator color={BLUE} size="small" />
            : <>
                <Feather name="chevrons-down" size={15} color={BLUE} />
                <Text style={{ color: BLUE, fontSize: 13, fontWeight: '600' }}>Load more</Text>
              </>
          }
        </Pressable>
      )}
    </View>
  );
}

// ── CRM Actions section ───────────────────────────────────────────────────────
function CrmActionsSection({ customerId, customerName, onRefresh }: {
  customerId: string; customerName: string; onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [notifyTitle, setNotifyTitle]   = useState('');
  const [notifyBody, setNotifyBody]     = useState('');
  const [sendingNotify, setSendingNotify] = useState(false);
  const [stampDelta, setStampDelta]     = useState('');
  const [stampReason, setStampReason]   = useState('');
  const [savingStamp, setSavingStamp]   = useState(false);

  const sendNotify = async () => {
    if (!notifyTitle.trim() || !notifyBody.trim()) { Alert.alert('Missing fields', 'Enter a title and message.'); return; }
    setSendingNotify(true);
    try {
      await api.director.customers.notify(customerId, notifyTitle.trim(), notifyBody.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotifyTitle(''); setNotifyBody('');
      Alert.alert('Sent!', 'Notification delivered to the customer\'s device.');
      qc.invalidateQueries({ queryKey: ['customer-timeline', customerId] });
    } catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setSendingNotify(false); }
  };

  const adjustStamps = async () => {
    const delta = parseInt(stampDelta, 10);
    if (!Number.isInteger(delta) || delta === 0) { Alert.alert('Invalid amount', 'Enter a non-zero number.'); return; }
    if (!stampReason.trim()) { Alert.alert('Missing reason', 'Please enter a reason for the adjustment.'); return; }
    setSavingStamp(true);
    try {
      const res = await api.director.customers.adjustStamps(customerId, delta, stampReason.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStampDelta(''); setStampReason('');
      Alert.alert('Done', `Coffee stamps updated. New total: ${res.newStampCount}`);
      onRefresh();
      qc.invalidateQueries({ queryKey: ['customer-timeline', customerId] });
    } catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setSavingStamp(false); }
  };

  return (
    <>
      <View style={[det.section, { borderBottomColor: BORDER }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Feather name="coffee" size={16} color={MUTED} />
          <Text style={det.sectionTitle}>Adjust Coffee Stamps</Text>
        </View>
        <Text style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
          Add or remove stamps. Positive = add, negative = remove.
        </Text>
        <View style={{ gap: 10 }}>
          <View>
            <Text style={det.fieldLabel}>Amount (e.g. +1 or -2)</Text>
            <TextInput
              style={det.input}
              placeholder="+1"
              placeholderTextColor={MUTED}
              value={stampDelta}
              onChangeText={setStampDelta}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View>
            <Text style={det.fieldLabel}>Reason (required)</Text>
            <TextInput
              style={det.input}
              placeholder="e.g. goodwill, data correction"
              placeholderTextColor={MUTED}
              value={stampReason}
              onChangeText={setStampReason}
            />
          </View>
          <Pressable
            onPress={adjustStamps}
            disabled={savingStamp || !stampDelta.trim() || !stampReason.trim()}
            style={[det.actionBtn, { backgroundColor: '#92400E', opacity: savingStamp || !stampDelta.trim() || !stampReason.trim() ? 0.5 : 1 }]}
          >
            {savingStamp ? <ActivityIndicator size="small" color="#fff" /> :
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Apply Adjustment</Text>}
          </Pressable>
        </View>
      </View>

      <View style={[det.section, { borderBottomColor: BORDER }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Feather name="bell" size={16} color={MUTED} />
          <Text style={det.sectionTitle}>Send Push Notification</Text>
        </View>
        <Text style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
          Send a targeted notification directly to {customerName.split(' ')[0]}'s device.
        </Text>
        <View style={{ gap: 10 }}>
          <View>
            <Text style={det.fieldLabel}>Title</Text>
            <TextInput
              style={det.input}
              placeholder="Notification title"
              placeholderTextColor={MUTED}
              value={notifyTitle}
              onChangeText={setNotifyTitle}
              maxLength={80}
            />
          </View>
          <View>
            <Text style={det.fieldLabel}>Message</Text>
            <TextInput
              style={[det.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]}
              placeholder="Write your message…"
              placeholderTextColor={MUTED}
              value={notifyBody}
              onChangeText={setNotifyBody}
              multiline
              maxLength={300}
            />
          </View>
          <Pressable
            onPress={sendNotify}
            disabled={sendingNotify || !notifyTitle.trim() || !notifyBody.trim()}
            style={[det.actionBtn, { backgroundColor: NAVY, opacity: sendingNotify || !notifyTitle.trim() || !notifyBody.trim() ? 0.5 : 1 }]}
          >
            {sendingNotify ? <ActivityIndicator size="small" color="#fff" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="send" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Send Notification</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </>
  );
}

// ── Customer detail modal ─────────────────────────────────────────────────────
export function CrmCustomerDetailModal({ customerId, onClose, onDelete }: {
  customerId: string; onClose: () => void; onDelete?: () => void;
}) {
  const insets  = useSafeAreaInsets();
  const qc      = useQueryClient();
  const [activeTab, setActiveTab]           = useState<'profile' | 'timeline' | 'actions'>('profile');
  const [noteText, setNoteText]             = useState('');
  const [isNoteComposerOpen, setIsNoteComposerOpen] = useState(false);
  const [isSavingNote, setIsSavingNote]     = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact]   = useState(false);
  const [eName, setEName]       = useState('');
  const [ePhone, setEPhone]     = useState('');
  const [eEmail, setEEmail]     = useState('');
  const [eBirthday, setEBirthday] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['customer-detail', customerId],
    queryFn:  () => api.director.customers.get(customerId),
  });

  type ExtDetail = CrmCustomerDetail & {
    loyaltyStats?: { totalEarnedPoints?: number; totalRedeemedPoints?: number } | null;
    loyaltyTransactions?: LoyaltyTransaction[] | null;
  };

  const customer: ExtDetail | undefined = data?.data as ExtDetail | undefined;

  const startEdit = (c: ExtDetail) => {
    setEName(c.name ?? ''); setEPhone(c.phone ?? '');
    setEEmail(c.email ?? ''); setEBirthday(isoToDdMmYyyy((c as any).profile?.birthday));
    setEditingContact(true);
  };

  const saveContact = async () => {
    setSavingContact(true);
    try {
      const birthdayISO = eBirthday.trim() ? ddMmYyyyToIso(eBirthday) : '';
      await api.director.customers.update(customerId, { name: eName.trim(), phone: ePhone.trim() || null, email: eEmail.trim(), birthday: birthdayISO });
      setEditingContact(false);
      refetch();
      qc.invalidateQueries({ queryKey: ['director-customers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setSavingContact(false); }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    setIsSavingNote(true);
    try {
      await api.director.customers.addNote(customerId, noteText.trim());
      setNoteText('');
      setIsNoteComposerOpen(false);
      refetch();
      qc.invalidateQueries({ queryKey: ['customer-timeline', customerId] });
    } catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setIsSavingNote(false); }
  };

  const deleteNote = (noteId: string) => {
    Alert.alert('Delete note', 'Remove this internal note?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.director.customers.deleteNote(customerId, noteId); refetch(); }
        catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'); }
      }},
    ]);
  };

  const addBadge = (badge: string) => {
    Alert.alert('Add tag', `Add "${BADGE_CFG[badge]?.label ?? badge}" tag?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add', onPress: async () => {
        try { await api.director.customers.addBadge(customerId, badge); refetch(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
        catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'); }
      }},
    ]);
  };

  const removeBadge = (badgeId: string, badge: string) => {
    Alert.alert('Remove tag', `Remove "${BADGE_CFG[badge]?.label ?? badge}" tag?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api.director.customers.deleteBadge(customerId, badgeId); refetch(); }
        catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'); }
      }},
    ]);
  };

  const tierCfg     = TIER_CFG[(customer as any)?.profile?.loyaltyTier ?? ''] ?? null;
  const allBadges   = customer?.badges ?? [];
  const defaultAddr = customer?.addresses?.find(a => a.isDefault) ?? customer?.addresses?.[0] ?? null;
  const orderStats  = (customer as any)?.orderStats;
  const topProducts = (orderStats?.topProducts ?? []).slice(0, 3) as { name: string; qty: number }[];
  const pickupCount   = orderStats?.pickupCount ?? 0;
  const deliveryCount = orderStats?.deliveryCount ?? 0;
  const totalOrders   = pickupCount + deliveryCount;
  const preferDelivery = deliveryCount > pickupCount;
  const wa = customer?.wholesaleAccount ?? null;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={[det.header, { paddingTop: insets.top > 0 ? insets.top + 4 : 20 }]}>
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
              { text: 'Edit contact info', onPress: () => customer && startEdit(customer) },
              { text: 'Delete account', style: 'destructive', onPress: () =>
                Alert.alert('Delete Customer', `Permanently delete ${customer.name}?\n\nThis cannot be undone.`, [
                  { text: 'Delete', style: 'destructive', onPress: async () => {
                    try {
                      await api.director.deleteUser(customerId);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      onClose(); onDelete?.();
                    } catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'); }
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

        <View style={det.tabBar}>
          {([
            { key: 'profile',  label: 'Profile'  },
            { key: 'timeline', label: 'Timeline' },
            { key: 'actions',  label: 'Actions'  },
          ] as const).map(tab => (
            <Pressable
              key={tab.key}
              onPress={() => { Haptics.selectionAsync(); setActiveTab(tab.key); }}
              style={[det.tab, activeTab === tab.key && det.tabActive]}
            >
              <Text style={[det.tabText, activeTab === tab.key && det.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={BLUE} size="large" />
          </View>
        ) : !customer ? (
          <Text style={{ color: MUTED, padding: 20 }}>Customer not found.</Text>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >

            {activeTab === 'profile' && (
              <>
                <View style={[det.heroSection, { borderBottomColor: BORDER }]}>
                  <View style={det.heroAvatarRow}>
                    {customer.profileImage ? (
                      <Image source={{ uri: customer.profileImage }} style={det.heroAvatarImage} contentFit="cover" />
                    ) : (
                      <View style={det.heroAvatarFallback}>
                        <Text style={det.heroAvatarText}>{initials(customer.name)}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={det.heroName}>{customer.name}</Text>
                  <Text style={det.heroSub}>
                    Since {fmtDate(customer.createdAt)}
                    {defaultAddr ? ` · ${defaultAddr.suburb} ${defaultAddr.state}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {tierCfg && <View style={[det.tag, { backgroundColor: tierCfg.bg }]}><Text style={[det.tagTx, { color: tierCfg.color }]}>{tierCfg.label} tier</Text></View>}
                    {customer.status !== 'active' && <View style={[det.tag, { backgroundColor: '#FEE2E2' }]}><Text style={[det.tagTx, { color: RED }]}>{customer.status}</Text></View>}
                  </View>
                </View>

                <View style={[det.section, { borderBottomColor: BORDER }]}>
                  <Text style={det.sectionTitle}>Contact</Text>
                  {(() => {
                    const profileComplete = !!(customer.name && customer.phone && (customer as any).addresses?.length > 0);
                    return [
                      { label: 'Email',        value: customer.email ?? '—', highlight: null },
                      { label: 'Profile',      value: profileComplete ? '✓ Verified' : '○ Incomplete profile', highlight: profileComplete ? GREEN : MUTED },
                      { label: 'Phone',        value: customer.phone ?? '—', highlight: null },
                      { label: 'Account status', value: customer.status ?? 'active', highlight: null },
                    ].map((r, i, arr) => (
                      <View key={r.label} style={[det.infoRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                        <Text style={det.infoLabel}>{r.label}</Text>
                        <Text style={[det.infoValue, r.highlight ? { color: r.highlight } : undefined]}>{r.value}</Text>
                      </View>
                    ));
                  })()}
                </View>

                <View style={[det.section, { borderBottomColor: BORDER }]}>
                  <Text style={det.sectionTitle}>Insights</Text>
                  {[
                    { label: 'Total spend',     value: fmtAUD(orderStats?.totalSpentCents ?? 0) },
                    { label: 'Last order',      value: orderStats?.lastOrderAt ? fmtDate(orderStats.lastOrderAt) : 'Never' },
                    { label: 'Total orders',    value: String(orderStats?.orderCount ?? 0) },
                    { label: 'Avg order',       value: orderStats?.avgOrderCents ? fmtAUD(orderStats.avgOrderCents) : '—' },
                    { label: 'Loyalty points',  value: String((customer as any).profile?.loyaltyPoints ?? 0) },
                    { label: 'Coffee stamps',   value: `${(customer as any).profile?.coffeeStampCount ?? (customer as any).profile?.stampCount ?? 0} / 6` },
                    { label: 'Preference',      value: totalOrders === 0 ? 'No orders yet' : preferDelivery ? `Delivery (${deliveryCount}/${totalOrders})` : `Pickup (${pickupCount}/${totalOrders})` },
                  ].map((r, i, arr) => (
                    <View key={r.label} style={[det.infoRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                      <Text style={det.infoLabel}>{r.label}</Text>
                      <Text style={det.infoValue}>{r.value}</Text>
                    </View>
                  ))}
                </View>

                {topProducts.length > 0 && (
                  <View style={[det.section, { borderBottomColor: BORDER }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Feather name="heart" size={16} color={MUTED} />
                      <Text style={det.sectionTitle}>Favourite Products</Text>
                    </View>
                    {topProducts.map((p, i) => (
                      <View key={p.name} style={[det.infoRow, i < topProducts.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: BLUE }}>{i + 1}</Text>
                          </View>
                          <Text style={det.infoLabel}>{p.name}</Text>
                        </View>
                        <Text style={det.infoValue}>×{p.qty}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {wa && (() => {
                  const wsStats = (wa as any).orderStats ?? null;
                  const creditEnabled = (wa as any).creditEnabled ?? false;
                  const creditLimitCents = (wa as any).creditLimitCents ?? 0;
                  const currentBalanceCents = (wa as any).currentBalanceCents ?? 0;
                  const pendingInvoiceCents = wsStats?.pendingInvoiceCents ?? 0;
                  const mgr = (wa as any).accountManager ?? null;
                  const mgrPhone = (wa as any).accountManagerPhone ?? null;
                  const mgrEmail = (wa as any).accountManagerEmail ?? null;
                  const wsRows = [
                    { label: 'Company',        value: (wa as any).companyName },
                    { label: 'ABN',            value: (wa as any).abn ?? null },
                    { label: 'Status',         value: (wa as any).status ? ((wa as any).status.charAt(0).toUpperCase() + (wa as any).status.slice(1)) : null },
                    { label: 'Pricing tier',   value: (wa as any).pricingTier ?? null },
                    { label: 'Payment terms',  value: (wa as any).paymentTerms ?? null },
                    wsStats ? { label: 'Wholesale orders', value: String(wsStats.orderCount) } : null,
                    wsStats?.lastOrderAt ? { label: 'Last ws order', value: fmtDate(wsStats.lastOrderAt) } : null,
                    wsStats ? { label: 'Ws total (ex-GST)', value: fmtAUD(wsStats.totalValueCents) } : null,
                    pendingInvoiceCents > 0 ? { label: 'Outstanding invoices', value: fmtAUD(pendingInvoiceCents) } : null,
                    creditEnabled && creditLimitCents > 0 ? { label: 'Credit limit', value: fmtAUD(creditLimitCents) } : null,
                    creditEnabled && creditLimitCents > 0 ? { label: 'Credit used',  value: fmtAUD(currentBalanceCents) } : null,
                  ].filter(Boolean) as { label: string; value: string | null }[];

                  return (
                    <View style={[det.section, { borderBottomColor: BORDER }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Feather name="briefcase" size={16} color={GREEN} />
                        <Text style={det.sectionTitle}>Wholesale Account</Text>
                      </View>
                      {wsRows.map((r, i) => r?.value ? (
                        <View key={r.label} style={[det.infoRow, i < wsRows.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                          <Text style={det.infoLabel}>{r.label}</Text>
                          <Text style={[det.infoValue, r.label === 'Outstanding invoices' && { color: RED }]}>{r.value}</Text>
                        </View>
                      ) : null)}
                      {(mgr || mgrPhone || mgrEmail) && (
                        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER }}>
                          <Text style={[det.infoLabel, { marginBottom: 8 }]}>Account Manager</Text>
                          {mgr && <Text style={{ fontSize: 13, fontWeight: '600', color: TEXT, marginBottom: 4 }}>{mgr}</Text>}
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            {mgrPhone && (
                              <Pressable onPress={() => Linking.openURL(`tel:${mgrPhone.replace(/\s/g,'')}`)} style={det.contactBtn}>
                                <Feather name="phone" size={13} color={BLUE} />
                                <Text style={{ color: BLUE, fontSize: 12, fontWeight: '600' }}>Call</Text>
                              </Pressable>
                            )}
                            {mgrEmail && (
                              <Pressable onPress={() => Linking.openURL(`mailto:${mgrEmail}`)} style={det.contactBtn}>
                                <Feather name="mail" size={13} color={BLUE} />
                                <Text style={{ color: BLUE, fontSize: 12, fontWeight: '600' }}>Email</Text>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })()}

                <View style={[det.section, { borderBottomColor: BORDER }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Text style={det.sectionTitle}>Tags</Text>
                    <Pressable
                      onPress={() => Alert.alert('Add tag', 'Select a tag to add', [
                        ...ALL_MANUAL_BADGES.filter(b => !allBadges.some((ab: any) => (ab.badge ?? ab) === b)).map(b => ({
                          text: BADGE_CFG[b]?.label ?? b,
                          onPress: () => addBadge(b),
                        })),
                        { text: 'Cancel', style: 'cancel' as const },
                      ])}
                      style={[det.contactBtn, { paddingHorizontal: 10 }]}
                    >
                      <Feather name="plus" size={13} color={BLUE} />
                      <Text style={{ color: BLUE, fontSize: 12, fontWeight: '600' }}>Add tag</Text>
                    </Pressable>
                  </View>
                  {allBadges.length === 0 ? (
                    <Text style={{ color: MUTED, fontSize: 13 }}>No tags yet</Text>
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {allBadges.map((b: any) => {
                        const badge = b.badge ?? b;
                        const cfg = BADGE_CFG[badge];
                        if (!cfg) return null;
                        return (
                          <Pressable
                            key={b.id ?? badge}
                            onLongPress={() => b.id && removeBadge(b.id, badge)}
                            style={[det.tag, { backgroundColor: cfg.bg }]}
                          >
                            <Text style={[det.tagTx, { color: cfg.text }]}>{cfg.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>

                <View style={[det.section, { borderBottomColor: BORDER }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Feather name="shield" size={16} color={MUTED} />
                    <Text style={det.sectionTitle}>Permissions</Text>
                  </View>
                  <View style={[det.infoRow, { alignItems: 'center' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={det.infoLabel}>Pay at pickup</Text>
                      <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>Allow this customer to pay in store on arrival</Text>
                    </View>
                    <Switch
                      value={Boolean((customer as any)?.profile?.payAtPickupEnabled)}
                      onValueChange={async (val) => {
                        try {
                          await api.director.customers.update(customerId, { payAtPickupEnabled: val });
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          refetch();
                        } catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Could not update permission'); }
                      }}
                      trackColor={{ false: BORDER, true: BLUE }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>

                <View style={[det.section, { borderBottomColor: BORDER }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Text style={det.sectionTitle}>Notes</Text>
                    <Pressable onPress={() => setIsNoteComposerOpen(n => !n)} style={[det.contactBtn, { paddingHorizontal: 10 }]}>
                      <Feather name="edit-2" size={13} color={BLUE} />
                      <Text style={{ color: BLUE, fontSize: 12, fontWeight: '600' }}>Add note</Text>
                    </Pressable>
                  </View>
                  {isNoteComposerOpen && (
                    <View style={{ gap: 8, marginBottom: 12 }}>
                      <TextInput
                        style={[det.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                        placeholder="Write your note…"
                        placeholderTextColor={MUTED}
                        value={noteText}
                        onChangeText={setNoteText}
                        multiline
                        autoFocus
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable onPress={() => { setIsNoteComposerOpen(false); setNoteText(''); }} style={[det.contactBtn, { flex: 1, justifyContent: 'center' }]}>
                          <Text style={{ color: MUTED, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={addNote}
                          disabled={isSavingNote || !noteText.trim()}
                          style={[det.actionBtn, { flex: 2, opacity: isSavingNote || !noteText.trim() ? 0.5 : 1, paddingVertical: 10 }]}
                        >
                          {isSavingNote ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Save Note</Text>}
                        </Pressable>
                      </View>
                    </View>
                  )}
                  {(customer.notes?.length ?? 0) === 0 && !isNoteComposerOpen ? (
                    <Text style={{ color: MUTED, fontSize: 13 }}>No internal notes yet</Text>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {(customer.notes ?? []).map((n: any) => (
                        <View key={n.id} style={{ backgroundColor: '#FAFAFA', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: BORDER }}>
                          <Text style={{ fontSize: 13, color: TEXT, lineHeight: 18 }}>{n.content}</Text>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                            <Text style={{ fontSize: 11, color: MUTED }}>{fmtDateTime(n.createdAt)}</Text>
                            <Pressable onPress={() => deleteNote(n.id)}>
                              <Feather name="trash-2" size={13} color={RED} />
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {editingContact && (
                  <View style={[det.section, { borderBottomColor: BORDER }]}>
                    <Text style={det.sectionTitle}>Edit Contact Info</Text>
                    <View style={{ gap: 10, marginTop: 12 }}>
                      {[
                        { label: 'Name', value: eName, setter: setEName, kb: 'default' as const },
                        { label: 'Email', value: eEmail, setter: setEEmail, kb: 'email-address' as const },
                        { label: 'Phone', value: ePhone, setter: setEPhone, kb: 'phone-pad' as const },
                      ].map(f => (
                        <View key={f.label}>
                          <Text style={[det.fieldLabel, { marginBottom: 4 }]}>{f.label}</Text>
                          <TextInput style={det.input} value={f.value} onChangeText={f.setter} keyboardType={f.kb} placeholderTextColor={MUTED} autoCapitalize="none" />
                        </View>
                      ))}
                      <View>
                        <Text style={[det.fieldLabel, { marginBottom: 4 }]}>Birthday (DD/MM/YYYY)</Text>
                        <TextInput
                          style={det.input}
                          value={eBirthday}
                          onChangeText={v => setEBirthday(autoFormatBd(v))}
                          placeholder="DD/MM/YYYY"
                          placeholderTextColor={MUTED}
                          keyboardType="numeric"
                          maxLength={10}
                        />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable onPress={() => setEditingContact(false)} style={[det.contactBtn, { flex: 1, justifyContent: 'center' }]}>
                          <Text style={{ color: MUTED, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
                        </Pressable>
                        <Pressable onPress={saveContact} disabled={savingContact} style={[det.actionBtn, { flex: 2 }]}>
                          {savingContact ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Save</Text>}
                        </Pressable>
                      </View>
                    </View>
                  </View>
                )}
              </>
            )}

            {activeTab === 'timeline' && (
              <View style={{ padding: 16 }}>
                <TimelineSection customerId={customerId} />
              </View>
            )}

            {activeTab === 'actions' && (
              <CrmActionsSection
                customerId={customerId}
                customerName={customer?.name ?? 'Customer'}
                onRefresh={() => refetch()}
              />
            )}
          </ScrollView>
        )}
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Customer row ───────────────────────────────────────────────────────────────
function CustomerRow({ item, onPress, isLast }: { item: CrmCustomer; onPress: () => void; isLast: boolean }) {
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={[row.wrap, !isLast && row.border]}
    >
      {item.profileImage ? (
        <Image source={{ uri: item.profileImage }} style={row.avatarImage} contentFit="cover" />
      ) : (
        <View style={row.avatarFallback}>
          <Text style={row.avatarText}>{initials(item.name)}</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={row.name}>{item.name}</Text>
        <Text style={row.meta}>{item.email}</Text>
        <Text style={row.meta}>
          {fmtAUD(item.totalSpentCents)}
          <Text style={{ color: MUTED }}> · </Text>
          {item.orderCount} {item.orderCount === 1 ? 'order' : 'orders'}
          {item.lastOrderAt ? <Text style={{ color: MUTED }}> · last {fmtDate(item.lastOrderAt)}</Text> : null}
        </Text>
        {item.badges.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
            {item.badges.slice(0, 3).map(b => {
              const cfg = BADGE_CFG[b];
              if (!cfg) return null;
              return (
                <View key={b} style={{ backgroundColor: cfg.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: cfg.text }}>{cfg.label}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
      <Feather name="chevron-right" size={16} color={MUTED} />
    </Pressable>
  );
}

// ── Filter panel ──────────────────────────────────────────────────────────────
type DatePreset = '' | '7d' | '30d' | '90d';
type SpendPreset = '' | '50' | '200' | '500';
type OrderPreset = '' | '1' | '5' | '10';
type LastOrderPreset = '' | 'active7' | 'active30' | 'inactive30';

export interface CrmFilterState {
  dateFrom?: string; dateTo?: string;
  minSpendCents?: number; maxSpendCents?: number;
  minOrders?: number; maxOrders?: number;
  lastOrderFrom?: string; lastOrderTo?: string;
  searchOrders?: string;
}

function FilterPanel({ visible, onClose, onApply }: {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: CrmFilterState) => void;
}) {
  const insets = useSafeAreaInsets();
  const [datePreset, setDatePreset]           = useState<DatePreset>('');
  const [spendPreset, setSpendPreset]         = useState<SpendPreset>('');
  const [orderPreset, setOrderPreset]         = useState<OrderPreset>('');
  const [lastOrderPreset, setLastOrderPreset] = useState<LastOrderPreset>('');
  const [searchOrders, setSearchOrders]       = useState('');

  const anyActive = !!(datePreset || spendPreset || orderPreset || lastOrderPreset || searchOrders.trim());

  const apply = () => {
    const dateRange = (() => {
      if (!datePreset) return {};
      const days = datePreset === '7d' ? 7 : datePreset === '30d' ? 30 : 90;
      const from = new Date(Date.now() - days * 86400000);
      return { dateFrom: from.toISOString().slice(0, 10) };
    })();
    const spendMin = spendPreset ? parseInt(spendPreset, 10) * 100 : undefined;
    const orderMin = orderPreset ? parseInt(orderPreset, 10) : undefined;
    const lastRange = (() => {
      if (!lastOrderPreset) return {};
      const now = new Date();
      if (lastOrderPreset === 'active7')    return { lastOrderFrom: new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10) };
      if (lastOrderPreset === 'active30')   return { lastOrderFrom: new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10) };
      if (lastOrderPreset === 'inactive30') return { lastOrderTo:   new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10) };
      return {};
    })();
    onApply({ ...dateRange, minSpendCents: spendMin, minOrders: orderMin, ...lastRange, searchOrders: searchOrders.trim() || undefined });
    onClose();
  };

  const clear = () => { setDatePreset(''); setSpendPreset(''); setOrderPreset(''); setLastOrderPreset(''); setSearchOrders(''); };

  const chipRow = (label: string, options: { key: string; label: string }[], value: string, set: (v: any) => void) => (
    <View style={{ marginBottom: 18 }}>
      <Text style={fp.filterLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        {options.map(o => (
          <Pressable key={o.key} onPress={() => { Haptics.selectionAsync(); set(value === o.key ? '' : o.key as any); }}
            style={[fp.chip, value === o.key && fp.chipActive]}>
            <Text style={[fp.chipText, value === o.key && fp.chipTextActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={[fp.header, { paddingTop: insets.top > 0 ? insets.top + 4 : 20 }]}>
          <Pressable onPress={onClose} style={det.headerBtn} hitSlop={10}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={fp.title}>Filters</Text>
          <Pressable onPress={clear} hitSlop={10} style={{ paddingHorizontal: 4 }}>
            <Text style={{ color: anyActive ? RED : MUTED, fontWeight: '600', fontSize: 14 }}>Clear</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {chipRow('Joined', [
            { key: '7d', label: 'Last 7 days' },
            { key: '30d', label: 'Last 30 days' },
            { key: '90d', label: 'Last 90 days' },
          ], datePreset, setDatePreset)}
          {chipRow('Min Total Spend', [
            { key: '50',  label: '$50+' },
            { key: '200', label: '$200+' },
            { key: '500', label: '$500+' },
          ], spendPreset, setSpendPreset)}
          {chipRow('Min Order Count', [
            { key: '1',  label: '1+ orders' },
            { key: '5',  label: '5+ orders' },
            { key: '10', label: '10+ orders' },
          ], orderPreset, setOrderPreset)}
          {chipRow('Last Order', [
            { key: 'active7',    label: 'Active in 7d' },
            { key: 'active30',   label: 'Active in 30d' },
            { key: 'inactive30', label: 'No order 30d+' },
          ], lastOrderPreset, setLastOrderPreset)}
          <View style={{ marginBottom: 18 }}>
            <Text style={fp.filterLabel}>Search Order History</Text>
            <TextInput
              style={[det.input, { marginTop: 6, borderColor: BORDER }]}
              placeholder="e.g. Flat White, Classic Cookie"
              placeholderTextColor={MUTED}
              value={searchOrders}
              onChangeText={setSearchOrders}
              autoCapitalize="none"
            />
          </View>
        </ScrollView>
        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: CARD }}>
          <Pressable onPress={apply} style={[det.actionBtn, { backgroundColor: NAVY }]}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Apply Filters</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── CRM Insights strip ────────────────────────────────────────────────────────
function InsightsStrip({ insights }: { insights: CrmInsights | null }) {
  if (!insights) return null;
  const metrics = [
    { label: 'Total',    value: insights.totalCustomers ?? 0,   color: BLUE   },
    { label: 'New',      value: insights.newThisMonth ?? 0,     color: GREEN  },
    { label: 'Repeat',   value: insights.repeatCustomers ?? 0,  color: PURPLE },
    { label: 'Inactive', value: insights.inactiveCount ?? 0,    color: RED    },
  ];
  const topSpenders = (insights.topSpenders ?? []).slice(0, 5);
  return (
    <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
      <View style={{ flexDirection: 'row' }}>
        {metrics.map((m, i) => (
          <View key={m.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: BORDER }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: m.color }}>{m.value}</Text>
            <Text style={{ fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</Text>
          </View>
        ))}
      </View>
      {topSpenders.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: BORDER }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingVertical: 8, gap: 6 }}>
            <Feather name="trending-up" size={13} color={AMBER} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: AMBER, textTransform: 'uppercase', letterSpacing: 0.4 }}>Top spenders:</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 8 }}>
            {topSpenders.map((s, i) => (
              <View key={s.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {i > 0 && <Text style={{ color: BORDER, fontSize: 11 }}>·</Text>}
                <Text style={{ fontSize: 11, color: TEXT, fontWeight: '600' }}>{s.name}</Text>
                <Text style={{ fontSize: 11, color: MUTED }}>({fmtAUD(s.totalSpentCents)})</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ── Main Customers tab ─────────────────────────────────────────────────────────
export function CrmCustomersTab() {
  const [search, setSearch]             = useState('');
  const [segment, setSegment]           = useState('');
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [refreshing, setRefreshing]     = useState(false);
  const [showFilters, setShowFilters]   = useState(false);
  const [filters, setFilters]           = useState<CrmFilterState>({});
  const [showSearch, setShowSearch]     = useState(false);
  const [showSegments, setShowSegments] = useState(false);

  const activeFilterCount = Object.values(filters).filter(v => v !== undefined && v !== '').length;
  const hasActiveFilter   = !!(search || segment || activeFilterCount > 0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-customers', search, segment, filters],
    queryFn:  () => api.director.customers.list({ search, segment: segment || undefined, ...filters }),
    staleTime: 30_000,
  });

  const { data: insightsData } = useQuery({
    queryKey: ['crm-insights'],
    queryFn:  () => api.director.customers.insights(),
    staleTime: 120_000,
  });

  const customers: CrmCustomer[] = data?.data ?? [];
  const insights: CrmInsights | null = (insightsData?.data as any) ?? null;
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  return (
    <View style={{ flex: 1 }}>
      <InsightsStrip insights={insights} />

      <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        {/* Compact 3-button toolbar */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 9, gap: 8 }}>
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setShowSearch(s => !s); }}
            style={[scr.toolBtn, (showSearch || search.length > 0) && scr.toolBtnActive]}
          >
            <Feather name="search" size={14} color={(showSearch || search.length > 0) ? '#fff' : MUTED} />
            <Text style={[scr.toolBtnText, (showSearch || search.length > 0) && scr.toolBtnTextActive]}>Search</Text>
          </Pressable>
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setShowSegments(s => !s); }}
            style={[scr.toolBtn, (showSegments || !!segment) && scr.toolBtnActive]}
          >
            <Feather name="layers" size={14} color={(showSegments || !!segment) ? '#fff' : MUTED} />
            <Text style={[scr.toolBtnText, (showSegments || !!segment) && scr.toolBtnTextActive]}>
              {segment ? (SEGMENT_LABEL[segment] ?? 'Segment') : 'Segments'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowFilters(true); }}
            style={[scr.toolBtn, activeFilterCount > 0 && scr.toolBtnActive]}
          >
            <Feather name="sliders" size={14} color={activeFilterCount > 0 ? '#fff' : MUTED} />
            <Text style={[scr.toolBtnText, activeFilterCount > 0 && scr.toolBtnTextActive]}>
              {activeFilterCount > 0 ? `Filter · ${activeFilterCount}` : 'Filter'}
            </Text>
          </Pressable>
        </View>

        {/* Expandable search input */}
        {showSearch && (
          <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
            <View style={[scr.searchInput, { borderColor: BORDER }]}>
              <Feather name="search" size={16} color={MUTED} />
              <TextInput
                style={{ flex: 1, fontSize: 15, color: TEXT }}
                placeholder="Search name, email, phone…"
                placeholderTextColor={MUTED}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoFocus
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')}>
                  <Feather name="x-circle" size={16} color={MUTED} />
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Expandable segment chips */}
        {showSegments && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 10, gap: 8, flexDirection: 'row' }}>
            {SEGMENT_CHIPS.map(chip => (
              <Pressable
                key={chip.key}
                onPress={() => { Haptics.selectionAsync(); setSegment(chip.key); if (chip.key) setShowSegments(false); }}
                style={[scr.chip, segment === chip.key && scr.chipActive]}
              >
                <Text style={[scr.chipText, segment === chip.key && scr.chipTextActive]}>{chip.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
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
              <Text style={{ color: MUTED, fontSize: 15 }}>
                {hasActiveFilter ? 'No customers match your filters.' : 'No customers yet.'}
              </Text>
              {hasActiveFilter && (
                <Pressable onPress={() => { setSearch(''); setSegment(''); setFilters({}); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Feather name="x-circle" size={15} color={BLUE} />
                  <Text style={{ color: BLUE, fontSize: 13, fontWeight: '600' }}>Clear all filters</Text>
                </Pressable>
              )}
            </View>
          }
          ListHeaderComponent={
            customers.length > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: MUTED, fontWeight: '500' }}>
                  {customers.length} customer{customers.length !== 1 ? 's' : ''}
                  {segment ? ` · ${SEGMENT_LABEL[segment] ?? segment}` : ''}
                </Text>
                {hasActiveFilter && (
                  <Pressable onPress={() => { setSearch(''); setSegment(''); setFilters({}); }} hitSlop={8}>
                    <Text style={{ fontSize: 12, color: RED, fontWeight: '600' }}>Clear</Text>
                  </Pressable>
                )}
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <CustomerRow
              item={item}
              onPress={() => setSelectedId(item.id)}
              isLast={index === customers.length - 1}
            />
          )}
        />
      )}

      <FilterPanel
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        onApply={(f) => setFilters(f)}
      />

      {selectedId && (
        <CrmCustomerDetailModal
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
          onDelete={() => { setSelectedId(null); refetch(); }}
        />
      )}
    </View>
  );
}

const row = StyleSheet.create({
  wrap:           { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD },
  border:         { borderBottomWidth: 1, borderBottomColor: BORDER },
  avatarImage:    { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF3FF' },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center' },
  avatarText:     { fontSize: 15, fontWeight: '700', color: BLUE },
  name:           { fontSize: 15, fontWeight: '700', color: TEXT },
  meta:           { fontSize: 12, color: MUTED },
});

const scr = StyleSheet.create({
  searchBar:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42 },
  filterBtn:      { width: 44, height: 44, borderRadius: 12, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  filterBadge:    { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  toolBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 36, borderRadius: 10, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  toolBtnActive:  { backgroundColor: NAVY, borderColor: NAVY },
  toolBtnText:    { fontSize: 13, fontWeight: '600', color: MUTED },
  toolBtnTextActive: { color: '#fff' },
  chip:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  chipActive:  { backgroundColor: BLUE, borderColor: BLUE },
  chipText:    { fontSize: 13, fontWeight: '600', color: MUTED },
  chipTextActive: { color: '#fff' },
});

const fp = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD },
  title:       { fontSize: 16, fontWeight: '700', color: TEXT },
  filterLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  chip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  chipActive:  { backgroundColor: NAVY, borderColor: NAVY },
  chipText:    { fontSize: 13, fontWeight: '600', color: MUTED },
  chipTextActive: { color: '#fff' },
});

const det = StyleSheet.create({
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD },
  headerBtn:          { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  headerTitle:        { fontSize: 16, fontWeight: '700', color: TEXT },
  tabBar:             { flexDirection: 'row', backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, paddingHorizontal: 8 },
  tab:                { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:          { borderBottomColor: BLUE },
  tabText:            { fontSize: 13, fontWeight: '600', color: MUTED },
  tabTextActive:      { color: BLUE },
  heroSection:        { backgroundColor: CARD, paddingHorizontal: 20, paddingVertical: 24, alignItems: 'center', borderBottomWidth: 1, gap: 4 },
  heroAvatarRow:      { marginBottom: 12 },
  heroAvatarImage:    { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EAF3FF' },
  heroAvatarFallback: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center' },
  heroAvatarText:     { fontSize: 28, fontWeight: '700', color: BLUE },
  heroName:           { fontSize: 22, fontWeight: '700', color: TEXT },
  heroSub:            { fontSize: 13, color: MUTED },
  tag:                { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagTx:              { fontSize: 12, fontWeight: '600' },
  section:            { backgroundColor: CARD, marginTop: 8, paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1 },
  sectionTitle:       { fontSize: 15, fontWeight: '700', color: TEXT, marginBottom: 12 },
  infoRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  infoLabel:          { fontSize: 13, color: MUTED, flex: 1 },
  infoValue:          { fontSize: 13, color: TEXT, fontWeight: '600', textAlign: 'right', maxWidth: '55%' },
  timelineRow:        { flexDirection: 'row', gap: 12, paddingTop: 16, paddingHorizontal: 16 },
  timelineIcon:       { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  timelineLine:       { width: 2, flex: 1, backgroundColor: BORDER, marginTop: 4, minHeight: 16, alignSelf: 'center' },
  fieldLabel:         { fontSize: 12, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  input:              { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT },
  actionBtn:          { backgroundColor: NAVY, borderRadius: 12, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  contactBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: '#EAF3FF' },
});
