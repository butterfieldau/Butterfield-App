import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { api, type WholesaleDeliverySlot } from '@/lib/api';

const BG      = '#EFF6FF';
const CARD    = '#FFFFFF';
const BLUE    = '#1493FF';
const TEXT    = '#1C1C1E';
const MUTED   = '#8E8E93';
const BORDER  = '#E5E7EB';
const GREEN   = '#22C55E';
const RED     = '#DC2626';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CUTOFF_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20];

function formatHour(h: number) {
  if (h === 12) return '12pm';
  if (h > 12) return `${h - 12}pm`;
  return `${h}am`;
}

function SlotCard({
  slot,
  onChange,
}: {
  slot: WholesaleDeliverySlot;
  onChange: (updated: WholesaleDeliverySlot) => void;
}) {
  return (
    <View style={ss.card}>
      <View style={ss.cardHeader}>
        <View style={[ss.dayBadge, { backgroundColor: BLUE + '15', borderColor: BLUE + '30' }]}>
          <Feather name="truck" size={13} color={BLUE} />
          <Text style={[ss.dayBadgeText, { color: BLUE }]}>{slot.deliveryLabel.toUpperCase()} DELIVERY</Text>
        </View>
      </View>

      {/* Cutoff Day Picker */}
      <Text style={ss.fieldLabel}>Cutoff day</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
          {DAY_LABELS.map((d, i) => {
            const active = slot.cutoffDow === i;
            return (
              <Pressable
                key={d}
                onPress={() => {
                  Haptics.selectionAsync();
                  onChange({ ...slot, cutoffDow: i, cutoffDayLabel: DAY_FULL[i] });
                }}
                style={[
                  ss.dayChip,
                  active && { backgroundColor: BLUE, borderColor: BLUE },
                ]}
              >
                <Text style={[ss.dayChipText, active && { color: '#FFF' }]}>{d}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Cutoff Hour Picker */}
      <Text style={ss.fieldLabel}>Cutoff time</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
          {CUTOFF_HOURS.map((h) => {
            const active = slot.cutoffHour === h;
            return (
              <Pressable
                key={h}
                onPress={() => { Haptics.selectionAsync(); onChange({ ...slot, cutoffHour: h }); }}
                style={[ss.dayChip, { minWidth: 52 }, active && { backgroundColor: BLUE, borderColor: BLUE }]}
              >
                <Text style={[ss.dayChipText, active && { color: '#FFF' }]}>{formatHour(h)}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Window times */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={ss.fieldLabel}>Delivery opens</Text>
          <TextInput
            style={ss.input}
            value={slot.windowOpen}
            onChangeText={(v) => onChange({ ...slot, windowOpen: v })}
            placeholder="8:00am"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ss.fieldLabel}>Delivery closes</Text>
          <TextInput
            style={ss.input}
            value={slot.windowClose}
            onChangeText={(v) => onChange({ ...slot, windowClose: v })}
            placeholder="5:00pm"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
          />
        </View>
      </View>

      {/* Summary */}
      <View style={ss.summary}>
        <Feather name="info" size={12} color={MUTED} />
        <Text style={ss.summaryText}>
          Order by {DAY_FULL[slot.cutoffDow]} at {formatHour(slot.cutoffHour)} → delivered {slot.deliveryLabel} {slot.windowOpen}–{slot.windowClose}
        </Text>
      </View>
      <View style={ss.summary}>
        <Feather name="bell" size={12} color={MUTED} />
        <Text style={ss.summaryText}>
          Reminder fires {DAY_FULL[slot.cutoffDow]} at {formatHour(slot.cutoffHour - 3)} (3 h before cutoff)
        </Text>
      </View>
    </View>
  );
}

export default function DirectorWholesaleDeliveryScreen() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['director-wholesale-delivery-settings'],
    queryFn: () => api.director.wholesaleDeliverySettings(),
    retry: 1,
  });

  const [slots, setSlots] = useState<WholesaleDeliverySlot[]>([]);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (data?.data) {
      setSlots(data.data.slots ?? []);
      setReminderEnabled(data.data.cutoffReminderEnabled ?? true);
      setIsDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.director.updateWholesaleDeliverySettings({
        slots,
        cutoffReminderEnabled: reminderEnabled,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-wholesale-delivery-settings'] });
      qc.invalidateQueries({ queryKey: ['wholesale-delivery-schedule'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Delivery settings updated.');
      setIsDirty(false);
    },
    onError: (e: any) => {
      Alert.alert('Error', e?.message ?? 'Could not save settings.');
    },
  });

  function updateSlot(index: number, updated: WholesaleDeliverySlot) {
    setSlots((prev) => prev.map((s, i) => (i === index ? updated : s)));
    setIsDirty(true);
  }

  return (
    <DirectorStandaloneScreen
      title="Delivery Settings"
      subtitle="Cutoff times, windows & order reminders"
      headerRight={
        isDirty ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              saveMutation.mutate();
            }}
            disabled={saveMutation.isPending}
            style={ss.saveBtn}
          >
            {saveMutation.isPending
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Text style={ss.saveBtnText}>Save</Text>
            }
          </Pressable>
        ) : null
      }
    >
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={ss.scroll} showsVerticalScrollIndicator={false}>

          {/* Slots */}
          <View style={ss.section}>
            <Text style={ss.sectionTitle}>DELIVERY WINDOWS</Text>
            {slots.map((slot, idx) => (
              <SlotCard
                key={slot.deliveryLabel}
                slot={slot}
                onChange={(updated) => updateSlot(idx, updated)}
              />
            ))}
          </View>

          {/* Cutoff Reminder toggle */}
          <View style={ss.section}>
            <Text style={ss.sectionTitle}>PUSH NOTIFICATIONS</Text>
            <View style={ss.toggleCard}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={ss.toggleLabel}>Cutoff reminders</Text>
                <Text style={ss.toggleSub}>
                  Send a push notification to all wholesale users 3 hours before each order cutoff.
                </Text>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={(v) => { Haptics.selectionAsync(); setReminderEnabled(v); setIsDirty(true); }}
                trackColor={{ true: GREEN, false: BORDER }}
                thumbColor="#FFF"
              />
            </View>
            {reminderEnabled && slots.length > 0 && (
              <View style={ss.reminderInfo}>
                {slots.map((slot) => (
                  <View key={slot.deliveryLabel} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Feather name="bell" size={12} color={BLUE} />
                    <Text style={ss.reminderText}>
                      {DAY_FULL[slot.cutoffDow]} at {formatHour(slot.cutoffHour - 3)} → {slot.deliveryLabel} delivery reminder
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Save button (bottom) */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              saveMutation.mutate();
            }}
            disabled={saveMutation.isPending || !isDirty}
            style={[ss.bottomSave, (!isDirty || saveMutation.isPending) && ss.bottomSaveDisabled]}
          >
            {saveMutation.isPending
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Text style={ss.bottomSaveText}>{isDirty ? 'Save Changes' : 'No Changes'}</Text>
            }
          </Pressable>
        </ScrollView>
      )}
    </DirectorStandaloneScreen>
  );
}

const ss = StyleSheet.create({
  scroll:          { padding: 16, gap: 0, paddingBottom: 60 },
  section:         { marginBottom: 24 },
  sectionTitle:    { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 10 },

  card:            { backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER, marginBottom: 12 },
  cardHeader:      { marginBottom: 14 },
  dayBadge:        { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  dayBadgeText:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  fieldLabel:      { fontSize: 12, fontWeight: '600', color: MUTED, marginBottom: 6 },

  dayChip:         { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', minWidth: 44 },
  dayChipText:     { fontSize: 13, fontWeight: '600', color: TEXT },

  input:           { backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: TEXT },

  summary:         { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 8 },
  summaryText:     { fontSize: 11.5, color: MUTED, flex: 1, lineHeight: 16 },

  toggleCard:      { backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', alignItems: 'center', gap: 14 },
  toggleLabel:     { fontSize: 15, fontWeight: '600', color: TEXT },
  toggleSub:       { fontSize: 12, color: MUTED, lineHeight: 17 },

  reminderInfo:    { backgroundColor: BLUE + '08', borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: BLUE + '20' },
  reminderText:    { fontSize: 12.5, color: TEXT },

  saveBtn:         { backgroundColor: BLUE, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  saveBtnText:     { color: '#FFF', fontWeight: '700', fontSize: 14 },

  bottomSave:      { backgroundColor: BLUE, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  bottomSaveDisabled: { opacity: 0.45 },
  bottomSaveText:  { color: '#FFF', fontWeight: '700', fontSize: 16 },
});
