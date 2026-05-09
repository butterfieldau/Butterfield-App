import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

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

const TABS = ['All', 'Staff', 'Wholesale', 'Customers'];

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  customer:  { bg: '#EBF8FF', text: '#0369A1' },
  staff:     { bg: '#EDE9FE', text: '#5B21B6' },
  wholesale: { bg: '#DCFCE7', text: '#166534' },
  director:  { bg: '#FEF9C3', text: '#854D0E' },
};

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ── Wholesale Detail Modal ──────────────────────────────────────────────────
const BRAND_BG: Record<string, string> = {
  Visa: '#1A3A8C', Mastercard: '#8C1B1B', Amex: '#1B5C8C',
};

function WholesaleDetailModal({ user, wa, visible, onClose, onRefresh }: {
  user: any; wa: any; visible: boolean; onClose: () => void; onRefresh: () => void;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [creditAud, setCreditAud]     = useState('');
  const [payTerms, setPayTerms]       = useState('');
  const [deliveryAddr, setDeliveryAddr] = useState('');
  const [suspended, setSuspended]     = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [saving, setSaving]           = useState(false);
  const [togglingCard, setTogglingCard] = useState<string | null>(null);

  const { data: cardsData, isLoading: cardsLoading, refetch: refetchCards } = useQuery({
    queryKey: ['director-ws-cards', wa?.id],
    queryFn: () => api.director.wholesaleCards(wa!.id),
    enabled: visible && !!wa?.id,
    staleTime: 0,
  });
  const cards = cardsData?.data ?? [];

  useEffect(() => {
    if (wa) {
      setCreditAud(wa.creditLimitCents ? String(wa.creditLimitCents / 100) : '');
      setPayTerms(wa.paymentTerms ?? '30 days');
      setDeliveryAddr(wa.deliveryAddress ?? '');
      setSuspended(wa.isSuspended ?? false);
      setSuspendReason(wa.suspendedReason ?? '');
    }
  }, [wa]);

  if (!wa || !user) return null;

  const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
    approved: { color: GREEN,  bg: '#DCFCE7', label: 'Approved' },
    pending:  { color: AMBER,  bg: '#FEF3C7', label: 'Pending' },
    rejected: { color: RED,    bg: '#FEE2E2', label: 'Rejected' },
  };
  const cfg = STATUS_CFG[wa.status] ?? STATUS_CFG.pending;

  const handleStatus = async (status: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.setWholesaleStatus(wa.id, status);
      onRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleSuspend = async (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSuspended(val);
    try {
      await api.director.suspendWholesale(wa.id, { isSuspended: val, suspendedReason: val ? suspendReason : undefined });
      onRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); setSuspended(!val); }
  };

  const handleSave = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const creditCents = creditAud ? Math.round(parseFloat(creditAud) * 100) : undefined;
      await api.director.updateWholesale(wa.id, {
        creditLimitCents: isNaN(creditCents as number) ? undefined : creditCents,
        paymentTerms: payTerms.trim() || undefined,
        deliveryAddress: deliveryAddr.trim() || undefined,
      });
      onRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Wholesale account updated.');
      onClose();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const handleCardVisibility = async (cardId: string, current: boolean) => {
    setTogglingCard(cardId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.director.setCardVisibility(cardId, !current);
      refetchCards();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setTogglingCard(null); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
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
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Company info */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>ACCOUNT INFO</Text>
            {[
              { label: 'Company',  value: wa.companyName },
              { label: 'ABN',      value: wa.abn ?? '—' },
              { label: 'Contact',  value: user.name },
              { label: 'Email',    value: user.email },
              { label: 'Tier',     value: wa.tier?.name ?? wa.pricingTier ?? 'Standard' },
              { label: 'Credit Used', value: wa.creditUsedCents ? `$${(wa.creditUsedCents / 100).toFixed(2)}` : '$0.00' },
            ].map((row) => (
              <View key={row.label} style={wdl.infoRow}>
                <Text style={wdl.infoLabel}>{row.label}</Text>
                <Text style={wdl.infoValue}>{row.value}</Text>
              </View>
            ))}
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
                const active = wa.status === s.key;
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

          {/* Edit fields */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>ACCOUNT SETTINGS</Text>
            <Text style={wdl.fieldLabel}>Credit Limit (AUD)</Text>
            <View style={[wdl.inputRow, { borderColor: BORDER }]}>
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 15 }}>$</Text>
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
              <TextInput
                style={[wdl.input, { color: TEXT }]}
                placeholder="e.g. 30 days"
                placeholderTextColor={MUTED}
                value={payTerms}
                onChangeText={setPayTerms}
              />
            </View>
            <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Delivery Address</Text>
            <View style={[wdl.inputRow, { borderColor: BORDER, height: 72, alignItems: 'flex-start', paddingTop: 12 }]}>
              <TextInput
                style={[wdl.input, { color: TEXT }]}
                placeholder="Street, suburb, postcode"
                placeholderTextColor={MUTED}
                value={deliveryAddr}
                onChangeText={setDeliveryAddr}
                multiline
              />
            </View>
          </View>

          {/* Suspend */}
          <View style={wdl.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Suspend Account</Text>
                <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12 }}>Prevents new orders while suspended</Text>
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
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }}>No cards saved by this account yet.</Text>
            )}
            {cards.map((card: any) => {
              const bg = BRAND_BG[card.cardBrand] ?? '#1A3A8C';
              const isToggling = togglingCard === card.id;
              return (
                <View key={card.id} style={{ marginBottom: 10, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: BORDER }}>
                  {/* Mini card face */}
                  <View style={{ backgroundColor: bg, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 2 }}>
                          •••• {card.last4}
                        </Text>
                        {card.isDefault && (
                          <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ color: '#fff', fontSize: 9, fontFamily: 'Inter_700Bold' }}>DEFAULT</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }}>
                        {card.cardBrand}  ·  {card.nameOnCard}  ·  {card.expiry}
                      </Text>
                    </View>
                    <Feather name="credit-card" size={18} color="rgba(255,255,255,0.4)" />
                  </View>

                  {/* Manager visibility toggle */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: CARD }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Visible to Manager</Text>
                      <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11 }}>Allow manager portal to view this card</Text>
                    </View>
                    {isToggling
                      ? <ActivityIndicator size="small" color={BLUE} style={{ marginLeft: 8 }} />
                      : <Switch
                          value={card.visibleToManager}
                          onValueChange={() => handleCardVisibility(card.id, card.visibleToManager)}
                          trackColor={{ false: '#D1D5DB', true: BLUE }}
                          thumbColor="#fff"
                          ios_backgroundColor="#D1D5DB"
                        />
                    }
                  </View>
                </View>
              );
            })}
          </View>

          {/* Save button */}
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[wdl.saveBtn, { opacity: saving ? 0.8 : 1 }]}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={wdl.saveBtnText}>Save Changes</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

