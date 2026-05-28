import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG = '#EFF6FF';
const CARD = '#FFFFFF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE = '#1493FF';
const GREEN = '#16A34A';

const CATEGORIES = [
  { id: 'opening', label: 'Opening' },
  { id: 'closing', label: 'Closing' },
  { id: 'prep', label: 'Coffee Bar' },
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'daily', label: 'General' },
  { id: 'training', label: 'One-Off' },
] as const;

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default function ShopDisplayTasksScreen() {
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>('opening');
  const [historyWeekOffset, setHistoryWeekOffset] = useState(0);

  const tasksQuery = useQuery({
    queryKey: ['shop-display-tasks', category],
    queryFn: () => api.shopDisplay.tasks(category),
  });

  const weekStart = useMemo(() => {
    const start = startOfWeek(new Date());
    start.setDate(start.getDate() - historyWeekOffset * 7);
    return start;
  }, [historyWeekOffset]);

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [weekStart]);

  const historyQuery = useQuery({
    queryKey: ['shop-display-task-history', weekStart.toISOString()],
    queryFn: () => api.shopDisplay.taskHistory(weekStart.toISOString(), weekEnd.toISOString()),
  });

  const tasks = tasksQuery.data?.data ?? [];
  const history = historyQuery.data?.data ?? [];

  const completeTask = async (taskId: string, isCompleted: boolean) => {
    Haptics.selectionAsync();
    await api.shopDisplay.completeTask(taskId, !isCompleted);
    qc.invalidateQueries({ queryKey: ['shop-display-tasks', category] });
    qc.invalidateQueries({ queryKey: ['shop-display-task-history'] });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={tasksQuery.isRefetching || historyQuery.isRefetching} onRefresh={() => { tasksQuery.refetch(); historyQuery.refetch(); }} tintColor={BLUE} />}
    >
      <Text style={styles.heading}>Daily shop checklist</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {CATEGORIES.map((entry) => {
          const active = category === entry.id;
          return (
            <Pressable key={entry.id} onPress={() => setCategory(entry.id)} style={[styles.pill, active && styles.pillActive]}>
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{entry.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.card}>
        {tasks.length === 0 ? (
          <Text style={styles.emptyText}>No tasks in this list yet.</Text>
        ) : (
          tasks.map((task: any, index: number) => (
            <Pressable
              key={task.id}
              onPress={() => void completeTask(task.id, task.isCompleted)}
              style={[styles.taskRow, index < tasks.length - 1 && styles.taskDivider]}
            >
              <View style={[styles.checkbox, task.isCompleted && styles.checkboxDone]}>
                {task.isCompleted ? <Feather name="check" size={16} color="#fff" /> : null}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.taskTitle, task.isCompleted && styles.taskTitleDone]}>{task.title}</Text>
                {task.description ? <Text style={styles.taskDesc}>{task.description}</Text> : null}
              </View>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>Completion history</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => setHistoryWeekOffset((value) => value + 1)} style={styles.smallPill}>
            <Text style={styles.smallPillText}>Previous week</Text>
          </Pressable>
          {historyWeekOffset > 0 ? (
            <Pressable onPress={() => setHistoryWeekOffset((value) => Math.max(0, value - 1))} style={styles.smallPill}>
              <Text style={styles.smallPillText}>Next week</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text style={styles.historyRange}>
        {weekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} - {weekEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
      </Text>

      <View style={styles.card}>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>No task history for this week yet.</Text>
        ) : (
          <FlatList
            data={history}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item, index }) => (
              <View style={[styles.historyRow, index < history.length - 1 && styles.taskDivider]}>
                <View style={styles.historyDot} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.taskTitle}>{item.taskTitle}</Text>
                  <Text style={styles.taskDesc}>{item.completedByName ?? 'Unknown'} · {String(item.completionStatus).replace(/_/g, ' ')}</Text>
                </View>
                <Text style={styles.historyTime}>
                  {new Date(item.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            )}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { color: TEXT, fontSize: 26, fontWeight: '800' },
  pill: { backgroundColor: CARD, borderRadius: 999, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 16, paddingVertical: 10 },
  pillActive: { backgroundColor: BLUE, borderColor: BLUE },
  pillText: { color: TEXT, fontSize: 15, fontWeight: '700' },
  pillTextActive: { color: '#fff' },
  card: { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  emptyText: { color: MUTED, fontSize: 16, textAlign: 'center', padding: 22 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  taskDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  checkbox: { width: 28, height: 28, borderRadius: 10, borderWidth: 2, borderColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: GREEN, borderColor: GREEN },
  taskTitle: { color: TEXT, fontSize: 18, fontWeight: '700' },
  taskTitleDone: { textDecorationLine: 'line-through', color: MUTED },
  taskDesc: { color: MUTED, fontSize: 14, lineHeight: 20 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  historyTitle: { color: TEXT, fontSize: 22, fontWeight: '800' },
  historyRange: { color: MUTED, fontSize: 14, fontWeight: '700', marginTop: -10 },
  smallPill: { backgroundColor: CARD, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: BORDER },
  smallPillText: { color: TEXT, fontSize: 13, fontWeight: '700' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18 },
  historyDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: BLUE },
  historyTime: { color: MUTED, fontSize: 12, fontWeight: '700' },
});
