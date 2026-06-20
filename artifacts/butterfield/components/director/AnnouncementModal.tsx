import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, Switch, Text, TextInput, View,
} from 'react-native';
import { api } from '@/lib/api';

function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}
import type { DirectorAnnouncement } from '@/lib/api';
import { styles } from './settingsStyles';

const BLUE   = '#1493FF';
const BORDER = '#E5E7EB';
const MUTED  = '#8E8E93';
const TEXT   = '#1C1C1E';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

const TARGET_ROLES = ['customer', 'staff', 'wholesale'];

export default function AnnouncementModal({ visible, announcement, onClose, onSuccess }: {
  visible: boolean;
  announcement: DirectorAnnouncement | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title,       setTitle]       = useState('');
  const [body,        setBody]        = useState('');
  const [isPinned,    setIsPinned]    = useState(false);
  const [isActive,    setIsActive]    = useState(true);
  const [targetRoles, setTargetRoles] = useState<string[]>(['customer']);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    if (announcement) {
      setTitle(announcement.title); setBody(announcement.body);
      setIsPinned(announcement.isPinned); setIsActive(announcement.isActive);
      setTargetRoles(announcement.targetRoles);
    } else {
      setTitle(''); setBody(''); setIsPinned(false); setIsActive(true); setTargetRoles(['customer']);
    }
    setError('');
  }, [announcement, visible]);

  const toggleRole = (role: string) => {
    setTargetRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
    Haptics.selectionAsync();
  };

  const submit = async () => {
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!body.trim())  { setError('Body is required.'); return; }
    if (targetRoles.length === 0) { setError('Select at least one audience.'); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const payload = { title: title.trim(), body: body.trim(), isPinned, isActive, targetRoles };
      if (announcement?.id) await api.director.updateAnnouncement(announcement.id, payload);
      else                   await api.director.createAnnouncement(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose}><Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>{announcement ? 'Edit Announcement' : 'New Announcement'}</Text>
          <Pressable onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={BLUE} /> : <Text style={[styles.modalSave, { color: BLUE }]}>Publish</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {error ? <Text style={[styles.errorText, { color: RED }]}>{error}</Text> : null}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={title}
              onChangeText={setTitle} placeholder="e.g. New Summer Menu!" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Message *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT, minHeight: 100 }]}
              value={body} onChangeText={setBody} multiline
              placeholder="What do you want to tell your customers?"
              placeholderTextColor={MUTED} textAlignVertical="top" />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>Audience</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TARGET_ROLES.map(role => (
                <Pressable key={role} onPress={() => toggleRole(role)}
                  style={[styles.chip, { backgroundColor: targetRoles.includes(role) ? BLUE : '#F3F4F6', borderColor: targetRoles.includes(role) ? BLUE : BORDER }]}>
                  <Text style={[styles.chipText, { color: targetRoles.includes(role) ? '#fff' : TEXT }]}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Pin to top of feed</Text>
            <Switch value={isPinned} onValueChange={v => { setIsPinned(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: AMBER }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Active (visible to users)</Text>
            <Switch value={isActive} onValueChange={v => { setIsActive(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: GREEN }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
