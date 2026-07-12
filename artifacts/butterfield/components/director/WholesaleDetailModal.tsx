import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal,
  Platform, Pressable, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AddressSearchInput } from '@/components/AddressSearchInput';
import type { DirectorUserSummary, PricingTier, WholesaleAccount, WholesaleCard } from '@/lib/api';
import { wdl, modal } from '@/components/director/usersStyles';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER      = '#E5E7EB';
const GLASS_BG    = 'rgba(255,255,255,0.6)';
const GLASS_BORDER= 'rgba(255,255,255,0.85)';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function fmtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' });
  const time = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' });
  return `${date} at ${time}`;
}

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  return error instanceof Error ? error.message : fallback;
}

const BRAND_BG: Record<string, string> = {
  Visa: '#1A3A8C', Mastercard: '#8C1B1B', Amex: '#1B5C8C',
};
function WholesaleDetailModal({ user, wa, visible, onClose, onRefresh, onDelete }: {
  user: DirectorUserSummary | null; wa: WholesaleAccount | null; visible: boolean; onClose: () => void; onRefresh: () => void; onDelete: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [bizCompany, setBizCompany]         = useState('');
  const [bizAbn, setBizAbn]                 = useState('');
  const [bizContact, setBizContact]         = useState('');
  const [bizPhone, setBizPhone]             = useState('');
  const [bizEmail, setBizEmail]             = useState('');
  const [selectedTierId, setSelectedTierId]  = useState<string | null>(null);
  const [bizHours, setBizHours]             = useState('');
  const [creditEnabled, setCreditEnabled]   = useState(false);
  const [creditAud, setCreditAud]           = useState('');
  const [creditNotes, setCreditNotes]       = useState('');
  const [payTerms, setPayTerms]             = useState('');
  const [deliveryAddr, setDeliveryAddr]     = useState('');
  const [deliveryFeeAud, setDeliveryFeeAud] = useState('');
  const [minOrderAud, setMinOrderAud]       = useState('');
  const [accountMgrName, setAccountMgrName] = useState('');
  const [accountMgrPhone, setAccountMgrPhone] = useState('');
  const [accountMgrEmail, setAccountMgrEmail] = useState('');
  const [acctEmail, setAcctEmail]           = useState('');
  const [suspended, setSuspended]           = useState(false);
  const [suspendReason, setSuspendReason]   = useState('');
  const [saving, setSaving]                 = useState(false);
  const [editMode, setEditMode]             = useState(false);
  const [localStatus, setLocalStatus]       = useState(wa?.status ?? 'pending');
  const { data: cardsData, isLoading: cardsLoading, refetch: refetchCards } = useQuery({
    queryKey: ['director-ws-cards', wa?.id],
    queryFn: () => api.director.wholesaleCards(wa!.id),
    enabled: visible && !!wa?.id,
  });
  const cards: WholesaleCard[] = cardsData?.data ?? [];

  const { data: tiersData } = useQuery({
    queryKey: ['director-tiers'],
    queryFn: () => api.director.tiers(),
    enabled: visible,
    staleTime: 60_000,
  });
  const tiers: PricingTier[] = tiersData?.data ?? [];
  useEffect(() => {
    if (wa) {
      setBizCompany(wa.companyName ?? '');
      setBizAbn(wa.abn ?? '');
      setBizContact(wa.contactName ?? user?.name ?? '');
      setBizPhone(wa.phone ?? (user as any)?.phone ?? '');
      setBizEmail(wa.email ?? user?.email ?? '');
      setSelectedTierId(wa.tierId ?? null);
      setBizHours(wa.businessHours ?? '');
      setCreditEnabled(wa.creditEnabled ?? false);
      setCreditAud(wa.creditLimitCents ? String(wa.creditLimitCents / 100) : '');
      setCreditNotes(wa.creditNotes ?? '');
      setPayTerms(wa.paymentTerms ?? '');
      setDeliveryAddr(wa.deliveryAddress ?? '');
      setDeliveryFeeAud(wa.deliveryFeeCents ? String(wa.deliveryFeeCents / 100) : '');
      setMinOrderAud((wa.minimumOrderCents ?? wa.minOrderCents) ? String((wa.minimumOrderCents ?? wa.minOrderCents ?? 0) / 100) : '');
      setAccountMgrName(wa.accountManager ?? '');
      setAccountMgrPhone(wa.accountManagerPhone ?? '');
      setAccountMgrEmail(wa.accountManagerEmail ?? '');
      setAcctEmail(wa.accountsEmail ?? '');
      setSuspended(wa.isSuspended ?? false);
      setSuspendReason(wa.suspendedReason ?? '');
      setLocalStatus(wa.status ?? 'pending');
      setEditMode(false);
    }
  }, [wa]);
  if (!wa || !user) return null;
  const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
    approved: { color: GREEN,  bg: '#DCFCE7', label: 'Approved' },
    pending:  { color: AMBER,  bg: '#FEF3C7', label: 'Pending' },
    rejected: { color: RED,    bg: '#FEE2E2', label: 'Rejected' },
  };
  const cfg = STATUS_CFG[localStatus] ?? STATUS_CFG.pending;
  const handleStatus = async (status: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const prev = localStatus;
    setLocalStatus(status);
    try {
      await api.director.setWholesaleStatus(wa.id, status);
      onRefresh();
    } catch (error) {
      setLocalStatus(prev);
      Alert.alert('Error', getErrorMessage(error));
    }
  };
  const handleSuspend = async (val: boolean) => {
    setSuspended(val);
    try {
      await api.director.suspendWholesale(wa.id, { isSuspended: val, suspendedReason: val ? suspendReason : undefined });
    } catch (error) { Alert.alert('Error', getErrorMessage(error)); setSuspended(!val); }
  };
  const handleSave = async () => {
    setSaving(true);
    try {
      const creditCents   = creditAud       ? Math.round(parseFloat(creditAud)       * 100) : 0;
      const deliveryCents = deliveryFeeAud  ? Math.round(parseFloat(deliveryFeeAud)  * 100) : 0;
      const minOrderCents = minOrderAud     ? Math.round(parseFloat(minOrderAud)     * 100) : undefined;
      await api.director.updateWholesale(wa.id, {
        companyName:         bizCompany.trim()  || null,
        abn:                 bizAbn.trim()      || null,
        contactName:         bizContact.trim()  || null,
        phone:               bizPhone.trim()    || null,
        email:               bizEmail.trim()    || null,
        businessHours:       bizHours.trim()    || null,
        creditEnabled,
        creditLimitCents:    isNaN(creditCents) ? 0 : creditCents,
        creditNotes:         creditNotes.trim() || null,
        paymentTerms:        payTerms.trim()    || null,
        deliveryAddress:     deliveryAddr.trim() || undefined,
        deliveryFeeCents:    isNaN(deliveryCents) ? 0 : deliveryCents,
        minimumOrderCents:   isNaN(minOrderCents as number) ? undefined : minOrderCents,
        accountManagerName:  accountMgrName.trim()  || null,
        accountManagerPhone: accountMgrPhone.trim() || null,
        accountManagerEmail: accountMgrEmail.trim() || null,
        accountsEmail:       acctEmail.trim()       || null,
      });
      if (selectedTierId !== (wa.tierId ?? null)) {
        await api.director.assignTier(wa.id, { tierId: selectedTierId });
      }
      Alert.alert('Saved', 'Wholesale account updated.');
      setEditMode(false);
      onRefresh();
      onClose();
    } catch (error) { Alert.alert('Error', getErrorMessage(error)); }
    finally { setSaving(false); }
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        {/* Header */}
        <View style={[wdl.header, { paddingTop: insets.top + 8, backgroundColor: CARD, borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={wdl.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={wdl.title}>{wa.companyName}</Text>
            <View style={[wdl.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
              <Text style={[wdl.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => { setEditMode(e => !e); Haptics.selectionAsync(); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 }}
          >
            <Feather name={editMode ? 'x' : 'edit-2'} size={15} color={editMode ? RED : BLUE} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: editMode ? RED : BLUE }}>{editMode ? 'Cancel' : 'Edit'}</Text>
          </Pressable>
        </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Business Details */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>BUSINESS DETAILS</Text>
            {editMode ? (
              <>
                <Text style={wdl.fieldLabel}>Company Name</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="e.g. Acme Hospitality Pty Ltd"
                    value={bizCompany} onChangeText={setBizCompany}
                  />
                </View>
                <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>ABN</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="e.g. 12 345 678 901"
                    value={bizAbn} onChangeText={setBizAbn}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Contact Name</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="e.g. Jane Smith"
                    value={bizContact} onChangeText={setBizContact}
                  />
                </View>
                <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Contact Email</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="e.g. jane@company.com.au"
                    value={bizEmail} onChangeText={setBizEmail}
                    keyboardType="email-address" autoCapitalize="none"
                  />
                </View>
                <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Contact Phone</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="e.g. 0400 000 000"
                    value={bizPhone} onChangeText={setBizPhone}
                    keyboardType="phone-pad"
                  />
                </View>
                <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Pricing Tier</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  <Pressable
                    onPress={() => { setSelectedTierId(null); Haptics.selectionAsync(); }}
                    style={{
                      paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20,
                      borderWidth: 1,
                      backgroundColor: selectedTierId === null ? NAVY : '#F3F4F6',
                      borderColor:     selectedTierId === null ? NAVY : BORDER,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: selectedTierId === null ? '#fff' : MUTED }}>No Tier</Text>
                  </Pressable>
                  {tiers.map((t) => {
                    const active = selectedTierId === t.id;
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => { setSelectedTierId(t.id); Haptics.selectionAsync(); }}
                        style={{
                          paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20,
                          borderWidth: 1,
                          backgroundColor: active ? BLUE : '#F3F4F6',
                          borderColor:     active ? BLUE : BORDER,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : TEXT }}>
                          {t.name}{(t.defaultDiscountPct ?? 0) > 0 ? ` (${t.defaultDiscountPct}% off)` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Business Hours</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="e.g. Mon–Fri 8am–4pm, closed weekends"
                    value={bizHours} onChangeText={setBizHours}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Company Name</Text>
                  <Text style={wdl.infoValue}>{bizCompany || '—'}</Text>
                </View>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>ABN</Text>
                  <Text style={wdl.infoValue}>{bizAbn || '—'}</Text>
                </View>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Contact Name</Text>
                  <Text style={wdl.infoValue}>{bizContact || '—'}</Text>
                </View>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Contact Email</Text>
                  <Text style={wdl.infoValue}>{bizEmail || '—'}</Text>
                </View>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Contact Phone</Text>
                  <Text style={wdl.infoValue}>{bizPhone || '—'}</Text>
                </View>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Pricing Tier</Text>
                  {selectedTierId ? (
                    <View style={{ backgroundColor: '#EBF8FF', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>
                        {tiers.find(t => t.id === selectedTierId)?.name ?? selectedTierId}
                      </Text>
                    </View>
                  ) : (
                    <Text style={wdl.infoValue}>—</Text>
                  )}
                </View>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Business Hours</Text>
                  <Text style={wdl.infoValue}>{bizHours || '—'}</Text>
                </View>
              </>
            )}
            {/* Always-visible reference rows */}
            <View style={[wdl.infoRow, { marginTop: editMode ? 16 : 0 }]}>
              <Text style={wdl.infoLabel}>Referred via</Text>
              <Text style={wdl.infoValue}>{wa.howDidYouHear ?? '—'}</Text>
            </View>
            <View style={wdl.infoRow}>
              <Text style={wdl.infoLabel}>Registered</Text>
              <Text style={wdl.infoValue}>{fmtDateTime(user.createdAt)}</Text>
            </View>
            <View style={wdl.infoRow}>
              <Text style={wdl.infoLabel}>Credit Used</Text>
              <Text style={wdl.infoValue}>{wa.creditUsedCents ? `$${(wa.creditUsedCents / 100).toFixed(2)}` : '$0.00'}</Text>
            </View>
          </View>
          {/* Status controls */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>ACCOUNT STATUS</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {[
                { key: 'approved', label: 'Approve',  color: GREEN,  bg: '#DCFCE7' },
                { key: 'pending',  label: 'Pending',  color: AMBER,  bg: '#FEF3C7' },
                { key: 'rejected', label: 'Reject',   color: RED,    bg: '#FEE2E2' },
              ].map((s) => {
                const active = localStatus === s.key;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => handleStatus(s.key)}
                    style={[wdl.statusBtn, { backgroundColor: active ? s.bg : '#F3F4F6', borderColor: active ? s.color : BORDER, borderWidth: 1 }]}
                  >
                    <Text style={[wdl.statusBtnText, { color: active ? s.color : MUTED }]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {/* Account Manager */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>ACCOUNT MANAGER</Text>
            {editMode ? (
              <>
                <Text style={wdl.fieldNote}>Assigned rep visible to this wholesale customer (read-only for them).</Text>
                <Text style={wdl.fieldLabel}>Manager Name</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="e.g. Sarah Thompson"
                    value={accountMgrName}
                    onChangeText={setAccountMgrName}
                  />
                </View>
                <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Manager Phone</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="e.g. 0400 000 000"
                    value={accountMgrPhone}
                    onChangeText={setAccountMgrPhone}
                    keyboardType="phone-pad"
                  />
                </View>
                <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Manager Email</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="e.g. sarah@butterfield.com.au"
                    value={accountMgrEmail}
                    onChangeText={setAccountMgrEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </>
            ) : (
              <>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Manager Name</Text>
                  <Text style={wdl.infoValue}>{accountMgrName || '—'}</Text>
                </View>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Manager Phone</Text>
                  <Text style={wdl.infoValue}>{accountMgrPhone || '—'}</Text>
                </View>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Manager Email</Text>
                  <Text style={wdl.infoValue}>{accountMgrEmail || '—'}</Text>
                </View>
              </>
            )}
          </View>
          {/* Credit Management */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>CREDIT MANAGEMENT</Text>
            {editMode ? (
              <>
                <Text style={wdl.fieldNote}>No credit is issued by default. Enable manually to grant credit terms.</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14 }}>Credit Account</Text>
                    <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>
                      {creditEnabled ? 'Credit enabled — customer can order on account' : 'Disabled — pay on order'}
                    </Text>
                  </View>
                  <Switch
                    value={creditEnabled}
                    onValueChange={setCreditEnabled}
                    trackColor={{ false: '#D1D5DB', true: GREEN }}
                    thumbColor="#fff"
                    ios_backgroundColor="#D1D5DB"
                  />
                </View>
                {creditEnabled && (
                  <>
                    <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Credit Limit (AUD)</Text>
                    <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                      <Text style={{ color: MUTED, fontWeight: '400', fontSize: 15 }}>$</Text>
                      <TextInput
                        style={[wdl.input, { color: TEXT }]}
                        placeholder="e.g. 5000"
                        placeholderTextColor={MUTED}
                        value={creditAud}
                        onChangeText={setCreditAud}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Payment Terms</Text>
                    <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                      <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                        placeholder="e.g. Net 30, Net 14, EOM"
                        value={payTerms}
                        onChangeText={setPayTerms}
                      />
                    </View>
                    <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Credit Notes (internal)</Text>
                    <View style={[wdl.inputRow, { borderColor: BORDER, height: 64, alignItems: 'flex-start', paddingTop: 10 }]}>
                      <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                        placeholder="Internal notes about credit terms..."
                        value={creditNotes}
                        onChangeText={setCreditNotes}
                        multiline
                      />
                    </View>
                  </>
                )}
              </>
            ) : (
              <>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Credit Account</Text>
                  <Text style={[wdl.infoValue, { color: creditEnabled ? GREEN : MUTED }]}>
                    {creditEnabled ? 'Enabled' : 'Disabled'}
                  </Text>
                </View>
                {creditEnabled && (
                  <>
                    <View style={wdl.infoRow}>
                      <Text style={wdl.infoLabel}>Credit Limit</Text>
                      <Text style={wdl.infoValue}>{creditAud ? `$${creditAud}` : '—'}</Text>
                    </View>
                    <View style={wdl.infoRow}>
                      <Text style={wdl.infoLabel}>Payment Terms</Text>
                      <Text style={wdl.infoValue}>{payTerms || '—'}</Text>
                    </View>
                    {!!creditNotes && (
                      <View style={wdl.infoRow}>
                        <Text style={wdl.infoLabel}>Credit Notes</Text>
                        <Text style={wdl.infoValue}>{creditNotes}</Text>
                      </View>
                    )}
                  </>
                )}
              </>
            )}
          </View>
          {/* Invoice email */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>INVOICE DELIVERY</Text>
            {editMode ? (
              <>
                <Text style={wdl.fieldNote}>Invoices are sent to this email. The customer can also set this themselves.</Text>
                <Text style={wdl.fieldLabel}>Accounts Team Email</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="e.g. accounts@company.com.au"
                    value={acctEmail}
                    onChangeText={setAcctEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </>
            ) : (
              <View style={wdl.infoRow}>
                <Text style={wdl.infoLabel}>Accounts Email</Text>
                <Text style={wdl.infoValue}>{acctEmail || '—'}</Text>
              </View>
            )}
          </View>
          {/* Delivery settings */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>DELIVERY SETTINGS</Text>
            {editMode ? (
              <>
                <Text style={wdl.fieldLabel}>Delivery Address</Text>
                <AddressSearchInput
                  currentValue={deliveryAddr || undefined}
                  placeholder="Search delivery address…"
                  onSelect={(r) => {
                    const parts = [r.street, r.suburb, r.state, r.postcode].filter(Boolean);
                    setDeliveryAddr(parts.join(', '));
                  }}
                />
                <View style={[wdl.inputRow, { borderColor: BORDER, height: 72, alignItems: 'flex-start', paddingTop: 12, marginTop: 8 }]}>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="Street, suburb, postcode"
                    value={deliveryAddr}
                    onChangeText={setDeliveryAddr}
                    multiline
                  />
                </View>
                <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Delivery Fee (AUD)</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <Text style={{ color: MUTED, fontWeight: '400', fontSize: 15 }}>$</Text>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED} keyboardType="decimal-pad"
                    placeholder="0.00 — free delivery"
                    value={deliveryFeeAud}
                    onChangeText={setDeliveryFeeAud}
                  />
                </View>
                <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Minimum Order (AUD)</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <Text style={{ color: MUTED, fontWeight: '400', fontSize: 15 }}>$</Text>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED} keyboardType="decimal-pad"
                    placeholder="e.g. 200.00"
                    value={minOrderAud}
                    onChangeText={setMinOrderAud}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Delivery Address</Text>
                  <Text style={wdl.infoValue}>{deliveryAddr || '—'}</Text>
                </View>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Delivery Fee</Text>
                  <Text style={wdl.infoValue}>{deliveryFeeAud ? `$${deliveryFeeAud}` : 'Free'}</Text>
                </View>
                <View style={wdl.infoRow}>
                  <Text style={wdl.infoLabel}>Minimum Order</Text>
                  <Text style={wdl.infoValue}>{minOrderAud ? `$${minOrderAud}` : '—'}</Text>
                </View>
              </>
            )}
          </View>
          {/* Suspend */}
          <View style={wdl.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14 }}>Suspend Account</Text>
                <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>Prevents new orders while suspended</Text>
              </View>
              <Switch
                value={suspended}
                onValueChange={handleSuspend}
                trackColor={{ false: '#D1D5DB', true: RED }}
                thumbColor="#fff"
                ios_backgroundColor="#D1D5DB"
              />
            </View>
            {suspended && (
              <View style={[wdl.inputRow, { borderColor: '#FECACA', marginTop: 12 }]}>
                <TextInput
                  style={[wdl.input, { color: TEXT }]}
                  placeholder="Suspension reason (optional)"
                  placeholderTextColor={MUTED}
                  value={suspendReason}
                  onChangeText={setSuspendReason}
                />
              </View>
            )}
          </View>
          {/* Cards on File */}
          <View style={wdl.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={wdl.sectionLabel}>CARDS ON FILE</Text>
              {cardsLoading && <ActivityIndicator size="small" color={BLUE} />}
            </View>
            {!cardsLoading && cards.length === 0 && (
              <Text style={{ color: MUTED, fontWeight: '400', fontSize: 13 }}>No cards saved by this account yet.</Text>
            )}
            {cards.map((card) => {
              const bg = BRAND_BG[card.cardBrand] ?? '#1A3A8C';
              return (
                <View key={card.id} style={{ marginBottom: 12, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER }}>
                  <View style={{ backgroundColor: bg, padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: 3 }}>
                        {`•••• •••• •••• ${card.last4}`}
                      </Text>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        {card.isDefault && (
                          <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>DEFAULT</Text>
                          </View>
                        )}
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '400', fontSize: 11 }}>{card.cardBrand}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '400', fontSize: 11 }}>{card.nameOnCard}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.55)', fontWeight: '400', fontSize: 11 }}>Exp {card.expiry}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
          {/* Save button — only in edit mode */}
          {editMode && (
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={[wdl.saveBtn, { opacity: saving ? 0.8 : 1 }]}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text style={wdl.saveBtnText}>Save Changes</Text>
              )}
            </Pressable>
          )}
          {/* Delete account */}
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, paddingVertical: 16 }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              Alert.alert(
                'Delete Account',
                `Permanently delete ${user?.name ?? 'this wholesale customer'} (${wa?.companyName ?? ''})?\n\nAll orders, invoices, and login access will be removed. This cannot be undone.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: async () => {
                    try {
                      await api.director.deleteUser(user.id);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      onClose();
                      onDelete();
                    } catch (error) { Alert.alert('Error', getErrorMessage(error)); }
                  }},
                ]
              );
            }}
          >
            <Feather name="trash-2" size={15} color={RED} />
            <Text style={{ color: RED, fontSize: 14, fontWeight: '600' }}>Delete Account</Text>
          </Pressable>
        </ScrollView>
      </Modal>
  );
}

export { WholesaleDetailModal };
