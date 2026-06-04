import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, RefreshControl,
  StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ShopDisplayStaffMember } from '@/lib/api';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const GREEN  = '#16A34A';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

function formatDuration(isoStart: string): string {
  const ms = Date.now() - new Date(isoStart).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

type ClockResult = { clocked: 'in' | 'out'; name: string; hoursWorked?: string };

function NumPad({
  visible,
  staff,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  staff: ShopDisplayStaffMember | null;
  onClose: () => void;
  onSuccess: (result: ClockResult) => void;
}) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setPin(''); setError(null); setLoading(false); }
  }, [visible, staff]);

  const pressKey = (key: string) => {
    if (loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (key === 'DEL') { setPin((p) => p.slice(0, -1)); setError(null); return; }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    setError(null);
    if (next.length === 4) submitPin(next);
  };

  const submitPin = useCallback(async (p: string) => {
    if (!staff) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.shopDisplay.staffClock(staff.userId, p);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess(res.data);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err?.message ?? String(err);
      setError(msg.includes('Incorrect') ? 'Incorrect PIN — try again' : msg.includes('approved') ? 'Account not approved' : 'Something went wrong');
      setPin('');
    } finally {
      setLoading(false);
    }
  }, [staff, onSuccess]);

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'] as const;
  const action = staff?.isClockedIn ? 'Clock Out' : 'Clock In';
  const actionColor = staff?.isClockedIn ? RED : GREEN;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.numpadSheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.numpadHeader}>
            <View>
              <Text style={s.numpadTitle}>{staff?.name ?? ''}</Text>
              <Text style={s.numpadSub}>{staff?.position ?? ''} · {action}</Text>
            </View>
            <Pressable onPress={onClose} style={s.closeBtn}>
              <Feather name="x" size={18} color={TEXT} />
            </Pressable>
          </View>

          <View style={s.dotsRow}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  s.dot,
                  i < pin.length && s.dotFilled,
                  error && s.dotError,
                ]}
              />
            ))}
          </View>

          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={BLUE} size="large" />
              <Text style={s.loadingText}>Verifying PIN…</Text>
            </View>
          ) : (
            <View style={s.keyGrid}>
              {KEYS.map((key, i) => {
                if (key === '') return <View key={i} style={s.keyEmpty} />;
                const isDel = key === 'DEL';
                return (
                  <Pressable
                    key={key}
                    onPress={() => pressKey(key)}
                    style={({ pressed }) => [
                      s.key,
                      isDel ? s.keyDel : s.keyNum,
                      pressed && s.keyPressed,
                    ]}
                  >
                    {isDel
                      ? <Feather name="delete" size={22} color={TEXT} />
                      : <Text style={s.keyText}>{key}</Text>
                    }
                  </Pressable>
                );
              })}
            </View>
          )}

          {error && (
            <View style={s.errorRow}>
              <Feather name="alert-circle" size={14} color={RED} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={onClose}
            style={[s.cancelBtn, { borderColor: BORDER }]}
          >
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SuccessOverlay({
  visible,
  result,
  onDismiss,
}: {
  visible: boolean;
  result: ClockResult | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onDismiss, 3000);
      return () => clearTimeout(t);
    }
  }, [visible, onDismiss]);

  if (!visible || !result) return null;
  const isIn = result.clocked === 'in';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={s.successBackdrop} onPress={onDismiss}>
        <View style={[s.successCard, { borderColor: isIn ? GREEN : RED }]}>
          <View style={[s.successIcon, { backgroundColor: isIn ? '#DCFCE7' : '#FEE2E2' }]}>
            <Feather name={isIn ? 'log-in' : 'log-out'} size={36} color={isIn ? GREEN : RED} />
          </View>
          <Text style={[s.successTitle, { color: isIn ? GREEN : RED }]}>
            {isIn ? 'Clocked In' : 'Clocked Out'}
          </Text>
          <Text style={s.successName}>{result.name}</Text>
          {result.hoursWorked && (
            <Text style={s.successHours}>{result.hoursWorked}h worked this shift</Text>
          )}
          <Text style={s.successDismiss}>Tap to dismiss</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

