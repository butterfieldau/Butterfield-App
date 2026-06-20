import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
import { BG, CARD, BORDER, TEXT, MUTED, BLUE, NAVY } from './directorColors';
import { fmtDateBox } from './dashboardHelpers';

export default function RevenueRangePicker({
  visible, onClose, onApply,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (from: Date, to: Date) => void;
}) {
  const [step, setStep]   = useState<'start' | 'end'>('start');
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd]     = useState<Date | null>(null);

  const today = useState(() => new Date())[0];

  const handleClose = () => { setStart(null); setEnd(null); setStep('start'); onClose(); };
  const handleApply = () => {
    if (!start || !end) return;
    const to = new Date(end); to.setHours(23, 59, 59, 999);
    onApply(start, to);
    onClose();
  };

  const handleSelectDate = (d: Date) => {
    if (step === 'start') {
      setStart(d); setEnd(null); setStep('end');
    } else {
      if (start && d < start) { setEnd(start); setStart(d); }
      else { setEnd(d); }
      setStep('start');
    }
    Haptics.selectionAsync();
  };

  const displayDate = step === 'start' ? start : (end ?? start);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD }}>
          <Pressable onPress={handleClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT }}>Custom Revenue Range</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <Pressable
              onPress={() => setStep('start')}
              style={{ flex: 1, backgroundColor: step === 'start' ? `${BLUE}12` : CARD, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: step === 'start' ? BLUE : BORDER }}
            >
              <Text style={{ fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>From</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: start ? TEXT : MUTED }}>{start ? fmtDateBox(start) : '—'}</Text>
            </Pressable>
            <View style={{ justifyContent: 'center' }}>
              <Feather name="arrow-right" size={18} color={MUTED} />
            </View>
            <Pressable
              onPress={() => { if (start) setStep('end'); }}
              style={{ flex: 1, backgroundColor: step === 'end' ? `${BLUE}12` : CARD, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: step === 'end' ? BLUE : BORDER }}
            >
              <Text style={{ fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>To</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: end ? TEXT : MUTED }}>{end ? fmtDateBox(end) : '—'}</Text>
            </Pressable>
          </View>

          <Text style={{ fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 8, fontWeight: '400' }}>
            {step === 'start' ? 'Tap a date to set the start' : 'Now tap a date to set the end'}
          </Text>

          <InlineCalendarPicker
            selectedDate={displayDate}
            onSelectDate={handleSelectDate}
            accentColor={BLUE}
            maxDate={today}
          />

          {start && end && (
            <Pressable
              onPress={handleApply}
              style={{ marginTop: 20, backgroundColor: NAVY, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                Apply — {fmtDateBox(start)} to {fmtDateBox(end)}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
