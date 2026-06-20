import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function DateField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (iso: string | undefined) => void;
  placeholder?: string;
}) {
  const [showCal, setShowCal] = useState(false);
  const selectedDate = value ? new Date(value + 'T12:00:00') : null;
  const clear = () => { onChange(undefined); Haptics.selectionAsync(); };

  return (
    <View style={{ gap: 4 }}>
      <Text style={[s.fieldLabel, { marginBottom: 0 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={() => { setShowCal(true); Haptics.selectionAsync(); }}
          style={[s.input, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderColor: BORDER }]}
        >
          <Text style={{ fontSize: 14, color: value ? TEXT : MUTED }}>
            {value ? fmtDate(value) : (placeholder ?? 'No date set')}
          </Text>
          <Feather name="calendar" size={14} color={BLUE} />
        </Pressable>
        {value && (
          <Pressable onPress={clear} hitSlop={8}>
            <Feather name="x-circle" size={16} color={MUTED} />
          </Pressable>
        )}
      </View>

      <Modal visible={showCal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD }}>
            <Pressable onPress={() => setShowCal(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="x" size={20} color={TEXT} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT }}>{label}</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
            <InlineCalendarPicker
              selectedDate={selectedDate}
              onSelectDate={d => {
                const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                onChange(iso);
                setShowCal(false);
                Haptics.selectionAsync();
              }}
              accentColor={BLUE}
            />
            {value && (
              <Pressable
                onPress={clear}
                style={{ marginTop: 12, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: BORDER }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: MUTED }}>Clear Date</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  fieldLabel: { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  input:      { backgroundColor: CARD, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontWeight: '400' },
});
