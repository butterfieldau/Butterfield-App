import { Feather } from '@expo/vector-icons';
import { CategorySvgIcon } from '@/components/CategoryIcons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const BLUE = '#40C0F2';

type Category = {
  id: string;
  label: string;
  icon: string;
  imageUrl: string | null;
  color: string | null;
};

interface Props {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (id: string) => void;
  isTablet?: boolean;
}

export function CategoryFilterBar({ categories, activeCategory, onCategoryChange, isTablet }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: isTablet ? 24 : 16 }}
    >
      {categories.map((cat) => {
        const active = cat.id === activeCategory;
        const iconStr = cat.icon ?? 'tag';
        const isMc  = iconStr.startsWith('mc:');
        const isSvg = iconStr.startsWith('svg:');
        const catColor = cat.color ?? BLUE;

        return (
          <Pressable
            key={cat.id}
            style={[s.tile, active && { borderColor: catColor, backgroundColor: `${catColor}12` }]}
            onPress={() => { Haptics.selectionAsync(); onCategoryChange(cat.id); }}
          >
            <View style={[s.iconWrap, { backgroundColor: active ? `${catColor}22` : '#F2F2F7' }]}>
              {cat.imageUrl ? (
                <Image source={{ uri: cat.imageUrl }} style={{ width: 28, height: 28 }} contentFit="contain" transition={200} />
              ) : isMc ? (
                <MaterialCommunityIcons name={iconStr.slice(3) as any} size={20} color={active ? catColor : '#8E8E93'} />
              ) : isSvg ? (
                <CategorySvgIcon name={iconStr.slice(4) as any} size={20} color={active ? catColor : '#8E8E93'} />
              ) : (
                <Feather name={iconStr as any} size={17} color={active ? catColor : '#8E8E93'} />
              )}
            </View>
            <Text style={[s.label, { color: active ? catColor : '#3C3C43', fontWeight: active ? '700' : '500' }]} numberOfLines={1}>
              {cat.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tile: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: '#F2F2F7',
    minWidth: 72,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label:    { fontSize: 12, textAlign: 'center' },
});
