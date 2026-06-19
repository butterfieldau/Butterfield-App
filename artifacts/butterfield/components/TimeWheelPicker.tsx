import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  initialHHMM: string;
  onConfirm: (hhmm: string) => void;
  onClose: () => void;
  accentColor?: string;
  title?: string;
}

export default function TimeWheelPicker({
  visible,
  initialHHMM,
  onConfirm,
  onClose,
  accentColor = '#4F46E5',
  title = 'Select Time',
}: Props) {
  const [hour, setHour]     = useState(9);
  const [minute, setMinute] = useState(0);

  React.useEffect(() => {
    if (visible && initialHHMM) {
      const [hStr, mStr] = initialHHMM.split(':');
      setHour(Math.min(23, Math.max(0, parseInt(hStr) || 0)));
      setMinute(Math.min(59, Math.max(0, parseInt(mStr) || 0)));
    }
  }, [visible, initialHHMM]);

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12  = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={e => e.stopPropagation()}>
          <Text style={s.title}>{title}</Text>

          <View style={s.pickerRow}>
            {/* Hour */}
            <View style={s.col}>
              <Pressable onPress={() => setHour(h => (h + 1) % 24)} style={s.arrow} hitSlop={6}>
                <Feather name="chevron-up" size={22} color={accentColor} />
              </Pressable>
              <Text style={s.digit}>{String(h12).padStart(2, '0')}</Text>
              <Pressable onPress={() => setHour(h => (h - 1 + 24) % 24)} style={s.arrow} hitSlop={6}>
                <Feather name="chevron-down" size={22} color={accentColor} />
              </Pressable>
            </View>

            <Text style={s.colon}>:</Text>

            {/* Minute — 1-min steps */}
            <View style={s.col}>
              <Pressable onPress={() => setMinute(m => (m + 1) % 60)} style={s.arrow} hitSlop={6}>
                <Feather name="chevron-up" size={22} color={accentColor} />
              </Pressable>
              <Text style={s.digit}>{String(minute).padStart(2, '0')}</Text>
              <Pressable onPress={() => setMinute(m => (m - 1 + 60) % 60)} style={s.arrow} hitSlop={6}>
                <Feather name="chevron-down" size={22} color={accentColor} />
              </Pressable>
            </View>

            {/* AM / PM toggle */}
            <Pressable
              style={[s.ampmBtn, { backgroundColor: accentColor + '18' }]}
              onPress={() => setHour(h => (h >= 12 ? h - 12 : h + 12))}
            >
              <Text style={[s.ampmText, { color: accentColor }]}>{ampm}</Text>
            </Pressable>
          </View>

          <View style={s.btnRow}>
            <Pressable onPress={onClose} style={[s.btn, { backgroundColor: '#F3F4F6' }]}>
              <Text style={[s.btnText, { color: '#374151' }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => { onConfirm(hhmm); onClose(); }}
              style={[s.btn, { backgroundColor: accentColor }]}
            >
              <Text style={[s.btnText, { color: '#fff' }]}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  sheet:     { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: 280, gap: 20,
               shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 8 },
  title:     { fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  col:       { alignItems: 'center', gap: 4 },
  arrow:     { padding: 6 },
  digit:     { fontSize: 36, fontWeight: '700', color: '#111827', width: 56, textAlign: 'center' },
  colon:     { fontSize: 36, fontWeight: '700', color: '#111827', marginTop: -8 },
  ampmBtn:   { marginLeft: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  ampmText:  { fontSize: 16, fontWeight: '700' },
  btnRow:    { flexDirection: 'row', gap: 10 },
  btn:       { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText:   { fontSize: 15, fontWeight: '600' },
});
