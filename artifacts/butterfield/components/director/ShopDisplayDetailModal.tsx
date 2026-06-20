import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ShopDisplayUser, StaffStoreAssignment, StoreSummary } from '@/lib/api';
import { modal, wdl, styles } from '@/components/director/usersStyles';

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

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  return error instanceof Error ? error.message : fallback;
}

function ShopDisplayDetailModal({ user, visible, onClose, onRefresh }: {
  user: ShopDisplayUser | null; visible: boolean; onClose: () => void; onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'suspended'>('active');
  const [password, setPassword] = useState('');
  const [displayPermissions, setDisplayPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setPhone(user?.phone ?? '');
    setStatus(user?.status === 'inactive' || user?.status === 'suspended' ? user.status : 'active');
    setPassword('');
    setDisplayPermissions(user?.permissions ?? []);
  }, [user]);

  const { data: assignData, refetch: refetchAssignments } = useQuery({
    queryKey: ['director-shop-display-assignments', user?.id],
    queryFn: () => api.director.staffAssignments(user!.id),
    enabled: visible && !!user?.id,
  });
  const { data: storesData } = useQuery({
    queryKey: ['director-stores'],
    queryFn: () => api.director.storesList(),
    enabled: visible,
    staleTime: 60000,
  });
  const assignments: StaffStoreAssignment[] = assignData?.data ?? [];
  const stores: StoreSummary[] = storesData?.data ?? [];

  const handleAddAssignment = () => {
    if (!user) return;
    const assigned = assignments.map((assignment) => assignment.storeId);
    const available = stores.filter((store) => store.status !== 'closed' && !assigned.includes(store.id));
    if (available.length === 0) {
      Alert.alert('No stores left', 'This shop display is already assigned to every active store.');
      return;
    }
    Alert.alert('Assign Shop Display', 'Select a store for this counter iPad login:', [
      ...available.map((store) => ({
        text: `${store.name}${store.suburb ? ` – ${store.suburb}` : ''}`,
        onPress: async () => {
          try {
            await api.director.createAssignment({ staffId: user.id, storeId: store.id, isPrimary: assignments.length === 0 });
            await Promise.all([
              refetchAssignments(),
              qc.invalidateQueries({ queryKey: ['director-users'] }),
            ]);
          } catch (error) {
            Alert.alert('Error', getErrorMessage(error, 'Unable to assign this store right now.'));
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const handleSetPrimary = async (assignmentId: string) => {
    try {
      await api.director.updateAssignment(assignmentId, { isPrimary: true });
      await refetchAssignments();
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error, 'Unable to update the primary store.'));
    }
  };

  const handleRemoveAssignment = (assignmentId: string, storeName: string) => {
    Alert.alert('Remove store', `Remove ${storeName} from this shop display login?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.director.deleteAssignment(assignmentId);
            await Promise.all([
              refetchAssignments(),
              qc.invalidateQueries({ queryKey: ['director-users'] }),
            ]);
          } catch (error) {
            Alert.alert('Error', getErrorMessage(error, 'Unable to remove this store assignment.'));
          }
        },
      },
    ]);
  };

  const save = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await api.director.updateShopDisplay(user.id, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        status,
        permissions: displayPermissions,
      });
      if (password.trim()) {
        await api.director.resetShopDisplayPassword(user.id, password);
      }
      await onRefresh();
      onClose();
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const remove = () => {
    if (!user) return;
    Alert.alert('Delete shop display', `Delete ${user.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.director.deleteShopDisplay(user.id);
            await onRefresh();
            onClose();
          } catch (error) {
            Alert.alert('Error', getErrorMessage(error));
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: CARD }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[modal.header, { borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={modal.closeBtn}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
          <Text style={[modal.title, { color: TEXT }]}>Manage Shop Display</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="user" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={MUTED} />
          </View>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="mail" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={MUTED} autoCapitalize="none" />
          </View>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="phone" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} value={phone} onChangeText={setPhone} placeholder="Phone (optional)" placeholderTextColor={MUTED} />
          </View>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="lock" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} value={password} onChangeText={setPassword} placeholder="New password (optional)" placeholderTextColor={MUTED} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['active', 'inactive', 'suspended'] as const).map((option) => (
              <Pressable key={option} onPress={() => { setStatus(option); Haptics.selectionAsync(); }} style={[modal.chip, { backgroundColor: status === option ? BLUE : BG, borderColor: status === option ? BLUE : BORDER }]}>
                <Text style={[modal.chipText, { color: status === option ? '#fff' : TEXT }]}>{option}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[wdl.card, { gap: 10 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>Assigned Stores</Text>
              <Pressable onPress={handleAddAssignment} style={[styles.addBtn, { backgroundColor: '#DBEAFE' }]}>
                <Feather name="plus" size={13} color="#1D4ED8" />
                <Text style={[styles.addBtnText, { color: '#1D4ED8' }]}>Assign</Text>
              </Pressable>
            </View>
            {assignments.length === 0 ? (
              <Text style={{ fontSize: 13, color: MUTED, lineHeight: 18 }}>
                No stores assigned yet. Assign the shop display to the store locations it should run for.
              </Text>
            ) : (
              assignments.map((assignment) => (
                <View key={assignment.id} style={[styles.subRow, { marginTop: 0, borderTopWidth: 0, borderRadius: 14, backgroundColor: BG }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.subTitle}>{assignment.storeName ?? assignment.storeId}</Text>
                      {assignment.isPrimary && (
                        <View style={{ backgroundColor: '#DBEAFE', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#1D4ED8' }}>PRIMARY</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.subSub}>{assignment.storeSuburb ?? 'Store assignment'}</Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    {!assignment.isPrimary && (
                      <Pressable onPress={() => { void handleSetPrimary(assignment.id); }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: BLUE }}>Set Primary</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => handleRemoveAssignment(assignment.id, assignment.storeName ?? 'this store')}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: RED }}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
          <View style={[wdl.card, { gap: 12 }]}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>Display Permissions</Text>
            <Text style={{ fontSize: 13, color: MUTED, lineHeight: 18 }}>Enable optional tabs on this Shop Display iPad login.</Text>
            {([
              { key: 'products',  label: 'Products tab',  sub: 'View product catalogue & availability', icon: 'package' },
              { key: 'customers', label: 'Customers tab', sub: 'Loyalty lookup by name, email or phone',  icon: 'users'   },
            ] as { key: string; label: string; sub: string; icon: React.ComponentProps<typeof Feather>['name'] }[]).map(({ key, label, sub, icon }) => (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Feather name={icon} size={16} color={BLUE} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>{label}</Text>
                  <Text style={{ fontSize: 12, color: MUTED }}>{sub}</Text>
                </View>
                <Switch
                  value={displayPermissions.includes(key)}
                  onValueChange={(val) => {
                    Haptics.selectionAsync();
                    setDisplayPermissions((prev) => val ? [...prev.filter((p) => p !== key), key] : prev.filter((p) => p !== key));
                  }}
                  trackColor={{ false: '#E5E7EB', true: '#BBF7D0' }}
                  thumbColor={displayPermissions.includes(key) ? '#16A34A' : '#9CA3AF'}
                />
              </View>
            ))}
          </View>
          <Pressable onPress={save} disabled={loading} style={[modal.submitBtn, { backgroundColor: BLUE }]}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={modal.submitBtnText}>Save Changes</Text>}
          </Pressable>
          <Pressable onPress={remove} style={[modal.submitBtn, { backgroundColor: RED }]}>
            <Text style={modal.submitBtnText}>Delete Login</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export { ShopDisplayDetailModal };
