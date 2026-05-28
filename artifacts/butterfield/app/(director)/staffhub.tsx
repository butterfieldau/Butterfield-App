import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useRefreshControl } from '@/hooks/useRefreshControl';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE   = '#1493FF';
const RED    = '#F40009';
const AMBER  = '#F59E0B';
const GREEN  = '#22C55E';
const PURPLE = '#8B5CF6';
const PINK   = '#EC4899';

// Glass card standard
const GLASS_BG     = 'rgba(255,255,255,0.6)';
const GLASS_BORDER = 'rgba(255,255,255,0.85)';

type Tab = 'tasks' | 'issues' | 'wastage' | 'leave' | 'feedback';

const STAFF_TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'tasks',   label: 'Tasks',   icon: 'clipboard'      },
  { key: 'issues',  label: 'Issues',  icon: 'alert-triangle' },
  { key: 'wastage', label: 'Wastage', icon: 'trash-2'        },
  { key: 'leave',   label: 'Leave',   icon: 'calendar'       },
];

const MANAGER_TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'tasks',    label: 'Tasks',    icon: 'clipboard'      },
  { key: 'issues',   label: 'Issues',   icon: 'alert-triangle' },
  { key: 'wastage',  label: 'Wastage',  icon: 'trash-2'        },
  { key: 'leave',    label: 'Leave',    icon: 'calendar'       },
  { key: 'feedback', label: 'Feedback', icon: 'message-circle' },
];

const CATEGORIES = ['daily', 'opening', 'closing', 'prep', 'cleaning', 'training'];
const CAT_COLORS: Record<string, string> = {
  daily: '#3B82F6', opening: '#22C55E', closing: '#F59E0B',
  prep: '#F97316', cleaning: '#8B5CF6', training: '#06B6D4',
};
const TASK_CATEGORY_LABELS: Record<string, string> = {
  opening: 'Opening', closing: 'Closing', prep: 'Coffee Bar',
  cleaning: 'Cleaning', daily: 'General Shift', training: 'Stock Check / One-Off',
};
const TASK_CADENCE_LABELS: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', one_off: 'One-Off',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(d: string | null | undefined) {
  if (!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  if (isNaN(ms)) return '';
  const s = ms / 1000;
  if (s < 60)    return 'Just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtAUD(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

function toSydneyDate(input: string | Date | null | undefined): Date {
  if (!input) return new Date();
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
    }).formatToParts(d);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0');
    const h = get('hour');
    return new Date(get('year'), get('month') - 1, get('day'), h === 24 ? 0 : h, get('minute'), get('second'));
  } catch { return d; }
}
function startOfSydneyDay(input: string | Date) {
  const d = toSydneyDate(input); d.setHours(0, 0, 0, 0); return d;
}
function startOfSydneyWeek(input: string | Date) {
  const d = startOfSydneyDay(input);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}
function endOfSydneyWeek(start: Date) {
  const d = new Date(start); d.setDate(d.getDate() + 6); d.setHours(23, 59, 59, 999); return d;
}

function priorityColor(p: string) {
  if (p === 'urgent' || p === 'high') return RED;
  if (p === 'medium') return AMBER;
  return MUTED;
}
function statusColor(s: string) {
  if (s === 'open')        return RED;
  if (s === 'in_progress') return AMBER;
  if (s === 'resolved')    return GREEN;
  return MUTED;
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.badge, { backgroundColor: color + '20', borderColor: color + '50' }]}>
      <Text style={[s.badgeText, { color }]}>{label.replace('_', ' ').toUpperCase()}</Text>
    </View>
  );
}
function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <View style={s.emptyState}>
      <Feather name={icon as any} size={36} color={BORDER} />
      <Text style={s.emptyText}>{message}</Text>
    </View>
  );
}

