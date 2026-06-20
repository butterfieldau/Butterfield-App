import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

const DIETARY_ICONS: Record<string, string> = {
  Vegan: '🌱', Vegetarian: '🥦', 'Gluten-Free': '🌾', 'Dairy-Free': '🥛', 'Nut-Free': '🥜',
};

interface Props {
  chips: string[];
  selectedTags: string[];
  onToggle: (tag: string) => void;
  hPad?: number;
}

export function DietaryTagFilter({ chips, selectedTags, onToggle, hPad = 16 }: Props) {
  if (chips.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: hPad, gap: 8 }}
    >
      {chips.map((tag) => {
        const active = selectedTags.includes(tag);
        const emoji  = DIETARY_ICONS[tag] ?? '✓';
        return (
          <Pressable
            key={tag}
            style={[s.chip, active && s.chipActive]}
            onPress={() => { Haptics.selectionAsync(); onToggle(tag); }}
          >
            <Text style={s.emoji}>{emoji}</Text>
            <Text style={[s.label, active && s.labelActive]}>{tag}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E8E8ED',
    backgroundColor: '#fff',
  },
  chipActive: { borderColor: '#40C0F2', backgroundColor: '#EBF7FD' },
  emoji:      { fontSize: 14 },
  label:      { color: '#3C3C43', fontWeight: '500', fontSize: 13 },
  labelActive: { color: '#0D8FC4', fontWeight: '600' },
});
