import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRefreshControl } from '@/hooks/useRefreshControl';

const BG     = '#F5F6FA';
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

type Tab = 'issues' | 'tasks' | 'wastage' | 'leave' | 'feedback';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'issues',   label: 'Issues',   icon: 'alert-triangle' },
  { key: 'tasks',    label: 'Tasks',    icon: 'check-square'   },
  { key: 'wastage',  label: 'Wastage',  icon: 'trash-2'        },
  { key: 'leave',    label: 'Leave',    icon: 'calendar'       },
  { key: 'feedback', label: 'Feedback', icon: 'message-circle' },
];

const TASK_CATEGORY_LABELS: Record<string, string> = {
  opening: 'Opening',
  closing: 'Closing',
  prep: 'Coffee Bar',
  cleaning: 'Cleaning',
  daily: 'General Shift',
  training: 'Stock Check / One-Off',
};

const TASK_CADENCE_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  one_off: 'One-Off',
};

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

function fmtAUD(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function toSydneyDate(input: string | Date | null | undefined): Date {
  if (!input) return new Date();
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false,
    }).formatToParts(d);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0');
    const h = get('hour');
    return new Date(get('year'), get('month') - 1, get('day'), h === 24 ? 0 : h, get('minute'), get('second'));
  } catch {
    return d;
  }
}

function startOfSydneyDay(input: string | Date) {
  const d = toSydneyDate(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfSydneyWeek(input: string | Date) {
  const d = startOfSydneyDay(input);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfSydneyWeek(start: Date) {
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
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

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.badge, { backgroundColor: color + '20', borderColor: color + '50' }]}>
      <Text style={[s.badgeText, { color }]}>{label.replace('_', ' ').toUpperCase()}</Text>
    </View>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <View style={s.empty}>
      <Feather name={icon as any} size={32} color={BORDER} />
      <Text style={s.emptyText}>{message}</Text>
    </View>
  );
}