// ── Task editor modal (manager/director) ──────────────────────────────────────
function TaskEditorModal({
  visible, task, onClose, onSubmit,
}: {
  visible: boolean; task: any | null; onClose: () => void;
  onSubmit: (payload: { title: string; description?: string; category: string; cadence: 'daily' | 'weekly' | 'one_off'; assignedToUserId?: string | null; assignedToName?: string | null }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('daily');
  const [cadence, setCadence] = useState<'daily' | 'weekly' | 'one_off'>('daily');
  const [saving, setSaving] = useState(false);
  const [assignedToUserId, setAssignedToUserId] = useState<string | null>(null);
  const [assignedToName, setAssignedToName] = useState<string | null>(null);

  const { data: staffData } = useQuery({
    queryKey: ['director-staff-list'],
    queryFn: () => api.director.staffList(),
    staleTime: 60_000,
  });
  const staffMembers: { id: string; name: string; role: string }[] = staffData?.data ?? [];

  useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setCategory(task?.category ?? 'daily');
    setCadence((task?.cadence as any) ?? 'daily');
    setAssignedToUserId(task?.assignedToUserId ?? null);
    setAssignedToName(task?.assignedToName ?? null);
    setSaving(false);
  }, [task, visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={s.modalHeader}>
          <Pressable onPress={onClose} style={s.modalCloseBtn}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
          <Text style={s.modalTitle}>{task ? 'Edit Task' : 'New Task'}</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>TASK NAME</Text>
            <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="e.g. Turn on coffee machine" placeholderTextColor={MUTED} />
          </View>
          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>DESCRIPTION</Text>
            <TextInput style={[s.input, { height: 80, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} multiline placeholder="Optional details for staff" placeholderTextColor={MUTED} />
          </View>

          <Text style={s.fieldLabel}>TASK TYPE</Text>
          <View style={s.chipRow}>
            {Object.entries(TASK_CATEGORY_LABELS).map(([key, label]) => (
              <Pressable key={key} onPress={() => setCategory(key)} style={[s.chip, category === key && { backgroundColor: BLUE, borderColor: BLUE }]}>
                <Text style={[s.chipText, category === key && { color: '#fff' }]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.fieldLabel}>CADENCE</Text>
          <View style={s.chipRow}>
            {(Object.keys(TASK_CADENCE_LABELS) as Array<'daily' | 'weekly' | 'one_off'>).map((key) => (
              <Pressable key={key} onPress={() => setCadence(key)} style={[s.chip, cadence === key && { backgroundColor: BLUE, borderColor: BLUE }]}>
                <Text style={[s.chipText, cadence === key && { color: '#fff' }]}>{TASK_CADENCE_LABELS[key]}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.fieldLabel}>ASSIGN TO</Text>
          <Text style={{ fontSize: 12, color: MUTED, marginTop: -8, marginBottom: 4 }}>Leave as "All staff" so everyone can see it</Text>
          <View style={s.chipRow}>
            <Pressable onPress={() => { setAssignedToUserId(null); setAssignedToName(null); }} style={[s.chip, !assignedToUserId && { backgroundColor: BLUE, borderColor: BLUE }]}>
              <Text style={[s.chipText, !assignedToUserId && { color: '#fff' }]}>All staff</Text>
            </Pressable>
            {staffMembers.map((m) => (
              <Pressable key={m.id} onPress={() => { setAssignedToUserId(m.id); setAssignedToName(m.name); }} style={[s.chip, assignedToUserId === m.id && { backgroundColor: BLUE, borderColor: BLUE }]}>
                <Text style={[s.chipText, assignedToUserId === m.id && { color: '#fff' }]}>{m.name}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={[s.primaryBtn, saving && { opacity: 0.7 }]} disabled={saving} onPress={async () => {
            if (!title.trim()) { Alert.alert('Missing task name', 'Please give the task a name.'); return; }
            setSaving(true);
            try { await onSubmit({ title: title.trim(), description: description.trim() || undefined, category, cadence, assignedToUserId, assignedToName }); onClose(); }
            finally { setSaving(false); }
          }}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{task ? 'Save Changes' : 'Create Task'}</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TASKS TAB — staff view: checklist
// ══════════════════════════════════════════════════════════════════════════════
function StaffTasksTab({ userId }: { userId?: string }) {
  const qc = useQueryClient();
  const [activeCat, setActiveCat] = useState('daily');

  const { data: tasksData, refetch } = useQuery({
    queryKey: ['staff-tasks', activeCat],
    queryFn: () => api.staff.tasks(activeCat),
    retry: 1,
  });
  const { data: assignedData } = useQuery({
    queryKey: ['staff-tasks-assigned'],
    queryFn: () => api.staff.tasks(),
    retry: 1,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const tasks = tasksData?.data ?? [];
  const assignedToMe = (assignedData?.data ?? []).filter((t: any) => t.assignedToUserId === userId && !t.isCompleted);

  const completedCount = tasks.filter((t: any) => t.isCompleted).length;
  const totalCount = tasks.length;

  const handleComplete = async (id: string, isCompleted: boolean) => {
    Haptics.selectionAsync();
    try {
      await api.staff.completeTask(id, !isCompleted);
      qc.invalidateQueries({ queryKey: ['staff-tasks', activeCat] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
    >
      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 }}>
        {CATEGORIES.map((c) => {
          const active = activeCat === c;
          return (
            <Pressable key={c} onPress={() => { setActiveCat(c); Haptics.selectionAsync(); }}
              style={[s.chip, active && { backgroundColor: CAT_COLORS[c], borderColor: CAT_COLORS[c] }]}>
              <Text style={[s.chipText, active && { color: '#fff' }]}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Progress */}
      {totalCount > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={s.metaLabel}>{completedCount}/{totalCount} complete</Text>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${(completedCount / totalCount) * 100}%` as any }]} />
          </View>
        </View>
      )}

      {/* Assigned to me */}
      {assignedToMe.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: AMBER }} />
            <Text style={[s.metaLabel, { color: '#B45309', letterSpacing: 0.8 }]}>ASSIGNED TO YOU</Text>
          </View>
          <View style={[s.glassCard, { borderColor: '#FDE68A', borderWidth: 1.5 }]}>
            {assignedToMe.map((task: any) => (
              <Pressable key={task.id} onPress={() => handleComplete(task.id, task.isCompleted)}
                style={({ pressed }) => [s.taskRow, { opacity: pressed ? 0.6 : 1 }]}>
                <View style={[s.checkbox, { borderColor: AMBER }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.taskTitle}>{task.title}</Text>
                  {task.description && <Text style={s.taskDesc} numberOfLines={1}>{task.description}</Text>}
                  <Text style={[s.taskCat, { color: AMBER }]}>
                    {task.category?.charAt(0).toUpperCase() + task.category?.slice(1)} · Assigned to you
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Task list */}
      {tasks.length === 0 ? (
        <EmptyState icon="clipboard" message="No tasks in this category." />
      ) : (
        <View style={s.glassCard}>
          {tasks.map((task: any) => (
            <Pressable key={task.id} onPress={() => handleComplete(task.id, task.isCompleted)}
              style={({ pressed }) => [s.taskRow, { opacity: pressed ? 0.6 : 1 }]}>
              <View style={[s.checkbox, {
                borderColor: task.isCompleted ? GREEN : BLUE,
                backgroundColor: task.isCompleted ? GREEN : 'transparent',
              }]}>
                {task.isCompleted && <Feather name="check" size={11} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.taskTitle, task.isCompleted && { color: MUTED, textDecorationLine: 'line-through' }]}>
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
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TASKS TAB — manager view: configure tasks
// ══════════════════════════════════════════════════════════════════════════════
function ManagerTasksTab() {
  const qc = useQueryClient();
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-tasks'],
    queryFn: () => api.director.tasks(),
    staleTime: 0,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const tasks: any[] = data?.data ?? [];

  const saveTask = useMutation({
    mutationFn: async (payload: any) => {
      const body = { ...payload, isRecurring: payload.cadence !== 'one_off' };
      return payload.id ? api.director.updateTask(payload.id, body) : api.director.createTask(body);
    },
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await qc.invalidateQueries({ queryKey: ['director-tasks'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.director.deleteTask(id),
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await qc.invalidateQueries({ queryKey: ['director-tasks'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const reorder = async (taskId: string, direction: -1 | 1) => {
    const index = tasks.findIndex((t) => t.id === taskId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= tasks.length) return;
    const reordered = [...tasks];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(swapIndex, 0, moved);
    await api.director.reorderTasks(reordered.map((t) => t.id));
    await qc.invalidateQueries({ queryKey: ['director-tasks'] });
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        showsVerticalScrollIndicator={false}>

        {/* Add task prompt */}
        <Pressable onPress={() => { setEditingTask(null); setShowEditor(true); }}
          style={[s.summaryCard, { backgroundColor: BLUE + '12', borderColor: BLUE + '40' }]}>
          <View style={[s.summaryIcon, { backgroundColor: BLUE + '20' }]}>
            <Feather name="plus" size={16} color={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.summaryTitle, { color: BLUE }]}>Add shop task</Text>
            <Text style={[s.summarySub, { color: MUTED }]}>Opening, closing, coffee bar, cleaning, one-off…</Text>
          </View>
        </Pressable>

        {tasks.length === 0 ? (
          <EmptyState icon="check-square" message="No tasks configured yet" />
        ) : tasks.map((task: any, index: number) => (
          <View key={task.id} style={s.glassCard}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: BLUE + '18' }]}>
                <Feather name="check-square" size={15} color={BLUE} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.cardTitle}>{task.title}</Text>
                <Text style={s.cardSub}>
                  {TASK_CATEGORY_LABELS[task.category] ?? task.category} · {TASK_CADENCE_LABELS[task.cadence ?? 'daily'] ?? 'Daily'}
                  {task.assignedToName ? ` · ${task.assignedToName}` : ' · All staff'}
                </Text>
              </View>
            </View>
            {task.description ? <Text style={s.cardDesc}>{task.description}</Text> : null}
            <View style={s.actionRow}>
              <Pressable style={[s.actionBtn, { borderColor: BORDER }]} onPress={() => void reorder(task.id, -1)} disabled={index === 0}>
                <Feather name="arrow-up" size={13} color={index === 0 ? BORDER : BLUE} />
                <Text style={[s.actionBtnText, { color: index === 0 ? MUTED : BLUE }]}>Up</Text>
              </Pressable>
              <Pressable style={[s.actionBtn, { borderColor: BORDER }]} onPress={() => void reorder(task.id, 1)} disabled={index === tasks.length - 1}>
                <Feather name="arrow-down" size={13} color={index === tasks.length - 1 ? BORDER : BLUE} />
                <Text style={[s.actionBtnText, { color: index === tasks.length - 1 ? MUTED : BLUE }]}>Down</Text>
              </Pressable>
              <Pressable style={[s.actionBtn, { borderColor: BLUE + '40', backgroundColor: BLUE + '10' }]} onPress={() => { setEditingTask(task); setShowEditor(true); }}>
                <Feather name="edit-2" size={13} color={BLUE} />
                <Text style={[s.actionBtnText, { color: BLUE }]}>Edit</Text>
              </Pressable>
              <Pressable style={[s.actionBtn, { borderColor: RED + '40', backgroundColor: RED + '10' }]}
                onPress={() => Alert.alert('Delete Task', `Delete "${task.title}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteTask.mutate(task.id) },
                ])}>
                <Feather name="trash-2" size={13} color={RED} />
                <Text style={[s.actionBtnText, { color: RED }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
      <TaskEditorModal
        visible={showEditor}
        task={editingTask}
        onClose={() => setShowEditor(false)}
        onSubmit={async (payload) => {
          await saveTask.mutateAsync(editingTask ? { ...payload, id: editingTask.id } : payload as any);
        }}
      />
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ISSUES TAB — staff view: submit form
// ══════════════════════════════════════════════════════════════════════════════
function StaffIssuesTab() {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' });
  const [submitting, setSubmitting] = useState(false);

  const handle = async () => {
    if (!form.title || !form.description) { Alert.alert('Fill all fields'); return; }
    setSubmitting(true);
    try {
      await api.staff.submitIssue(form);
      setForm({ title: '', description: '', priority: 'medium' });
      Alert.alert('Reported', 'Issue submitted to management.');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
      <View style={s.glassCard}>
        <View style={{ padding: 8, gap: 14 }}>
          <Text style={s.formHeading}>Report an Issue</Text>
          {[
            { label: 'TITLE', key: 'title', placeholder: 'Brief description', multiline: false },
            { label: 'DETAILS', key: 'description', placeholder: 'What happened? Where? When?', multiline: true },
          ].map((field) => (
            <View key={field.key} style={s.fieldWrap}>
              <Text style={s.fieldLabel}>{field.label}</Text>
              <TextInput
                style={[s.input, field.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
                value={(form as any)[field.key]}
                onChangeText={(v) => setForm((f) => ({ ...f, [field.key]: v }))}
                multiline={field.multiline}
                numberOfLines={field.multiline ? 4 : 1}
                placeholder={field.placeholder}
                placeholderTextColor={MUTED}
              />
            </View>
          ))}
          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>PRIORITY</Text>
            <View style={s.chipRow}>
              {(['low', 'medium', 'high', 'urgent'] as const).map((p) => {
                const c = { low: GREEN, medium: BLUE, high: AMBER, urgent: RED }[p];
                const active = form.priority === p;
                return (
                  <Pressable key={p} onPress={() => setForm((f) => ({ ...f, priority: p }))}
                    style={[s.chip, active && { backgroundColor: c, borderColor: c }]}>
                    <Text style={[s.chipText, active && { color: '#fff' }]}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Pressable onPress={handle} disabled={submitting} style={[s.primaryBtn, { backgroundColor: RED }]}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>Report Issue</Text>}
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ISSUES TAB — manager view: review all issues
// ══════════════════════════════════════════════════════════════════════════════
function ManagerIssuesTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-all-issues'],
    queryFn: () => api.director.allIssues(),
    staleTime: 0,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const issues: any[] = data?.data ?? [];

  const resolve = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.director.resolveIssue(id, status),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['director-all-issues'] });
      qc.invalidateQueries({ queryKey: ['director-stats'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handleAction = (issue: any) => {
    const opts: any[] = [];
    if (issue.status === 'open') {
      opts.push({ text: 'Mark In Progress', onPress: () => resolve.mutate({ id: issue.id, status: 'in_progress' }) });
      opts.push({ text: 'Mark Resolved',    onPress: () => resolve.mutate({ id: issue.id, status: 'resolved' }) });
    } else if (issue.status === 'in_progress') {
      opts.push({ text: 'Mark Resolved',    onPress: () => resolve.mutate({ id: issue.id, status: 'resolved' }) });
    }
    if (issue.status !== 'closed') {
      opts.push({ text: 'Close Issue',      onPress: () => resolve.mutate({ id: issue.id, status: 'closed' }) });
    }
    opts.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(issue.title, `${issue.description}\n\nReported by: ${issue.staffName ?? 'Unknown'}\nPriority: ${issue.priority}`, opts);
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      showsVerticalScrollIndicator={false}>
      {issues.length === 0 ? <EmptyState icon="check-circle" message="No issues reported" /> :
        issues.map((item: any) => (
          <Pressable key={item.id} onPress={() => handleAction(item)} style={s.glassCard}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: priorityColor(item.priority) + '18' }]}>
                <Feather name="alert-triangle" size={15} color={priorityColor(item.priority)} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={s.cardSub} numberOfLines={1}>{item.staffName ?? 'Unknown'} · {item.category}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </View>
            <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
            <View style={s.cardFooter}>
              <Badge label={item.priority} color={priorityColor(item.priority)} />
              <Badge label={item.status}   color={statusColor(item.status)} />
              <Text style={[s.cardTime, { marginLeft: 'auto' }]}>{timeAgo(item.createdAt)}</Text>
            </View>
          </Pressable>
        ))
      }
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WASTAGE TAB — staff view: log form
// ══════════════════════════════════════════════════════════════════════════════
function StaffWastageTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ productName: '', quantity: '', unit: 'units', reason: '', estimatedCost: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const { data: wastageData } = useQuery({ queryKey: ['staff-wastage'], queryFn: () => api.staff.wastage() });
  const wastageList = wastageData?.data ?? [];

  const handle = async () => {
    if (!form.productName || !form.quantity || !form.reason) { Alert.alert('Fill all required fields'); return; }
    setSubmitting(true);
    try {
      const cost = form.estimatedCost.trim();
      const costNum = cost ? Number(cost) : null;
      if (cost && (costNum === null || !Number.isFinite(costNum!) || costNum! < 0)) {
        Alert.alert('Invalid amount', 'Enter a valid loss amount.'); setSubmitting(false); return;
      }
      await api.staff.submitWastage({
        productName: form.productName, quantity: form.quantity, unit: form.unit, reason: form.reason,
        notes: form.notes.trim() || null,
        estimatedCostCents: costNum !== null ? Math.round(costNum! * 100) : null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setForm({ productName: '', quantity: '', unit: 'units', reason: '', estimatedCost: '', notes: '' });
      qc.invalidateQueries({ queryKey: ['staff-wastage'] });
      Alert.alert('Logged', 'Wastage recorded successfully.');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
      <View style={s.glassCard}>
        <View style={{ padding: 8, gap: 14 }}>
          <Text style={s.formHeading}>Log Wastage</Text>
          {[
            { label: 'PRODUCT NAME', key: 'productName', placeholder: 'e.g. Classic Choc Chip', keyboard: undefined },
            { label: 'QUANTITY', key: 'quantity', placeholder: 'e.g. 3', keyboard: 'number-pad' as const },
            { label: 'REASON', key: 'reason', placeholder: 'Burnt, dropped, overproduced…', keyboard: undefined },
            { label: 'LOSS AMOUNT (AUD)', key: 'estimatedCost', placeholder: 'e.g. 18.50', keyboard: 'decimal-pad' as const },
            { label: 'NOTES', key: 'notes', placeholder: 'Optional notes for management', keyboard: undefined },
          ].map((field) => (
            <View key={field.key} style={s.fieldWrap}>
              <Text style={s.fieldLabel}>{field.label}</Text>
              <TextInput
                style={s.input} placeholder={field.placeholder} placeholderTextColor={MUTED}
                keyboardType={field.keyboard} value={(form as any)[field.key]}
                onChangeText={(v) => setForm((f) => ({ ...f, [field.key]: v }))}
              />
            </View>
          ))}
          <Pressable onPress={handle} disabled={submitting} style={s.primaryBtn}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>Log Wastage</Text>}
          </Pressable>
        </View>
      </View>

      {wastageList.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={[s.metaLabel, { letterSpacing: 0.8 }]}>RECENT LOGS</Text>
          <View style={s.glassCard}>
            {(wastageList as any[]).slice(0, 5).map((w: any) => (
              <View key={w.id} style={s.taskRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.taskTitle}>{w.productName} × {w.quantity} {w.unit}</Text>
                  <Text style={s.taskDesc}>{w.reason}</Text>
                  {w.estimatedCostCents ? (
                    <Text style={[s.taskCat, { color: PURPLE }]}>Loss: {fmtAUD(w.estimatedCostCents)}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WASTAGE TAB — manager view: analytics
// ══════════════════════════════════════════════════════════════════════════════
function ManagerWastageTab() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-all-wastage'], queryFn: () => api.director.allWastage(), staleTime: 0,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const wastage: any[] = data?.data ?? [];
  const currentWeekKey = startOfSydneyWeek(new Date()).toISOString();

  const weekGroups = useMemo(() => {
    const groups = new Map<string, { key: string; start: Date; end: Date; items: any[]; totalCost: number }>();
    wastage.forEach((item) => {
      const start = startOfSydneyWeek(item.createdAt);
      const key = start.toISOString();
      const end = endOfSydneyWeek(start);
      const ex = groups.get(key);
      if (ex) { ex.items.push(item); ex.totalCost += item.estimatedCostCents ?? 0; }
      else groups.set(key, { key, start, end, items: [item], totalCost: item.estimatedCostCents ?? 0 });
    });
    return Array.from(groups.values()).sort((a, b) => b.start.getTime() - a.start.getTime());
  }, [wastage]);

  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const selectedWeek = useMemo(() => {
    const fb = selectedWeekKey ?? currentWeekKey;
    return weekGroups.find((g) => g.key === fb) ?? weekGroups[0] ?? null;
  }, [currentWeekKey, selectedWeekKey, weekGroups]);

  const todayStart = startOfSydneyDay(new Date());
  const todayEnd = new Date(todayStart); todayEnd.setHours(23, 59, 59, 999);
  const todayItems = useMemo(() => wastage.filter((item) => {
    const c = toSydneyDate(item.createdAt); return c >= todayStart && c <= todayEnd;
  }), [wastage]);
  const todayCost  = todayItems.reduce((s, i) => s + (i.estimatedCostCents ?? 0), 0);
  const thisWeekItems = weekGroups.find((g) => g.key === currentWeekKey)?.items ?? [];
  const thisWeekCost  = thisWeekItems.reduce((s, i) => s + (i.estimatedCostCents ?? 0), 0);

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.director.deleteWastage(id),
    onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); refetch(); },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      showsVerticalScrollIndicator={false}>
      {/* Metrics */}
      <View style={s.metricsRow}>
        {[
          { label: 'TODAY', value: fmtAUD(todayCost), sub: `${todayItems.length} entries` },
          { label: 'THIS WEEK', value: fmtAUD(thisWeekCost), sub: `${thisWeekItems.length} entries` },
        ].map((m) => (
          <View key={m.label} style={[s.metricCard, { backgroundColor: GLASS_BG, borderColor: GLASS_BORDER }]}>
            <Text style={s.metricLabel}>{m.label}</Text>
            <Text style={[s.metricValue, { color: PURPLE }]}>{m.value}</Text>
            <Text style={s.metricSub}>{m.sub}</Text>
          </View>
        ))}
      </View>

      {/* Week selector */}
      {weekGroups.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {weekGroups.map((group) => {
            const active = selectedWeek?.key === group.key;
            const label = group.key === currentWeekKey
              ? 'This week'
              : `${group.start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${group.end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
            return (
              <Pressable key={group.key} onPress={() => { Haptics.selectionAsync(); setSelectedWeekKey(group.key); }}
                style={[s.chip, active && { backgroundColor: PURPLE, borderColor: PURPLE }]}>
                <Text style={[s.chipText, active && { color: '#fff' }]}>{label}</Text>
                <Text style={[{ fontSize: 11, color: active ? 'rgba(255,255,255,0.75)' : MUTED }]}>
                  {fmtAUD(group.totalCost)} · {group.items.length}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {selectedWeek == null || selectedWeek.items.length === 0
        ? <EmptyState icon="trash-2" message="No wastage logged" />
        : selectedWeek.items.map((item: any) => (
          <Pressable key={item.id} style={s.glassCard} onPress={() => {
            const cost = item.estimatedCostCents ? fmtAUD(item.estimatedCostCents) : 'Not estimated';
            Alert.alert(`Wastage: ${item.productName}`,
              `Staff: ${item.staffName ?? 'Unknown'}\nQty: ${item.quantity} ${item.unit}\nReason: ${item.reason}\nEst. cost: ${cost}${item.notes ? `\nNotes: ${item.notes}` : ''}`,
              [
                { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(item.id) },
                { text: 'OK' },
              ]);
          }}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: PURPLE + '18' }]}>
                <Feather name="trash-2" size={15} color={PURPLE} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.cardTitle} numberOfLines={1}>{item.productName}</Text>
                <Text style={s.cardSub} numberOfLines={1}>{item.staffName ?? 'Unknown staff'} · {item.quantity} {item.unit}</Text>
              </View>
              {item.estimatedCostCents ? (
                <Text style={[s.metricValue, { color: PURPLE, fontSize: 14 }]}>{fmtAUD(item.estimatedCostCents)}</Text>
              ) : null}
            </View>
            <View style={s.cardFooter}>
              <Text style={[s.cardTime]}>{item.reason}</Text>
              <Text style={[s.cardTime, { marginLeft: 'auto' }]}>{timeAgo(item.createdAt)}</Text>
            </View>
          </Pressable>
        ))
      }
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LEAVE TAB — staff view: request form
// ══════════════════════════════════════════════════════════════════════════════
function StaffLeaveTab() {
  const [form, setForm] = useState({ startDate: '', endDate: '', type: 'annual', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const handle = async () => {
    if (!form.startDate || !form.endDate || !form.reason) { Alert.alert('Fill all fields'); return; }
    setSubmitting(true);
    try {
      await api.staff.submitLeave(form);
      setForm({ startDate: '', endDate: '', type: 'annual', reason: '' });
      Alert.alert('Submitted', 'Leave request sent to management.');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
      <View style={s.glassCard}>
        <View style={{ padding: 8, gap: 14 }}>
          <Text style={s.formHeading}>Leave Request</Text>
          {[
            { label: 'START DATE', key: 'startDate', placeholder: 'DD/MM/YYYY' },
            { label: 'END DATE',   key: 'endDate',   placeholder: 'DD/MM/YYYY' },
            { label: 'REASON',     key: 'reason',    placeholder: 'Reason for leave', multiline: true },
          ].map((field) => (
            <View key={field.key} style={s.fieldWrap}>
              <Text style={s.fieldLabel}>{field.label}</Text>
              <TextInput
                style={[s.input, (field as any).multiline && { minHeight: 80, textAlignVertical: 'top' }]}
                value={(form as any)[field.key]}
                onChangeText={(v) => setForm((f) => ({ ...f, [field.key]: v }))}
                placeholder={field.placeholder} placeholderTextColor={MUTED}
                multiline={(field as any).multiline} numberOfLines={(field as any).multiline ? 4 : 1}
              />
            </View>
          ))}
          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>LEAVE TYPE</Text>
            <View style={s.chipRow}>
              {(['annual', 'sick', 'personal', 'other'] as const).map((lt) => {
                const active = form.type === lt;
                return (
                  <Pressable key={lt} onPress={() => setForm((f) => ({ ...f, type: lt }))}
                    style={[s.chip, active && { backgroundColor: BLUE, borderColor: BLUE }]}>
                    <Text style={[s.chipText, active && { color: '#fff' }]}>
                      {lt.charAt(0).toUpperCase() + lt.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Pressable onPress={handle} disabled={submitting} style={s.primaryBtn}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>Submit Request</Text>}
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LEAVE TAB — manager view: approve / reject
// ══════════════════════════════════════════════════════════════════════════════
type ReviewTarget = { id: string; staffName: string; action: 'approve' | 'reject' };

function ManagerLeaveTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-all-leave'], queryFn: () => api.director.allLeave(), staleTime: 0,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const leave: any[] = data?.data ?? [];
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const reviewMut = useMutation({
    mutationFn: ({ id, approved, note }: { id: string; approved: boolean; note: string }) =>
      api.director.approveLeave(id, approved, note || undefined),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReviewTarget(null); setReviewNote('');
      qc.invalidateQueries({ queryKey: ['director-all-leave'] });
      qc.invalidateQueries({ queryKey: ['director-stats'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const leaveTypeColor = (t: string) => {
    if (t === 'annual') return BLUE; if (t === 'sick') return AMBER; if (t === 'personal') return PINK; return MUTED;
  };
  const leaveStatusColor = (s: string) => {
    if (s === 'approved') return GREEN; if (s === 'rejected') return RED; return AMBER;
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        showsVerticalScrollIndicator={false}>
        {leave.length === 0 ? <EmptyState icon="calendar" message="No leave requests" /> :
          leave.map((item: any) => (
            <View key={item.id} style={[s.glassCard, item.status === 'pending' && { borderColor: AMBER + '70' }]}>
              <View style={s.cardHeader}>
                <View style={[s.iconBox, { backgroundColor: leaveTypeColor(item.type) + '18' }]}>
                  <Feather name="calendar" size={15} color={leaveTypeColor(item.type)} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.cardTitle} numberOfLines={1}>{item.staffName ?? 'Unknown staff'}</Text>
                  <Text style={s.cardSub}>{fmtDate(item.startDate)} → {fmtDate(item.endDate)}</Text>
                </View>
                <Badge label={item.status} color={leaveStatusColor(item.status)} />
              </View>
              <Text style={s.cardDesc} numberOfLines={2}>{item.reason}</Text>
              {item.reviewedByName && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: leaveStatusColor(item.status) + '12', borderRadius: 8, padding: 8 }}>
                  <Feather name={item.status === 'approved' ? 'check-circle' : 'x-circle'} size={13} color={leaveStatusColor(item.status)} />
                  <Text style={{ fontSize: 12, color: leaveStatusColor(item.status), fontWeight: '600', flex: 1 }} numberOfLines={2}>
                    {item.status === 'approved' ? 'Approved' : 'Rejected'} by {item.reviewedByName}
                    {item.reviewNote ? ` · "${item.reviewNote}"` : ''}
                  </Text>
                </View>
              )}
              <View style={s.cardFooter}>
                <Badge label={item.type} color={leaveTypeColor(item.type)} />
                <Text style={[s.cardTime, { marginLeft: 'auto' }]}>{timeAgo(item.createdAt)}</Text>
              </View>
              <View style={s.actionRow}>
                <Pressable style={[s.actionBtn, { backgroundColor: RED + '12', borderColor: RED + '40' }]}
                  onPress={() => { Haptics.selectionAsync(); setReviewTarget({ id: item.id, staffName: item.staffName ?? 'staff', action: 'reject' }); }}>
                  <Feather name="x" size={13} color={RED} />
                  <Text style={[s.actionBtnText, { color: RED }]}>Reject</Text>
                </Pressable>
                <Pressable style={[s.actionBtn, { backgroundColor: GREEN + '12', borderColor: GREEN + '40' }]}
                  onPress={() => { Haptics.selectionAsync(); setReviewTarget({ id: item.id, staffName: item.staffName ?? 'staff', action: 'approve' }); }}>
                  <Feather name="check" size={13} color={GREEN} />
                  <Text style={[s.actionBtnText, { color: GREEN }]}>Approve</Text>
                </Pressable>
              </View>
            </View>
          ))
        }
      </ScrollView>

      {/* Review bottom sheet */}
      <Modal visible={!!reviewTarget} transparent animationType="fade" onRequestClose={() => setReviewTarget(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={() => setReviewTarget(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable onPress={() => {}} style={{ backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>
                  {reviewTarget?.action === 'approve' ? 'Approve' : 'Reject'} Leave
                </Text>
                <Pressable onPress={() => setReviewTarget(null)} hitSlop={8}>
                  <Feather name="x" size={20} color={MUTED} />
                </Pressable>
              </View>
              <Text style={{ fontSize: 14, color: MUTED }}>
                For <Text style={{ fontWeight: '600', color: TEXT }}>{reviewTarget?.staffName}</Text>
              </Text>
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>NOTE (OPTIONAL)</Text>
                <TextInput style={[s.input, { minHeight: 72, textAlignVertical: 'top' }]}
                  placeholder={reviewTarget?.action === 'approve' ? 'e.g. Enjoy your break!' : 'e.g. Insufficient notice period'}
                  placeholderTextColor={MUTED} value={reviewNote} onChangeText={setReviewNote} multiline autoFocus />
              </View>
              <Pressable
                style={[s.primaryBtn, { backgroundColor: reviewTarget?.action === 'approve' ? GREEN : RED, opacity: reviewMut.isPending ? 0.7 : 1 }]}
                onPress={() => reviewMut.mutate({ id: reviewTarget!.id, approved: reviewTarget!.action === 'approve', note: reviewNote })}
                disabled={reviewMut.isPending}>
                <Text style={s.primaryBtnText}>{reviewMut.isPending ? 'Saving…' : reviewTarget?.action === 'approve' ? 'Approve' : 'Reject'}</Text>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FEEDBACK TAB — managers only
// ══════════════════════════════════════════════════════════════════════════════
function FeedbackTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-all-feedback'], queryFn: () => api.director.allFeedback(), staleTime: 0,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const feedback: any[] = data?.data ?? [];

  const markRead = useMutation({
    mutationFn: (id: string) => api.director.markFeedbackRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-all-feedback'] });
      qc.invalidateQueries({ queryKey: ['director-stats'] });
    },
  });

  const ratingColor = (r: number) => { if (r >= 4) return GREEN; if (r >= 3) return AMBER; return RED; };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  const unread = feedback.filter(f => !f.isRead).length;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      showsVerticalScrollIndicator={false}>
      {unread > 0 && (
        <View style={[s.summaryCard, { backgroundColor: BLUE + '12', borderColor: BLUE + '40' }]}>
          <View style={[s.summaryIcon, { backgroundColor: BLUE + '20' }]}>
            <Feather name="message-circle" size={16} color={BLUE} />
          </View>
          <Text style={[s.summaryTitle, { color: BLUE }]}>{unread} unread — tap to mark read</Text>
        </View>
      )}
      {feedback.length === 0 ? <EmptyState icon="message-circle" message="No feedback submitted yet" /> :
        feedback.map((item: any) => (
          <Pressable key={item.id} style={[s.glassCard, !item.isRead && { borderColor: BLUE + '50' }]}
            onPress={() => {
              if (!item.isRead) markRead.mutate(item.id);
              Alert.alert(
                `Feedback${item.rating ? ` · ${item.rating}/5 ⭐` : ''}`,
                `${item.message}\n\nCategory: ${item.category ?? 'General'}\nSubmitted: ${fmtDate(item.createdAt)}`,
                [{ text: 'OK' }],
              );
            }}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: item.rating ? ratingColor(item.rating) + '18' : MUTED + '18' }]}>
                <Feather name="message-circle" size={15} color={item.rating ? ratingColor(item.rating) : MUTED} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                {item.rating ? (
                  <Text style={s.cardTitle}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</Text>
                ) : (
                  <Text style={s.cardTitle}>Feedback</Text>
                )}
                <Text style={s.cardSub} numberOfLines={1}>{item.category ?? 'General'}</Text>
              </View>
              {!item.isRead && <View style={s.unreadDot} />}
              <Text style={s.cardTime}>{timeAgo(item.createdAt)}</Text>
            </View>
            <Text style={[s.cardDesc, { color: TEXT }]} numberOfLines={3}>{item.message}</Text>
          </Pressable>
        ))
      }
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════
export default function StaffHubScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: Tab; initialTab?: Tab }>();
  const isManager = user?.role === 'manager' || user?.role === 'master' || user?.role === 'director';

  // Managers can toggle between their own staff tools and the management view
  const [manageMode, setManageMode] = useState(false);

  // In staff-tools mode managers see the same 4 tabs as regular staff
  const tabs = (isManager && manageMode) ? MANAGER_TABS : STAFF_TABS;
  const [activeTab, setActiveTab] = useState<Tab>('tasks');

  useEffect(() => {
    const requested = params.tab ?? params.initialTab;
    if (requested && tabs.some(t => t.key === requested)) {
      setActiveTab(requested);
    }
  }, [params.tab, params.initialTab]);

  // When mode flips, stay on the same tab if it exists, else go to tasks
  useEffect(() => {
    if (!tabs.some(t => t.key === activeTab)) setActiveTab('tasks');
  }, [manageMode]);

  const showManagerContent = isManager && manageMode;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={s.title}>Staff Hub</Text>
            <Text style={s.subtitle}>{showManagerContent ? 'Manage your team' : 'Your shift tools'}</Text>
          </View>
          {isManager && (
            <View style={s.modeToggle}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setManageMode(false); }}
                style={[s.modeBtn, !manageMode && s.modeBtnActive]}
              >
                <Text style={[s.modeBtnText, !manageMode && { color: '#fff' }]}>My Shift</Text>
              </Pressable>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setManageMode(true); }}
                style={[s.modeBtn, manageMode && s.modeBtnActive]}
              >
                <Text style={[s.modeBtnText, manageMode && { color: '#fff' }]}>Manage</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* ── Tab bar (pill style, full-width) ── */}
      <View style={s.tabRow}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => { Haptics.selectionAsync(); setActiveTab(tab.key); }}
              style={[s.tabPill, active && s.tabPillActive]}
            >
              <Feather name={tab.icon as any} size={13} color={active ? '#fff' : MUTED} />
              <Text style={[s.tabPillText, active && { color: '#fff' }]} numberOfLines={1}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Content ── */}
      {activeTab === 'tasks'    && (showManagerContent ? <ManagerTasksTab />   : <StaffTasksTab userId={user?.id} />)}
      {activeTab === 'issues'   && (showManagerContent ? <ManagerIssuesTab />  : <StaffIssuesTab />)}
      {activeTab === 'wastage'  && (showManagerContent ? <ManagerWastageTab /> : <StaffWastageTab />)}
      {activeTab === 'leave'    && (showManagerContent ? <ManagerLeaveTab />   : <StaffLeaveTab />)}
      {activeTab === 'feedback' && showManagerContent  && <FeedbackTab />}
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  // Page chrome
  header:     { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  title:      { fontSize: 28, fontWeight: '700', color: TEXT },
  subtitle:   { fontSize: 13, color: MUTED, marginTop: 2, fontWeight: '400' },

  // Manager mode toggle
  modeToggle:   { flexDirection: 'row', backgroundColor: BORDER, borderRadius: 20, padding: 3, gap: 2 },
  modeBtn:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 17 },
  modeBtnActive:{ backgroundColor: BLUE },
  modeBtnText:  { fontSize: 12, fontWeight: '700', color: MUTED },

  // Tab pills
  tabRow:     { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tabPill:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: GLASS_BG },
  tabPillActive: { backgroundColor: BLUE, borderColor: BLUE },
  tabPillText:   { fontSize: 12, fontWeight: '600', color: MUTED },

  // Glass card
  glassCard:  { backgroundColor: GLASS_BG, borderRadius: 20, borderWidth: 1, borderColor: GLASS_BORDER, padding: 14, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 },

  // Task row (inside glass card)
  taskRow:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4, paddingVertical: 10 },
  checkbox:   { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  taskTitle:  { fontSize: 14, fontWeight: '500', color: TEXT },
  taskDesc:   { fontSize: 12, color: MUTED, marginTop: 2 },
  taskCat:    { fontSize: 11, fontWeight: '500', marginTop: 3 },

  // Card anatomy
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle:  { fontSize: 14, fontWeight: '600', color: TEXT },
  cardSub:    { fontSize: 12, color: MUTED },
  cardDesc:   { fontSize: 13, color: MUTED, lineHeight: 19 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardTime:   { fontSize: 11, color: MUTED },
  actionRow:  { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontWeight: '600' },

  // Chips
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  chipText:   { fontSize: 12, fontWeight: '600', color: MUTED, textTransform: 'capitalize' },

  // Form
  formHeading: { fontSize: 16, fontWeight: '700', color: TEXT },
  fieldWrap:  { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 0.5 },
  input:      { backgroundColor: CARD, color: TEXT, borderRadius: 12, borderColor: BORDER, borderWidth: 1, padding: 14, fontSize: 14 },
  primaryBtn: { backgroundColor: BLUE, paddingVertical: 15, alignItems: 'center', borderRadius: 14, marginTop: 4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Summary cards
  summaryCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  summaryIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
  summarySub:   { fontSize: 12, color: MUTED, marginTop: 2 },

  // Metrics
  metricsRow:   { flexDirection: 'row', gap: 12 },
  metricCard:   { flex: 1, borderRadius: 16, padding: 14, gap: 2, borderWidth: 1 },
  metricLabel:  { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, color: MUTED, marginBottom: 4 },
  metricValue:  { fontSize: 22, fontWeight: '700', color: TEXT },
  metricSub:    { fontSize: 12, color: MUTED },

  // Progress
  metaLabel:    { fontSize: 12, fontWeight: '600', color: MUTED },
  progressTrack: { height: 4, backgroundColor: BORDER, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: 4, backgroundColor: BLUE, borderRadius: 2 },

  // Empty state
  emptyState:  { alignItems: 'center', gap: 12, paddingVertical: 48 },
  emptyText:   { fontSize: 14, color: MUTED, textAlign: 'center' },

  // Badges
  badge:       { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeText:   { fontSize: 10, fontWeight: '600' },
  unreadDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: BLUE },

  // Modal
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  modalTitle:  { fontSize: 16, fontWeight: '700', color: TEXT },
  modalCloseBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#F3F4F6' },
});
