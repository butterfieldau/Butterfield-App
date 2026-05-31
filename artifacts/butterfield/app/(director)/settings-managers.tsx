import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type AccessRole, type DirectorIdentity, type DirectorManager, type DirectorUserSummary } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const BG = '#EFF6FF';
const CARD = '#FFFFFF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE = '#1493FF';
const GREEN = '#22C55E';
const PURPLE = '#8B5CF6';
const INDIGO = '#3730A3';
const AMBER = '#F59E0B';
const RED = '#EF4444';

type FeatherIconName = ComponentProps<typeof Feather>['name'];

const ALL_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'orders', label: 'Orders', icon: 'shopping-bag' },
  { key: 'users', label: 'Users', icon: 'users' },
  { key: 'timesheets', label: 'Timesheets', icon: 'clock' },
  { key: 'tasks', label: 'Tasks', icon: 'clipboard' },
  { key: 'products', label: 'Products', icon: 'package' },
  { key: 'reports', label: 'Reports', icon: 'bar-chart-2' },
  { key: 'rewards', label: 'Rewards', icon: 'gift' },
  { key: 'announcements', label: 'Announcements', icon: 'bell' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
  { key: 'pricing', label: 'Pricing', icon: 'dollar-sign' },
  { key: 'banners', label: 'Banner', icon: 'image' },
  { key: 'stock', label: 'Stock', icon: 'archive' },
] as const;

const ROLE_OVERVIEW = [
  { label: 'Manager', color: '#1D4ED8', sub: 'General access to daily operations and reporting.' },
  { label: 'Supervisor', color: '#7C3AED', sub: 'Team lead style access for oversight and service flow.' },
  { label: 'Store Manager', color: '#059669', sub: 'Owns one location, staffing, store settings and trade.' },
  { label: 'Area Manager', color: '#EA580C', sub: 'Oversees multiple stores and cross-location operations.' },
  { label: 'Director', color: '#DC2626', sub: 'Full business controls across the director portal.' },
  { label: 'Master', color: '#111827', sub: 'Highest level access, including director management.' },
] as const;

const PORTAL_ACCESS = [
  { role: 'Manager', access: 'Home, Orders, People, More' },
  { role: 'Supervisor', access: 'Home, Orders, Staff Hub, More' },
  { role: 'Store Manager', access: 'Orders, Staff, Stores, Stock, Timesheets' },
  { role: 'Area Manager', access: 'Multi-store reporting, staffing and store controls' },
  { role: 'Director', access: 'All director tools except master-only controls' },
  { role: 'Master', access: 'Everything including director creation and removal' },
] as const;

const ACCESS_ROLE_OPTIONS: { key: AccessRole; label: string; color: string }[] = [
  { key: 'manager', label: 'Manager', color: '#1D4ED8' },
  { key: 'supervisor', label: 'Supervisor', color: '#7C3AED' },
  { key: 'store_manager', label: 'Store Manager', color: '#059669' },
  { key: 'area_manager', label: 'Area Manager', color: '#EA580C' },
  { key: 'director', label: 'Director', color: '#DC2626' },
  { key: 'master', label: 'Master', color: '#111827' },
] as const;

type ManagerFormData = { name: string; email: string; password: string; notes: string };
type ManagerFormFieldKey = keyof ManagerFormData;
type DirectorFormData = { name: string; email: string; password: string };
type DirectorFormFieldKey = keyof DirectorFormData;

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  return error instanceof Error ? error.message : fallback;
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

