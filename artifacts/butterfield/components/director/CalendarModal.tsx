import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
import { BG, SURFACE, BRAND, TEXT, TEXT_MUTED, BORDER } from './commandCenterColors';

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
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: SURFACE }}>
          <Pressable onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT }}>Pick a Date</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
          {/* InlineCalendarPicker is shared with light-themed screens — wrap in a light card so its text stays legible */}
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12 }}>
            <InlineCalendarPicker
              selectedDate={selectedDate}
              onSelectDate={d => { onSelectDate(d); onClose(); Haptics.selectionAsync(); }}
              accentColor={BRAND}
              maxDate={today}
              dotDates={ordersByDate}
            />
          </View>
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: BRAND }} />
            <Text style={{ fontSize: 12, color: TEXT_MUTED }}>Dot indicates orders on that day</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
