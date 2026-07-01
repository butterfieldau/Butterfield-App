import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

export interface BoxOption {
  size: number;
  label: string;
  priceCents: number;
}

interface Props {
  boxOptions: BoxOption[];
  selected: BoxOption | null;
  onSelect: (opt: BoxOption) => void;
}

function BoxCard({ opt, selected, onSelect }: { opt: BoxOption; selected: boolean; onSelect: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSpring(0.95, {}, () => { scale.value = withSpring(1); });
    Haptics.selectionAsync();
    onSelect();
  };

  const costPerCookie = opt.priceCents > 0 && opt.size > 0
    ? Math.round(opt.priceCents / opt.size)
    : 0;

  return (
    <Reanimated.View style={[s.cardWrap, animStyle]}>
      <Pressable
        onPress={handlePress}
        style={[s.card, selected && s.cardSelected]}
      >
        {selected && (
          <View style={s.checkBadge}>
            <Text style={s.checkText}>✓</Text>
          </View>
        )}
        <Text style={[s.packLabel, { color: selected ? BLUE : TEXT }]}>{opt.label}</Text>
        <Text style={[s.cookieCount, { color: selected ? BLUE : MUTED }]}>
          {opt.size} cookies
        </Text>
        <View style={s.divider} />
        <Text style={[s.price, { color: selected ? BLUE : TEXT }]}>
          ${(opt.priceCents / 100).toFixed(2)}
        </Text>
        {costPerCookie > 0 && (
          <Text style={s.perCookie}>${(costPerCookie / 100).toFixed(2)}/cookie</Text>
        )}
      </Pressable>
    </Reanimated.View>
  );
}

export default function SizePicker({ boxOptions, selected, onSelect }: Props) {
  return (
    <View style={s.root}>
      <Text style={s.heading}>Choose your box</Text>
      <Text style={s.sub}>Pick a size to get started</Text>
      <View style={s.row}>
        {boxOptions.map(opt => (
          <BoxCard
            key={opt.size}
            opt={opt}
            selected={selected?.size === opt.size}
            onSelect={() => onSelect(opt)}
          />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:      { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  heading:   { fontSize: 22, fontWeight: '700', color: TEXT, marginBottom: 4, letterSpacing: -0.3 },
  sub:       { fontSize: 14, color: MUTED, marginBottom: 20 },
  row:       { flexDirection: 'row', gap: 10 },

  cardWrap:  { flex: 1 },
  card:      {
    flex: 1, alignItems: 'center',
    paddingVertical: 22, paddingHorizontal: 8,
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1.5, borderColor: BORDER,
    shadowColor: '#000', shadowOpacity: 0.05,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2, position: 'relative',
  },
  cardSelected: { borderColor: BLUE, backgroundColor: '#EBF7FD', borderWidth: 2 },

  checkBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center',
  },
  checkText:  { color: '#fff', fontSize: 11, fontWeight: '800' },

  packLabel:  { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cookieCount:{ fontSize: 11, fontWeight: '500', marginBottom: 14 },
  divider:    { width: '75%', height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginBottom: 12 },
  price:      { fontSize: 22, fontWeight: '700', marginBottom: 2 },
  perCookie:  { fontSize: 11, fontWeight: '400', color: MUTED },
});
