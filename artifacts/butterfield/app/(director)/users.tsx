import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { AddressSearchInput } from '@/components/AddressSearchInput';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal,
  Platform, Pressable, RefreshControl, ScrollView, Share, StatusBar, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AccessRole, DeletedAccount, DirectorStaffMember, DirectorUserSummary, LoginHistoryEntry, ShopDisplayUser, StaffInviteToken, StaffLeaveRequest, StaffShift, StaffStoreAssignment, StoreSummary, WholesaleAccount, WholesaleCard } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CrmCustomersTab } from '@/components/director';
import { StaffProfileModal, WholesaleDetailModal, CreateUserModal, ShopDisplayDetailModal } from '@/components/director';
import { styles, modal, wdl } from '@/components/director/usersStyles';
import { DirectorEmptyState } from '@/components/DirectorEmptyState';
import { BG, CARD, BLUE, NAVY, TEXT, MUTED, BORDER, GREEN, AMBER, RED, PURPLE, PINK, TEAL, ROSE, GOLD, GLASS_BG, GLASS_BORDER } from '@/components/director/directorColors';

type FeatherIconName = ComponentProps<typeof Feather>['name'];
type InputKeyboardType = ComponentProps<typeof TextInput>['keyboardType'];
const TABS = ['Staff', 'Wholesale', 'Customers'] as const;
const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  customer:  { bg: '#EBF8FF', text: '#0369A1' },
  staff:     { bg: '#EDE9FE', text: '#5B21B6' },
  manager:   { bg: '#E0E7FF', text: '#4338CA' },
  wholesale: { bg: '#DCFCE7', text: '#166534' },
  director:  { bg: '#FEF9C3', text: '#854D0E' },
  master:    { bg: '#E5E7EB', text: '#111827' },
  shop_display: { bg: '#DBEAFE', text: '#1D4ED8' },
};
const ACCESS_ROLE_OPTIONS: { key: AccessRole; label: string }[] = [
  { key: 'manager', label: 'Manager' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'store_manager', label: 'Store Manager' },
  { key: 'area_manager', label: 'Area Manager' },
  { key: 'director', label: 'Director' },
  { key: 'master', label: 'Master' },
];

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function fmtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date} at ${time}`;
}

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  return error instanceof Error ? error.message : fallback;
}

function getUserRoleLabel(user: DirectorUserSummary): string {
  if (user.role === 'manager') return user.staffProfile?.position?.trim() || 'Manager';
  if (user.role === 'shop_display') return 'POS Screen';
  if (user.role === 'master') return 'Master';
  if (user.role === 'director') return 'Director';
  if (user.role === 'staff') return 'Staff';
  if (user.role === 'wholesale') return 'Wholesale';
  return 'Customer';
}

type CreateType = 'staff' | 'wholesale' | 'shop_display';
type UsersMode = 'wholesale' | 'staff' | 'pos' | 'deleted';

export function DirectorUsersScreen({ modeOverride }: { modeOverride?: UsersMode } = {}) {
  const params = useLocalSearchParams<{ mode?: string; tab?: string }>();
  const routeMode = params.mode === 'wholesale' || params.mode === 'staff' || params.mode === 'pos' || params.mode === 'deleted'
    ? params.mode
    : undefined;
  const screenMode = modeOverride ?? routeMode;
  const wholesaleMode = screenMode === 'wholesale';
  const staffMode = screenMode === 'staff';
  const posMode = screenMode === 'pos';
  const deletedMode = screenMode === 'deleted';
  const dedicatedMode = Boolean(screenMode);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const initialTab = ((): (typeof TABS)[number] => {
    if (params.tab === 'Staff') return 'Staff';
    if (params.tab === 'Wholesale') return 'Wholesale';
    if (wholesaleMode) return 'Wholesale';
    if (staffMode || posMode) return 'Staff';
    return 'Customers';
  })();
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab);
  const [createType, setCreateType] = useState<CreateType>('staff');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWholesaleUser, setSelectedWholesaleUser] = useState<DirectorUserSummary | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedShopDisplayUser, setSelectedShopDisplayUser] = useState<ShopDisplayUser | null>(null);
  const [showTerminated, setShowTerminated] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-users', showTerminated],
    queryFn: () => api.director.users({ includeTerminated: showTerminated }),
    placeholderData: keepPreviousData,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const allUsers: DirectorUserSummary[] = data?.data ?? [];
  const isStaffView = staffMode || (!dedicatedMode && tab === 'Staff');
  const filtered = allUsers.filter((u) => {
    if (showTerminated) {
      if (!isStaffView) return false;
      return (u.role === 'staff' || u.role === 'manager') && u.status === 'inactive';
    }
    if (wholesaleMode) return u.role === 'wholesale';
    if (staffMode)     return (u.role === 'staff' || u.role === 'manager' || u.role === 'director' || u.role === 'master') && u.status !== 'inactive';
    if (posMode)       return u.role === 'shop_display';
    if (tab === 'Staff')     return (u.role === 'staff' || u.role === 'manager' || u.role === 'director' || u.role === 'master') && u.status !== 'inactive';
    if (tab === 'Wholesale') return u.role === 'wholesale';
    return false;
  });
  // ── Deleted accounts ───────────────────────────────────────────────────────
  const { data: deletedData, isLoading: deletedLoading, refetch: refetchDeleted } = useQuery({
    queryKey: ['director-deleted-accounts'],
    queryFn:  () => api.director.deletedAccounts(),
    enabled:  deletedMode,
  });
  const deletedAccounts: DeletedAccount[] = deletedData?.data ?? [];
  const restoreMut = useMutation({
    mutationFn: (id: string) => api.director.restoreAccount(id),
    onSuccess: () => {
      refetchDeleted();
      qc.invalidateQueries({ queryKey: ['director-users'] });
      Alert.alert('Restored', 'Account has been restored successfully.');
    },
    onError: (e) => Alert.alert('Error', getErrorMessage(e, 'Failed to restore account.')),
  });
  const reinstateMut = useMutation({
    mutationFn: (id: string) => api.director.reinstateStaff(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-users'] });
      Alert.alert('Reinstated', 'Staff member has been reinstated and approved.');
    },
    onError: (e) => Alert.alert('Error', getErrorMessage(e, 'Failed to reinstate staff member.')),
  });
  // ── Staff invite state ─────────────────────────────────────────────────────
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteGenerating, setInviteGenerating] = useState(false);
  const [generatedInvite, setGeneratedInvite] = useState<{ token: string; expiresAt: string; note?: string } | null>(null);
  const [inviteNote, setInviteNote] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const { data: invitesData, refetch: refetchInvites } = useQuery({
    queryKey: ['director-staff-invites'],
    queryFn: () => api.director.listStaffInvites(),
    enabled: showInviteModal,
    staleTime: 0,
  });
  const activeInvites: StaffInviteToken[] = (invitesData?.data ?? []).filter((invite) => !invite.usedAt && new Date(invite.expiresAt) > new Date());

  async function handleGenerateInvite() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setInviteGenerating(true);
    try {
      const res = await api.director.generateStaffInvite({ note: inviteNote.trim() || undefined, expiryDays: 7 });
      setGeneratedInvite(res.data);
      await refetchInvites();
      setInviteNote('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error, 'Failed to generate invite.'));
    } finally {
      setInviteGenerating(false);
    }
  }

  async function handleRevokeInvite(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.revokeStaffInvite(id);
      if (generatedInvite) {
        const inv = (invitesData?.data ?? []).find((invite) => invite.id === id);
        if (inv && inv.token === generatedInvite.token) setGeneratedInvite(null);
      }
      await refetchInvites();
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error, 'Failed to revoke invite.'));
    }
  }

  const openCreate = (type: CreateType) => {
    setCreateType(type); setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };
  useEffect(() => {
    if (!isStaffView) setShowTerminated(false);
  }, [isStaffView]);
  const approveStaff = async (userId: string, approved: boolean) => {
    try {
      await api.director.approveStaff(userId, approved);
      await qc.invalidateQueries({ queryKey: ['director-users'] });
    } catch (error) { Alert.alert('Error', getErrorMessage(error)); }
  };
  const handleRefreshUsers = async () => {
    await qc.invalidateQueries({ queryKey: ['director-users'] });
  };
  const canGoBack = router.canGoBack();
  return (
    <DirectorTabScreen
      title={deletedMode ? 'Deleted Accounts' : wholesaleMode ? 'Wholesale Accounts' : staffMode ? 'Staff Accounts' : posMode ? 'POS Screens' : 'People'}
      backgroundColor="#EFF6FF"
      headerBackgroundColor="#EFF6FF"
      headerLeft={(dedicatedMode || deletedMode) && canGoBack ? (
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={20} color={NAVY} />
        </Pressable>
      ) : undefined}
      headerBottom={!dedicatedMode ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#EFF6FF' }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#E5E5EA', borderRadius: 9, padding: 2, gap: 0 }}>
            {TABS.map((t) => {
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => { setTab(t); Haptics.selectionAsync(); }}
                  style={[
                    { flex: 1, paddingVertical: 7, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
                    active && { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 2, elevation: 2 },
                  ]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#000' : 'rgba(0,0,0,0.55)' }}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : undefined}
    >
      {/* Add strip — only shown for Staff/Wholesale/POS, not Customers or Deleted */}
      {!deletedMode && (dedicatedMode || tab !== 'Customers') && (
      <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        {!showTerminated && (
          <View style={[styles.addStrip, { borderTopColor: BORDER }]}>
            <Text style={[styles.addStripLabel, { color: MUTED }]}>Add new:</Text>
            {(wholesaleMode || (!dedicatedMode && tab === 'Wholesale')) && (
              <Pressable onPress={() => openCreate('wholesale')} style={[styles.addBtn, { backgroundColor: '#DCFCE7' }]}>
                <Feather name="briefcase" size={13} color="#166534" />
                <Text style={[styles.addBtnText, { color: '#166534' }]}>Wholesale Account</Text>
              </Pressable>
            )}
            {(staffMode || (!dedicatedMode && tab === 'Staff')) && (
              <>
                <Pressable onPress={() => openCreate('staff')} style={[styles.addBtn, { backgroundColor: '#EDE9FE' }]}>
                  <Feather name="user-plus" size={13} color="#5B21B6" />
                  <Text style={[styles.addBtnText, { color: '#5B21B6' }]}>Staff Member</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setShowInviteModal(true); setGeneratedInvite(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={[styles.addBtn, { backgroundColor: '#DBEAFE' }]}
                >
                  <Feather name="link" size={13} color="#1D4ED8" />
                  <Text style={[styles.addBtnText, { color: '#1D4ED8' }]}>Invite Link</Text>
                </Pressable>
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); router.push('/director-settings-managers' as any); }}
                  style={[styles.addBtn, { backgroundColor: '#EEF4FF' }]}
                >
                  <Feather name="shield" size={13} color={BLUE} />
                  <Text style={[styles.addBtnText, { color: BLUE }]}>Roles & Permissions</Text>
                </Pressable>
              </>
            )}
            {posMode && (
              <Pressable onPress={() => openCreate('shop_display')} style={[styles.addBtn, { backgroundColor: '#DBEAFE' }]}>
                <Feather name="monitor" size={13} color="#1D4ED8" />
                <Text style={[styles.addBtnText, { color: '#1D4ED8' }]}>POS Screen</Text>
              </Pressable>
            )}
          </View>
        )}
        {/* Active / Terminated filter chips — only on Staff tab */}
        {isStaffView && !posMode && (
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Pressable
              onPress={() => { setShowTerminated(false); Haptics.selectionAsync(); }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                backgroundColor: !showTerminated ? '#EDE9FE' : '#F3F4F6',
                borderWidth: 1, borderColor: !showTerminated ? '#8B5CF6' : BORDER,
              }}
            >
              <Feather name="check-circle" size={12} color={!showTerminated ? '#5B21B6' : MUTED} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: !showTerminated ? '#5B21B6' : MUTED }}>Active</Text>
            </Pressable>
            <Pressable
              onPress={() => { setShowTerminated(true); Haptics.selectionAsync(); }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                backgroundColor: showTerminated ? '#FEE2E2' : '#F3F4F6',
                borderWidth: 1, borderColor: showTerminated ? '#EF4444' : BORDER,
              }}
            >
              <Feather name="user-x" size={12} color={showTerminated ? '#991B1B' : MUTED} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: showTerminated ? '#991B1B' : MUTED }}>Terminated</Text>
            </Pressable>
          </View>
        )}
      </View>
      )}
      {deletedMode ? (
        deletedLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={RED} />
          </View>
        ) : (
          <FlatList
            data={deletedAccounts}
            keyExtractor={(a) => a.id}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refetchDeleted} tintColor={RED} />}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              deletedAccounts.length > 0 ? (
                <Text style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>
                  Accounts are permanently removed after 30 days. Restore to reactivate.
                </Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
                <Feather name="trash-2" size={40} color={MUTED} />
                <Text style={{ color: MUTED, fontWeight: '500', fontSize: 15 }}>No deleted accounts</Text>
                <Text style={{ color: MUTED, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 }}>
                  Deleted customer and staff accounts will appear here for 30 days.
                </Text>
              </View>
            }
            renderItem={({ item: a }) => {
              const roleColors = ROLE_COLORS[a.role] ?? { bg: BG, text: MUTED };
              return (
                <View style={[styles.userCard, { backgroundColor: CARD, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 }]}>
                  <View style={styles.userTop}>
                    <View style={[styles.avatar, { backgroundColor: '#F3F4F6' }]}>
                      <Text style={[styles.avatarText, { color: MUTED }]}>{initials(a.name)}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.userName}>{a.name}</Text>
                        <View style={[styles.rolePill, { backgroundColor: roleColors.bg }]}>
                          <Text style={[styles.rolePillText, { color: roleColors.text }]}>{a.role}</Text>
                        </View>
                      </View>
                      <Text style={styles.userEmail}>{a.email}</Text>
                      <Text style={styles.userDate}>Deleted {fmtDateTime(a.deletedAt)}</Text>
                    </View>
                  </View>
                  <View style={[styles.subRow, { borderTopColor: BORDER, justifyContent: 'flex-end' }]}>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        Alert.alert(
                          'Restore Account',
                          `Restore ${a.name}'s account? They will be able to log in again.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Restore', onPress: () => restoreMut.mutate(a.id) },
                          ],
                        );
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: '#DCFCE7' }}
                    >
                      <Feather name="refresh-cw" size={13} color="#166534" />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#166534' }}>Restore</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        )
      ) : !dedicatedMode && tab === 'Customers' ? (
        <CrmCustomersTab />
      ) : isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        >
          {filtered.length === 0 ? (
            <DirectorEmptyState icon="users" title="No users in this category" />
          ) : (
            <View style={u$.listCard}>
              {filtered.map((user, index) => {
                const isLast = index === filtered.length - 1;
                const roleColors = ROLE_COLORS[user.role] ?? { bg: BG, text: MUTED };
                const roleLabel = getUserRoleLabel(user);
                const sp = user.staffProfile;
                const wa = user.wholesaleAccount;
                const isPendingStaff = !!(sp && !sp.approvedByAdmin);
                const canOpenStaff = user.role === 'staff' || user.role === 'manager' || user.role === 'director' || user.role === 'master';

                // Status badge values
                let statusBg = '#F3F4F6', statusText = MUTED, statusLabel = '';
                if (sp) {
                  if (showTerminated) {
                    statusBg  = '#FEE2E2'; statusText = '#991B1B'; statusLabel = 'Terminated';
                  } else {
                    statusBg  = sp.approvedByAdmin ? '#D1FAE5' : '#FEF3C7';
                    statusText = sp.approvedByAdmin ? '#065F46' : '#92400E';
                    statusLabel = sp.approvedByAdmin ? 'Approved' : 'Pending';
                  }
                } else if (wa) {
                  statusBg  = wa.status === 'approved' ? '#D1FAE5' : wa.status === 'rejected' ? '#FEE2E2' : '#FEF3C7';
                  statusText = wa.status === 'approved' ? '#065F46' : wa.status === 'rejected' ? '#991B1B' : '#92400E';
                  statusLabel = wa.status === 'approved' ? (wa.isSuspended ? 'Suspended' : 'Approved') : wa.status === 'rejected' ? 'Rejected' : 'Pending';
                  if (wa.isSuspended) { statusBg = '#FEE2E2'; statusText = '#991B1B'; }
                } else if (user.role === 'shop_display') {
                  statusBg  = user.status === 'active' ? '#D1FAE5' : '#FEE2E2';
                  statusText = user.status === 'active' ? '#065F46' : '#991B1B';
                  statusLabel = user.status === 'active' ? 'Active' : 'Inactive';
                }

                const handlePress = () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (wa) setSelectedWholesaleUser(user);
                  else if (canOpenStaff) setSelectedStaffId(user.id);
                  else if (user.role === 'shop_display') setSelectedShopDisplayUser(user as unknown as ShopDisplayUser);
                };

                return (
                  <Pressable
                    key={user.id}
                    onPress={handlePress}
                    style={({ pressed }) => [
                      u$.row,
                      !isLast && u$.rowBorder,
                      pressed && { backgroundColor: '#F8F8F8' },
                    ]}
                  >
                    {/* Top: avatar + name/role + status + chevron */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={[u$.avatar, { backgroundColor: roleColors.bg }]}>
                        <Text style={[u$.avatarText, { color: roleColors.text }]}>{initials(user.name)}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={u$.name} numberOfLines={1}>{user.name}</Text>
                        <Text style={u$.sub} numberOfLines={1}>
                          {roleLabel}{wa ? ` · ${wa.companyName}` : ''}{sp ? ` · ${sp.position ?? ''}` : ''}
                        </Text>
                      </View>
                      {!isPendingStaff && statusLabel ? (
                        <View style={[u$.badge, { backgroundColor: statusBg }]}>
                          <Text style={[u$.badgeText, { color: statusText }]}>{statusLabel}</Text>
                        </View>
                      ) : null}
                      <Feather name="chevron-right" size={18} color="#C7C7CC" />
                    </View>

                    {/* Approve / Remove buttons for pending staff */}
                    {isPendingStaff && !showTerminated && (
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                        <Pressable
                          onPress={(e) => { e.stopPropagation?.(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); approveStaff(user.id, true); }}
                          style={u$.approveBtn}
                        >
                          <Text style={u$.approveBtnText}>Approve</Text>
                        </Pressable>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.();
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            Alert.alert(
                              'Remove Staff Member',
                              `Archive ${user.name}'s account? They will be removed from the staff list and blocked from logging in.`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Remove', style: 'destructive', onPress: async () => {
                                  try {
                                    await api.director.terminateStaff(user.id);
                                    await qc.invalidateQueries({ queryKey: ['director-users'] });
                                  } catch (error) { Alert.alert('Error', getErrorMessage(error)); }
                                }},
                              ]
                            );
                          }}
                          style={u$.rejectBtn}
                        >
                          <Text style={u$.rejectBtnText}>Remove</Text>
                        </Pressable>
                      </View>
                    )}
                    {/* Reinstate button for terminated staff */}
                    {showTerminated && (
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.();
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            Alert.alert(
                              'Reinstate Staff Member',
                              `Reinstate ${user.name}? Their account will be reactivated and they'll be able to log in again.`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Reinstate', onPress: () => reinstateMut.mutate(user.id) },
                              ],
                            );
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#D1FAE5' }}
                        >
                          <Feather name="user-check" size={13} color="#065F46" />
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#065F46' }}>Reinstate</Text>
                        </Pressable>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
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
        onDelete={() => { setSelectedWholesaleUser(null); handleRefreshUsers(); }}
      />
      <StaffProfileModal
        visible={!!selectedStaffId}
        userId={selectedStaffId}
        onClose={() => setSelectedStaffId(null)}
        onRefresh={handleRefreshUsers}
        onDelete={() => { setSelectedStaffId(null); handleRefreshUsers(); }}
      />
      <ShopDisplayDetailModal
        visible={!!selectedShopDisplayUser}
        user={selectedShopDisplayUser}
        onClose={() => setSelectedShopDisplayUser(null)}
        onRefresh={handleRefreshUsers}
      />
      {/* ── Staff Invite Modal ──────────────────────────────────────────── */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: BG }}>
          {/* Header */}
          <View style={{ backgroundColor: CARD, paddingTop: 20, paddingBottom: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: TEXT, fontSize: 18, fontWeight: '700' }}>Staff Invite Link</Text>
              <Text style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>
                Generate a single-use code for new staff to register
              </Text>
            </View>
            <Pressable onPress={() => setShowInviteModal(false)} hitSlop={12}>
              <Feather name="x" size={22} color={MUTED} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} showsVerticalScrollIndicator={false}>
            {/* Generate section */}
            <View style={{ backgroundColor: CARD, borderRadius: 18, padding: 18, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>Generate new code</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>Note (optional)</Text>
              <TextInput
                style={{ backgroundColor: BG, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT, borderWidth: 1, borderColor: BORDER }}
                value={inviteNote}
                onChangeText={setInviteNote}
                placeholder="e.g. For Sam — weekend barista"
                placeholderTextColor={MUTED}
              />
              <Pressable
                onPress={handleGenerateInvite}
                disabled={inviteGenerating}
                style={{ backgroundColor: BLUE, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: inviteGenerating ? 0.6 : 1 }}
              >
                {inviteGenerating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Generate Code</Text>
                }
              </Pressable>
            </View>

            {/* Generated code display */}
            {generatedInvite && (
              <View style={{ backgroundColor: CARD, borderRadius: 18, padding: 18, gap: 12, borderWidth: 2, borderColor: GREEN, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="check-circle" size={18} color={GREEN} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: GREEN }}>Code generated!</Text>
                </View>
                <View style={{ backgroundColor: '#F0FDF4', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 26, fontWeight: '800', color: TEXT, letterSpacing: 3, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                    {generatedInvite.token}
                  </Text>
                  <Text style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
                    Expires {new Date(generatedInvite.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                {generatedInvite.note ? (
                  <Text style={{ fontSize: 13, color: MUTED, textAlign: 'center' }}>Note: {generatedInvite.note}</Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={async () => {
                      await Share.share({ message: `You've been invited to join Butterfield Cookies staff!\n\nYour registration code is:\n\n${generatedInvite.token}\n\nOpen the Butterfield app → Staff Login → "Register with invite code" and enter this code. It expires in 7 days.` });
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={{ flex: 1, backgroundColor: BLUE, borderRadius: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Feather name="share-2" size={15} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Share</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Active invites list */}
            {activeInvites.length > 0 && (
              <View style={{ backgroundColor: CARD, borderRadius: 18, padding: 18, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>Active codes ({activeInvites.length})</Text>
                {activeInvites.map((inv) => (
                  <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BG, borderRadius: 12, padding: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 1 }}>{inv.token}</Text>
                      {inv.note ? <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{inv.note}</Text> : null}
                      <Text style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                        Expires {new Date(inv.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => Alert.alert('Revoke code?', `Revoke invite code ${inv.token}? Staff will not be able to register with it.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Revoke', style: 'destructive', onPress: () => handleRevokeInvite(inv.id) },
                      ])}
                      style={{ padding: 8 }}
                      hitSlop={8}
                    >
                      <Feather name="trash-2" size={16} color={RED} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {/* Instructions */}
            <View style={{ backgroundColor: '#EFF6FF', borderRadius: 14, padding: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="info" size={15} color={BLUE} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: BLUE }}>How it works</Text>
              </View>
              {[
                'Generate a code and share it with your new staff member',
                'They open the app → Staff Login → "Register with invite code"',
                'They enter the code and fill in their details',
                'Their account is created pending your approval in the Staff tab',
              ].map((step, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={{ fontSize: 13, color: '#1D4ED8', fontWeight: '700', width: 18 }}>{i + 1}.</Text>
                  <Text style={{ fontSize: 13, color: '#1D4ED8', flex: 1, lineHeight: 19 }}>{step}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </DirectorTabScreen>
  );
}

export default DirectorUsersScreen;

const u$ = StyleSheet.create({
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  name:  { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  sub:   { fontSize: 14, color: '#8E8E93' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    flexShrink: 0,
  },
  badgeText: { fontSize: 13, fontWeight: '600' },
  approveBtn: {
    flex: 1,
    backgroundColor: '#34C759',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  rejectBtn: {
    flex: 1,
    backgroundColor: '#FF3B3015',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF3B3030',
  },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: '#FF3B30' },
});
