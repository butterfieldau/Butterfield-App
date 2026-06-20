import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
import { s } from './reportStyles';
import { BLUE, BG, CARD, BORDER, TEXT, MUTED } from './directorColors';
import { toYMD } from './reportHelpers';

export type RangePreset = 'today' | 'week' | 'month' | 'custom';
export interface DateRange { from: string; to: string }

export function getPresetRange(preset: RangePreset): DateRange {
  const today = new Date();
  const ymd = toYMD;
  switch (preset) {
    case 'today':
      return { from: ymd(today), to: ymd(today) };
    case 'week': {
      const d = new Date(today); d.setDate(d.getDate() - 6);
      return { from: ymd(d), to: ymd(today) };
    }
    case 'month': {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: ymd(d), to: ymd(today) };
    }
    default:
      return { from: ymd(today), to: ymd(today) };
  }
}

interface DateRangePickerProps {
  preset: RangePreset;
  range: DateRange;
  onPreset: (p: RangePreset) => void;
  onCustomChange: (r: DateRange) => void;
}

export default function ReportDateRangePicker({ preset, range, onPreset, onCustomChange }: DateRangePickerProps) {
  const [showFromCal, setShowFromCal] = useState(false);
  const [showToCal,   setShowToCal]   = useState(false);

  const PRESETS: { key: RangePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: '7 Days' },
    { key: 'month', label: 'Month' },
    { key: 'custom',label: 'Custom' },
  ];

  const today    = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const fromDate = useMemo(() => range.from ? new Date(range.from + 'T12:00:00') : null, [range.from]);
  const toDate   = useMemo(() => range.to   ? new Date(range.to   + 'T12:00:00') : null, [range.to]);

  function toISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function fmtLabel(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  return (
    <View style={s.drpContainer}>
      <View style={s.drpRow}>
        {PRESETS.map(p => (
          <Pressable
            key={p.key}
            onPress={() => { Haptics.selectionAsync(); onPreset(p.key); }}
            style={[s.drpChip, preset === p.key && s.drpChipActive]}
          >
            <Text style={[s.drpChipText, preset === p.key && s.drpChipTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {preset === 'custom' && (
        <>
          <View style={s.drpCustomRow}>
            <Pressable style={s.drpDateBtn} onPress={() => { Haptics.selectionAsync(); setShowFromCal(true); }}>
              <Feather name="calendar" size={13} color={BLUE} />
              <Text style={[s.drpDateText, !range.from && { color: MUTED }]}>
                {range.from ? fmtLabel(range.from) : 'From date'}
              </Text>
            </Pressable>
            <Text style={s.drpSep}>→</Text>
            <Pressable style={s.drpDateBtn} onPress={() => { Haptics.selectionAsync(); setShowToCal(true); }}>
              <Feather name="calendar" size={13} color={BLUE} />
              <Text style={[s.drpDateText, !range.to && { color: MUTED }]}>
                {range.to ? fmtLabel(range.to) : 'To date'}
              </Text>
            </Pressable>
          </View>

          <Modal visible={showFromCal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFromCal(false)}>
            <View style={{ flex: 1, backgroundColor: BG }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD }}>
                <Pressable onPress={() => setShowFromCal(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="x" size={20} color={TEXT} />
                </Pressable>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT }}>Start Date</Text>
                <View style={{ width: 36 }} />
              </View>
              <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
                <InlineCalendarPicker
                  selectedDate={fromDate}
                  onSelectDate={d => { onCustomChange({ ...range, from: toISO(d) }); setShowFromCal(false); Haptics.selectionAsync(); }}
                  accentColor={BLUE}
                  maxDate={today}
                />
              </ScrollView>
            </View>
          </Modal>

          <Modal visible={showToCal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowToCal(false)}>
            <View style={{ flex: 1, backgroundColor: BG }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD }}>
                <Pressable onPress={() => setShowToCal(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="x" size={20} color={TEXT} />
                </Pressable>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT }}>End Date</Text>
                <View style={{ width: 36 }} />
              </View>
              <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
                <InlineCalendarPicker
                  selectedDate={toDate}
                  onSelectDate={d => { onCustomChange({ ...range, to: toISO(d) }); setShowToCal(false); Haptics.selectionAsync(); }}
                  accentColor={BLUE}
                  maxDate={today}
                />
              </ScrollView>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}