export default function DirectorRolesSettingsPage() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isMaster = user?.role === 'master';

  const { data: managersData, isLoading: loadingManagers } = useQuery({
    queryKey: ['director-managers'],
    queryFn: () => api.director.managers.list(),
  });
  const { data: staffListData, isLoading: loadingStaffList } = useQuery({
    queryKey: ['director-staff-list'],
    queryFn: () => api.director.staffList(),
  });
  const { data: directorsData, isLoading: loadingDirectors } = useQuery({
    queryKey: ['master-directors'],
    queryFn: () => api.director.directors.list(),
    enabled: isMaster,
  });

  const managers: DirectorManager[] = managersData?.data ?? [];
  const staffCandidates = useMemo(
    () => (staffListData?.data ?? []).filter((person) => person.role === 'staff'),
    [staffListData],
  );
  const directors: DirectorIdentity[] = directorsData?.data ?? [];

  const [createModal, setCreateModal] = useState(false);
  const [createDirectorModal, setCreateDirectorModal] = useState(false);
  const [form, setForm] = useState<ManagerFormData>({ name: '', email: '', password: '', notes: '' });
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [selectedAccessRole, setSelectedAccessRole] = useState<AccessRole>('manager');
  const [editAccessRole, setEditAccessRole] = useState<AccessRole>('manager');
  const [savingPerms, setSavingPerms] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [directorForm, setDirectorForm] = useState<DirectorFormData>({ name: '', email: '', password: '' });
  const [creatingDirector, setCreatingDirector] = useState(false);

  const togglePerm = (set: string[], key: string, setter: (v: string[]) => void) => {
    Haptics.selectionAsync();
    setter(set.includes(key) ? set.filter((p) => p !== key) : [...set, key]);
  };

  const handleCreateManager = async () => {
    if (!form.name || !form.email || !form.password) {
      Alert.alert('Missing fields', 'Name, email and password are required.');
      return;
    }
    setCreating(true);
    try {
      await api.director.managers.create({ ...form, permissions: formPerms, accessRole: selectedAccessRole });
      await qc.invalidateQueries({ queryKey: ['director-managers'] });
      await qc.invalidateQueries({ queryKey: ['director-users'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateModal(false);
      setForm({ name: '', email: '', password: '', notes: '' });
      setFormPerms([]);
      setSelectedAccessRole('manager');
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const handlePromoteStaff = (id: string, name: string) => {
    const options = ACCESS_ROLE_OPTIONS.filter((option) => isMaster || (option.key !== 'director' && option.key !== 'master'));
    Alert.alert(
      'Assign Role',
      `Choose the access role for ${name}.`,
      [
        ...options.map((option) => ({
          text: option.label,
          onPress: async () => {
            setPromotingId(id);
            try {
              const targetRole = option.key === 'director' || option.key === 'master' ? option.key : 'manager';
              await api.director.customers.promote(id, targetRole, option.key);
              await qc.invalidateQueries({ queryKey: ['director-staff-list'] });
              await qc.invalidateQueries({ queryKey: ['director-managers'] });
              await qc.invalidateQueries({ queryKey: ['master-directors'] });
              await qc.invalidateQueries({ queryKey: ['director-users'] });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              Alert.alert('Error', getErrorMessage(error));
            } finally {
              setPromotingId(null);
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleSavePerms = async (id: string) => {
    setSavingPerms(true);
    try {
      await api.director.managers.updatePermissions(id, { permissions: editPerms, accessRole: editAccessRole });
      await qc.invalidateQueries({ queryKey: ['director-managers'] });
      await qc.invalidateQueries({ queryKey: ['director-users'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingId(null);
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error));
    } finally {
      setSavingPerms(false);
    }
  };

  const handleRemoveManager = (id: string, name: string) => {
    Alert.alert('Remove Leadership Access', `Remove ${name}'s leadership access? Their account will become a staff account again.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.director.managers.delete(id);
            await qc.invalidateQueries({ queryKey: ['director-managers'] });
            await qc.invalidateQueries({ queryKey: ['director-staff-list'] });
            await qc.invalidateQueries({ queryKey: ['director-users'] });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch (error) {
            Alert.alert('Error', getErrorMessage(error));
          }
        },
      },
    ]);
  };

  const handleCreateDirector = async () => {
    if (!directorForm.name || !directorForm.email || !directorForm.password) {
      Alert.alert('Missing fields', 'Name, email and password are required.');
      return;
    }
    setCreatingDirector(true);
    try {
      await api.director.directors.create(directorForm);
      await qc.invalidateQueries({ queryKey: ['master-directors'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateDirectorModal(false);
      setDirectorForm({ name: '', email: '', password: '' });
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error));
    } finally {
      setCreatingDirector(false);
    }
  };

  const handleRemoveDirector = (id: string, name: string) => {
    Alert.alert('Remove Director', `Remove ${name}'s director access? This permanently deletes that director account.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.director.directors.delete(id);
            await qc.invalidateQueries({ queryKey: ['master-directors'] });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch (error) {
            Alert.alert('Error', getErrorMessage(error));
          }
        },
      },
    ]);
  };

  const isLoading = loadingManagers || loadingStaffList || (isMaster && loadingDirectors);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: TEXT }}>Roles & Permissions</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: '#EEF4FF', borderColor: '#C7D2FE' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="shield" size={16} color={INDIGO} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: INDIGO }}>One place for access control</Text>
            </View>
            <Text style={{ fontSize: 12, color: '#4F46E5', lineHeight: 18 }}>
              Promote staff, add managers, adjust portal access, and keep role control tidy here instead of jumping between old screens.
            </Text>
          </View>

          <SectionTitle>ROLE TYPES</SectionTitle>
          <View style={{ gap: 10 }}>
            {ROLE_OVERVIEW.map((role) => (
              <View key={role.label} style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.roleDot, { backgroundColor: role.color }]} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{role.label}</Text>
                </View>
                <Text style={{ fontSize: 12, color: MUTED, lineHeight: 18 }}>{role.sub}</Text>
              </View>
            ))}
          </View>

          <SectionTitle>STAFF ROLES</SectionTitle>
          <Pressable onPress={() => { Haptics.selectionAsync(); setCreateModal(true); }} style={[styles.primaryBtn, { backgroundColor: INDIGO }]}>
            <Feather name="user-plus" size={17} color="#fff" />
            <Text style={styles.primaryBtnText}>Create Role Account</Text>
          </Pressable>
          <Text style={{ fontSize: 12, color: MUTED, lineHeight: 18, marginTop: -6 }}>
            If the email already belongs to a staff account, we now restore that person back into manager access instead of leaving them stranded.
          </Text>

          <SectionTitle>STAFF TO PROMOTE</SectionTitle>
          {staffCandidates.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>No staff accounts are waiting for manager access.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {staffCandidates.map((person) => (
                <View key={person.id} style={styles.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{person.name}</Text>
                      <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Currently Staff</Text>
                    </View>
                    <Pressable
                      onPress={() => handlePromoteStaff(person.id, person.name)}
                      disabled={promotingId === person.id}
                      style={[styles.actionBtn, { borderColor: GREEN + '50', backgroundColor: '#F0FDF4' }]}
                    >
                      {promotingId === person.id ? (
                        <ActivityIndicator size="small" color={GREEN} />
                      ) : (
                        <>
                          <Feather name="arrow-up-right" size={13} color={GREEN} />
                          <Text style={[styles.actionBtnText, { color: GREEN }]}>Assign Role</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          <SectionTitle>ROLES & PERMISSIONS</SectionTitle>
          <View style={{ gap: 10 }}>
            {managers.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>No leadership accounts yet. Create one above and their permission groups will appear here.</Text>
              </View>
            ) : managers.map((manager) => (
              <View key={manager.id} style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{manager.name}</Text>
                        <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{manager.email}</Text>
                      </View>
                  <Pressable onPress={() => handleRemoveManager(manager.id, manager.name)} style={{ padding: 6 }}>
                    <Feather name="trash-2" size={18} color={RED} />
                  </Pressable>
                </View>

                <View style={[styles.chip, { backgroundColor: INDIGO + '12', borderColor: INDIGO + '30', alignSelf: 'flex-start' }]}>
                  <Text style={[styles.chipText, { color: INDIGO }]}>{ACCESS_ROLE_OPTIONS.find((option) => option.key === (manager.accessRole ?? 'manager'))?.label ?? 'Manager'}</Text>
                </View>

                {manager.notes ? (
                  <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{manager.notes}</Text>
                ) : null}

                {editingId === manager.id ? (
                  <View style={{ gap: 10 }}>
                    <Text style={styles.fieldLabel}>Role</Text>
                    <View style={styles.rolePickerGrid}>
                      {ACCESS_ROLE_OPTIONS.filter((option) => option.key !== 'director' && option.key !== 'master').map((option) => {
                        const active = editAccessRole === option.key;
                        return (
                          <Pressable
                            key={option.key}
                            onPress={() => { setEditAccessRole(option.key); Haptics.selectionAsync(); }}
                            style={[styles.rolePickerCard, { borderColor: active ? option.color : BORDER, backgroundColor: active ? `${option.color}12` : CARD }]}
                          >
                            <Text style={[styles.rolePickerTitle, { color: active ? option.color : TEXT }]}>{option.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {ALL_PERMISSIONS.map((permission) => (
                      <View key={permission.key} style={styles.switchRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Feather name={permission.icon as FeatherIconName} size={14} color={INDIGO} />
                          <Text style={{ fontSize: 14, fontWeight: '500', color: TEXT }}>{permission.label}</Text>
                        </View>
                        <Switch
                          value={editPerms.includes(permission.key)}
                          onValueChange={() => togglePerm(editPerms, permission.key, setEditPerms)}
                          trackColor={{ false: BORDER, true: INDIGO }}
                          thumbColor="#fff"
                          ios_backgroundColor={BORDER}
                        />
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Pressable onPress={() => setEditingId(null)} style={[styles.secondaryBtn, { flex: 1 }]}>
                        <Text style={[styles.secondaryBtnText, { color: MUTED }]}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleSavePerms(manager.id)}
                        disabled={savingPerms}
                        style={[styles.primaryBtn, { flex: 1, backgroundColor: INDIGO, paddingVertical: 12 }]}
                      >
                        {savingPerms ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Save Access</Text>}
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {(manager.permissions as string[]).length === 0 ? (
                        <Text style={{ fontSize: 12, color: AMBER }}>No access assigned yet.</Text>
                      ) : (
                        (manager.permissions as string[]).map((permission) => (
                          <View key={permission} style={[styles.chip, { backgroundColor: INDIGO + '12', borderColor: INDIGO + '30' }]}>
                            <Text style={[styles.chipText, { color: INDIGO }]}>{permission}</Text>
                          </View>
                        ))
                      )}
                    </View>
                    <Pressable
                      onPress={() => {
                        setEditingId(manager.id);
                        setEditPerms([...(manager.permissions as string[])]);
                        setEditAccessRole(manager.accessRole ?? 'manager');
                        Haptics.selectionAsync();
                      }}
                      style={[styles.actionBtn, { borderColor: INDIGO, alignSelf: 'flex-start' }]}
                    >
                      <Feather name="sliders" size={13} color={INDIGO} />
                      <Text style={[styles.actionBtnText, { color: INDIGO }]}>Edit Permissions</Text>
                    </Pressable>
                  </>
                )}
              </View>
            ))}
          </View>

          <SectionTitle>PORTAL ACCESS</SectionTitle>
          <View style={{ gap: 10 }}>
            {PORTAL_ACCESS.map((item) => (
              <View key={item.role} style={styles.card}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{item.role}</Text>
                <Text style={{ fontSize: 12, color: MUTED, lineHeight: 18 }}>{item.access}</Text>
              </View>
            ))}
          </View>

          {isMaster ? (
            <>
              <SectionTitle>DIRECTOR & MASTER</SectionTitle>
              <Pressable onPress={() => { Haptics.selectionAsync(); setCreateDirectorModal(true); }} style={[styles.primaryBtn, { backgroundColor: PURPLE }]}>
                <Feather name="shield" size={17} color="#fff" />
                <Text style={styles.primaryBtnText}>Add Director</Text>
              </Pressable>
              <View style={{ gap: 10 }}>
                {directors.map((director) => (
                  <View key={director.id} style={styles.card}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{director.name}</Text>
                        <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{director.email}</Text>
                      </View>
                      <Pressable onPress={() => handleRemoveDirector(director.id, director.name)} style={{ padding: 6 }}>
                        <Feather name="trash-2" size={18} color={RED} />
                      </Pressable>
                    </View>
                    <View style={[styles.chip, { backgroundColor: PURPLE + '14', borderColor: PURPLE + '30', alignSelf: 'flex-start' }]}>
                      <Text style={[styles.chipText, { color: PURPLE }]}>Director</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}

      <Modal visible={createModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setCreateModal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setCreateModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Create Role Account</Text>
            <Pressable onPress={handleCreateManager} disabled={creating}>
              {creating ? <ActivityIndicator color={BLUE} size="small" /> : <Text style={styles.modalSave}>Create</Text>}
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
              {[
                { label: 'Full Name', key: 'name', placeholder: 'Jane Smith' },
                { label: 'Email', key: 'email', placeholder: 'jane@butterfield.com.au' },
                { label: 'Password', key: 'password', placeholder: 'Min 8 characters' },
                { label: 'Notes (optional)', key: 'notes', placeholder: 'e.g. Merrylands store manager' },
              ].map((field) => (
                <View key={field.key} style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    value={form[field.key as ManagerFormFieldKey]}
                    onChangeText={(value) => setForm((prev) => ({ ...prev, [field.key]: value }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={MUTED}
                    secureTextEntry={field.key === 'password'}
                    style={styles.input}
                  />
                </View>
              ))}

              <SectionTitle>ACCESS ROLE</SectionTitle>
              <View style={styles.rolePickerGrid}>
                {ACCESS_ROLE_OPTIONS.filter((option) => isMaster || (option.key !== 'director' && option.key !== 'master')).map((option) => {
                  const active = selectedAccessRole === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => { setSelectedAccessRole(option.key); Haptics.selectionAsync(); }}
                      style={[styles.rolePickerCard, { borderColor: active ? option.color : BORDER, backgroundColor: active ? `${option.color}12` : CARD }]}
                    >
                      <Text style={[styles.rolePickerTitle, { color: active ? option.color : TEXT }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <SectionTitle>INITIAL ACCESS</SectionTitle>
              {ALL_PERMISSIONS.map((permission) => (
                <View key={permission.key} style={styles.switchRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name={permission.icon as FeatherIconName} size={14} color={INDIGO} />
                    <Text style={{ fontSize: 14, fontWeight: '500', color: TEXT }}>{permission.label}</Text>
                  </View>
                  <Switch
                    value={formPerms.includes(permission.key)}
                    onValueChange={() => togglePerm(formPerms, permission.key, setFormPerms)}
                    trackColor={{ false: BORDER, true: INDIGO }}
                    thumbColor="#fff"
                    ios_backgroundColor={BORDER}
                  />
                </View>
              ))}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={createDirectorModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setCreateDirectorModal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setCreateDirectorModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Add Director</Text>
            <Pressable onPress={handleCreateDirector} disabled={creatingDirector}>
              {creatingDirector ? <ActivityIndicator color={BLUE} size="small" /> : <Text style={styles.modalSave}>Create</Text>}
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
              {[
                { label: 'Full Name', key: 'name', placeholder: 'Jane Smith' },
                { label: 'Email', key: 'email', placeholder: 'jane@butterfield.com.au' },
                { label: 'Password', key: 'password', placeholder: 'Min 8 characters' },
              ].map((field) => (
                <View key={field.key} style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    value={directorForm[field.key as DirectorFormFieldKey]}
                    onChangeText={(value) => setDirectorForm((prev) => ({ ...prev, [field.key]: value }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={MUTED}
                    secureTextEntry={field.key === 'password'}
                    style={styles.input}
                  />
                </View>
              ))}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  section: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 1.4, marginTop: 2 },
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 10,
  },
  roleDot: { width: 10, height: 10, borderRadius: 5 },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: { fontSize: 11, fontWeight: '600' },
  rolePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  rolePickerCard: {
    minWidth: 140,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  rolePickerTitle: { fontSize: 13, fontWeight: '700' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  emptyText: { fontSize: 14, fontWeight: '400', color: MUTED },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  modalCancel: { fontSize: 15, fontWeight: '400', color: MUTED },
  modalSave: { fontSize: 15, fontWeight: '700', color: BLUE },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: TEXT },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: TEXT,
    backgroundColor: '#FAFAFA',
  },
});
