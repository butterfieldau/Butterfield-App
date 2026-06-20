import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, Text, TextInput, View,
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

const BLUE   = '#1493FF';
const BORDER = '#E5E7EB';
const MUTED  = '#8E8E93';
const TEXT   = '#1C1C1E';
const RED    = '#EF4444';
const PURPLE = '#7C3AED';

interface DirectorFormData { name: string; email: string; password: string; }
type DirectorFormFieldKey = keyof DirectorFormData;

export function DirectorsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['master-directors'],
    queryFn: () => api.director.directors.list(),
  });
  const directors: DirectorUserSummary[] = data?.data ?? [];

  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState<DirectorFormData>({ name: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      Alert.alert('Missing fields', 'Name, email and password are required.'); return;
    }
    if (form.password.length < 8) {
      Alert.alert('Password too short', 'Password must be at least 8 characters.'); return;
    }
    setCreating(true);
    try {
      await api.director.directors.create(form);
      await qc.invalidateQueries({ queryKey: ['master-directors'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateModal(false);
      setForm({ name: '', email: '', password: '' });
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally { setCreating(false); }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Remove Director', `Remove ${name}'s director access? This will permanently delete their account.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.director.directors.delete(id);
          await qc.invalidateQueries({ queryKey: ['master-directors'] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch (e) { Alert.alert('Error', getErrorMessage(e)); }
      }},
    ]);
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: '#F5F3FF', borderColor: PURPLE + '30' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="shield" size={16} color={PURPLE} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: PURPLE }}>Master Account Controls</Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '400', color: '#6D28D9', lineHeight: 18 }}>
            Directors have full access to all store management features, but cannot add or remove other directors. Only the master account can manage directors.
          </Text>
        </View>

        <Pressable onPress={() => { Haptics.selectionAsync(); setCreateModal(true); }}
          style={[styles.addBtn, { backgroundColor: PURPLE }]}>
          <Feather name="user-plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add Director</Text>
        </Pressable>

        {directors.length === 0 ? (
          <View style={styles.center}>
            <Feather name="users" size={40} color={BORDER} />
            <Text style={styles.emptyText}>No directors yet. Add one above.</Text>
          </View>
        ) : (
          directors.map((d) => (
            <View key={d.id} style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{d.name}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 }}>{d.email}</Text>
                  <View style={[styles.chip, { backgroundColor: PURPLE + '18', borderColor: PURPLE + '40', alignSelf: 'flex-start', marginTop: 6 }]}>
                    <Text style={[styles.chipText, { color: PURPLE }]}>DIRECTOR</Text>
                  </View>
                </View>
                <Pressable onPress={() => handleDelete(d.id, d.name)} style={{ padding: 6 }}>
                  <Feather name="trash-2" size={18} color={RED} />
                </Pressable>
              </View>
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
            <Text style={styles.modalTitle}>New Director</Text>
            <Pressable onPress={handleCreate} disabled={creating}>
              {creating ? <ActivityIndicator color={BLUE} size="small" /> :
                <Text style={[styles.modalSave, { color: BLUE }]}>Create</Text>}
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
              <View style={[styles.card, { backgroundColor: '#F5F3FF', borderColor: PURPLE + '30' }]}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#6D28D9', lineHeight: 18 }}>
                  Directors have the same access as this master account, except they cannot manage other directors.
                </Text>
              </View>
              {[
                { label: 'Full Name', key: 'name',     placeholder: 'Jane Smith' },
                { label: 'Email',     key: 'email',    placeholder: 'jane@butterfield.com.au' },
                { label: 'Password',  key: 'password', placeholder: 'Min 8 characters' },
              ].map(field => (
                <View key={field.key} style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    value={form[field.key as DirectorFormFieldKey]}
                    onChangeText={v => setForm(p => ({ ...p, [field.key]: v }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={MUTED}
                    secureTextEntry={field.key === 'password'}
                    style={[styles.input, { color: TEXT, borderColor: BORDER }]}
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
