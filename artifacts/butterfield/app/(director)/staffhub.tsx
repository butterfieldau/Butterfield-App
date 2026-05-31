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
import {
  api,
  type DirectorFeedback,
  type StaffIssue,
  type StaffIssueInput,
  type StaffLeaveInput,
  type StaffLeaveRequest,
  type StaffMember,
  type StaffTask,
  type StaffWastageEntry,
  type StaffWastageInput,
  type TaskHistoryEntry,
} from '@/lib/api';
import { INTERNAL_GLASS_BG, INTERNAL_GLASS_BORDER } from '@/components/InternalGlass';
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
const GLASS_BG     = INTERNAL_GLASS_BG;
const GLASS_BORDER = INTERNAL_GLASS_BORDER;
type FeatherIcon = keyof typeof Feather.glyphMap;

type Tab = 'tasks' | 'issues' | 'wastage' | 'leave' | 'feedback';
type TaskCadence = 'daily' | 'weekly' | 'one_off';
type TaskCategory = 'daily' | 'opening' | 'closing' | 'prep' | 'cleaning' | 'training';

type TaskEditorPayload = {
  title: string;
  description?: string;
  category: string;
  cadence: TaskCadence;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
};

type ManagerTask = StaffTask & {
  completedBy?: string | null;
};

type EditableTask = Partial<ManagerTask>;

type ManagedIssue = StaffIssue & {
  staffName?: string | null;
};

type ManagedWastageEntry = StaffWastageEntry & {
  productName?: string | null;
  itemName?: string | null;
  staffName?: string | null;
};

type ManagedLeaveRequest = StaffLeaveRequest & {
  staffName?: string | null;
};

type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

const STAFF_TABS: { key: Tab; label: string; icon: FeatherIcon }[] = [
  { key: 'tasks',   label: 'Tasks',   icon: 'clipboard'      },
  { key: 'issues',  label: 'Issues',  icon: 'alert-triangle' },
  { key: 'wastage', label: 'Wastage', icon: 'trash-2'        },
  { key: 'leave',   label: 'Leave',   icon: 'calendar'       },
];

