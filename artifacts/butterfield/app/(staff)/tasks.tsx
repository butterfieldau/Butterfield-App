import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const CATEGORIES = ['daily', 'opening', 'closing', 'prep', 'cleaning', 'training'];
const CAT_COLORS: Record<string, string> = {
  daily: '#3B82F6', opening: '#22C55E', closing: '#F59E0B', prep: '#F97316', cleaning: '#8B5CF6', training: '#06B6D4',
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

  const TABS: { id: TabMode; label: string }[] = [
    { id: 'tasks', label: 'Tasks' }, { id: 'wastage', label: 'Wastage' },
    { id: 'issues', label: 'Issues' }, { id: 'leave', label: 'Leave' },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: BORDER }]}>
        <Text style={[styles.title, { fontFamily: 'Inter_700Bold', color: TEXT }]}>Staff Tools</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TABS.map((t) => (
            <Pressable key={t.id} onPress={() => { setTab(t.id); Haptics.selectionAsync(); }}
              style={[styles.tabPill, { backgroundColor: tab === t.id ? BLUE : BG, borderRadius: 20, borderWidth: 1, borderColor: tab === t.id ? BLUE : BORDER }]}>
              <Text style={[{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: tab === t.id ? '#fff' : MUTED }]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {tab === 'tasks' && (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
            {CATEGORIES.map((c) => (
              <Pressable key={c} onPress={() => { setActiveCat(c); Haptics.selectionAsync(); }}
                style={[styles.catPill, { backgroundColor: activeCat === c ? CAT_COLORS[c] : CARD, borderRadius: 20, borderWidth: 1, borderColor: activeCat === c ? CAT_COLORS[c] : BORDER }]}>
                <Text style={[{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: activeCat === c ? '#fff' : MUTED, textTransform: 'capitalize' }]}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <FlatList
            data={tasks}
            keyExtractor={(t) => t.id}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={[{ color: MUTED, textAlign: 'center', marginTop: 40, fontFamily: 'Inter_400Regular' }]}>No tasks in this category.</Text>}
            renderItem={({ item: task }) => (
              <Pressable onPress={() => handleCompleteTask(task.id, task.isCompleted)}
                style={[styles.taskRow, { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, borderLeftColor: task.isCompleted ? '#22C55E' : (CAT_COLORS[task.category] ?? BLUE), borderLeftWidth: 3 }]}>
                <View style={[styles.taskCheck, { borderColor: task.isCompleted ? '#22C55E' : BORDER, backgroundColor: task.isCompleted ? '#22C55E' : '#fff', borderWidth: 2, borderRadius: 8 }]}>
                  {task.isCompleted && <Feather name="check" size={12} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: task.isCompleted ? MUTED : TEXT, fontFamily: 'Inter_500Medium', fontSize: 14, textDecorationLine: task.isCompleted ? 'line-through' : 'none' }]}>{task.title}</Text>
                  {task.description && <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 }]}>{task.description}</Text>}
                  {task.completedBy && <Text style={[{ color: '#22C55E', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }]}>✓ {task.completedBy}</Text>}
                </View>
              </Pressable>
            )}
          />
        </View>
      )}

      {tab === 'wastage' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
          <Text style={[{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 20, marginBottom: 4 }]}>Log Wastage</Text>
          {[
            { label: 'Product name', key: 'productName', placeholder: 'e.g. Classic Choc Chip' },
            { label: 'Quantity', key: 'quantity', placeholder: 'e.g. 3', keyboardType: 'number-pad' as const },
            { label: 'Reason', key: 'reason', placeholder: 'e.g. Burnt, dropped, overproduced' },
          ].map((field) => (
            <View key={field.key}>
              <Text style={[{ color: MUTED, fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 6 }]}>{field.label.toUpperCase()}</Text>
              <TextInput style={[styles.input, { backgroundColor: CARD, color: TEXT, fontFamily: 'Inter_400Regular', borderRadius: 12, borderColor: BORDER, borderWidth: 1 }]}
                placeholder={field.placeholder} placeholderTextColor={MUTED}
                keyboardType={field.keyboardType}
                value={(wastageForm as any)[field.key]} onChangeText={(v) => setWastageForm((f) => ({ ...f, [field.key]: v }))} />
            </View>
          ))}
          <Pressable onPress={handleWastage} disabled={submitting} style={[styles.submitBtn, { backgroundColor: BLUE, borderRadius: 14 }]}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 }]}>Log Wastage</Text>}
          </Pressable>
          {wastageList.length > 0 && (
            <View style={{ gap: 8, marginTop: 8 }}>
              <Text style={[{ color: MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1 }]}>RECENT LOGS</Text>
              {wastageList.slice(0, 5).map((w: any) => (
                <View key={w.id} style={[styles.taskRow, { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: TEXT, fontFamily: 'Inter_500Medium', fontSize: 13 }]}>{w.productName} × {w.quantity}</Text>
                    <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11 }]}>{w.reason}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {tab === 'issues' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
          <Text style={[{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 20, marginBottom: 4 }]}>Report an Issue</Text>
          {[
            { label: 'Title', key: 'title', placeholder: 'Brief description of the issue' },
            { label: 'Details', key: 'description', placeholder: 'What happened? Where? When?', multiline: true },
          ].map((field) => (
            <View key={field.key}>
              <Text style={[{ color: MUTED, fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 6 }]}>{field.label.toUpperCase()}</Text>
              <TextInput style={[styles.input, { backgroundColor: CARD, color: TEXT, fontFamily: 'Inter_400Regular', borderRadius: 12, borderColor: BORDER, borderWidth: 1, minHeight: field.multiline ? 80 : 50 }]}
                placeholder={field.placeholder} placeholderTextColor={MUTED}
                value={(issueForm as any)[field.key]} onChangeText={(v) => setIssueForm((f) => ({ ...f, [field.key]: v }))}
                multiline={field.multiline} numberOfLines={field.multiline ? 4 : 1} />
            </View>
          ))}
          <Text style={[{ color: MUTED, fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 4 }]}>PRIORITY</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['low', 'medium', 'high', 'urgent'].map((p) => {
              const pColors: Record<string, string> = { low: '#22C55E', medium: BLUE, high: '#F59E0B', urgent: '#EF4444' };
              const pc = pColors[p] ?? BLUE;
              return (
                <Pressable key={p} onPress={() => setIssueForm((f) => ({ ...f, priority: p }))}
                  style={[styles.catPill, { backgroundColor: issueForm.priority === p ? pc : CARD, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: issueForm.priority === p ? pc : BORDER }]}>
                  <Text style={[{ color: issueForm.priority === p ? '#fff' : MUTED, fontFamily: 'Inter_500Medium', fontSize: 12, textTransform: 'capitalize' }]}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={handleIssue} disabled={submitting} style={[styles.submitBtn, { backgroundColor: '#EF4444', borderRadius: 14 }]}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 }]}>Report Issue</Text>}
          </Pressable>
        </ScrollView>
      )}

      {tab === 'leave' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
          <Text style={[{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 20, marginBottom: 4 }]}>Leave Request</Text>
          {[
            { label: 'Start date (DD/MM/YYYY)', key: 'startDate', placeholder: '01/06/2026' },
            { label: 'End date (DD/MM/YYYY)', key: 'endDate', placeholder: '05/06/2026' },
            { label: 'Reason', key: 'reason', placeholder: 'Reason for leave', multiline: true },
          ].map((field) => (
            <View key={field.key}>
              <Text style={[{ color: MUTED, fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 6 }]}>{field.label.toUpperCase()}</Text>
              <TextInput style={[styles.input, { backgroundColor: CARD, color: TEXT, fontFamily: 'Inter_400Regular', borderRadius: 12, borderColor: BORDER, borderWidth: 1, minHeight: field.multiline ? 80 : 50 }]}
                placeholder={field.placeholder} placeholderTextColor={MUTED}
                value={(leaveForm as any)[field.key]} onChangeText={(v) => setLeaveForm((f) => ({ ...f, [field.key]: v }))}
                multiline={field.multiline} />
            </View>
          ))}
          <Text style={[{ color: MUTED, fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 4 }]}>LEAVE TYPE</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['annual', 'sick', 'personal', 'other'].map((t) => (
              <Pressable key={t} onPress={() => setLeaveForm((f) => ({ ...f, type: t }))}
                style={[styles.catPill, { backgroundColor: leaveForm.type === t ? BLUE : CARD, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: leaveForm.type === t ? BLUE : BORDER }]}>
                <Text style={[{ color: leaveForm.type === t ? '#fff' : MUTED, fontFamily: 'Inter_500Medium', fontSize: 12, textTransform: 'capitalize' }]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={handleLeave} disabled={submitting} style={[styles.submitBtn, { backgroundColor: BLUE, borderRadius: 14 }]}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 }]}>Submit Request</Text>}
          </Pressable>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, gap: 12, paddingBottom: 12 },
  title: { fontSize: 26 },
  tabPill: { paddingHorizontal: 16, paddingVertical: 8 },
  catPill: { paddingHorizontal: 14, paddingVertical: 7 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  taskCheck: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  input: { padding: 14, fontSize: 14 },
  submitBtn: { paddingVertical: 16, alignItems: 'center', marginTop: 8 },
});
