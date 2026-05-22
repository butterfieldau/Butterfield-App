import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const CATEGORIES = ['daily', 'opening', 'closing', 'prep', 'cleaning', 'training'];
const CAT_COLORS: Record<string, string> = {
  daily: '#3B82F6', opening: '#22C55E', closing: '#F59E0B',
  prep: '#F97316', cleaning: '#8B5CF6', training: '#06B6D4',
};
type TabMode = 'tasks' | 'wastage' | 'issues' | 'leave';
export default function StaffTasksScreen() {
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
  const { data: tasksData, refetch } = useQuery({
    queryKey: ['staff-tasks', activeCat],
    queryFn: () => api.staff.tasks(activeCat),
    retry: 1,
  });
  const { data: wastageData, refetch: refetchWastage } = useQuery({
    queryKey: ['staff-wastage'],
    queryFn: () => api.staff.wastage(),
    enabled: tab === 'wastage',
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch, refetchWastage);
  const tasks = tasksData?.data ?? [];
  const wastageList = wastageData?.data ?? [];
  const [wastageForm, setWastageForm] = useState({ productName: '', quantity: '', unit: 'units', reason: '', estimatedCost: '', notes: '' });
  const [issueForm, setIssueForm] = useState({ title: '', description: '', priority: 'medium' });
  const [leaveForm, setLeaveForm] = useState({ startDate: '', endDate: '', type: 'annual', reason: '' });
  const handleCompleteTask = async (id: string, isCompleted: boolean) => {
    Haptics.selectionAsync();
    try {
      await api.staff.completeTask(id, !isCompleted);
      qc.invalidateQueries({ queryKey: ['staff-tasks', activeCat] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const handleWastage = async () => {
    if (!wastageForm.productName || !wastageForm.quantity || !wastageForm.reason) { Alert.alert('Fill all fields'); return; }
    setSubmitting(true);
    try {
      const estimatedCost = wastageForm.estimatedCost.trim();
      const estimatedCostNumber = estimatedCost ? Number(estimatedCost) : null;
      if (estimatedCost && (estimatedCostNumber === null || !Number.isFinite(estimatedCostNumber) || estimatedCostNumber < 0)) {
        Alert.alert('Invalid amount', 'Enter a valid loss amount.');
        setSubmitting(false);
        return;
      }
      await api.staff.submitWastage({
        productName: wastageForm.productName,
        quantity: wastageForm.quantity,
        unit: wastageForm.unit,
        reason: wastageForm.reason,
        notes: wastageForm.notes.trim() || null,
        estimatedCostCents: estimatedCostNumber !== null ? Math.round(estimatedCostNumber * 100) : null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWastageForm({ productName: '', quantity: '', unit: 'units', reason: '', estimatedCost: '', notes: '' });
      qc.invalidateQueries({ queryKey: ['staff-wastage'] });
      Alert.alert('Logged', 'Wastage recorded successfully.');
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setSubmitting(false); }
  };
  const handleIssue = async () => {
    if (!issueForm.title || !issueForm.description) { Alert.alert('Fill all fields'); return; }
    try {
      await api.staff.submitIssue(issueForm);
      setIssueForm({ title: '', description: '', priority: 'medium' });
      Alert.alert('Reported', 'Issue submitted to management.');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const handleLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason) { Alert.alert('Fill all fields'); return; }
    try {
      await api.staff.submitLeave(leaveForm);
      setLeaveForm({ startDate: '', endDate: '', type: 'annual', reason: '' });
      Alert.alert('Submitted', 'Leave request sent to management.');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const TABS: { id: TabMode; label: string }[] = [
    { id: 'tasks', label: 'Tasks' }, { id: 'wastage', label: 'Wastage' },
    { id: 'issues', label: 'Issues' }, { id: 'leave', label: 'Leave' },
  ];
  const completedCount = tasks.filter((t: any) => t.isCompleted).length;
  const totalCount = tasks.length;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.title}>Staff Tools</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TABS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => { setTab(t.id); Haptics.selectionAsync(); }}
              style={[s.tabPill, tab === t.id && { backgroundColor: BLUE, borderColor: BLUE }]}
            >
              <Text style={[s.tabPillText, tab === t.id && { color: '#fff' }]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {/* ── Tasks tab ──────────────────────────────────────────────────────── */}
      {tab === 'tasks' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        >
          {/* Category filter */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -16 }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 }}
          >
            {CATEGORIES.map((c) => {
              const active = activeCat === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => { setActiveCat(c); Haptics.selectionAsync(); }}
                  style={[s.catPill, active && { backgroundColor: CAT_COLORS[c], borderColor: CAT_COLORS[c] }]}
                >
                  <Text style={[s.catPillText, active && { color: '#fff' }]}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {/* Progress summary */}
          {totalCount > 0 && (
            <View style={s.progressRow}>
              <Text style={s.progressLabel}>
                {completedCount}/{totalCount} complete
              </Text>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${(completedCount / totalCount) * 100}%` as any }]} />
              </View>
            </View>
          )}
          {/* Task list card */}
          {tasks.length === 0 ? (
            <Text style={s.empty}>No tasks in this category.</Text>
          ) : (
            <View style={s.taskCard}>
              {tasks.map((task: any, idx: number) => (
                <Pressable
                  key={task.id}
                  onPress={() => handleCompleteTask(task.id, task.isCompleted)}
                  style={({ pressed }) => [
                    s.taskRow,
                    idx < tasks.length - 1 && s.taskDivider,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <View style={[s.checkbox, {
                    borderColor: task.isCompleted ? GREEN : BLUE,
                    backgroundColor: task.isCompleted ? GREEN : 'transparent',
                  }]}>
                    {task.isCompleted && <Feather name="check" size={11} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.taskTitle, task.isCompleted && s.taskDone]}>
                      {task.title}
                    </Text>
                    {task.description && !task.isCompleted && (
                      <Text style={s.taskDesc} numberOfLines={1}>{task.description}</Text>
                    )}
                    <Text style={[s.taskCat, { color: CAT_COLORS[task.category] ?? BLUE }]}>
                      {task.category?.charAt(0).toUpperCase() + task.category?.slice(1)}
                      {task.completedBy ? ` · ✓ ${task.completedBy}` : ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
      {/* ── Wastage tab ────────────────────────────────────────────────────── */}
      {tab === 'wastage' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
          <Text style={s.formTitle}>Log Wastage</Text>
          {[
            { label: 'Product name', key: 'productName', placeholder: 'e.g. Classic Choc Chip' },
            { label: 'Quantity', key: 'quantity', placeholder: 'e.g. 3', keyboardType: 'number-pad' as const },
            { label: 'Reason', key: 'reason', placeholder: 'e.g. Burnt, dropped, overproduced' },
            { label: 'Loss amount (AUD)', key: 'estimatedCost', placeholder: 'e.g. 18.50', keyboardType: 'decimal-pad' as const },
            { label: 'Notes', key: 'notes', placeholder: 'Optional details for management' },
          ].map((field) => (
            <View key={field.key}>
              <Text style={s.fieldLabel}>{field.label.toUpperCase()}</Text>
              <TextInput
                style={s.input}
                placeholder={field.placeholder}
                placeholderTextColor={MUTED}
                keyboardType={field.keyboardType}
                value={(wastageForm as any)[field.key]}
                onChangeText={(v) => setWastageForm((f) => ({ ...f, [field.key]: v }))}
              />
            </View>
          ))}
          <Pressable onPress={handleWastage} disabled={submitting} style={[s.submitBtn, { backgroundColor: BLUE }]}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitBtnText}>Log Wastage</Text>}
          </Pressable>
          {wastageList.length > 0 && (
            <View style={{ gap: 8, marginTop: 8 }}>
              <Text style={s.sectionLabel}>RECENT LOGS</Text>
              <View style={s.taskCard}>
              {wastageList.slice(0, 5).map((w: any, idx: number) => (
                  <View key={w.id} style={[s.taskRow, idx < Math.min(wastageList.length, 5) - 1 && s.taskDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.taskTitle}>{w.productName} × {w.quantity}</Text>
                      <Text style={s.taskDesc}>{w.reason}</Text>
                      {w.estimatedCostCents ? (
                        <Text style={[s.taskCat, { color: BLUE }]}>Loss recorded: ${(w.estimatedCostCents / 100).toFixed(2)}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
      {/* ── Issues tab ─────────────────────────────────────────────────────── */}
      {tab === 'issues' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
          <Text style={s.formTitle}>Report an Issue</Text>
          {[
            { label: 'Title', key: 'title', placeholder: 'Brief description of the issue', multiline: false },
            { label: 'Details', key: 'description', placeholder: 'What happened? Where? When?', multiline: true },
          ].map((field) => (
            <View key={field.key}>
              <Text style={s.fieldLabel}>{field.label.toUpperCase()}</Text>
              <TextInput
                style={[s.input, field.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
                value={(issueForm as any)[field.key]}
                onChangeText={(v) => setIssueForm((f) => ({ ...f, [field.key]: v }))}
                multiline={field.multiline}
                numberOfLines={field.multiline ? 4 : 1}
                placeholder={field.placeholder}
                placeholderTextColor={MUTED}
              />
            </View>
          ))}
          <Text style={s.fieldLabel}>PRIORITY</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['low', 'medium', 'high', 'urgent'].map((p) => {
              const pColors: Record<string, string> = { low: GREEN, medium: BLUE, high: '#F59E0B', urgent: '#EF4444' };
              const pc = pColors[p] ?? BLUE;
              const active = issueForm.priority === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setIssueForm((f) => ({ ...f, priority: p }))}
                  style={[s.catPill, active && { backgroundColor: pc, borderColor: pc }]}
                >
                  <Text style={[s.catPillText, active && { color: '#fff' }]}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={handleIssue} disabled={submitting} style={[s.submitBtn, { backgroundColor: '#EF4444' }]}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitBtnText}>Report Issue</Text>}
          </Pressable>
        </ScrollView>
      )}
      {/* ── Leave tab ──────────────────────────────────────────────────────── */}
      {tab === 'leave' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
          <Text style={s.formTitle}>Leave Request</Text>
          {[
            { label: 'Start date (DD/MM/YYYY)', key: 'startDate', placeholder: '01/06/2026', multiline: false },
            { label: 'End date (DD/MM/YYYY)',   key: 'endDate',   placeholder: '05/06/2026', multiline: false },
            { label: 'Reason', key: 'reason', placeholder: 'Reason for leave', multiline: true },
          ].map((field) => (
            <View key={field.key}>
              <Text style={s.fieldLabel}>{field.label.toUpperCase()}</Text>
              <TextInput
                style={[s.input, field.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
                value={(leaveForm as any)[field.key]}
                onChangeText={(v) => setLeaveForm((f) => ({ ...f, [field.key]: v }))}
                placeholder={field.placeholder}
                placeholderTextColor={MUTED}
                multiline={field.multiline}
                numberOfLines={field.multiline ? 4 : 1}
              />
            </View>
          ))}
          <Text style={s.fieldLabel}>LEAVE TYPE</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['annual', 'sick', 'personal', 'other'].map((lt) => {
              const active = leaveForm.type === lt;
              return (
                <Pressable
                  key={lt}
                  onPress={() => setLeaveForm((f) => ({ ...f, type: lt }))}
                  style={[s.catPill, active && { backgroundColor: BLUE, borderColor: BLUE }]}
                >
                  <Text style={[s.catPillText, active && { color: '#fff' }]}>
                    {lt.charAt(0).toUpperCase() + lt.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={handleLeave} disabled={submitting} style={[s.submitBtn, { backgroundColor: BLUE }]}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitBtnText}>Submit Request</Text>}
          </Pressable>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  header:        { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, gap: 12 },
  title:         { fontSize: 26, fontWeight: '700', color: TEXT },
  tabPill:       { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: BG },
  tabPillText:   { fontSize: 13, fontWeight: '600', color: MUTED },
  catPill:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  catPillText:   { fontSize: 12, fontWeight: '600', color: MUTED, textTransform: 'capitalize' },
  progressRow:   { gap: 6 },
  progressLabel: { fontSize: 12, fontWeight: '600', color: MUTED },
  progressTrack: { height: 4, backgroundColor: BORDER, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: 4, backgroundColor: BLUE, borderRadius: 2 },
  taskCard:      { backgroundColor: CARD, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, overflow: 'hidden' },
  taskRow:       { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  taskDivider:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  checkbox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  taskTitle:     { fontSize: 14, fontWeight: '500', color: TEXT },
  taskDone:      { color: MUTED, textDecorationLine: 'line-through' },
  taskDesc:      { fontSize: 12, color: MUTED, marginTop: 2 },
  taskCat:       { fontSize: 11, fontWeight: '500', marginTop: 3 },
  empty:         { color: MUTED, textAlign: 'center', marginTop: 40, fontWeight: '400' },
  sectionLabel:  { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 1 },
  formTitle:     { fontSize: 20, fontWeight: '700', color: TEXT, marginBottom: 4 },
  fieldLabel:    { fontSize: 12, fontWeight: '500', color: MUTED, marginBottom: 6 },
  input:         { backgroundColor: CARD, color: TEXT, borderRadius: 12, borderColor: BORDER, borderWidth: 1, padding: 14, fontSize: 14 },
  submitBtn:     { paddingVertical: 16, alignItems: 'center', borderRadius: 14, marginTop: 8 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
