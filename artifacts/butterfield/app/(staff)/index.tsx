import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';

const BG = '#0D0604';
const CARD = '#1A0A04';
const ACCENT = '#C8833A';

export default function StaffDashboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [clockingIn, setClockingIn] = useState(false);

  const { data: shiftData, refetch: refetchShift, isRefetching: shiftRefetching } = useQuery({
    queryKey: ['current-shift'], queryFn: () => api.staff.currentShift(), retry: 1,
  });
  const { data: tasksData, refetch: refetchTasks } = useQuery({
    queryKey: ['staff-tasks'], queryFn: () => api.staff.tasks(), retry: 1,
  });

  const currentShift = shiftData?.data;
  const tasks = tasksData?.data ?? [];
  const completedTasks = tasks.filter((t) => t.isCompleted).length;

  const getShiftDuration = () => {
    if (!currentShift) return null;
    const ms = Date.now() - new Date(currentShift.clockIn).getTime();
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  const handleClockIn = async () => {
    setClockingIn(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await api.staff.clockIn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['current-shift'] });
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setClockingIn(false); }
  };

  const handleClockOut = async () => {
    Alert.alert('Clock Out', 'End your shift?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clock Out', style: 'destructive', onPress: async () => {
        setClockingIn(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        try {
          const res = await api.staff.clockOut();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          qc.invalidateQueries({ queryKey: ['current-shift'] });
          Alert.alert('Shift ended', `Total time: ${res.data.hoursWorked}`);
        } catch (e: any) { Alert.alert('Error', e.message); } finally { setClockingIn(false); }
      }},
    ]);
  };

  const handleCompleteTask = async (taskId: string, completed: boolean) => {
    Haptics.selectionAsync();
    try {
      await api.staff.completeTask(taskId, !completed);
      qc.invalidateQueries({ queryKey: ['staff-tasks'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const urgentTasks = tasks.filter((t) => !t.isCompleted).slice(0, 5);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={shiftRefetching} onRefresh={() => { refetchShift(); refetchTasks(); }} tintColor={ACCENT} />}>
      <LinearGradient colors={['#2A1408', BG]} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.greeting, { fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.6)' }]}>Good shift,</Text>
            <Text style={[styles.name, { fontFamily: 'Inter_700Bold', color: '#fff' }]}>{user?.name?.split(' ')[0]} 👋</Text>
          </View>
          <View style={[styles.shiftIndicator, { backgroundColor: currentShift ? '#22C55E20' : '#EF444420', borderColor: currentShift ? '#22C55E' : '#EF4444', borderWidth: 1 }]}>
            <View style={[styles.shiftDot, { backgroundColor: currentShift ? '#22C55E' : '#EF4444' }]} />
            <Text style={[{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: currentShift ? '#22C55E' : '#EF4444' }]}>{currentShift ? 'On Shift' : 'Off Duty'}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 16 }}>
        {/* Clock In/Out */}
        <View style={[styles.clockCard, { backgroundColor: CARD, borderRadius: 16 }]}>
          {currentShift ? (
            <>
              <View style={styles.clockInfo}>
                <Text style={[styles.clockLabel, { color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_400Regular' }]}>Shift started</Text>
                <Text style={[styles.clockTime, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{new Date(currentShift.clockIn).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</Text>
                <Text style={[{ color: ACCENT, fontFamily: 'Inter_600SemiBold', fontSize: 14 }]}>{getShiftDuration()} on shift</Text>
              </View>
              <Pressable onPress={handleClockOut} disabled={clockingIn} style={[styles.clockBtn, { backgroundColor: '#DC2626', borderRadius: 12 }]}>
                {clockingIn ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 }]}>Clock Out</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.clockInfo}>
                <Text style={[styles.clockLabel, { color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_400Regular' }]}>Ready to start?</Text>
                <Text style={[styles.clockTime, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              <Pressable onPress={handleClockIn} disabled={clockingIn} style={[styles.clockBtn, { backgroundColor: '#22C55E', borderRadius: 12 }]}>
                {clockingIn ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 }]}>Clock In</Text>}
              </Pressable>
            </>
          )}
        </View>

        {/* Task Progress */}
        <View style={[styles.taskProgress, { backgroundColor: CARD, borderRadius: 16 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>Today's Tasks</Text>
            <Text style={[{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>{completedTasks}/{tasks.length}</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: '#2A1408' }]}>
            <View style={[styles.progressFill, { width: tasks.length ? `${Math.round(completedTasks / tasks.length * 100)}%` : '0%', backgroundColor: ACCENT }]} />
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_600SemiBold' }]}>QUICK ACTIONS</Text>
        <View style={styles.actionsGrid}>
          {[
            { icon: 'clipboard', label: 'Tasks', onPress: () => router.push({ pathname: '/(staff)/tasks', params: { initialTab: 'tasks' } }) },
            { icon: 'alert-triangle', label: 'Log Wastage', onPress: () => router.push({ pathname: '/(staff)/tasks', params: { initialTab: 'wastage' } }) },
            { icon: 'tool', label: 'Report Issue', onPress: () => router.push({ pathname: '/(staff)/tasks', params: { initialTab: 'issues' } }) },
            { icon: 'calendar', label: 'Leave Request', onPress: () => router.push({ pathname: '/(staff)/tasks', params: { initialTab: 'leave' } }) },
          ].map((action) => (
            <Pressable key={action.label} onPress={() => { Haptics.selectionAsync(); action.onPress(); }}
              style={[styles.actionCard, { backgroundColor: CARD, borderRadius: 16 }]}>
              <View style={[styles.actionIcon, { backgroundColor: `${ACCENT}20`, borderRadius: 12 }]}>
                <Feather name={action.icon as any} size={20} color={ACCENT} />
              </View>
              <Text style={[styles.actionLabel, { color: '#fff', fontFamily: 'Inter_500Medium' }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Urgent Tasks */}
        {urgentTasks.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_600SemiBold' }]}>PENDING TASKS</Text>
            {urgentTasks.map((task) => (
              <Pressable key={task.id} onPress={() => handleCompleteTask(task.id, task.isCompleted)}
                style={[styles.taskRow, { backgroundColor: CARD, borderRadius: 14, borderLeftColor: ACCENT, borderLeftWidth: 3 }]}>
                <View style={[styles.taskCheck, {
                  borderColor: task.isCompleted ? '#22C55E' : ACCENT,
                  backgroundColor: task.isCompleted ? '#22C55E' : 'transparent', borderWidth: 2, borderRadius: 8,
                }]}>
                  {task.isCompleted && <Feather name="check" size={12} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: task.isCompleted ? 'rgba(255,255,255,0.4)' : '#fff', fontFamily: 'Inter_500Medium', fontSize: 14, textDecorationLine: task.isCompleted ? 'line-through' : 'none' }]}>{task.title}</Text>
                  <Text style={[{ color: ACCENT, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2, textTransform: 'capitalize' }]}>{task.category}</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: 14 },
  name: { fontSize: 24 },
  shiftIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  shiftDot: { width: 6, height: 6, borderRadius: 3 },
  clockCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 },
  clockInfo: { flex: 1, gap: 4 },
  clockLabel: { fontSize: 12 },
  clockTime: { fontSize: 28 },
  clockBtn: { paddingHorizontal: 20, paddingVertical: 14 },
  taskProgress: { padding: 16, gap: 10 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  sectionTitle: { fontSize: 11, letterSpacing: 1.5, marginTop: 4 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { width: '47%', padding: 16, gap: 10 },
  actionIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 13 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  taskCheck: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
