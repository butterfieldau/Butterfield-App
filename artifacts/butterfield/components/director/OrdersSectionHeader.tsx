import React from 'react';
import { View, Text } from 'react-native';
import { styles } from './directorOrdersStyles';
import { BRAND, BRAND_DIM } from './commandCenterColors';

export default function OrdersSectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      <View style={{ backgroundColor: BRAND_DIM, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text style={{ color: BRAND, fontWeight: '700', fontSize: 11 }}>{count}</Text>
      </View>
    </View>
  );
}
