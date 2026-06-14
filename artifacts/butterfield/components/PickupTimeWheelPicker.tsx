import React, { useRef } from 'react';
import { View, Text, PanResponder, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

const ROW_H = 44;
const VISIBLE = 5;
const HALF = Math.floor(VISIBLE / 2);
const DRUM_H = ROW_H * VISIBLE;
const TAP_THRESHOLD = 8;

const ROW_OPACITY: Record<number, number> = {
  0: 1,
  1: 0.55,
  2: 0.22,
};

interface Props {
  validSlots: number[];
  selectedSlotMins: number | null;
  onSelectSlot: (mins: number) => void;
  accentColor?: string;
}

function formatSlot(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
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

  const accDy = useRef(0);
  const grantY = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      // Capture every touch at start so the parent ScrollView never steals the
      // gesture, fully isolating drum flicks from page scroll.
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,

      onPanResponderGrant: (evt) => {
        accDy.current = 0;
        // Store the Y position relative to this view so we can detect which
        // row the finger landed on when the gesture ends as a tap.
        grantY.current = evt.nativeEvent.locationY;
      },

      onPanResponderMove: (_, gs) => {
        const delta = gs.dy - accDy.current;
        if (Math.abs(delta) >= ROW_H) {
          const steps = Math.trunc(delta / ROW_H);
          const dir = -steps;
          const next = Math.max(0, Math.min(validSlotsRef.current.length - 1, safeIndexRef.current + dir));
          if (next !== safeIndexRef.current) {
            onSelectSlotRef.current(validSlotsRef.current[next]);
          }
          accDy.current += steps * ROW_H;
        }
      },

      onPanResponderRelease: (_, gs) => {
        if (Math.abs(gs.dy) < TAP_THRESHOLD) {
          // Short movement = tap. Calculate which row the finger was on using
          // the Y captured at grant, then jump to that slot if it isn't centre.
          const rowIndex = Math.floor(grantY.current / ROW_H);
          const offset = rowIndex - HALF;
          const slotIndex = safeIndexRef.current + offset;
          if (offset !== 0 && slotIndex >= 0 && slotIndex < validSlotsRef.current.length) {
            onSelectSlotRef.current(validSlotsRef.current[slotIndex]);
          }
        }
        accDy.current = 0;
        grantY.current = 0;
      },

      onPanResponderTerminate: () => {
        accDy.current = 0;
        grantY.current = 0;
      },
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

  return (
    <View style={s.drum} {...panResponder.panHandlers}>
      <View
        style={[s.highlightBar, { borderColor: accentColor + '44', backgroundColor: accentColor + '14' }]}
        pointerEvents="none"
      />
      {Array.from({ length: VISIBLE }, (_, vi) => {
        const offset = vi - HALF;
        const slotIndex = safeIndex + offset;
        const isCenter = offset === 0;
        const absOffset = Math.abs(offset);
        const opacity = ROW_OPACITY[absOffset] ?? 0;

        if (slotIndex < 0 || slotIndex >= validSlots.length) {
          return <View key={vi} style={s.row} />;
        }

        const label = formatSlot(validSlots[slotIndex]);

        return (
          <View key={vi} style={s.row}>
            <Text
              style={[
                s.rowText,
                { opacity, color: isCenter ? accentColor : '#111827' },
                isCenter && s.rowTextCenter,
              ]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  drum: {
    height: DRUM_H,
    alignSelf: 'stretch',
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  highlightBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: HALF * ROW_H,
    height: ROW_H,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  row: {
    height: ROW_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#111827',
  },
  rowTextCenter: {
    fontSize: 19,
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
});