const MANAGER_TABS: { key: Tab; label: string; icon: FeatherIcon }[] = [
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
function sydneyDayBounds(input: Date) {
  const from = startOfSydneyDay(input);
  const to   = new Date(from); to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
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
function Badge({ label, color }: { label?: string | null; color: string }) {
  return (
    <View style={[s.badge, { backgroundColor: color + '20', borderColor: color + '50' }]}>
      <Text style={[s.badgeText, { color }]}>{(label ?? '').replace('_', ' ').toUpperCase()}</Text>
    </View>
  );
}
function EmptyState({ icon, message }: { icon: FeatherIcon; message: string }) {
  return (
    <View style={s.emptyState}>
      <Feather name={icon} size={36} color={BORDER} />
      <Text style={s.emptyText}>{message}</Text>
    </View>
  );
}

// ── Task editor modal (manager/director) ──────────────────────────────────────
function TaskEditorModal({
  visible, task, onClose, onSubmit,
}: {
  visible: boolean; task: EditableTask | null; onClose: () => void;
  onSubmit: (payload: TaskEditorPayload) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('daily');
  const [cadence, setCadence] = useState<TaskCadence>('daily');
  const [saving, setSaving] = useState(false);
  const [assignedToUserId, setAssignedToUserId] = useState<string | null>(null);
  const [assignedToName, setAssignedToName] = useState<string | null>(null);

  const { data: staffData } = useQuery({
    queryKey: ['director-staff-list'],
    queryFn: () => api.director.staffList(),
    staleTime: 60_000,
  });
  const staffMembers = staffData?.data ?? [];

  useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setCategory((task?.category as TaskCategory | undefined) ?? 'daily');
    setCadence(task?.cadence ?? 'daily');
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
          <Text style={s.modalTitle}>{task?.id ? 'Edit Task' : 'New Task'}</Text>
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
              <Pressable key={key} onPress={() => setCategory(key as TaskCategory)} style={[s.chip, category === key && { backgroundColor: BLUE, borderColor: BLUE }]}>
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
              <Pressable key={m.id} onPress={() => { setAssignedToUserId(m.id); setAssignedToName(m.name ?? null); }} style={[s.chip, assignedToUserId === m.id && { backgroundColor: BLUE, borderColor: BLUE }]}>
                <Text style={[s.chipText, assignedToUserId === m.id && { color: '#fff' }]}>{m.name ?? 'Staff member'}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={[s.primaryBtn, saving && { opacity: 0.7 }]} disabled={saving} onPress={async () => {
            if (!title.trim()) { Alert.alert('Missing task name', 'Please give the task a name.'); return; }
            setSaving(true);
            try { await onSubmit({ title: title.trim(), description: description.trim() || undefined, category, cadence, assignedToUserId, assignedToName }); onClose(); }
            finally { setSaving(false); }
          }}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{task?.id ? 'Save Changes' : 'Create Task'}</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TASKS TAB — staff view: categorised checklist (no filter chips)
// ══════════════════════════════════════════════════════════════════════════════
const CAT_SECTIONS = [
  { cat: 'daily',    label: 'General Shift', color: CAT_COLORS.daily    },
  { cat: 'opening',  label: 'Opening',        color: CAT_COLORS.opening  },
  { cat: 'closing',  label: 'Closing',        color: CAT_COLORS.closing  },
  { cat: 'prep',     label: 'Coffee Bar',     color: CAT_COLORS.prep     },
  { cat: 'cleaning', label: 'Cleaning',       color: CAT_COLORS.cleaning },
  { cat: 'training', label: 'Stock Check',    color: CAT_COLORS.training },
];

const CADENCE_GROUPS = [
  { cadence: 'daily',   label: 'DAILY TASKS'   },
  { cadence: 'weekly',  label: 'WEEKLY TASKS'  },
  { cadence: 'one_off', label: 'ONE-OFF TASKS' },
];

function StaffTasksTab({ userId }: { userId?: string }) {
  const qc = useQueryClient();

  const { data: tasksData, refetch } = useQuery({
    queryKey: ['staff-tasks-all'],
    queryFn: () => api.staff.tasks(),
    retry: 1,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const allTasks: StaffTask[] = tasksData?.data ?? [];

  // My Tasks: personally assigned to this user
  const myTasks = allTasks.filter((t) => t.assignedToUserId === userId);
  // General tasks: unassigned (visible to everyone on shift)
  const generalTasks = allTasks.filter((t) => !t.assignedToUserId);

  const totalCount = allTasks.length;
  const completedCount = allTasks.filter((t) => t.isCompleted).length;

  const handleComplete = async (id: string, isCompleted: boolean) => {
    Haptics.selectionAsync();
    try {
      await api.staff.completeTask(id, !isCompleted);
      qc.invalidateQueries({ queryKey: ['staff-tasks-all'] });
      qc.invalidateQueries({ queryKey: ['staff-tasks'] });
    } catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'); }
  };

  const renderTaskRow = (task: StaffTask) => (
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
        {task.isCompleted && (task.completedBy ?? task.completedByName) ? (
          <Text style={[s.taskCat, { color: GREEN }]}>✓ {task.completedBy ?? task.completedByName}</Text>
        ) : null}
      </View>
    </Pressable>
  );

  const renderCategoryBox = (tasks: StaffTask[], cat: string, label: string, color: string) => {
    if (tasks.length === 0) return null;
    const done = tasks.filter((t) => t.isCompleted).length;
    return (
      <View key={cat} style={s.glassCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, flexShrink: 0 }} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT, flex: 1 }}>{label}</Text>
          <Text style={s.metaLabel}>{done}/{tasks.length}</Text>
        </View>
        {tasks.map(renderTaskRow)}
      </View>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
    >
      {/* Overall progress bar */}
      {totalCount > 0 && (
        <View style={{ gap: 6, paddingTop: 14 }}>
          <Text style={s.metaLabel}>{completedCount}/{totalCount} tasks complete</Text>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, {
              width: `${(completedCount / totalCount) * 100}%`,
              backgroundColor: completedCount === totalCount ? GREEN : BLUE,
            }]} />
          </View>
        </View>
      )}

      {/* ── My Tasks ── */}
      {myTasks.length > 0 && (
        <View style={s.glassCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: AMBER, flexShrink: 0 }} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT, flex: 1 }}>My Tasks</Text>
            <Text style={s.metaLabel}>
              {myTasks.filter((t) => t.isCompleted).length}/{myTasks.length}
            </Text>
          </View>
          {myTasks.map(renderTaskRow)}
        </View>
      )}

      {/* ── Cadence groups: Daily → Weekly → One-Off ── */}
      {CADENCE_GROUPS.map(({ cadence, label }) => {
        const cadenceTasks = generalTasks.filter((t) => t.cadence === cadence);
        if (cadenceTasks.length === 0) return null;
        return (
          <View key={cadence} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 }}>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: BORDER }} />
              <Text style={[s.metaLabel, { letterSpacing: 1.2, color: MUTED }]}>{label}</Text>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: BORDER }} />
            </View>
            {CAT_SECTIONS.map(({ cat, label: catLabel, color }) =>
              renderCategoryBox(
                cadenceTasks.filter((t) => t.category === cat),
                cat, catLabel, color,
              )
            )}
          </View>
        );
      })}

      {allTasks.length === 0 && (
        <EmptyState icon="clipboard" message="No tasks available yet. Check back soon." />
      )}
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TASKS TAB — manager view: configure tasks
// ══════════════════════════════════════════════════════════════════════════════
function ManagerTasksTab({ canEdit = true }: { canEdit?: boolean }) {
  const qc = useQueryClient();
  const [editingTask, setEditingTask]             = useState<EditableTask | null>(null);
  const [showEditor, setShowEditor]               = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [incompleteExpanded, setIncompleteExpanded] = useState(false);
  const [dayOffset, setDayOffset]                 = useState(0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-tasks'],
    queryFn: () => api.director.tasks(),
    staleTime: 0,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const tasks: ManagerTask[] = data?.data ?? [];

  // Single-day history range (Sydney-aligned)
  const historyRange = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return sydneyDayBounds(d);
  }, [dayOffset]);

  const { data: historyData } = useQuery({
    queryKey: ['director-tasks-history', historyRange.from, historyRange.to],
    queryFn:  () => api.director.taskHistory(historyRange.from, historyRange.to),
    staleTime: 0,
  });
  // For past-day browsing: per-task keep the most-recent entry overall,
  // then include only if that latest entry is 'completed' (not reopened).
  const completedHistory: TaskHistoryEntry[] = (() => {
    const latestByTask = new Map<string, TaskHistoryEntry>();
    for (const h of (historyData?.data ?? []) as TaskHistoryEntry[]) {
      const prev = latestByTask.get(h.taskId);
      if (!prev || new Date(h.createdAt) > new Date(prev.createdAt)) latestByTask.set(h.taskId, h);
    }
    return Array.from(latestByTask.values()).filter(h => h.completionStatus === 'completed');
  })();

  const saveTask = useMutation({
    mutationFn: async (payload: TaskEditorPayload & { id?: string }) => {
      const body = { ...payload, isRecurring: payload.cadence !== 'one_off' };
      return payload.id ? api.director.updateTask(payload.id, body) : api.director.createTask(body);
    },
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await qc.invalidateQueries({ queryKey: ['director-tasks'] });
    },
    onError: (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.director.deleteTask(id),
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await qc.invalidateQueries({ queryKey: ['director-tasks'] });
    },
    onError: (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'),
  });

  const toggleComplete = useMutation({
    mutationFn: ({ id, isCompleted }: { id: string; isCompleted: boolean }) =>
      api.director.completeTask(id, isCompleted),
    onSuccess: () => {
      Haptics.selectionAsync();
      qc.invalidateQueries({ queryKey: ['director-tasks'] });
      qc.invalidateQueries({ queryKey: ['director-tasks-history'] });
    },
    onError: (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'),
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

  const completedTasks  = tasks.filter(t => t.isCompleted);
  const incompleteTasks = tasks.filter(t => !t.isCompleted);

  const completedHistoryByCategory = useMemo(() => {
    const groups = new Map<string, TaskHistoryEntry[]>();
    for (const h of completedHistory) {
      const cat = h.taskCategory ?? 'daily';
      groups.set(cat, [...(groups.get(cat) ?? []), h]);
    }
    return groups;
  }, [completedHistory]);

  const dayLabel = dayOffset === 0 ? 'Today'
    : dayOffset === -1 ? 'Yesterday'
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() + dayOffset);
        return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
      })();

  const DayNavRow = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable onPress={() => setDayOffset(d => d - 1)}
        style={[s.actionBtn, { borderColor: BORDER, paddingHorizontal: 10 }]}>
        <Feather name="chevron-left" size={15} color={TEXT} />
      </Pressable>
      <Text style={{ fontSize: 13, fontWeight: '600', color: TEXT, letterSpacing: 0.4 }}>{dayLabel}</Text>
      <Pressable onPress={() => setDayOffset(d => Math.min(d + 1, 0))}
        style={[s.actionBtn, { borderColor: BORDER, paddingHorizontal: 10, opacity: dayOffset >= 0 ? 0.3 : 1 }]}
        disabled={dayOffset >= 0}>
        <Feather name="chevron-right" size={15} color={TEXT} />
      </Pressable>
    </View>
  );

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        showsVerticalScrollIndicator={false}>

        {/* ── 3-tile row: Add Task | Completed | Incomplete ── */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* Add Task tile */}
          <Pressable
            onPress={() => { if (!canEdit) return; Haptics.selectionAsync(); setEditingTask(null); setShowEditor(true); }}
            style={[s.tileBig, { flex: 1, borderColor: BLUE + '50', backgroundColor: BLUE + '0D', opacity: canEdit ? 1 : 0.5 }]}>
            <View style={[s.tileIcon, { backgroundColor: BLUE + '20' }]}>
              <Feather name="plus" size={16} color={BLUE} />
            </View>
            <Text style={[s.tileCount, { color: BLUE }]}>{tasks.length}</Text>
            <Text style={[s.tileLabel, { color: BLUE }]}>Add Task</Text>
          </Pressable>

          {/* Completed tile */}
          <Pressable
            style={[s.tileBig, { flex: 1, borderColor: completedExpanded ? GREEN : BORDER, backgroundColor: completedExpanded ? GREEN + '10' : GLASS_BG }]}
            onPress={() => { Haptics.selectionAsync(); setCompletedExpanded(v => !v); setIncompleteExpanded(false); }}>
            <View style={[s.tileIcon, { backgroundColor: GREEN + '20' }]}>
              <Feather name="check-circle" size={16} color={GREEN} />
            </View>
            <Text style={[s.tileCount, { color: completedExpanded ? GREEN : TEXT }]}>
              {dayOffset === 0 ? completedTasks.length : completedHistory.length}
            </Text>
            <Text style={s.tileLabel}>Completed</Text>
            <Feather name={completedExpanded ? 'chevron-up' : 'chevron-down'} size={11} color={MUTED} />
          </Pressable>

          {/* Incomplete tile */}
          <Pressable
            style={[s.tileBig, { flex: 1, borderColor: incompleteExpanded ? AMBER : BORDER, backgroundColor: incompleteExpanded ? AMBER + '10' : GLASS_BG }]}
            onPress={() => { Haptics.selectionAsync(); setIncompleteExpanded(v => !v); setCompletedExpanded(false); }}>
            <View style={[s.tileIcon, { backgroundColor: AMBER + '20' }]}>
              <Feather name="clock" size={16} color={AMBER} />
            </View>
            <Text style={[s.tileCount, { color: incompleteExpanded ? AMBER : TEXT }]}>
              {dayOffset === 0 ? incompleteTasks.length : tasks.length - completedHistory.length}
            </Text>
            <Text style={s.tileLabel}>Incomplete</Text>
            <Feather name={incompleteExpanded ? 'chevron-up' : 'chevron-down'} size={11} color={MUTED} />
          </Pressable>
        </View>

        {/* ── Completed section ── */}
        {completedExpanded && (
          <View style={[s.glassCard, { gap: 12 }]}>
            <DayNavRow />
            {/* Today: render straight from completedTasks (same source as the tile) */}
            {dayOffset === 0 ? (
              completedTasks.length === 0 ? (
                <EmptyState icon="check-circle" message="No completed tasks yet today" />
              ) : (
                CATEGORIES.map(cat => {
                  const items = completedTasks.filter(t => t.category === cat);
                  if (items.length === 0) return null;
                  const color = CAT_COLORS[cat] ?? BLUE;
                  return (
                    <View key={cat} style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: TEXT, flex: 1 }}>{TASK_CATEGORY_LABELS[cat] ?? cat}</Text>
                        <Badge label={String(items.length)} color={color} />
                      </View>
                      {items.map(t => (
                        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingLeft: 16 }}>
                          <Feather name="check-circle" size={14} color={GREEN} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={[s.taskTitle, { fontSize: 13, textDecorationLine: 'line-through', color: MUTED }]}>{t.title}</Text>
                            <Text style={s.taskDesc}>{(t.completedBy ?? t.completedByName) ? `✓ ${t.completedBy ?? t.completedByName}  ·  ` : ''}{t.completedAt ? timeAgo(t.completedAt) : ''}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })
              )
            ) : (
              /* Past days: use history (deduplicated, latest-entry-wins) */
              completedHistory.length === 0 ? (
                <EmptyState icon="check-circle" message="No completed tasks this day" />
              ) : (
                CATEGORIES.map(cat => {
                  const items = completedHistoryByCategory.get(cat) ?? [];
                  if (items.length === 0) return null;
                  const color = CAT_COLORS[cat] ?? BLUE;
                  return (
                    <View key={cat} style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: TEXT, flex: 1 }}>{TASK_CATEGORY_LABELS[cat] ?? cat}</Text>
                        <Badge label={String(items.length)} color={color} />
                      </View>
                      {items.map(h => (
                        <View key={h.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingLeft: 16 }}>
                          <Feather name="check-circle" size={14} color={GREEN} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={[s.taskTitle, { fontSize: 13, textDecorationLine: 'line-through', color: MUTED }]}>{h.taskTitle}</Text>
                            <Text style={s.taskDesc}>{h.completedByName ? `✓ ${h.completedByName}  ·  ` : ''}{timeAgo(h.createdAt)}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })
              )
            )}
          </View>
        )}

        {/* ── Incomplete section ── */}
        {incompleteExpanded && (() => {
          // Today: use live isCompleted=false list
          // Past days: tasks not found in that day's completed history
          const completedIdsForDay = new Set(completedHistory.map(h => h.taskId));
          const displayIncomplete = dayOffset === 0
            ? incompleteTasks
            : tasks.filter(t => !completedIdsForDay.has(t.id));
          return (
            <View style={[s.glassCard, { gap: 12 }]}>
              <DayNavRow />
              {displayIncomplete.length === 0 ? (
                <EmptyState icon="check-square" message="All tasks completed that day!" />
              ) : (
                CATEGORIES.map(cat => {
                  const items = displayIncomplete.filter(t => t.category === cat);
                  if (items.length === 0) return null;
                  const color = CAT_COLORS[cat] ?? BLUE;
                  return (
                    <View key={cat} style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: TEXT, flex: 1 }}>{TASK_CATEGORY_LABELS[cat] ?? cat}</Text>
                        <Badge label={String(items.length)} color={AMBER} />
                      </View>
                      {items.map(t => (
                        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingLeft: 16 }}>
                          <Feather name="square" size={14} color={AMBER} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={[s.taskTitle, { fontSize: 13 }]}>{t.title}</Text>
                            <Text style={s.taskDesc}>
                              {TASK_CADENCE_LABELS[t.cadence ?? 'daily'] ?? 'Daily'}
                              {t.assignedToName ? `  ·  ${t.assignedToName}` : ''}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })
              )}
            </View>
          );
        })()}

        {/* ── All Tasks ── */}
        <Text style={[s.metaLabel, { paddingHorizontal: 2, letterSpacing: 1, marginTop: 4 }]}>ALL TASKS</Text>

        {tasks.length === 0 ? (
          <EmptyState icon="check-square" message="No tasks configured yet" />
        ) : tasks.map((task, index) => (
          <View key={task.id} style={[s.glassCard, task.isCompleted && { borderColor: GREEN + '40', backgroundColor: GREEN + '06' }]}>
            <View style={s.cardHeader}>
              {/* Tap checkbox to toggle */}
              <Pressable
                onPress={() => { Haptics.selectionAsync(); toggleComplete.mutate({ id: task.id, isCompleted: !task.isCompleted }); }}
                style={[s.iconBox, { backgroundColor: task.isCompleted ? GREEN + '20' : (CAT_COLORS[task.category] ?? BLUE) + '18' }]}
                hitSlop={8}>
                <Feather
                  name={task.isCompleted ? 'check-circle' : 'circle'}
                  size={15}
                  color={task.isCompleted ? GREEN : (CAT_COLORS[task.category] ?? BLUE)} />
              </Pressable>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.cardTitle, task.isCompleted && { color: MUTED, textDecorationLine: 'line-through' }]}>{task.title}</Text>
                <Text style={s.cardSub}>
                  {TASK_CATEGORY_LABELS[task.category] ?? task.category} · {TASK_CADENCE_LABELS[task.cadence ?? 'daily'] ?? 'Daily'}
                  {task.assignedToName ? ` · ${task.assignedToName}` : ' · All staff'}
                </Text>
                {task.isCompleted && (task.completedBy ?? task.completedByName) ? (
                  <Text style={[s.taskDesc, { color: GREEN, marginTop: 1 }]}>
                    {'✓ '}{task.completedBy ?? task.completedByName}{task.completedAt ? `  ·  ${timeAgo(task.completedAt)}` : ''}
                  </Text>
                ) : null}
              </View>
            </View>
            {task.description ? <Text style={s.cardDesc}>{task.description}</Text> : null}
            {canEdit && (
              <View style={s.actionRow}>
                <Pressable style={[s.actionBtn, { borderColor: BORDER }]} onPress={() => void reorder(task.id, -1)} disabled={index === 0}>
                  <Feather name="arrow-up" size={13} color={index === 0 ? BORDER : BLUE} />
                  <Text style={[s.actionBtnText, { color: index === 0 ? MUTED : BLUE }]}>Up</Text>
                </Pressable>
                <Pressable style={[s.actionBtn, { borderColor: BORDER }]} onPress={() => void reorder(task.id, 1)} disabled={index === tasks.length - 1}>
                  <Feather name="arrow-down" size={13} color={index === tasks.length - 1 ? BORDER : BLUE} />
                  <Text style={[s.actionBtnText, { color: index === tasks.length - 1 ? MUTED : BLUE }]}>Down</Text>
                </Pressable>
                <Pressable style={[s.actionBtn, { borderColor: BLUE + '40', backgroundColor: BLUE + '10', flex: 1 }]} onPress={() => { setEditingTask(task); setShowEditor(true); }}>
                  <Feather name="edit-2" size={13} color={BLUE} />
                  <Text style={[s.actionBtnText, { color: BLUE }]}>Edit</Text>
                </Pressable>
                <Pressable style={[s.actionBtn, { borderColor: RED + '40', backgroundColor: RED + '10' }]}
                  onPress={() => Alert.alert('Delete Task', `Delete "${task.title}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deleteTask.mutate(task.id) },
                  ])}>
                  <Feather name="trash-2" size={13} color={RED} />
                </Pressable>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      <TaskEditorModal
        visible={showEditor}
        task={editingTask}
        onClose={() => setShowEditor(false)}
        onSubmit={async (payload) => {
          await saveTask.mutateAsync(editingTask?.id ? { ...payload, id: editingTask.id } : payload);
        }}
      />
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ISSUES TAB — staff view: submit form
// ══════════════════════════════════════════════════════════════════════════════
function StaffIssuesTab() {
  const [form, setForm] = useState<Required<Pick<StaffIssueInput, 'title' | 'description' | 'priority'>>>({ title: '', description: '', priority: 'medium' });
  const [submitting, setSubmitting] = useState(false);

  const handle = async () => {
    if (!form.title || !form.description) { Alert.alert('Fill all fields'); return; }
    setSubmitting(true);
    try {
      await api.staff.submitIssue(form);
      setForm({ title: '', description: '', priority: 'medium' });
      Alert.alert('Reported', 'Issue submitted to management.');
    } catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'); }
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
                value={form[field.key as keyof typeof form]}
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
  const issues: ManagedIssue[] = data?.data ?? [];

  const resolve = useMutation({
    mutationFn: ({ id, status }: { id: string; status: IssueStatus }) => api.director.resolveIssue(id, status),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['director-all-issues'] });
      qc.invalidateQueries({ queryKey: ['director-stats'] });
    },
    onError: (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'),
  });

  const handleAction = (issue: ManagedIssue) => {
    const opts: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [];
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
    Alert.alert(issue.title ?? 'Issue', `${issue.description}\n\nReported by: ${issue.staffName ?? 'Unknown'}\nPriority: ${issue.priority ?? ''}`, opts);
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      showsVerticalScrollIndicator={false}>
      {issues.length === 0 ? <EmptyState icon="check-circle" message="No issues reported" /> :
        issues.map((item) => (
          <Pressable key={item.id} onPress={() => handleAction(item)} style={s.glassCard}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: priorityColor(item.priority ?? '') + '18' }]}>
                <Feather name="alert-triangle" size={15} color={priorityColor(item.priority ?? '')} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={s.cardSub} numberOfLines={1}>{item.staffName ?? 'Unknown'} · {item.category}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </View>
            <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
            <View style={s.cardFooter}>
              <Badge label={item.priority} color={priorityColor(item.priority ?? '')} />
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
  const [form, setForm] = useState<{ productName: string; quantity: string; unit: string; reason: string; estimatedCost: string; notes: string }>({ productName: '', quantity: '', unit: 'units', reason: '', estimatedCost: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const { data: wastageData } = useQuery({ queryKey: ['staff-wastage'], queryFn: () => api.staff.wastage() });
  const wastageList: StaffWastageEntry[] = wastageData?.data ?? [];

  const handle = async () => {
    if (!form.productName || !form.quantity || !form.reason) { Alert.alert('Fill all required fields'); return; }
    setSubmitting(true);
    try {
      const cost = form.estimatedCost.trim();
      const costNum = cost ? Number(cost) : null;
      if (cost && (costNum === null || !Number.isFinite(costNum!) || costNum! < 0)) {
        Alert.alert('Invalid amount', 'Enter a valid loss amount.'); setSubmitting(false); return;
      }
      const payload: StaffWastageInput = {
        productName: form.productName, quantity: form.quantity, unit: form.unit, reason: form.reason,
        notes: form.notes.trim() || null,
        estimatedCostCents: costNum !== null ? Math.round(costNum! * 100) : null,
      };
      await api.staff.submitWastage(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setForm({ productName: '', quantity: '', unit: 'units', reason: '', estimatedCost: '', notes: '' });
      qc.invalidateQueries({ queryKey: ['staff-wastage'] });
      Alert.alert('Logged', 'Wastage recorded successfully.');
    } catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'); }
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
                keyboardType={field.keyboard} value={form[field.key as keyof typeof form]}
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
            {wastageList.slice(0, 5).map((w) => (
              <View key={w.id} style={s.taskRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.taskTitle}>{(w.itemName ?? 'Item')} × {w.quantity} {w.unit ?? 'units'}</Text>
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
  const wastage: ManagedWastageEntry[] = data?.data ?? [];
  const currentWeekKey = startOfSydneyWeek(new Date()).toISOString();

  const weekGroups = useMemo(() => {
    const groups = new Map<string, { key: string; start: Date; end: Date; items: ManagedWastageEntry[]; totalCost: number }>();
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
    onError: (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'),
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
        : selectedWeek.items.map((item) => (
          <Pressable key={item.id} style={s.glassCard} onPress={() => {
            const cost = item.estimatedCostCents ? fmtAUD(item.estimatedCostCents) : 'Not estimated';
            const itemName = item.productName ?? item.itemName ?? 'Item';
            Alert.alert(`Wastage: ${itemName}`,
              `Staff: ${item.staffName ?? 'Unknown'}\nQty: ${item.quantity} ${item.unit ?? 'units'}\nReason: ${item.reason ?? '—'}\nEst. cost: ${cost}${item.notes ? `\nNotes: ${item.notes}` : ''}`,
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
                <Text style={s.cardTitle} numberOfLines={1}>{item.productName ?? item.itemName ?? 'Item'}</Text>
                <Text style={s.cardSub} numberOfLines={1}>{item.staffName ?? 'Unknown staff'} · {item.quantity} {item.unit ?? 'units'}</Text>
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
  const qc = useQueryClient();
  const [form, setForm] = useState<{ startDate: string; endDate: string; type: 'annual' | 'sick' | 'personal' | 'other'; reason: string }>({ startDate: '', endDate: '', type: 'annual', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const { data: leaveData } = useQuery({
    queryKey: ['staff-my-leave'],
    queryFn:  () => api.staff.myLeave(),
    staleTime: 0,
  });
  const myLeave: StaffLeaveRequest[] = leaveData?.data ?? [];

  const leaveTypeColor = (t: string) => {
    if (t === 'annual')   return BLUE;
    if (t === 'sick')     return AMBER;
    if (t === 'personal') return PINK;
    return MUTED;
  };
  const leaveStatusColor = (st: string) => {
    if (st === 'approved') return GREEN;
    if (st === 'rejected') return RED;
    return AMBER;
  };

  const handle = async () => {
    if (!form.startDate || !form.endDate || !form.reason) { Alert.alert('Fill all fields'); return; }
    setSubmitting(true);
    try {
      const payload: StaffLeaveInput = form;
      await api.staff.submitLeave(payload);
      setForm({ startDate: '', endDate: '', type: 'annual', reason: '' });
      await qc.invalidateQueries({ queryKey: ['staff-my-leave'] });
      Alert.alert('Submitted', 'Leave request sent to management.');
    } catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setSubmitting(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
      {/* ── Submit form ── */}
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
                style={[s.input, field.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
                value={form[field.key as keyof typeof form]}
                onChangeText={(v) => setForm((f) => ({ ...f, [field.key]: v }))}
                placeholder={field.placeholder} placeholderTextColor={MUTED}
                multiline={field.multiline} numberOfLines={field.multiline ? 4 : 1}
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

      {/* ── My requests ── */}
      {myLeave.length > 0 && (
        <>
          <Text style={[s.metaLabel, { letterSpacing: 1, paddingHorizontal: 2 }]}>MY REQUESTS</Text>
          {myLeave.map(item => (
            <View key={item.id}
              style={[s.glassCard, item.status === 'pending' && { borderColor: AMBER + '60' }]}>
              <View style={s.cardHeader}>
                <View style={[s.iconBox, { backgroundColor: leaveTypeColor(item.type) + '18' }]}>
                  <Feather name="calendar" size={15} color={leaveTypeColor(item.type)} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.cardTitle}>{item.startDate} → {item.endDate}</Text>
                  {item.reason ? <Text style={s.cardSub} numberOfLines={2}>{item.reason}</Text> : null}
                </View>
                <Badge label={item.status} color={leaveStatusColor(item.status)} />
              </View>
              {item.reviewNote ? (
                <View style={{ backgroundColor: leaveStatusColor(item.status) + '12', borderRadius: 8, padding: 8 }}>
                  <Text style={{ fontSize: 12, color: leaveStatusColor(item.status) }}>{item.reviewNote}</Text>
                </View>
              ) : null}
              <View style={s.cardFooter}>
                <Badge label={item.type} color={leaveTypeColor(item.type)} />
                <Text style={[s.cardTime, { marginLeft: 'auto' }]}>{timeAgo(item.createdAt)}</Text>
              </View>
            </View>
          ))}
        </>
      )}
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
  const leave: ManagedLeaveRequest[] = data?.data ?? [];
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
    onError: (e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong'),
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
          leave.map((item) => (
            <View key={item.id} style={[s.glassCard, item.status === 'pending' && { borderColor: AMBER + '70' }]}>
              <View style={s.cardHeader}>
                <View style={[s.iconBox, { backgroundColor: leaveTypeColor(item.type ?? '') + '18' }]}>
                  <Feather name="calendar" size={15} color={leaveTypeColor(item.type ?? '')} />
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
                <Badge label={item.type} color={leaveTypeColor(item.type ?? '')} />
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
                onPress={() => { if (!reviewTarget) return; reviewMut.mutate({ id: reviewTarget.id, approved: reviewTarget.action === 'approve', note: reviewNote }); }}
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
  const feedback: DirectorFeedback[] = data?.data ?? [];

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
        feedback.map((item) => (
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

  // Managers/directors default to Manage mode; staff default to My Shift
  const [manageMode, setManageMode] = useState(isManager);

  // Fetch manager permissions (only relevant for role=manager)
  const { data: mgrProfileData } = useQuery({
    queryKey: ['manager-profile'],
    queryFn:  () => api.manager.profile(),
    enabled:  user?.role === 'manager',
    staleTime: 60_000,
  });
  const mgrPerms: string[] = (mgrProfileData?.data?.permissions as string[]) ?? [];
  // Directors/masters always can edit tasks; managers need the 'tasks' permission
  const canEditTasks = user?.role !== 'manager' || mgrPerms.includes('tasks');

  // Manager tabs: hide 'tasks' tab when manager doesn't have the tasks permission
  const managerTabs = canEditTasks ? MANAGER_TABS : MANAGER_TABS.filter(t => t.key !== 'tasks');
  const tabs = (isManager && manageMode) ? managerTabs : STAFF_TABS;
  const [activeTab, setActiveTab] = useState<Tab>('tasks');

  useEffect(() => {
    const requested = params.tab ?? params.initialTab;
    if (requested && tabs.some(t => t.key === requested)) {
      setActiveTab(requested);
    }
  }, [params.tab, params.initialTab]);

  // When mode or permissions change, reset to a valid tab
  useEffect(() => {
    if (!tabs.some(t => t.key === activeTab)) {
      setActiveTab(tabs[0]?.key ?? 'issues');
    }
  }, [manageMode, canEditTasks]);

  const showManagerContent = isManager && manageMode;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
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

      {/* ── Tab bar (scrollable pills) ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={s.tabRow}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => { Haptics.selectionAsync(); setActiveTab(tab.key); }}
              style={[s.tabPill, active && s.tabPillActive]}
            >
              <Feather name={tab.icon} size={13} color={active ? '#fff' : MUTED} />
              <Text style={[s.tabPillText, active && { color: '#fff' }]} numberOfLines={1}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Content (KAV only here so keyboard never pushes the header/tabs) ── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {activeTab === 'tasks'    && (showManagerContent ? <ManagerTasksTab canEdit={canEditTasks} />   : <StaffTasksTab userId={user?.id} />)}
        {activeTab === 'issues'   && (showManagerContent ? <ManagerIssuesTab />  : <StaffIssuesTab />)}
        {activeTab === 'wastage'  && (showManagerContent ? <ManagerWastageTab /> : <StaffWastageTab />)}
        {activeTab === 'leave'    && (showManagerContent ? <ManagerLeaveTab />   : <StaffLeaveTab />)}
        {activeTab === 'feedback' && showManagerContent  && <FeedbackTab />}
      </KeyboardAvoidingView>
    </View>
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

  // Tab pills (horizontal-scroll row)
  tabRow:       { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  tabPill:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: GLASS_BG },
  tabPillActive:{ backgroundColor: BLUE, borderColor: BLUE },
  tabPillText:  { fontSize: 12, fontWeight: '600', color: MUTED },

  // Summary tiles (Completed / Incomplete)
  tileBig:   { padding: 14, borderRadius: 18, borderWidth: 1, alignItems: 'center', gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  tileIcon:  { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileCount: { fontSize: 28, fontWeight: '700' },
  tileLabel: { fontSize: 12, fontWeight: '600', color: MUTED },

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
