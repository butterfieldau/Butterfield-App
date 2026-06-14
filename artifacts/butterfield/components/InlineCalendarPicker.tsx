import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

const DAYS_SHORT  = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  accentColor?: string;
  /** Block dates after this (inclusive). Defaults to no restriction. */
  maxDate?: Date;
  /** Block dates before this (inclusive). Defaults to no restriction. */
  minDate?: Date;
  /**
   * Map of YYYY-MM-DD → count. Days with count > 0 show a small accent dot
   * below the date number (useful for showing which dates have data).
   */
  dotDates?: Record<string, number>;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function InlineCalendarPicker({
  selectedDate,
  onSelectDate,
  accentColor = '#4F46E5',
  maxDate,
  minDate,
  dotDates,
}: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(
    selectedDate ? selectedDate.getFullYear() : today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    selectedDate ? selectedDate.getMonth() : today.getMonth(),
  );

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  // Build grid: Mon–Sun
  const firstDay  = new Date(viewYear, viewMonth, 1);
  const lastDay   = new Date(viewYear, viewMonth + 1, 0);
  const startDow  = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Mon=0
  const cells: Array<{ date: Date; inMonth: boolean }> = [];

  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(firstDay);
    d.setDate(firstDay.getDate() - i - 1);
    cells.push({ date: d, inMonth: false });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push({ date: new Date(viewYear, viewMonth, d), inMonth: true });
  }
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(lastDay);
      d.setDate(lastDay.getDate() + i);
      cells.push({ date: d, inMonth: false });
    }
  }

  const rows: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  function isDisabled(date: Date): boolean {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    if (maxDate) { const mx = new Date(maxDate); mx.setHours(0, 0, 0, 0); if (d > mx) return true; }
    if (minDate) { const mn = new Date(minDate); mn.setHours(0, 0, 0, 0); if (d < mn) return true; }
    return false;
  }

  return (
    <View style={s.container}>
      {/* Month navigation */}
      <View style={s.nav}>
        <Pressable onPress={prevMonth} hitSlop={8} style={s.navBtn}>
          <Feather name="chevron-left" size={18} color="#374151" />
        </Pressable>
        <Text style={s.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <Pressable onPress={nextMonth} hitSlop={8} style={s.navBtn}>
          <Feather name="chevron-right" size={18} color="#374151" />
        </Pressable>
      </View>

      {/* Day-of-week headers */}
      <View style={s.row}>
        {DAYS_SHORT.map((d, i) => (
          <View key={i} style={s.cell}>
            <Text style={s.dowLabel}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Date rows */}
      {rows.map((row, ri) => (
        <View key={ri} style={s.row}>
          {row.map((cell, ci) => {
            const isToday    = isSameDay(cell.date, today);
            const isSelected = selectedDate ? isSameDay(cell.date, selectedDate) : false;
            const disabled   = isDisabled(cell.date);
            const dotCount   = dotDates ? (dotDates[toKey(cell.date)] ?? 0) : 0;

            return (
              <Pressable
                key={ci}
                onPress={() => { if (!disabled) onSelectDate(cell.date); }}
                style={s.cell}
                disabled={disabled}
              >
                <View style={[
                  s.dayCircle,
                  isSelected && { backgroundColor: accentColor },
                  !isSelected && isToday && { borderWidth: 1.5, borderColor: accentColor },
                ]}>
                  <Text style={[
                    s.dayText,
                    (!cell.inMonth || disabled) && s.dayTextOut,
                    isSelected && s.dayTextSelected,
                    !isSelected && isToday && { color: accentColor, fontWeight: '600' },
                  ]}>
                    {cell.date.getDate()}
                  </Text>
                </View>
                {dotCount > 0 && !disabled ? (
                  <View style={[s.dot, { backgroundColor: isSelected ? '#fff' : accentColor }]} />
                ) : (
                  <View style={s.dotPlaceholder} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container:       { paddingHorizontal: 4, paddingBottom: 8 },
  nav:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn:          { padding: 6 },
  monthLabel:      { fontSize: 15, fontWeight: '600', color: '#111827' },
  row:             { flexDirection: 'row' },
  cell:            { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dowLabel:        { fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginBottom: 4 },
  dayCircle:       { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayText:         { fontSize: 13, fontWeight: '500', color: '#111827' },
  dayTextOut:      { color: '#D1D5DB' },
  dayTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  dot:             { width: 5, height: 5, borderRadius: 2.5, marginTop: 1 },
  dotPlaceholder:  { width: 5, height: 5, marginTop: 1 },
});
