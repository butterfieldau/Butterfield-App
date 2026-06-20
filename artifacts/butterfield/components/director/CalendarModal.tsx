import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

export default function CalendarModal({
  visible, onClose, selectedDate, onSelectDate, ordersByDate,
}: {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  ordersByDate: Record<string, number>;
}) {
  const today = useMemo(() => new Date(), []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD }}>
          <Pressable onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT }}>Pick a Date</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
          <InlineCalendarPicker
            selectedDate={selectedDate}
            onSelectDate={d => { onSelectDate(d); onClose(); Haptics.selectionAsync(); }}
            accentColor={BLUE}
            maxDate={today}
            dotDates={ordersByDate}
          />
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: BLUE }} />
            <Text style={{ fontSize: 12, color: MUTED }}>Dot indicates orders on that day</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