type CreateType = 'staff' | 'wholesale';

function CreateUserModal({ visible, type, onClose, onSuccess }: {
  visible: boolean; type: CreateType; onClose: () => void; onSuccess: () => void;
}) {
  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPw, setShowPw]           = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [abn, setAbn]                 = useState('');
  const [phone, setPhone]             = useState('');
  const [position, setPosition]       = useState('Crew');
  const [isManager, setIsManager]     = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const reset = () => {
    setName(''); setEmail(''); setPassword(''); setCompanyName('');
    setAbn(''); setPhone(''); setPosition('Crew'); setIsManager(false);
    setError(''); setLoading(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    setError('');
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Name, email and password are required.'); return;
    }
    if (type === 'wholesale' && !companyName.trim()) {
      setError('Company name is required.'); return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.'); return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (type === 'staff') {
        await api.director.createStaff({ name: name.trim(), email: email.trim(), password, position: position.trim(), isManager });
      } else {
        await api.director.createWholesale({ name: name.trim(), email: email.trim(), password, companyName: companyName.trim(), abn: abn.trim() || undefined, phone: phone.trim() || undefined });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Failed to create account.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setLoading(false); }
  };

  const isStaff = type === 'staff';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: CARD }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={[modal.header, { borderBottomColor: BORDER }]}>
          <Pressable onPress={handleClose} style={modal.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[modal.title, { color: TEXT }]}>Add {isStaff ? 'Staff Member' : 'Wholesale Customer'}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">

          {/* Role badge */}
          <View style={[modal.roleBanner, { backgroundColor: isStaff ? '#EDE9FE' : '#DCFCE7' }]}>
            <Feather name={isStaff ? 'users' : 'package'} size={15} color={isStaff ? '#5B21B6' : '#166534'} />
            <Text style={[modal.roleBannerText, { color: isStaff ? '#5B21B6' : '#166534' }]}>
              {isStaff ? 'New staff account will be pre-approved' : 'Wholesale account will be marked approved'}
            </Text>
          </View>

          {/* Common fields */}
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="user" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} placeholder="Full name" placeholderTextColor={MUTED} value={name} onChangeText={setName} autoCapitalize="words" />
          </View>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="mail" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} placeholder="Email address" placeholderTextColor={MUTED} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </View>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="lock" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT, flex: 1 }]} placeholder="Temporary password (min. 8 chars)" placeholderTextColor={MUTED} value={password} onChangeText={setPassword} secureTextEntry={!showPw} autoComplete="new-password" />
            <Pressable onPress={() => setShowPw(p => !p)}>
              <Feather name={showPw ? 'eye-off' : 'eye'} size={15} color={MUTED} />
            </Pressable>
          </View>

          {/* Staff-specific */}
          {isStaff && (
            <>
              <Text style={[modal.sectionLabel, { color: MUTED }]}>POSITION DETAILS</Text>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="briefcase" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Position (e.g. Barista, Crew)" placeholderTextColor={MUTED} value={position} onChangeText={setPosition} autoCapitalize="words" />
              </View>
              <View style={[modal.toggleRow, { borderColor: BORDER }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[modal.toggleLabel, { color: TEXT }]}>Manager permissions</Text>
                  <Text style={[modal.toggleSub, { color: MUTED }]}>Can view staff timesheets and update geo radius</Text>
                </View>
                <Switch value={isManager} onValueChange={setIsManager} trackColor={{ false: '#D1D5DB', true: BLUE }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
              </View>
            </>
          )}

          {/* Wholesale-specific */}
          {!isStaff && (
            <>
              <Text style={[modal.sectionLabel, { color: MUTED }]}>COMPANY DETAILS</Text>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="briefcase" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Company name *" placeholderTextColor={MUTED} value={companyName} onChangeText={setCompanyName} autoCapitalize="words" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="hash" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="ABN (optional)" placeholderTextColor={MUTED} value={abn} onChangeText={setAbn} keyboardType="numeric" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="phone" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Phone (optional)" placeholderTextColor={MUTED} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              </View>
            </>
          )}

          {error ? (
            <View style={modal.errorBox}>
              <Feather name="alert-circle" size={14} color={RED} />
              <Text style={[modal.errorText, { color: RED }]}>{error}</Text>
            </View>
          ) : null}

          <Pressable onPress={handleSubmit} disabled={loading} style={[modal.submitBtn, { backgroundColor: isStaff ? NAVY : GREEN, opacity: loading ? 0.8 : 1 }]}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={modal.submitBtnText}>Create {isStaff ? 'Staff Account' : 'Wholesale Account'}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function DirectorUsersScreen() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('All');
  const [createType, setCreateType] = useState<CreateType>('staff');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWholesaleUser, setSelectedWholesaleUser] = useState<any | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-users'],
    queryFn: () => api.director.users(),
  });

  const allUsers: any[] = data?.data ?? [];

  const filtered = allUsers.filter((u) => {
    if (tab === 'All')        return true;
    if (tab === 'Staff')      return u.role === 'staff';
    if (tab === 'Wholesale')  return u.role === 'wholesale';
    if (tab === 'Customers')  return u.role === 'customer';
    return true;
  });

  const openCreate = (type: CreateType) => {
    setCreateType(type); setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const approveStaff = async (userId: string, approved: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.approveStaff(userId, approved);
      await qc.invalidateQueries({ queryKey: ['director-users'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleRefreshUsers = async () => {
    await qc.invalidateQueries({ queryKey: ['director-users'] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Tab bar + Add buttons */}
      <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2, gap: 8 }}>
          {TABS.map((t) => {
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => { setTab(t); Haptics.selectionAsync(); }}
                style={[styles.tabChip, { backgroundColor: active ? BLUE : BG, borderColor: active ? BLUE : BORDER }]}
              >
                <Text style={[styles.tabChipText, { color: active ? '#fff' : MUTED }]}>{t}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Quick-add strip */}
        <View style={[styles.addStrip, { borderTopColor: BORDER }]}>
          <Text style={[styles.addStripLabel, { color: MUTED }]}>Add new:</Text>
          <Pressable onPress={() => openCreate('staff')} style={[styles.addBtn, { backgroundColor: '#EDE9FE' }]}>
            <Feather name="user-plus" size={13} color="#5B21B6" />
            <Text style={[styles.addBtnText, { color: '#5B21B6' }]}>Staff Member</Text>
          </Pressable>
          <Pressable onPress={() => openCreate('wholesale')} style={[styles.addBtn, { backgroundColor: '#DCFCE7' }]}>
            <Feather name="package" size={13} color="#166534" />
            <Text style={[styles.addBtnText, { color: '#166534' }]}>Wholesale</Text>
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="users" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular' }}>No users in this category</Text>
            </View>
          }
          renderItem={({ item: u }) => {
            const roleColors = ROLE_COLORS[u.role] ?? { bg: BG, text: MUTED };
            const sp = u.staffProfile;
            const wa = u.wholesaleAccount;
            return (
              <View style={[styles.userCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                <View style={styles.userTop}>
                  <View style={[styles.avatar, { backgroundColor: roleColors.bg }]}>
                    <Text style={[styles.avatarText, { color: roleColors.text }]}>{initials(u.name)}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.userName}>{u.name}</Text>
                      <View style={[styles.rolePill, { backgroundColor: roleColors.bg }]}>
                        <Text style={[styles.rolePillText, { color: roleColors.text }]}>{u.role}</Text>
                      </View>
                    </View>
                    <Text style={styles.userEmail}>{u.email}</Text>
                    <Text style={styles.userDate}>Joined {new Date(u.createdAt).toLocaleDateString('en-AU')}</Text>
                  </View>
                </View>

                {/* Staff approval toggle */}
                {sp && (
                  <View style={[styles.subRow, { borderTopColor: BORDER }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.subTitle}>{sp.position} · {sp.department}</Text>
                      <Text style={[styles.subSub, { color: sp.approvedByAdmin ? GREEN : AMBER }]}>
                        {sp.approvedByAdmin ? '✓ Approved' : '⏳ Pending approval'}
                      </Text>
                    </View>
                    <Switch
                      value={sp.approvedByAdmin}
                      onValueChange={(v) => approveStaff(u.id, v)}
                      trackColor={{ false: '#D1D5DB', true: GREEN }}
                      thumbColor="#fff"
                      ios_backgroundColor="#D1D5DB"
                    />
                  </View>
                )}

                {/* Wholesale status */}
                {wa && (
                  <Pressable
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedWholesaleUser(u); }}
                    style={[styles.subRow, { borderTopColor: BORDER }]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.subTitle}>{wa.companyName}</Text>
                      <Text style={[styles.subSub, {
                        color: wa.status === 'approved' ? GREEN : wa.status === 'rejected' ? RED : AMBER,
                      }]}>
                        {wa.status === 'approved' ? '✓ Approved' : wa.status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                        {wa.isSuspended ? ' · Suspended' : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: BLUE, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Manage</Text>
                      <Feather name="chevron-right" size={13} color={BLUE} />
                    </View>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}

      <CreateUserModal
        visible={showCreate}
        type={createType}
        onClose={() => setShowCreate(false)}
        onSuccess={() => {
          setShowCreate(false);
          qc.invalidateQueries({ queryKey: ['director-users'] });
          Alert.alert('Account created', `The new ${createType} account is ready to use.`);
        }}
      />

      <WholesaleDetailModal
        visible={!!selectedWholesaleUser}
        user={selectedWholesaleUser}
        wa={selectedWholesaleUser?.wholesaleAccount ?? null}
        onClose={() => setSelectedWholesaleUser(null)}
        onRefresh={handleRefreshUsers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  tabChipText:   { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  addStrip:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  addStripLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  addBtnText:    { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  userCard:      { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  userTop:       { flexDirection: 'row', gap: 12, padding: 14 },
  avatar:        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:    { fontSize: 16, fontFamily: 'Inter_700Bold' },
  nameRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName:      { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  rolePill:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  rolePillText:  { fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  userEmail:     { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  userDate:      { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  subRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, padding: 12, paddingHorizontal: 14 },
  subTitle:      { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  subSub:        { fontSize: 12, fontFamily: 'Inter_400Regular' },
});

const modal = StyleSheet.create({
  header:         { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 20, borderBottomWidth: 1 },
  closeBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:          { fontSize: 16, fontFamily: 'Inter_700Bold' },
  roleBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  roleBannerText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  sectionLabel:   { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, marginTop: 2 },
  inputRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12, backgroundColor: BG },
  input:          { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  toggleRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderRadius: 12, backgroundColor: BG },
  toggleLabel:    { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  toggleSub:      { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  errorBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: '#FEF2F2', borderRadius: 10 },
  errorText:      { flex: 1, fontSize: 13 },
  submitBtn:      { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitBtnText:  { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
});

const wdl = StyleSheet.create({
  header:          { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  closeBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:           { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  statusBadge:     { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1, marginTop: 4 },
  statusBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  card:            { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', gap: 0 },
  sectionLabel:    { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, color: '#8E8E93', marginBottom: 8 },
  infoRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  infoLabel:       { color: '#8E8E93', fontFamily: 'Inter_400Regular', fontSize: 13 },
  infoValue:       { color: '#1C1C1E', fontFamily: 'Inter_500Medium', fontSize: 13, maxWidth: '55%', textAlign: 'right' },
  statusBtn:       { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  statusBtnText:   { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  fieldLabel:      { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#8E8E93', marginBottom: 6 },
  inputRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12, backgroundColor: '#F5F6FA' },
  input:           { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  saveBtn:         { height: 54, borderRadius: 14, backgroundColor: '#40C0F2', alignItems: 'center', justifyContent: 'center' },
  saveBtnText:     { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
});
