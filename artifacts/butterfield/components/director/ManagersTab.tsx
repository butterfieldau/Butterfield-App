import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, Switch, Text, TextInput, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}
import type { DirectorUserSummary } from '@/lib/api';
import { BG } from './directorColors';
import { styles } from './settingsStyles';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

const BLUE   = '#1493FF';
const BORDER = '#E5E7EB';
const MUTED  = '#8E8E93';
const TEXT   = '#1C1C1E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const INDIGO = '#3730A3';
const GREEN  = '#22C55E';

const ALL_PERMISSIONS = [
  { key: 'dashboard',     label: 'Dashboard',     icon: 'grid'        },
  { key: 'orders',        label: 'Orders',        icon: 'shopping-bag'},
  { key: 'users',         label: 'Users',         icon: 'users'       },
  { key: 'timesheets',    label: 'Timesheets',    icon: 'clock'       },
  { key: 'tasks',         label: 'Tasks',         icon: 'clipboard'   },
  { key: 'products',      label: 'Products',      icon: 'package'     },
  { key: 'reports',       label: 'Reports',       icon: 'bar-chart-2' },
  { key: 'rewards',       label: 'Rewards',       icon: 'gift'        },
  { key: 'announcements', label: 'Announcements', icon: 'bell'        },
  { key: 'settings',      label: 'Settings',      icon: 'settings'    },
  { key: 'pricing',       label: 'Pricing',       icon: 'dollar-sign' },
  { key: 'banners',       label: 'Banner',        icon: 'image'       },
  { key: 'stock',         label: 'Stock',         icon: 'archive'     },
] as const;

interface ManagerFormData { name: string; email: string; password: string; notes: string; }
type ManagerFormFieldKey = keyof ManagerFormData;

function togglePerm(set: string[], key: string, setter: (v: string[]) => void) {
  Haptics.selectionAsync();
  setter(set.includes(key) ? set.filter(p => p !== key) : [...set, key]);
}