function TaskEditorModal({
  visible,
  task,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  task: any | null;
  onClose: () => void;
  onSubmit: (payload: { title: string; description?: string; category: string; cadence: 'daily' | 'weekly' | 'one_off' }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('daily');
  const [cadence, setCadence] = useState<'daily' | 'weekly' | 'one_off'>('daily');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setCategory(task?.category ?? 'daily');
    setCadence((task?.cadence as any) ?? 'daily');
    setSaving(false);
  }, [task, visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={[s.modalHeader, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={s.modalCloseBtn}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
          <Text style={s.modalTitle}>{task ? 'Edit Task' : 'Add Task'}</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={s.modalInputWrap}>
            <Text style={s.modalInputLabel}>Task name</Text>
            <TextInput style={s.modalInput} value={title} onChangeText={setTitle} placeholder="e.g. Turn on coffee machine" placeholderTextColor={MUTED} />
          </View>
          <View style={s.modalInputWrap}>
            <Text style={s.modalInputLabel}>Description</Text>
            <TextInput style={[s.modalInput, { height: 90, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} multiline placeholder="Optional detail for staff" placeholderTextColor={MUTED} />
          </View>

          <Text style={s.modalInputLabel}>Task type</Text>
          <View style={s.modalChipRow}>
            {Object.entries(TASK_CATEGORY_LABELS).map(([key, label]) => (
              <Pressable key={key} onPress={() => setCategory(key)} style={[s.modalChip, category === key && s.modalChipActive]}>
                <Text style={[s.modalChipText, category === key && s.modalChipTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.modalInputLabel}>Cadence</Text>
          <View style={s.modalChipRow}>
            {(Object.keys(TASK_CADENCE_LABELS) as Array<'daily' | 'weekly' | 'one_off'>).map((key) => (
              <Pressable key={key} onPress={() => setCadence(key)} style={[s.modalChip, cadence === key && s.modalChipActive]}>
                <Text style={[s.modalChipText, cadence === key && s.modalChipTextActive]}>{TASK_CADENCE_LABELS[key]}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[s.primaryActionBtn, saving && { opacity: 0.7 }]}
            disabled={saving}
            onPress={async () => {
              if (!title.trim()) {
                Alert.alert('Missing task name', 'Please give the task a name.');
                return;
              }
              setSaving(true);
              try {
                await onSubmit({ title: title.trim(), description: description.trim() || undefined, category, cadence });
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryActionText}>{task ? 'Save Changes' : 'Create Task'}</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function TasksTab() {
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
    mutationFn: async (payload: { id?: string; title: string; description?: string; category: string; cadence: 'daily' | 'weekly' | 'one_off' }) => {
      const body = { ...payload, isRecurring: payload.cadence !== 'one_off' };
      if (payload.id) return api.director.updateTask(payload.id, body);
      return api.director.createTask(body);
    },
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await qc.invalidateQueries({ queryKey: ['director-tasks'] });
      await qc.invalidateQueries({ queryKey: ['shop-display-tasks'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.director.deleteTask(id),
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await qc.invalidateQueries({ queryKey: ['director-tasks'] });
      await qc.invalidateQueries({ queryKey: ['shop-display-tasks'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const reorder = async (taskId: string, direction: -1 | 1) => {
    const index = tasks.findIndex((task) => task.id === taskId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= tasks.length) return;
    const reordered = [...tasks];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(swapIndex, 0, moved);
    await api.director.reorderTasks(reordered.map((task) => task.id));
    await qc.invalidateQueries({ queryKey: ['director-tasks'] });
    await qc.invalidateQueries({ queryKey: ['shop-display-tasks'] });
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => { setEditingTask(null); setShowEditor(true); }} style={[s.summaryCard, { backgroundColor: BLUE + '12', borderColor: BLUE + '40' }]}>
          <Feather name="plus-circle" size={16} color={BLUE} />
          <View style={{ flex: 1 }}>
            <Text style={[s.summaryTitle, { color: BLUE }]}>Add shop task</Text>
            <Text style={[s.summarySub, { color: MUTED }]}>Create opening, closing, coffee bar, cleaning, stock check or one-off tasks.</Text>
          </View>
        </Pressable>

        {tasks.length === 0 ? (
          <EmptyState icon="check-square" message="No tasks configured yet" />
        ) : tasks.map((task: any, index: number) => (
          <View key={task.id} style={[s.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: BLUE + '18' }]}>
                <Feather name="check-square" size={15} color={BLUE} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[s.cardTitle, { color: TEXT }]}>{task.title}</Text>
                <Text style={[s.cardSub, { color: MUTED }]}>
                  {TASK_CATEGORY_LABELS[task.category] ?? task.category} · {TASK_CADENCE_LABELS[task.cadence ?? 'daily'] ?? 'Daily'}
                </Text>
              </View>
            </View>
            {task.description ? <Text style={[s.cardDesc, { color: MUTED }]}>{task.description}</Text> : null}
            <View style={s.actionRow}>
              <Pressable style={[s.actionBtn, { borderColor: BORDER, backgroundColor: CARD }]} onPress={() => void reorder(task.id, -1)} disabled={index === 0}>
                <Feather name="arrow-up" size={14} color={index === 0 ? BORDER : BLUE} />
                <Text style={[s.actionBtnText, { color: index === 0 ? MUTED : BLUE }]}>Up</Text>
              </Pressable>
              <Pressable style={[s.actionBtn, { borderColor: BORDER, backgroundColor: CARD }]} onPress={() => void reorder(task.id, 1)} disabled={index === tasks.length - 1}>
                <Feather name="arrow-down" size={14} color={index === tasks.length - 1 ? BORDER : BLUE} />
                <Text style={[s.actionBtnText, { color: index === tasks.length - 1 ? MUTED : BLUE }]}>Down</Text>
              </Pressable>
              <Pressable style={[s.actionBtn, { borderColor: BLUE + '40', backgroundColor: BLUE + '10' }]} onPress={() => { setEditingTask(task); setShowEditor(true); }}>
                <Feather name="edit-2" size={14} color={BLUE} />
                <Text style={[s.actionBtnText, { color: BLUE }]}>Edit</Text>
              </Pressable>
              <Pressable
                style={[s.actionBtn, { borderColor: RED + '40', backgroundColor: RED + '10' }]}
                onPress={() => Alert.alert('Delete Task', `Delete "${task.title}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteTask.mutate(task.id) },
                ])}
              >
                <Feather name="trash-2" size={14} color={RED} />
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
          await saveTask.mutateAsync(editingTask ? { ...payload, id: editingTask.id } : payload);
        }}
      />
    </>
  );
}

// ── Issues tab ────────────────────────────────────────────────────────────────
function IssuesTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-all-issues'],
    queryFn: () => api.director.allIssues(),
    staleTime: 0,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const issues: any[] = data?.data ?? [];

  const resolve = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.director.resolveIssue(id, status),
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
    Alert.alert(issue.title, `${issue.description}\n\nReported by: ${issue.staffName ?? 'Unknown'}\nCategory: ${issue.category}\nPriority: ${issue.priority}`, opts);
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      showsVerticalScrollIndicator={false}
    >
      {issues.length === 0
        ? <EmptyState icon="check-circle" message="No issues reported" />
        : issues.map((item: any) => (
          <Pressable key={item.id} onPress={() => handleAction(item)} style={[s.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: priorityColor(item.priority) + '18' }]}>
                <Feather name="alert-triangle" size={15} color={priorityColor(item.priority)} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.cardTitle, { color: TEXT }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[s.cardSub,   { color: MUTED }]} numberOfLines={1}>{item.staffName ?? 'Unknown staff'} · {item.category}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </View>
            <Text style={[s.cardDesc, { color: MUTED }]} numberOfLines={2}>{item.description}</Text>
            <View style={s.cardFooter}>
              <Badge label={item.priority} color={priorityColor(item.priority)} />
              <Badge label={item.status}   color={statusColor(item.status)} />
              <Text style={[s.cardTime, { color: MUTED }]}>{timeAgo(item.createdAt)}</Text>
            </View>
          </Pressable>
        ))
      }
    </ScrollView>
  );
}

// ── Wastage tab ───────────────────────────────────────────────────────────────
function WastageTab() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-all-wastage'],
    queryFn: () => api.director.allWastage(),
    staleTime: 0,
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
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
        existing.totalCost += item.estimatedCostCents ?? 0;
      } else {
        groups.set(key, { key, start, end, items: [item], totalCost: item.estimatedCostCents ?? 0 });
      }
    });
    return Array.from(groups.values()).sort((a, b) => b.start.getTime() - a.start.getTime());
  }, [wastage]);

  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);

  const selectedWeek = useMemo(() => {
    const fallbackKey = selectedWeekKey ?? currentWeekKey;
    return weekGroups.find((group) => group.key === fallbackKey) ?? weekGroups[0] ?? null;
  }, [currentWeekKey, selectedWeekKey, weekGroups]);

  const todayStart = startOfSydneyDay(new Date());
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);
  const todayItems = useMemo(() => wastage.filter((item) => {
    const createdAt = toSydneyDate(item.createdAt);
    return createdAt >= todayStart && createdAt <= todayEnd;
  }), [todayEnd, todayStart, wastage]);
  const todayCost = todayItems.reduce((sum, item) => sum + (item.estimatedCostCents ?? 0), 0);
  const thisWeekItems = useMemo(() => weekGroups.find((group) => group.key === currentWeekKey)?.items ?? [], [currentWeekKey, weekGroups]);
  const thisWeekCost = thisWeekItems.reduce((sum, item) => sum + (item.estimatedCostCents ?? 0), 0);

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.director.deleteWastage(id),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handlePress = (item: any) => {
    const cost = item.estimatedCostCents ? fmtAUD(item.estimatedCostCents) : 'Not estimated';
    Alert.alert(
      `Wastage: ${item.productName}`,
      `Staff: ${item.staffName ?? 'Unknown'}\nQuantity: ${item.quantity} ${item.unit}\nReason: ${item.reason}\nEst. cost: ${cost}${item.notes ? `\nNotes: ${item.notes}` : ''}`,
      [
        { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item) },
        { text: 'OK' },
      ],
    );
  };

  const handleDelete = (item: any) => {
    Alert.alert(
      'Delete Wastage Entry',
      `Remove wastage entry for ${item.productName} (${item.quantity} ${item.unit}) by ${item.staffName ?? 'Unknown'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(item.id) },
      ],
    );
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.metricsRow}>
        <View style={[s.metricCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          <Text style={s.metricLabel}>TODAY</Text>
          <Text style={[s.metricValue, { color: PURPLE }]}>{fmtAUD(todayCost)}</Text>
          <Text style={s.metricSub}>{todayItems.length} entr{todayItems.length === 1 ? 'y' : 'ies'}</Text>
        </View>
        <View style={[s.metricCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          <Text style={s.metricLabel}>THIS WEEK</Text>
          <Text style={[s.metricValue, { color: PURPLE }]}>{fmtAUD(thisWeekCost)}</Text>
          <Text style={s.metricSub}>{thisWeekItems.length} entr{thisWeekItems.length === 1 ? 'y' : 'ies'}</Text>
        </View>
      </View>

      {weekGroups.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {weekGroups.map((group) => {
            const active = selectedWeek?.key === group.key;
            const isCurrentWeek = group.key === currentWeekKey;
            const label = isCurrentWeek
              ? 'This week'
              : `${group.start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} - ${group.end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
            return (
              <Pressable
                key={group.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedWeekKey(group.key);
                }}
                style={[s.weekChip, active && { backgroundColor: PURPLE, borderColor: PURPLE }]}
              >
                <Text style={[s.weekChipTitle, active && { color: '#fff' }]}>{label}</Text>
                <Text style={[s.weekChipSub, active && { color: 'rgba(255,255,255,0.82)' }]}>{fmtAUD(group.totalCost)} · {group.items.length} entries</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {selectedWeek && (
        <View style={[s.summaryCard, { backgroundColor: PURPLE + '12', borderColor: PURPLE + '40' }]}>
          <Feather name="trash-2" size={16} color={PURPLE} />
          <View style={{ flex: 1 }}>
            <Text style={[s.summaryTitle, { color: PURPLE }]}>
              {selectedWeek.key === currentWeekKey ? "This Week's Wastage Cost" : 'Weekly Wastage Cost'}
            </Text>
            <Text style={[s.summarySub, { color: MUTED }]}>
              {selectedWeek.items.length} entr{selectedWeek.items.length === 1 ? 'y' : 'ies'} · estimated {fmtAUD(selectedWeek.totalCost)} lost
            </Text>
          </View>
        </View>
      )}
      {selectedWeek == null || selectedWeek.items.length === 0
        ? <EmptyState icon="trash-2" message="No wastage logged" />
        : selectedWeek.items.map((item: any) => (
          <Pressable key={item.id} onPress={() => handlePress(item)} style={[s.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: PURPLE + '18' }]}>
                <Feather name="trash-2" size={15} color={PURPLE} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.cardTitle, { color: TEXT }]} numberOfLines={1}>{item.productName}</Text>
                <Text style={[s.cardSub,   { color: MUTED }]} numberOfLines={1}>{item.staffName ?? 'Unknown staff'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {item.estimatedCostCents ? (
                  <Text style={[s.cost, { color: PURPLE }]}>{fmtAUD(item.estimatedCostCents)}</Text>
                ) : null}
                <Pressable onPress={() => handleDelete(item)} hitSlop={8} style={{ padding: 4 }}>
                  <Feather name="trash-2" size={15} color={RED} />
                </Pressable>
              </View>
            </View>
            <View style={s.cardFooter}>
              <Text style={[s.badgeText, { color: MUTED, fontSize: 11 }]}>{item.quantity} {item.unit}</Text>
              <Text style={[s.badgeText, { color: MUTED, fontSize: 11 }]}>·</Text>
              <Text style={[s.badgeText, { color: MUTED, fontSize: 11 }]} numberOfLines={1}>{item.reason}</Text>
              <Text style={[s.cardTime, { color: MUTED, marginLeft: 'auto' }]}>{timeAgo(item.createdAt)}</Text>
            </View>
          </Pressable>
        ))
      }
    </ScrollView>
  );
}

// ── Leave review modal ────────────────────────────────────────────────────────
type ReviewTarget = { id: string; staffName: string; action: 'approve' | 'reject' };

function LeaveReviewModal({
  target, onClose, onSubmit, loading,
}: {
  target: ReviewTarget;
  onClose: () => void;
  onSubmit: (note: string) => void;
  loading: boolean;
}) {
  const [note, setNote] = useState('');
  const isApprove = target.action === 'approve';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable onPress={() => {}} style={{ backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>
                {isApprove ? 'Approve' : 'Reject'} Leave
              </Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Feather name="x" size={20} color={MUTED} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 14, color: MUTED }}>
              {isApprove ? 'Approving' : 'Rejecting'} leave for <Text style={{ fontWeight: '600', color: TEXT }}>{target.staffName}</Text>.
            </Text>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.5 }}>NOTE (optional)</Text>
              <TextInput
                style={[s.modalInput, { minHeight: 80, textAlignVertical: 'top' }]}
                placeholder={isApprove ? 'e.g. Enjoy your break!' : 'e.g. Insufficient notice period'}
                placeholderTextColor={MUTED}
                value={note}
                onChangeText={setNote}
                multiline
                autoFocus
              />
            </View>
            <Pressable
              style={[s.primaryActionBtn, { backgroundColor: isApprove ? GREEN : RED, opacity: loading ? 0.6 : 1 }]}
              onPress={() => onSubmit(note)}
              disabled={loading}
            >
              <Text style={s.primaryActionText}>{loading ? 'Saving…' : isApprove ? 'Approve' : 'Reject'}</Text>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Leave tab ─────────────────────────────────────────────────────────────────
function LeaveTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-all-leave'],
    queryFn: () => api.director.allLeave(),
    staleTime: 0,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const leave: any[] = data?.data ?? [];

  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);

  const reviewMut = useMutation({
    mutationFn: ({ id, approved, note }: { id: string; approved: boolean; note: string }) =>
      api.director.approveLeave(id, approved, note || undefined),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReviewTarget(null);
      qc.invalidateQueries({ queryKey: ['director-all-leave'] });
      qc.invalidateQueries({ queryKey: ['director-stats'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const leaveTypeColor = (t: string) => {
    if (t === 'annual')   return BLUE;
    if (t === 'sick')     return AMBER;
    if (t === 'personal') return PINK;
    return MUTED;
  };
  const leaveStatusColor = (s: string) => {
    if (s === 'approved') return GREEN;
    if (s === 'rejected') return RED;
    return AMBER;
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        showsVerticalScrollIndicator={false}
      >
        {leave.length === 0
          ? <EmptyState icon="calendar" message="No leave requests" />
          : leave.map((item: any) => (
            <View key={item.id} style={[s.card, { backgroundColor: CARD, borderColor: item.status === 'pending' ? AMBER + '60' : BORDER }]}>
              <View style={s.cardHeader}>
                <View style={[s.iconBox, { backgroundColor: leaveTypeColor(item.type) + '18' }]}>
                  <Feather name="calendar" size={15} color={leaveTypeColor(item.type)} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.cardTitle, { color: TEXT }]} numberOfLines={1}>{item.staffName ?? 'Unknown staff'}</Text>
                  <Text style={[s.cardSub,   { color: MUTED }]} numberOfLines={1}>
                    {fmtDate(item.startDate)} → {fmtDate(item.endDate)}
                  </Text>
                </View>
                <Badge label={item.status} color={leaveStatusColor(item.status)} />
              </View>
              <Text style={[s.cardDesc, { color: MUTED }]} numberOfLines={2}>{item.reason}</Text>
              {/* Reviewer info */}
              {item.reviewedByName && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: leaveStatusColor(item.status) + '10', borderRadius: 8, padding: 8 }}>
                  <Feather name={item.status === 'approved' ? 'check-circle' : 'x-circle'} size={13} color={leaveStatusColor(item.status)} />
                  <Text style={{ fontSize: 12, color: leaveStatusColor(item.status), fontWeight: '600', flex: 1 }} numberOfLines={2}>
                    {item.status === 'approved' ? 'Approved' : 'Rejected'} by {item.reviewedByName}
                    {item.reviewNote ? ` · "${item.reviewNote}"` : ''}
                  </Text>
                </View>
              )}
              <View style={s.cardFooter}>
                <Badge label={item.type} color={leaveTypeColor(item.type)} />
                <Text style={[s.cardTime, { color: MUTED }]}>{timeAgo(item.createdAt)}</Text>
              </View>
              <View style={s.actionRow}>
                <Pressable
                  style={[s.actionBtn, { backgroundColor: RED + '12', borderColor: RED + '40' }]}
                  onPress={() => { Haptics.selectionAsync(); setReviewTarget({ id: item.id, staffName: item.staffName ?? 'staff', action: 'reject' }); }}
                >
                  <Feather name="x" size={14} color={RED} />
                  <Text style={[s.actionBtnText, { color: RED }]}>Reject</Text>
                </Pressable>
                <Pressable
                  style={[s.actionBtn, { backgroundColor: GREEN + '12', borderColor: GREEN + '40' }]}
                  onPress={() => { Haptics.selectionAsync(); setReviewTarget({ id: item.id, staffName: item.staffName ?? 'staff', action: 'approve' }); }}
                >
                  <Feather name="check" size={14} color={GREEN} />
                  <Text style={[s.actionBtnText, { color: GREEN }]}>Approve</Text>
                </Pressable>
              </View>
            </View>
          ))
        }
      </ScrollView>

      {reviewTarget && (
        <LeaveReviewModal
          target={reviewTarget}
          onClose={() => setReviewTarget(null)}
          loading={reviewMut.isPending}
          onSubmit={(note) => reviewMut.mutate({ id: reviewTarget.id, approved: reviewTarget.action === 'approve', note })}
        />
      )}
    </>
  );
}

// ── Feedback tab ──────────────────────────────────────────────────────────────
function FeedbackTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-all-feedback'],
    queryFn: () => api.director.allFeedback(),
    staleTime: 0,
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

  const ratingColor = (r: number) => {
    if (r >= 4) return GREEN;
    if (r >= 3) return AMBER;
    return RED;
  };

  const handlePress = (item: any) => {
    if (!item.isRead) markRead.mutate(item.id);
    Alert.alert(
      `Feedback${item.rating ? ` · ${item.rating}/5 ⭐` : ''}`,
      `${item.message}\n\nCategory: ${item.category ?? 'General'}\nSubmitted: ${fmtDate(item.createdAt)}`,
      [{ text: 'OK' }],
    );
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  const unread = feedback.filter(f => !f.isRead).length;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      showsVerticalScrollIndicator={false}
    >
      {unread > 0 && (
        <View style={[s.summaryCard, { backgroundColor: BLUE + '12', borderColor: BLUE + '40' }]}>
          <Feather name="message-circle" size={16} color={BLUE} />
          <Text style={[s.summaryTitle, { color: BLUE }]}>{unread} unread feedback item{unread !== 1 ? 's' : ''} — tap to mark read</Text>
        </View>
      )}
      {feedback.length === 0
        ? <EmptyState icon="message-circle" message="No feedback submitted yet" />
        : feedback.map((item: any) => (
          <Pressable key={item.id} onPress={() => handlePress(item)}
            style={[s.card, { backgroundColor: CARD, borderColor: item.isRead ? BORDER : BLUE + '50', opacity: item.isRead ? 0.85 : 1 }]}
          >
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: item.rating ? ratingColor(item.rating) + '18' : MUTED + '18' }]}>
                <Feather name="message-circle" size={15} color={item.rating ? ratingColor(item.rating) : MUTED} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                {item.rating ? (
                  <Text style={[s.cardTitle, { color: TEXT }]}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</Text>
                ) : (
                  <Text style={[s.cardTitle, { color: TEXT }]}>Feedback</Text>
                )}
                <Text style={[s.cardSub, { color: MUTED }]} numberOfLines={1}>{item.category ?? 'General'}</Text>
              </View>
              {!item.isRead && <View style={s.unreadDot} />}
              <Text style={[s.cardTime, { color: MUTED }]}>{timeAgo(item.createdAt)}</Text>
            </View>
            <Text style={[s.cardDesc, { color: TEXT }]} numberOfLines={3}>{item.message}</Text>
          </Pressable>
        ))
      }
    </ScrollView>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function StaffHubScreen() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [activeTab, setActiveTab] = useState<Tab>(params.tab ?? 'issues');

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { backgroundColor: BG, borderBottomColor: BORDER }]}>
        <Text style={s.headerTitle}>Staff Hub</Text>
        <Text style={s.headerSub}>Issues · Tasks · Wastage · Leave · Feedback</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={[s.tabBar, { backgroundColor: CARD, borderBottomColor: BORDER, flex: 1 }]}>
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => { Haptics.selectionAsync(); setActiveTab(tab.key); }}
                style={[s.tabBtn, active && { borderBottomColor: BLUE, borderBottomWidth: 2 }]}
              >
                <Feather name={tab.icon as any} size={14} color={active ? BLUE : MUTED} />
                <Text style={[s.tabLabel, { color: active ? BLUE : MUTED }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {activeTab === 'issues'   && <IssuesTab />}
      {activeTab === 'tasks'    && <TasksTab />}
      {activeTab === 'wastage'  && <WastageTab />}
      {activeTab === 'leave'    && <LeaveTab />}
      {activeTab === 'feedback' && <FeedbackTab />}
    </View>
  );
}

const s = StyleSheet.create({
  header:      { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 22, fontWeight: '700', color: TEXT },
  headerSub:   { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 },
  tabBar:      { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel:    { fontSize: 12, fontWeight: '600' },
  card:        { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle:   { fontSize: 14, fontWeight: '600' },
  cardSub:     { fontSize: 12, fontWeight: '400' },
  cardDesc:    { fontSize: 13, fontWeight: '400', lineHeight: 19 },
  cardFooter:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardTime:    { fontSize: 11, fontWeight: '400' },
  badge:       { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeText:   { fontSize: 10, fontWeight: '600' },
  actionRow:   { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  cost:        { fontSize: 13, fontWeight: '700' },
  metricsRow:  { flexDirection: 'row', gap: 10 },
  metricCard:  { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, gap: 4 },
  metricLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8 },
  metricValue: { fontSize: 21, fontWeight: '700' },
  metricSub:   { fontSize: 12, fontWeight: '400', color: MUTED },
  weekChip:    { borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, paddingHorizontal: 12, paddingVertical: 10, minWidth: 128 },
  weekChipTitle: { fontSize: 12, fontWeight: '700', color: TEXT },
  weekChipSub:   { fontSize: 11, fontWeight: '400', color: MUTED, marginTop: 2 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  summaryTitle:{ fontSize: 13, fontWeight: '600', flex: 1 },
  summarySub:  { fontSize: 12, fontWeight: '400' },
  primaryActionBtn: { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryActionText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: TEXT, fontSize: 17, fontWeight: '700' },
  modalInputWrap: { gap: 6 },
  modalInputLabel: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.5 },
  modalInput: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: TEXT, fontSize: 15 },
  modalChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modalChip: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  modalChipActive: { backgroundColor: BLUE, borderColor: BLUE },
  modalChipText: { color: TEXT, fontSize: 13, fontWeight: '700' },
  modalChipTextActive: { color: '#fff' },
  empty:       { alignItems: 'center', gap: 12, paddingVertical: 60 },
  emptyText:   { fontSize: 14, fontWeight: '400', color: MUTED },
  unreadDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: BLUE, marginRight: 4 },
});