export default function ShopDisplayClockScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const qc = useQueryClient();

  const [selectedStaff, setSelectedStaff] = useState<ShopDisplayStaffMember | null>(null);
  const [success, setSuccess] = useState<ClockResult | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setTick] = useState(0);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['shop-display-staff-assigned'],
    queryFn: () => api.shopDisplay.staffAssigned(),
    refetchInterval: 30000,
  });

  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 60000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const staff: ShopDisplayStaffMember[] = data?.data ?? [];
  const clockedIn = staff.filter((s) => s.isClockedIn);
  const clockedOut = staff.filter((s) => !s.isClockedIn);

  const handleSuccess = useCallback((result: ClockResult) => {
    setSelectedStaff(null);
    setSuccess(result);
    setShowSuccess(true);
    void qc.invalidateQueries({ queryKey: ['shop-display-staff-assigned'] });
  }, [qc]);

  const renderStaffCard = ({ item }: { item: ShopDisplayStaffMember }) => (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedStaff(item); }}
      style={({ pressed }) => [s.staffCard, isWide && s.staffCardWide, pressed && { opacity: 0.85 }]}
    >
      <View style={[s.staffAvatar, { backgroundColor: item.isClockedIn ? `${GREEN}18` : BG }]}>
        <Text style={[s.staffInitial, { color: item.isClockedIn ? GREEN : MUTED }]}>
          {(item.name ?? '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.staffName}>{item.name}</Text>
        <Text style={s.staffPosition}>{item.position}</Text>
        {item.isClockedIn && item.shiftStart ? (
          <Text style={[s.staffStatus, { color: GREEN }]}>
            <Feather name="clock" size={11} /> {formatDuration(item.shiftStart)} into shift
          </Text>
        ) : (
          <Text style={[s.staffStatus, { color: MUTED }]}>Not clocked in</Text>
        )}
      </View>
      <View style={[s.clockBadge, { backgroundColor: item.isClockedIn ? '#DCFCE7' : '#FEE2E2' }]}>
        <Feather name={item.isClockedIn ? 'log-out' : 'log-in'} size={14} color={item.isClockedIn ? GREEN : RED} />
        <Text style={[s.clockBadgeText, { color: item.isClockedIn ? GREEN : RED }]}>
          {item.isClockedIn ? 'Clock Out' : 'Clock In'}
        </Text>
      </View>
    </Pressable>
  );

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BLUE} size="large" />
        <Text style={s.loadingText}>Loading staff…</Text>
      </View>
    );
  }

  if (staff.length === 0) {
    return (
      <View style={s.center}>
        <Feather name="users" size={44} color={MUTED} />
        <Text style={s.emptyTitle}>No staff assigned</Text>
        <Text style={s.emptyText}>
          Staff need to be assigned to this store and have a PIN set by a director before they can clock in here.
        </Text>
      </View>
    );
  }

  const allSections = [
    ...(clockedIn.length > 0 ? [{ type: 'header', label: `On shift (${clockedIn.length})`, color: GREEN } as const] : []),
    ...clockedIn.map((s) => ({ type: 'staff', item: s } as const)),
    ...(clockedOut.length > 0 ? [{ type: 'header', label: `Off shift (${clockedOut.length})`, color: MUTED } as const] : []),
    ...clockedOut.map((s) => ({ type: 'staff', item: s } as const)),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={s.statsBar}>
        <View style={[s.statPill, { backgroundColor: '#DCFCE7' }]}>
          <Feather name="check-circle" size={14} color={GREEN} />
          <Text style={[s.statPillText, { color: GREEN }]}>{clockedIn.length} on shift</Text>
        </View>
        <View style={[s.statPill, { backgroundColor: '#FEE2E2' }]}>
          <Feather name="circle" size={14} color={RED} />
          <Text style={[s.statPillText, { color: RED }]}>{clockedOut.length} off shift</Text>
        </View>
      </View>

      <FlatList
        data={allSections}
        keyExtractor={(item, i) => item.type === 'header' ? `header-${i}` : item.item.userId}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={BLUE} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 8 }}
        numColumns={isWide ? 2 : 1}
        columnWrapperStyle={isWide ? { gap: 12 } : undefined}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <View style={isWide ? { width: '100%' } : undefined}>
                <Text style={[s.sectionHeader, { color: item.color }]}>{item.label}</Text>
              </View>
            );
          }
          return renderStaffCard({ item: item.item });
        }}
      />

      <NumPad
        visible={!!selectedStaff}
        staff={selectedStaff}
        onClose={() => setSelectedStaff(null)}
        onSuccess={handleSuccess}
      />

      <SuccessOverlay
        visible={showSuccess}
        result={success}
        onDismiss={() => setShowSuccess(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: BG, padding: 32 },
  loadingText:      { color: MUTED, fontSize: 15, fontWeight: '500', marginTop: 8 },
  emptyTitle:       { fontSize: 18, fontWeight: '700', color: TEXT, textAlign: 'center' },
  emptyText:        { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
  statsBar:         { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  statPill:         { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  statPillText:     { fontSize: 13, fontWeight: '800' },
  sectionHeader:    { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8, marginBottom: 2, marginLeft: 2 },
  staffCard:        { backgroundColor: CARD, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', alignItems: 'center', gap: 12 },
  staffCardWide:    { flex: 1 },
  staffAvatar:      { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  staffInitial:     { fontSize: 20, fontWeight: '800' },
  staffName:        { fontSize: 16, fontWeight: '800', color: TEXT },
  staffPosition:    { fontSize: 13, color: MUTED, fontWeight: '500' },
  staffStatus:      { fontSize: 12, fontWeight: '600', marginTop: 2 },
  clockBadge:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  clockBadgeText:   { fontSize: 13, fontWeight: '800' },
  backdrop:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  numpadSheet:      { backgroundColor: CARD, borderRadius: 28, padding: 24, width: '100%', maxWidth: 360, gap: 20 },
  numpadHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  numpadTitle:      { fontSize: 20, fontWeight: '800', color: TEXT },
  numpadSub:        { fontSize: 14, color: MUTED, fontWeight: '500', marginTop: 2 },
  closeBtn:         { width: 32, height: 32, borderRadius: 16, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  dotsRow:          { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  dot:              { width: 18, height: 18, borderRadius: 9, backgroundColor: BORDER },
  dotFilled:        { backgroundColor: BLUE },
  dotError:         { backgroundColor: RED },
  loadingWrap:      { alignItems: 'center', gap: 10, paddingVertical: 20 },
  keyGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  key:              { width: 80, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  keyNum:           { backgroundColor: BG },
  keyDel:           { backgroundColor: '#FEE2E2' },
  keyEmpty:         { width: 80, height: 80 },
  keyPressed:       { opacity: 0.6 },
  keyText:          { fontSize: 28, fontWeight: '600', color: TEXT },
  errorRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  errorText:        { color: RED, fontSize: 14, fontWeight: '700' },
  cancelBtn:        { borderRadius: 16, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  cancelText:       { fontSize: 15, fontWeight: '700', color: TEXT },
  successBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  successCard:      { backgroundColor: CARD, borderRadius: 28, padding: 32, alignItems: 'center', gap: 14, borderWidth: 3, width: '100%', maxWidth: 360 },
  successIcon:      { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  successTitle:     { fontSize: 28, fontWeight: '900' },
  successName:      { fontSize: 20, fontWeight: '700', color: TEXT },
  successHours:     { fontSize: 15, color: MUTED, fontWeight: '600' },
  successDismiss:   { fontSize: 13, color: MUTED, marginTop: 8 },
});
