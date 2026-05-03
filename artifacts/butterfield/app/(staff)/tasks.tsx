import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG = '#0D0604';
const CARD = '#1A0A04';
const ACCENT = '#C8833A';

const CATEGORIES = ['daily', 'opening', 'closing', 'prep', 'cleaning', 'training'];
const CAT_COLORS: Record<string, string> = {
  daily: '#3B82F6', opening: '#22C55E', closing: '#F59E0B', prep: ACCENT, cleaning: '#8B5CF6', training: '#06B6D4',
};

type TabMode = 'tasks' | 'wastage' | 'issues' | 'leave';

export default function StaffTasksScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ initialTab?: TabMode }>();
  const [tab, setTab] = useState<TabMode>('tasks');

  useEffect(() => {
    if (params.initialTab && (['tasks', 'wastage', 'issues', 'leave'] as TabMode[]).includes(params.initialTab)) {
      setTab(params.initialTab);
    }
  }, [params.initialTab]);
  const [activeCat, setActiveCat] = useState('daily');
  const [submitting, setSubmitting] = useState(false);

  const { data: tasksData, refetch, isRefetching } = useQuery({ queryKey: ['staff-tasks', activeCat], queryFn: () => api.staff.tasks(activeCat), retry: 1 });
  const { data: wastageData, refetch: refetchWastage } = useQuery({ queryKey: ['staff-wastage'], queryFn: () => api.staff.wastage(), retry: 1, enabled: tab === 'wastage' });
  const tasks = tasksData?.data ?? [];
  const wastageList = wastageData?.data ?? [];

  const [wastageForm, setWastageForm] = useState({ productName: '', quantity: '', unit: 'units', reason: '' });
  const [issueForm, setIssueForm] = useState({ title: '', description: '', priority: 'medium' });
  const [leaveForm, setLeaveForm] = useState({ startDate: '', endDate: '', type: 'annual', reason: '' });

  const handleCompleteTask = async (id: string, isCompleted: boolean) => {
    Haptics.selectionAsync();
    try { await api.staff.completeTask(id, !isCompleted); qc.invalidateQueries({ queryKey: ['staff-tasks', activeCat] }); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleWastage = async () => {
    if (!wastageForm.productName || !wastageForm.quantity || !wastageForm.reason) { Alert.alert('Fill all fields'); return; }
    setSubmitting(true);
    try {
      await api.staff.logWastage(wastageForm);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWastageForm({ productName: '', quantity: '', unit: 'units', reason: '' });
      qc.invalidateQueries({ queryKey: ['staff-wastage'] });
      Alert.alert('Logged', 'Wastage recorded successfully.');
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setSubmitting(false); }
  };

  const handleIssue = async () => {
    if (!issueForm.title || !issueForm.description) { Alert.alert('Fill all fields'); return; }
    setSubmitting(true);
    try {
      await api.staff.reportIssue(issueForm);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIssueForm({ title: '', description: '', priority: 'medium' });
      Alert.alert('Reported', 'Issue submitted to management.');
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setSubmitting(false); }
  };

  const handleLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason) { Alert.alert('Fill all fields'); return; }
    setSubmitting(true);
    try {
      await api.staff.requestLeave(leaveForm);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLeaveForm({ startDate: '', endDate: '', type: 'annual', reason: '' });
      Alert.alert('Submitted', 'Leave request sent to management.');
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setSubmitting(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.title, { fontFamily: 'Inter_700Bold', color: '#fff' }]}>Staff Tools</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(['tasks', 'wastage', 'issues', 'leave'] as TabMode[]).map((t) => (
            <Pressable key={t} onPress={() => { setTab(t); Haptics.selectionAsync(); }}
              style={[styles.tabPill, { backgroundColor: tab === t ? ACCENT : CARD, borderRadius: 20 }]}>
              <Text style={[{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: tab === t ? '#fff' : 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }]}>{t === 'leave' ? 'Leave' : t}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {tab === 'tasks' && (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}>
            {CATEGORIES.map((c) => (
              <Pressable key={c} onPress={() => { setActiveCat(c); Haptics.selectionAsync(); qc.invalidateQueries({ queryKey: ['staff-tasks', c] }); }}
                style={[styles.catPill, { backgroundColor: activeCat === c ? CAT_COLORS[c] : CARD, borderRadius: 20 }]}>
                <Text style={[{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#fff', textTransform: 'capitalize' }]}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <FlatList
            data={tasks}
            keyExtractor={(t) => t.id}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={ACCENT} />}
            contentContainerStyle={{ padding: 20, gap: 10, paddingTop: 0, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={[{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 40, fontFamily: 'Inter_400Regular' }]}>No tasks in this category.</Text>}
            renderItem={({ item: task }) => (
              <Pressable onPress={() => handleCompleteTask(task.id, task.isCompleted)}
                style={[styles.taskRow, { backgroundColor: CARD, borderRadius: 14, borderLeftColor: task.isCompleted ? '#22C55E' : CAT_COLORS[task.category] ?? ACCENT, borderLeftWidth: 3 }]}>
                <View style={[styles.taskCheck, { borderColor: task.isCompleted ? '#22C55E' : 'rgba(255,255,255,0.3)', backgroundColor: task.isCompleted ? '#22C55E' : 'transparent', borderWidth: 2, borderRadius: 8 }]}>
                  {task.isCompleted && <Feather name="check" size={12} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: task.isCompleted ? 'rgba(255,255,255,0.35)' : '#fff', fontFamily: 'Inter_500Medium', fontSize: 14, textDecorationLine: task.isCompleted ? 'line-through' : 'none' }]}>{task.title}</Text>
                  {task.description && <Text style={[{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 }]}>{task.description}</Text>}
                  {task.completedBy && <Text style={[{ color: '#22C55E', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }]}>✓ {task.completedBy}</Text>}
                </View>
              </Pressable>
            )}
          />
        </View>
      )}

      {tab === 'wastage' && (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 100 }}>
          <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 17, marginBottom: 4 }]}>Log Wastage</Text>
          {[
            { label: 'Product name', key: 'productName', placeholder: 'e.g. Classic Choc Chip' },
            { label: 'Quantity', key: 'quantity', placeholder: 'e.g. 3' },
            { label: 'Reason', key: 'reason', placeholder: 'e.g. Burnt, dropped, overproduced' },
          ].map((field) => (
            <View key={field.key}>
              <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 6 }]}>{field.label}</Text>
              <TextInput style={[styles.input, { backgroundColor: CARD, color: '#fff', fontFamily: 'Inter_400Regular', borderRadius: 12 }]}
                placeholder={field.placeholder} placeholderTextColor="rgba(255,255,255,0.25)"
                value={(wastageForm as any)[field.key]} onChangeText={(v) => setWastageForm((f) => ({ ...f, [field.key]: v }))} />
            </View>
          ))}
          <Pressable onPress={handleWastage} disabled={submitting} style={[styles.submitBtn, { backgroundColor: ACCENT, borderRadius: 14 }]}>
            <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 }]}>{submitting ? 'Logging...' : 'Log Wastage'}</Text>
          </Pressable>
          {wastageList.length > 0 && (
            <View style={{ gap: 8, marginTop: 8 }}>
              <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 1 }]}>RECENT LOGS</Text>
              {wastageList.slice(0, 5).map((w: any) => (
                <View key={w.id} style={[styles.taskRow, { backgroundColor: CARD, borderRadius: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: '#fff', fontFamily: 'Inter_500Medium', fontSize: 13 }]}>{w.productName} × {w.quantity}</Text>
                    <Text style={[{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 11 }]}>{w.reason}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {tab === 'issues' && (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 100 }}>
          <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 17, marginBottom: 4 }]}>Report an Issue</Text>
          {[
            { label: 'Title', key: 'title', placeholder: 'Brief description of the issue' },
            { label: 'Details', key: 'description', placeholder: 'What happened? Where? When?', multiline: true },
          ].map((field) => (
            <View key={field.key}>
              <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 6 }]}>{field.label}</Text>
              <TextInput style={[styles.input, { backgroundColor: CARD, color: '#fff', fontFamily: 'Inter_400Regular', borderRadius: 12, minHeight: field.multiline ? 80 : 50 }]}
                placeholder={field.placeholder} placeholderTextColor="rgba(255,255,255,0.25)"
                value={(issueForm as any)[field.key]} onChangeText={(v) => setIssueForm((f) => ({ ...f, [field.key]: v }))}
                multiline={field.multiline} numberOfLines={field.multiline ? 4 : 1} />
            </View>
          ))}
          <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 4 }]}>Priority</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['low', 'medium', 'high', 'urgent'].map((p) => (
              <Pressable key={p} onPress={() => setIssueForm((f) => ({ ...f, priority: p }))}
                style={[styles.catPill, { backgroundColor: issueForm.priority === p ? ACCENT : CARD, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }]}>
                <Text style={[{ color: '#fff', fontFamily: 'Inter_500Medium', fontSize: 12, textTransform: 'capitalize' }]}>{p}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={handleIssue} disabled={submitting} style={[styles.submitBtn, { backgroundColor: ACCENT, borderRadius: 14 }]}>
            <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 }]}>{submitting ? 'Submitting...' : 'Report Issue'}</Text>
          </Pressable>
        </ScrollView>
      )}

      {tab === 'leave' && (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 100 }}>
          <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 17, marginBottom: 4 }]}>Leave Request</Text>
          {[
            { label: 'Start date (DD/MM/YYYY)', key: 'startDate', placeholder: '01/06/2026' },
            { label: 'End date (DD/MM/YYYY)', key: 'endDate', placeholder: '05/06/2026' },
            { label: 'Reason', key: 'reason', placeholder: 'Reason for leave', multiline: true },
          ].map((field) => (
            <View key={field.key}>
              <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 6 }]}>{field.label}</Text>
              <TextInput style={[styles.input, { backgroundColor: CARD, color: '#fff', fontFamily: 'Inter_400Regular', borderRadius: 12, minHeight: field.multiline ? 80 : 50 }]}
                placeholder={field.placeholder} placeholderTextColor="rgba(255,255,255,0.25)"
                value={(leaveForm as any)[field.key]} onChangeText={(v) => setLeaveForm((f) => ({ ...f, [field.key]: v }))}
                multiline={field.multiline} />
            </View>
          ))}
          <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 4 }]}>Leave type</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['annual', 'sick', 'personal', 'other'].map((t) => (
              <Pressable key={t} onPress={() => setLeaveForm((f) => ({ ...f, type: t }))}
                style={[styles.catPill, { backgroundColor: leaveForm.type === t ? ACCENT : CARD, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 }]}>
                <Text style={[{ color: '#fff', fontFamily: 'Inter_500Medium', fontSize: 12, textTransform: 'capitalize' }]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={handleLeave} disabled={submitting} style={[styles.submitBtn, { backgroundColor: ACCENT, borderRadius: 14 }]}>
            <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 }]}>{submitting ? 'Submitting...' : 'Submit Request'}</Text>
          </Pressable>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, gap: 12, paddingBottom: 8 },
  title: { fontSize: 26 },
  tabPill: { paddingHorizontal: 16, paddingVertical: 8 },
  catPill: { paddingHorizontal: 14, paddingVertical: 7 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  taskCheck: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  input: { padding: 14, fontSize: 14 },
  submitBtn: { paddingVertical: 16, alignItems: 'center', marginTop: 8 },
});
