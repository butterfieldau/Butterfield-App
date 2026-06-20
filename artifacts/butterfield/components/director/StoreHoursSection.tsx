import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  Switch, Text, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type StoreHour, type StoreSummary } from '@/lib/api';
import TimeWheelPicker from '@/components/TimeWheelPicker';
import { styles } from './settingsStyles';

const BLUE   = '#1493FF';
const CARD   = '#FFFFFF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface HourRow extends StoreHour {
  dayOfWeek: number;
  openTime:  string;
  closeTime: string;
  isClosed:  boolean;
  notes:     string;
}

function defaultHours(): HourRow[] {
  return [0, 1, 2, 3, 4, 5, 6].map(d => ({
    dayOfWeek: d,
    openTime:  '08:00',
    closeTime: '17:00',
    isClosed:  d === 0,
    notes:     '',
  }));
}

function formatTime12(t: string): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? '0', 10);
  if (isNaN(h)) return t;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const suf  = h < 12 ? 'am' : 'pm';
  const ms   = m > 0 ? `:${String(m).padStart(2, '0')}` : '';
  return `${h12}${ms}${suf}`;
}

function timeToMins(t: string): number {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const h   = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

function normaliseTime(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) return `${colonMatch[1].padStart(2, '0')}:${colonMatch[2]}`;
  const fourDigit = trimmed.match(/^(\d{2})(\d{2})$/);
  if (fourDigit) return `${fourDigit[1]}:${fourDigit[2]}`;
  return trimmed;
}

function rowHasError(row: HourRow): string | null {
  if (row.isClosed) return null;
  const openMins  = timeToMins(row.openTime);
  const closeMins = timeToMins(row.closeTime);
  if (isNaN(openMins))  return 'Opens time is invalid — use HH:MM (e.g. 08:00)';
  if (isNaN(closeMins)) return 'Closes time is invalid — use HH:MM (e.g. 17:00)';
  if (closeMins <= openMins) return 'Closes time must be after Opens time';
  return null;
}

function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

