import React, { useRef } from 'react';
import { View, Text, Pressable, PanResponder, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface Props {
  validSlots: number[];
  selectedSlotMins: number | null;
  onSelectSlot: (mins: number) => void;
  accentColor?: string;
}

function formatSlot(totalMins: number) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return {
    h12: String(h12).padStart(2, '0'),
    min: String(m).padStart(2, '0'),
    ampm,
  };
}

function findNearestInOpposite(currentMins: number, validSlots: number[]): number | null {
  const currentIsAM = currentMins < 720;
  const oppositeSlots = currentIsAM
    ? validSlots.filter((s) => s >= 720)
    : validSlots.filter((s) => s < 720);
  if (oppositeSlots.length === 0) return null;
  const currentHalfDay = currentMins % 720;
  let best = oppositeSlots[0];
  let bestDiff = Math.abs((best % 720) - currentHalfDay);
  for (const s of oppositeSlots) {
    const diff = Math.abs((s % 720) - currentHalfDay);
    if (diff < bestDiff) { bestDiff = diff; best = s; }
  }
  return best;
}

export default function PickupTimeWheelPicker({
  validSlots,
  selectedSlotMins,
  onSelectSlot,
  accentColor = '#1493FF',
}: Props) {
  const currentIndex = selectedSlotMins !== null ? validSlots.indexOf(selectedSlotMins) : -1;
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;

  const safeIndexRef = useRef(safeIndex);
  safeIndexRef.current = safeIndex;
  const validSlotsRef = useRef(validSlots);
  validSlotsRef.current = validSlots;
  const onSelectSlotRef = useRef(onSelectSlot);
  onSelectSlotRef.current = onSelectSlot;
  const lastDy = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        lastDy.current = 0;
      },
      onPanResponderMove: (_, gs) => {
        const delta = gs.dy - lastDy.current;
        if (Math.abs(delta) >= 30) {
          const dir = delta < 0 ? 1 : -1;
          const next = safeIndexRef.current + dir;
          if (next >= 0 && next < validSlotsRef.current.length) {
            onSelectSlotRef.current(validSlotsRef.current[next]);
          }
          lastDy.current = gs.dy;
        }
      },
      onPanResponderRelease: () => { lastDy.current = 0; },
      onPanResponderTerminate: () => { lastDy.current = 0; },
    })
  ).current;

  if (validSlots.length === 0) {
    return (
      <View style={s.closedWrap}>
        <Feather name="moon" size={18} color="#8E8E93" />
        <Text style={s.closedText}>Closed — no pickup times available</Text>
      </View>
    );
  }

  const currentMins = validSlots[safeIndex];
  const slot = formatSlot(currentMins);
  const atStart = safeIndex === 0;
  const atEnd = safeIndex === validSlots.length - 1;

  const oppositeSlot = findNearestInOpposite(currentMins, validSlots);
  const canToggleMeridiem = oppositeSlot !== null;

  const goUp = () => { if (!atStart) onSelectSlot(validSlots[safeIndex - 1]); };
  const goDown = () => { if (!atEnd) onSelectSlot(validSlots[safeIndex + 1]); };
  const toggleMeridiem = () => { if (oppositeSlot !== null) onSelectSlot(oppositeSlot); };

  return (
    <View style={s.container}>
      <View style={s.pickerRow} {...panResponder.panHandlers}>
        <View style={s.col}>
          <Pressable onPress={goUp} style={[s.arrow, atStart && s.arrowDisabled]} hitSlop={8}>
            <Feather name="chevron-up" size={26} color={atStart ? '#D1D5DB' : accentColor} />
          </Pressable>
          <Text style={s.digit}>{slot.h12}</Text>
          <Pressable onPress={goDown} style={[s.arrow, atEnd && s.arrowDisabled]} hitSlop={8}>
            <Feather name="chevron-down" size={26} color={atEnd ? '#D1D5DB' : accentColor} />
          </Pressable>
        </View>

        <Text style={s.colon}>:</Text>

        <View style={s.col}>
          <Pressable onPress={goUp} style={[s.arrow, atStart && s.arrowDisabled]} hitSlop={8}>
            <Feather name="chevron-up" size={26} color={atStart ? '#D1D5DB' : accentColor} />
          </Pressable>
          <Text style={s.digit}>{slot.min}</Text>
          <Pressable onPress={goDown} style={[s.arrow, atEnd && s.arrowDisabled]} hitSlop={8}>
            <Feather name="chevron-down" size={26} color={atEnd ? '#D1D5DB' : accentColor} />
          </Pressable>
        </View>

        <Pressable
          onPress={toggleMeridiem}
          disabled={!canToggleMeridiem}
          style={[
            s.ampmBox,
            { backgroundColor: canToggleMeridiem ? accentColor + '22' : '#F3F4F6' },
            !canToggleMeridiem && s.ampmDisabled,
          ]}
          hitSlop={6}
        >
          <Text style={[s.ampmText, { color: canToggleMeridiem ? accentColor : '#9CA3AF' }]}>
            {slot.ampm}
          </Text>
        </Pressable>
      </View>

      <Text style={s.slotHint}>
        {safeIndex + 1} of {validSlots.length} slot{validSlots.length !== 1 ? 's' : ''} · swipe or tap arrows
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  col: {
    alignItems: 'center',
    gap: 2,
  },
  arrow: {
    padding: 6,
  },
  arrowDisabled: {
    opacity: 0.4,
  },
  digit: {
    fontSize: 44,
    fontWeight: '700',
    color: '#111827',
    width: 66,
    textAlign: 'center',
    letterSpacing: -1,
  },
  colon: {
    fontSize: 44,
    fontWeight: '700',
    color: '#111827',
    marginTop: -14,
    marginHorizontal: 2,
  },
  ampmBox: {
    marginLeft: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'center',
  },
  ampmDisabled: {
    opacity: 0.5,
  },
  ampmText: {
    fontSize: 17,
    fontWeight: '700',
  },
  closedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
    justifyContent: 'center',
  },
  closedText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
  },
  slotHint: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '400',
  },
});
