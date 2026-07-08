import React, { type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { styles } from './directorOrdersStyles';
import { BRAND, BRAND_DIM } from './commandCenterColors';

export default function OrdersSectionHeader({ title, count, right }: { title: string; count: number; right?: ReactNode }) {
  return (
    <View style={[styles.sectionHeader, { justifyContent: 'space-between' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        <Text style={[styles.sectionHeaderText, { flex: 0 }]}>{title}</Text>
        <View style={{ backgroundColor: BRAND_DIM, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: BRAND, fontWeight: '700', fontSize: 11 }}>{count}</Text>
        </View>
      </View>
      {right ?? null}
    </View>
  );
}