export function StoreHoursSection() {
  const qc = useQueryClient();

  const { data: storesData, isLoading: loadingStores } = useQuery({
    queryKey: ['director-stores-list'],
    queryFn:  () => api.director.storesList(),
  });
  const stores: StoreSummary[] = storesData?.data ?? [];

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [hours,  setHours]  = useState<HourRow[]>(defaultHours());
  const [saving, setSaving] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<{ dayIndex: number; field: 'openTime' | 'closeTime' } | null>(null);

  const activeStoreId = selectedStoreId ?? (stores.length > 0 ? stores[0].id : null);

  const { data: hoursData, isLoading: loadingHours } = useQuery({
    queryKey: ['director-store-hours', activeStoreId],
    queryFn:  () => (activeStoreId ? api.director.storeHours(activeStoreId) : Promise.resolve({ data: [] })),
    enabled:  !!activeStoreId,
  });

  useEffect(() => {
    if (hoursData?.data && hoursData.data.length > 0) {
      const fetched: HourRow[] = hoursData.data.map((r: StoreHour) => ({
        dayOfWeek: r.dayOfWeek,
        openTime:  r.openTime  ?? '08:00',
        closeTime: r.closeTime ?? '17:00',
        isClosed:  r.isClosed  ?? false,
        notes:     r.notes     ?? '',
      }));
      const merged = [0, 1, 2, 3, 4, 5, 6].map(d => {
        const found = fetched.find(r => r.dayOfWeek === d);
        return found ?? { dayOfWeek: d, openTime: '08:00', closeTime: '17:00', isClosed: d === 0, notes: '' };
      });
      setHours(merged);
    } else if (hoursData?.data && hoursData.data.length === 0) {
      setHours(defaultHours());
    }
  }, [hoursData]);

  const updateRow = (dayOfWeek: number, patch: Partial<HourRow>) => {
    setHours(prev => prev.map(r => r.dayOfWeek === dayOfWeek ? { ...r, ...patch } : r));
  };

  const rowErrors: Record<number, string> = {};
  for (const row of hours) {
    const err = rowHasError(row);
    if (err) rowErrors[row.dayOfWeek] = err;
  }
  const hasErrors = Object.keys(rowErrors).length > 0;

  const saveHours = async () => {
    if (!activeStoreId || hasErrors) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.setStoreHours(activeStoreId, hours);
      await qc.invalidateQueries({ queryKey: ['director-store-hours', activeStoreId] });
      await qc.invalidateQueries({ queryKey: ['stores'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Trading hours updated. The store info sheet will reflect these changes immediately.');
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e, 'Failed to save trading hours.'));
    } finally { setSaving(false); }
  };

  if (loadingStores) {
    return (
      <>
        <Text style={styles.section}>TRADING HOURS</Text>
        <View style={styles.center}><ActivityIndicator color={BLUE} /></View>
      </>
    );
  }

  if (stores.length === 0) return null;

  return (
    <>
      <Text style={styles.section}>TRADING HOURS</Text>

      <View style={[styles.card, { backgroundColor: '#EBF8FF', borderColor: BLUE + '40' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Feather name="clock" size={14} color={BLUE} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '400', color: BLUE, lineHeight: 18 }}>
            Set opening and closing times per day. Use 24-hour format (e.g. 08:00, 17:30). Changes are reflected immediately for customers.
          </Text>
        </View>
      </View>

      {stores.length > 1 && (
        <>
          <Text style={[styles.fieldLabel, { marginBottom: 4 }]}>Select store</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4, alignItems: 'flex-start' }}>
            {stores.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => { setSelectedStoreId(s.id); Haptics.selectionAsync(); }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: activeStoreId === s.id ? BLUE : CARD,
                    borderColor:     activeStoreId === s.id ? BLUE : BORDER,
                    paddingHorizontal: 14, paddingVertical: 8,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: activeStoreId === s.id ? '#fff' : TEXT, fontSize: 13 }]}>
                  {s.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {loadingHours ? (
        <View style={styles.center}><ActivityIndicator color={BLUE} /></View>
      ) : (
        <View style={[styles.card, { gap: 0 }]}>
          {WEEK_ORDER.map((dayIndex, i) => {
            const row = hours.find(r => r.dayOfWeek === dayIndex) ?? {
              dayOfWeek: dayIndex, openTime: '08:00', closeTime: '17:00', isClosed: false, notes: '',
            };
            const isLast      = i === WEEK_ORDER.length - 1;
            const rowErr      = rowErrors[dayIndex];
            const openBorder  = rowErr && rowErr.includes('Opens')  ? RED : BORDER;
            const closeBorder = rowErr && rowErr.includes('Closes') ? RED : BORDER;
            return (
              <View key={dayIndex}>
                <View style={{ paddingVertical: 12, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{
                        width: 36, height: 36, borderRadius: 10,
                        backgroundColor: row.isClosed ? '#F3F4F6' : (rowErr ? '#FEF2F2' : BLUE + '15'),
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{
                          fontSize: 11, fontWeight: '700',
                          color: row.isClosed ? MUTED : (rowErr ? RED : BLUE),
                        }}>
                          {DAY_SHORT[dayIndex]}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: row.isClosed ? MUTED : TEXT }}>
                          {DAY_LABELS[dayIndex]}
                        </Text>
                        {!row.isClosed && !rowErr && (row.openTime || row.closeTime) ? (
                          <Text style={{ fontSize: 11, fontWeight: '400', color: MUTED, marginTop: 1 }}>
                            {formatTime12(row.openTime)} – {formatTime12(row.closeTime)}
                          </Text>
                        ) : row.isClosed ? (
                          <Text style={{ fontSize: 11, fontWeight: '400', color: RED, marginTop: 1 }}>Closed</Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '400', color: row.isClosed ? RED : MUTED }}>
                        {row.isClosed ? 'Closed' : 'Open'}
                      </Text>
                      <Switch
                        value={!row.isClosed}
                        onValueChange={v => { updateRow(dayIndex, { isClosed: !v }); Haptics.selectionAsync(); }}
                        trackColor={{ false: '#D1D5DB', true: GREEN }}
                        thumbColor="#fff"
                        ios_backgroundColor="#D1D5DB"
                      />
                    </View>
                  </View>

                  {!row.isClosed && (
                    <>
                      <View style={{ flexDirection: 'row', gap: 10, paddingLeft: 44 }}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={[styles.fieldLabel, { fontSize: 11 }]}>Opens</Text>
                          <Pressable
                            onPress={() => { setTimePickerTarget({ dayIndex, field: 'openTime' }); Haptics.selectionAsync(); }}
                            style={[styles.input, { borderColor: openBorder, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                          >
                            <Text style={{ fontSize: 14, color: row.openTime ? TEXT : MUTED }}>
                              {row.openTime ? formatTime12(row.openTime) : '—'}
                            </Text>
                            <Feather name="clock" size={13} color={BLUE} />
                          </Pressable>
                        </View>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={[styles.fieldLabel, { fontSize: 11 }]}>Closes</Text>
                          <Pressable
                            onPress={() => { setTimePickerTarget({ dayIndex, field: 'closeTime' }); Haptics.selectionAsync(); }}
                            style={[styles.input, { borderColor: closeBorder, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                          >
                            <Text style={{ fontSize: 14, color: row.closeTime ? TEXT : MUTED }}>
                              {row.closeTime ? formatTime12(row.closeTime) : '—'}
                            </Text>
                            <Feather name="clock" size={13} color={BLUE} />
                          </Pressable>
                        </View>
                      </View>
                      {rowErr && (
                        <Text style={{ fontSize: 11, fontWeight: '400', color: RED, paddingLeft: 44 }}>
                          {rowErr}
                        </Text>
                      )}
                    </>
                  )}
                </View>
                {!isLast && <View style={[styles.divider, { backgroundColor: BORDER }]} />}
              </View>
            );
          })}
        </View>
      )}

      {hasErrors && (
        <View style={[styles.card, { backgroundColor: '#FEF2F2', borderColor: RED + '40' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="alert-circle" size={14} color={RED} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: RED }}>
              Fix the highlighted rows before saving.
            </Text>
          </View>
        </View>
      )}

      <Pressable onPress={saveHours} disabled={saving || !activeStoreId || hasErrors}
        style={[styles.saveBtn, { backgroundColor: hasErrors ? '#D1D5DB' : GREEN, opacity: saving ? 0.8 : 1 }]}>
        {saving
          ? <ActivityIndicator color="#fff" />
          : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="clock" size={16} color="#fff" />
              <Text style={styles.saveBtnText}>Save Trading Hours</Text>
            </View>
          )}
      </Pressable>

      {timePickerTarget && (
        <TimeWheelPicker
          visible
          initialHHMM={hours.find(r => r.dayOfWeek === timePickerTarget.dayIndex)?.[timePickerTarget.field] ?? '08:00'}
          onConfirm={hhmm => {
            updateRow(timePickerTarget.dayIndex, { [timePickerTarget.field]: hhmm });
            setTimePickerTarget(null);
          }}
          onClose={() => setTimePickerTarget(null)}
          accentColor={BLUE}
          title={timePickerTarget.field === 'openTime' ? 'Opens At' : 'Closes At'}
        />
      )}
    </>
  );
}
