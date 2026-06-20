import { Feather } from '@expo/vector-icons';
import React from 'react';
import { View, Text } from 'react-native';
import { s } from './reportStyles';
import { BORDER } from './directorColors';

export default function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.emptyState}>
      <Feather name={icon as any} size={28} color={BORDER} />
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}
