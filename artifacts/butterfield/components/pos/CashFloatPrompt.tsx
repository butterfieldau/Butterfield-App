import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import styles from './posStyles';
import { BLUE, DARK, MID, MUTED, WHITE, BORDER } from './types';

export default function CashFloatPrompt({ onSave, onSkip, busy }: {
  onSave: (amountCents: number) => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const [value, setValue] = React.useState('');
  const isValid = parseFloat(value || '0') > 0;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onSkip}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: WHITE, borderRadius: 20, padding: 24, width: '100%', maxWidth: 380, gap: 4 }}>
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Feather name="dollar-sign" size={24} color={BLUE} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: DARK, textAlign: 'center' }}>Morning Cash Float</Text>
            <Text style={{ fontSize: 14, color: MUTED, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
              Enter the starting cash in the drawer to enable cash payments for today.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1.5, borderColor: isValid ? BLUE : BORDER, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: DARK, marginRight: 6 }}>$</Text>
            <TextInput
              style={{ flex: 1, fontSize: 28, fontWeight: '700', color: DARK, padding: 0 }}
              placeholder="0.00"
              placeholderTextColor={MUTED}
              keyboardType="decimal-pad"
              value={value}
              onChangeText={v => setValue(v.replace(/[^0-9.]/g, ''))}
              autoFocus
              selectTextOnFocus
            />
            <Text style={{ fontSize: 14, color: MUTED, fontWeight: '600' }}>AUD</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {[100, 200, 300, 500].map(amt => (
              <Pressable
                key={amt}
                onPress={() => { setValue(amt.toFixed(2)); Haptics.selectionAsync(); }}
                style={{ flex: 1, backgroundColor: value === amt.toFixed(2) ? BLUE : '#F1F5F9', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: value === amt.toFixed(2) ? WHITE : MID }}>${amt}</Text>
              </Pressable>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => isValid && onSave(Math.round(parseFloat(value) * 100))}
            style={[{ backgroundColor: isValid ? BLUE : '#CBD5E1', borderRadius: 12, paddingVertical: 15, alignItems: 'center' }, busy && { opacity: 0.7 }]}
            disabled={!isValid || busy}
            activeOpacity={0.85}
          >
            {busy
              ? <ActivityIndicator color={WHITE} />
              : <Text style={{ fontSize: 16, fontWeight: '800', color: WHITE }}>Set Float</Text>}
          </TouchableOpacity>

          <Pressable onPress={onSkip} style={{ paddingVertical: 12, alignItems: 'center' }} hitSlop={8}>
            <Text style={{ fontSize: 14, color: MUTED, fontWeight: '500' }}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

