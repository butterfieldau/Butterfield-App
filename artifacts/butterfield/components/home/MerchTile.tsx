import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getPalette } from '@/constants/categoryColors';

export type MerchItem = { id: string; name: string; price: number; image: string };

export function MerchTile({ item, onPress }: { item: MerchItem; onPress: () => void }) {
  const palette = getPalette('merch');
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={s.tile}
    >
      <View style={s.tileTop}>
        <Image source={{ uri: item.image }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
        <View style={s.priceBadge}>
          <Text style={[s.priceBadgeText, { fontWeight: '700' }]}>${item.price}</Text>
        </View>
        <View style={[s.bannerStrip, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <Text style={[s.bannerText, { fontWeight: '500' }]} numberOfLines={1}>In-store Pickup · Merrylands</Text>
        </View>
      </View>
      <View style={s.tileBottom}>
        <View style={s.nameRow}>
          <Text style={[s.name, { fontWeight: '700' }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[s.arrow, { color: palette.banner, fontWeight: '500' }]}>↗</Text>
        </View>
        <View style={s.tagsRow}>
          {['Branded', 'Limited'].map((tag) => (
            <View key={tag} style={[s.tagChip, { backgroundColor: `${palette.bg}55` }]}>
              <Text style={[s.tagText, { fontWeight: '500', color: palette.banner }]}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tile:         { width: 150, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3 },
  tileTop:      { height: 120, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  priceBadge:   { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  priceBadgeText: { fontSize: 16, color: '#1C1C1E' },
  bannerStrip:  { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center' },
  bannerText:   { fontSize: 9, color: '#fff', letterSpacing: 0.2 },
  tileBottom:   { padding: 10, gap: 5, backgroundColor: '#fff' },
  nameRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  name:         { fontSize: 13, color: '#1C1C1E', flex: 1 },
  arrow:        { fontSize: 13 },
  tagsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tagChip:      { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 },
  tagText:      { fontSize: 9 },
});
