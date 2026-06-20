import { Feather } from '@expo/vector-icons';
import React from 'react';
import { View, Text } from 'react-native';
import { s } from './reportStyles';
import { MUTED } from './directorColors';

export default function ReportSectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={s.sectionHeader}>
      <Feather name={icon as any} size={13} color={MUTED} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}
