import React from 'react';
import { View, Text } from 'react-native';
import { styles } from './ordersStyles';

const BLUE = '#1493FF';

export default function OrdersSectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      <View style={{ backgroundColor: `${BLUE}18`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text style={{ color: BLUE, fontWeight: '700', fontSize: 11 }}>{count}</Text>
      </View>
    </View>
  );
}