export function ManagersTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['director-managers'],
    queryFn: () => api.director.managers.list(),
  });
  const managers: DirectorUserSummary[] = data?.data ?? [];

  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState<ManagerFormData>({ name: '', email: '', password: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [formPerms, setFormPerms] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      Alert.alert('Missing fields', 'Name, email and password are required.'); return;
    }
    setCreating(true);
    try {
      await api.director.managers.create({ ...form, permissions: formPerms });
      await qc.invalidateQueries({ queryKey: ['director-managers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateModal(false);
      setForm({ name: '', email: '', password: '', notes: '' });
      setFormPerms([]);
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally { setCreating(false); }
  };

  const handleSavePerms = async (id: string) => {
    setSavingPerms(true);
    try {
      await api.director.managers.updatePermissions(id, { permissions: editPerms });
      await qc.invalidateQueries({ queryKey: ['director-managers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingId(null);
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally { setSavingPerms(false); }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Remove Manager', `Remove ${name}'s manager access? Their account will become a staff account.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.director.managers.delete(id);
          await qc.invalidateQueries({ queryKey: ['director-managers'] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch (e) { Alert.alert('Error', getErrorMessage(e)); }
      }},
    ]);
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => { Haptics.selectionAsync(); setCreateModal(true); }}
          style={[styles.addBtn, { backgroundColor: INDIGO }]}>
          <Feather name="user-plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add Manager</Text>
        </Pressable>

        {managers.length === 0 ? (
          <View style={styles.center}>
            <Feather name="users" size={40} color={BORDER} />
            <Text style={styles.emptyText}>No managers yet. Add one above.</Text>
          </View>
        ) : (
          managers.map((m) => (
            <View key={m.id} style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{m.name}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 }}>{m.email}</Text>
                </View>
                <Pressable onPress={() => handleDelete(m.id, m.name)} style={{ padding: 6 }}>
                  <Feather name="trash-2" size={18} color={RED} />
                </Pressable>
              </View>

              {m.notes ? <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED }}>{m.notes}</Text> : null}
              <View style={{ height: 1, backgroundColor: BORDER }} />

              {editingId === m.id ? (
                <>
                  {ALL_PERMISSIONS.map(p => (
                    <View key={p.key} style={styles.switchRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Feather name={p.icon as FeatherIconName} size={14} color={INDIGO} />
                        <Text style={{ fontSize: 14, fontWeight: '500', color: TEXT }}>{p.label}</Text>
                      </View>
                      <Switch
                        value={editPerms.includes(p.key)}
                        onValueChange={() => togglePerm(editPerms, p.key, setEditPerms)}
                        trackColor={{ false: BORDER, true: INDIGO }}
                        thumbColor="#fff"
                        ios_backgroundColor={BORDER}
                      />
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={() => setEditingId(null)}
                      style={[styles.actionBtn, { flex: 1, borderColor: BORDER, justifyContent: 'center' }]}>
                      <Text style={[styles.actionBtnText, { color: MUTED }]}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={() => handleSavePerms(m.id)} disabled={savingPerms}
                      style={[styles.actionBtn, { flex: 1, backgroundColor: INDIGO, borderColor: INDIGO, justifyContent: 'center' }]}>
                      {savingPerms ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.actionBtnText, { color: '#fff' }]}>Save permissions</Text>}
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {(m.permissions as string[]).length === 0 ? (
                      <Text style={{ fontSize: 12, fontWeight: '400', color: AMBER }}>No permissions — manager cannot see any tabs</Text>
                    ) : (m.permissions as string[]).map((p: string) => (
                      <View key={p} style={[styles.chip, { backgroundColor: INDIGO + '18', borderColor: INDIGO + '40' }]}>
                        <Text style={[styles.chipText, { color: INDIGO }]}>{p}</Text>
                      </View>
                    ))}
                  </View>
                  <Pressable onPress={() => { setEditingId(m.id); setEditPerms([...(m.permissions as string[])]); }}
                    style={[styles.actionBtn, { borderColor: INDIGO, alignSelf: 'flex-start' }]}>
                    <Feather name="edit-2" size={12} color={INDIGO} />
                    <Text style={[styles.actionBtnText, { color: INDIGO }]}>Edit permissions</Text>
                  </Pressable>
                </>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={createModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setCreateModal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
            <Pressable onPress={() => setCreateModal(false)}>
              <Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>New Manager</Text>
            <Pressable onPress={handleCreate} disabled={creating}>
              {creating ? <ActivityIndicator color={BLUE} size="small" /> :
                <Text style={[styles.modalSave, { color: BLUE }]}>Create</Text>}
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
              {[
                { label: 'Full Name', key: 'name', placeholder: 'Jane Smith' },
                { label: 'Email', key: 'email', placeholder: 'jane@butterfield.com.au' },
                { label: 'Password', key: 'password', placeholder: 'Min 8 characters' },
                { label: 'Notes (optional)', key: 'notes', placeholder: 'e.g. Sydney store manager' },
              ].map(field => (
                <View key={field.key} style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    value={form[field.key as ManagerFormFieldKey]}
                    onChangeText={v => setForm(p => ({ ...p, [field.key]: v }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={MUTED}
                    secureTextEntry={field.key === 'password'}
                    style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                  />
                </View>
              ))}

              <Text style={[styles.section, { marginTop: 8 }]}>INITIAL PERMISSIONS</Text>
              {ALL_PERMISSIONS.map(p => (
                <View key={p.key} style={styles.switchRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name={p.icon as FeatherIconName} size={14} color={INDIGO} />
                    <Text style={{ fontSize: 14, fontWeight: '500', color: TEXT }}>{p.label}</Text>
                  </View>
                  <Switch
                    value={formPerms.includes(p.key)}
                    onValueChange={() => togglePerm(formPerms, p.key, setFormPerms)}
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
    </>
  );
}
