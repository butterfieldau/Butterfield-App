import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { qa } from './dashboardStyles';
import { TEXT } from './directorColors';

export default function QuickBtn({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} style={qa.btn}>
      <View style={[qa.icon, { backgroundColor: color + '33', borderColor: color + '55' }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={[qa.label, { color: TEXT }]}>{label}</Text>
    </Pressable>
  );
}
