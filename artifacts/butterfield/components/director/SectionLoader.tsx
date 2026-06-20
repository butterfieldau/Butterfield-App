import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { s } from './reportStyles';
import { BLUE } from './directorColors';

export default function SectionLoader() {
  return (
    <View style={s.sectionLoader}>
      <ActivityIndicator color={BLUE} size="small" />
    </View>
  );
}
