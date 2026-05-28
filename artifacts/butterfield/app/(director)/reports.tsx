import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { api, getToken, type DirectorFeedback } from '@/lib/api';

const BG = 'transparent';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';

const TABS = ['Revenue', 'Feedback'] as const;
type TabKey = typeof TABS[number];

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : 'http://localhost:80/api';

function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso: string) {
  const direct = new Date(iso);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }
  const normalized = typeof iso === 'string'
    ? iso.replace(' ', 'T').replace(/(\.\d+)?([+-]\d{2}:?\d{2}|Z)?$/, '')
    : '';
  const fallback = new Date(normalized);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }
  return '—';
}

function fmtDisplayDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  return (
    <View style={{ height: 6, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={[styles.statBox, { backgroundColor: CARD, borderColor: BORDER }]}>
      <Text style={[styles.statVal, { color: color ?? TEXT }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ── Download Report Modal ─────────────────────────────────────────────────────

interface DownloadModalProps {
  visible: boolean;
  onClose: () => void;
}

function DownloadReportModal({ visible, onClose }: DownloadModalProps) {
  const today = new Date();
  const [fromStr, setFromStr] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return toYMD(d);
  });
  const [toStr, setToStr] = useState(() => toYMD(today));
  const [loading, setLoading] = useState(false);
  const [fromFocused, setFromFocused] = useState(false);
  const [toFocused, setToFocused] = useState(false);

  const PRESETS = [
    { label: 'Last 7 days',  from: () => { const d = new Date(); d.setDate(d.getDate() - 7);  return toYMD(d); }, to: () => toYMD(today) },
    { label: 'Last 30 days', from: () => { const d = new Date(); d.setDate(d.getDate() - 30); return toYMD(d); }, to: () => toYMD(today) },
    { label: 'This month',   from: () => { const d = new Date(today.getFullYear(), today.getMonth(), 1); return toYMD(d); }, to: () => toYMD(today) },
    { label: 'This year',    from: () => `${today.getFullYear()}-01-01`, to: () => toYMD(today) },
  ];

  const applyPreset = (p: typeof PRESETS[0]) => {
    setFromStr(p.from());
    setToStr(p.to());
    Haptics.selectionAsync();
  };

  const validate = (): string | null => {
    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!ymdRe.test(fromStr)) return 'From date must be YYYY-MM-DD';
    if (!ymdRe.test(toStr))   return 'To date must be YYYY-MM-DD';
    const f = new Date(fromStr); const t = new Date(toStr);
    if (isNaN(f.getTime())) return 'From date is invalid';
    if (isNaN(t.getTime())) return 'To date is invalid';
    if (f > t) return '"From" date must be before "To" date';
    return null;
  };

  const handleDownload = async () => {
    const err = validate();
    if (err) { Alert.alert('Invalid Date', err); return; }
    setLoading(true);
    try {
      const token    = await getToken();
      const url      = `${API_BASE}/director/reports/export?from=${fromStr}&to=${toStr}`;
      const filename = `butterfield-report-${fromStr}-to-${toStr}.xlsx`;

      if (Platform.OS === 'web') {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
        if (!res.ok) throw new Error(await res.text());
        const blob   = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a      = document.createElement('a');
        a.href     = objUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
      } else {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Server error ${res.status}`);
        }
        const ab     = await res.arrayBuffer();
        const base64 = arrayBufferToBase64(ab);
        const fileUri = (FileSystem.cacheDirectory ?? '') + filename;
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Save Butterfield Report',
            UTI: 'com.microsoft.excel.xlsx',
          });
        } else {
          Alert.alert('File Saved', `Saved to: ${fileUri}`);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
      }
    } catch (e: any) {
      Alert.alert('Download Failed', e?.message ?? 'Unknown error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fromDisplay = fromStr ? fmtDisplayDate(fromStr) : 'Select date';
  const toDisplay   = toStr   ? fmtDisplayDate(toStr)   : 'Select date';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={dl.container}>
          {/* Header */}
          <View style={dl.header}>
            <View style={dl.headerLeft}>
              <View style={dl.iconBox}>
                <Feather name="download" size={18} color={BLUE} />
              </View>
              <View>
                <Text style={dl.title}>Download Report</Text>
                <Text style={dl.subtitle}>Export to Excel (.xlsx)</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={dl.closeBtn} disabled={loading}>
              <Feather name="x" size={20} color={MUTED} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>
            {/* Quick presets */}
            <View style={{ gap: 8 }}>
              <Text style={dl.sectionLabel}>QUICK RANGE</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PRESETS.map(p => (
                  <Pressable
                    key={p.label}
                    onPress={() => applyPreset(p)}
                    style={[dl.preset, fromStr === p.from() && toStr === p.to() && dl.presetActive]}
                  >
                    <Text style={[dl.presetText, fromStr === p.from() && toStr === p.to() && { color: '#fff' }]}>
                      {p.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Date inputs */}
            <View style={{ gap: 12 }}>
              <Text style={dl.sectionLabel}>CUSTOM DATE RANGE</Text>

              <View style={dl.dateRow}>
                <Text style={dl.dateLabel}>From</Text>
                <View style={[dl.dateInputWrap, fromFocused && { borderColor: BLUE }]}>
                  <Feather name="calendar" size={15} color={MUTED} />
                  <TextInput
                    style={dl.dateInput}
                    value={fromStr}
                    onChangeText={setFromStr}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={MUTED}
                    keyboardType="numbers-and-punctuation"
                    autoCorrect={false}
                    onFocus={() => setFromFocused(true)}
                    onBlur={() => setFromFocused(false)}
                    editable={!loading}
                  />
                  {fromStr ? (
                    <Text style={dl.dateParsed} numberOfLines={1}>{fromDisplay}</Text>
                  ) : null}
                </View>
              </View>

              <View style={dl.dateRow}>
                <Text style={dl.dateLabel}>To</Text>
                <View style={[dl.dateInputWrap, toFocused && { borderColor: BLUE }]}>
                  <Feather name="calendar" size={15} color={MUTED} />
                  <TextInput
                    style={dl.dateInput}
                    value={toStr}
                    onChangeText={setToStr}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={MUTED}
                    keyboardType="numbers-and-punctuation"
                    autoCorrect={false}
                    onFocus={() => setToFocused(true)}
                    onBlur={() => setToFocused(false)}
                    editable={!loading}
                  />
                  {toStr ? (
                    <Text style={dl.dateParsed} numberOfLines={1}>{toDisplay}</Text>
                  ) : null}
                </View>
              </View>
            </View>

            {/* What's included */}
            <View style={dl.includesCard}>
              <Text style={[dl.sectionLabel, { marginBottom: 10 }]}>REPORT INCLUDES</Text>
              {[
                ['bar-chart-2', 'Summary — revenue, orders, averages'],
                ['shopping-bag', 'Item Sales — per cookie/item with revenue'],
                ['truck', 'Order Types — delivery vs pickup breakdown'],
                ['check-circle', 'Order Status — completed, cancelled, refunds'],
                ['users', 'New Customers — registrations in range'],
                ['list', 'Detailed Orders — every order with full detail'],
              ].map(([icon, label]) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                  <Feather name={icon as any} size={14} color={BLUE} />
                  <Text style={dl.includeText}>{label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Action buttons */}
          <View style={[dl.footer, { borderTopColor: BORDER }]}>
            <Pressable onPress={onClose} style={dl.cancelBtn} disabled={loading}>
              <Text style={dl.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleDownload}
              style={[dl.downloadBtn, loading && { opacity: 0.7 }]}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Feather name="download" size={16} color="#fff" />
              }
              <Text style={dl.downloadText}>
                {loading ? 'Generating…' : 'Download Excel'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Revenue Tab ───────────────────────────────────────────────────────────────

function DownloadInlineButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.downloadInline}
    >
      <Feather name="download" size={16} color="#fff" />
      <Text style={styles.downloadInlineText}>Download Report</Text>
    </Pressable>
  );
}

function RevenueTab({ onDownloadPress }: { onDownloadPress: () => void }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-reports'],
    queryFn: () => api.director.reports(),
    staleTime: 60_000,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const r = data?.data;
  const maxDaily = Math.max(...(r?.dailyRevenue?.map(d => d.totalCents) ?? [1]));

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
    >
      <Text style={styles.section}>REVENUE</Text>
      <View style={styles.statRow}>
        <StatBox label="Today"      value={fmtAUD(r?.revenue.today ?? 0)} color={BLUE} />
        <StatBox label="This Week"  value={fmtAUD(r?.revenue.week  ?? 0)} />
        <StatBox label="This Month" value={fmtAUD(r?.revenue.month ?? 0)} />
      </View>

      <Text style={styles.section}>ORDERS</Text>
      <View style={styles.statRow}>
        <StatBox label="Today"      value={String(r?.orders.today ?? 0)} />
        <StatBox label="This Week"  value={String(r?.orders.week  ?? 0)} />
        <StatBox label="This Month" value={String(r?.orders.month ?? 0)} />
      </View>
      <View style={styles.statRow}>
        <StatBox label="Avg Order Value" value={fmtAUD(r?.orders.avgValueCents ?? 0)} sub="(7 days)" />
        <StatBox label="New Customers"   value={String(r?.customers.newWeek ?? 0)} sub="this week" color={GREEN} />
        <StatBox label="Total Customers" value={String(r?.customers.total ?? 0)} />
      </View>

      {(r?.byType?.length ?? 0) > 0 && (
        <>
          <Text style={styles.section}>BY ORDER TYPE (THIS MONTH)</Text>
          <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            {r!.byType.map(t => (
              <View key={t.type} style={styles.breakRow}>
                <Text style={styles.breakLabel}>{t.type.replace('_', ' ').toUpperCase()}</Text>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <MiniBar value={t.count} max={r!.orders.month || 1} color={BLUE} />
                </View>
                <Text style={styles.breakCount}>{t.count}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {(r?.byStatus?.length ?? 0) > 0 && (
        <>
          <Text style={styles.section}>BY STATUS (THIS MONTH)</Text>
          <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            {r!.byStatus.map(s => {
              const c = s.status === 'completed' ? GREEN : s.status === 'cancelled' ? RED : AMBER;
              return (
                <View key={s.status} style={styles.breakRow}>
                  <Text style={styles.breakLabel}>{s.status.replace('_', ' ').toUpperCase()}</Text>
                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <MiniBar value={s.count} max={r!.orders.month || 1} color={c} />
                  </View>
                  <Text style={styles.breakCount}>{s.count}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {(r?.dailyRevenue?.length ?? 0) > 0 && (
        <>
          <Text style={styles.section}>DAILY REVENUE — LAST 30 DAYS</Text>
          <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            {r!.dailyRevenue.slice(-14).map((d, i) => (
              <View key={i} style={styles.breakRow}>
                <Text style={[styles.breakLabel, { width: 64 }]}>{fmtDateShort(d.day)}</Text>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <MiniBar value={d.totalCents} max={maxDaily} color={NAVY} />
                </View>
                <Text style={styles.breakCount}>{fmtAUD(d.totalCents)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {(r?.topSellingItems?.length ?? 0) > 0 && (
        <>
          <Text style={styles.section}>TOP SELLING ITEMS</Text>
          <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            {r!.topSellingItems.map((item, i) => (
              <View key={`${item.name}-${i}`} style={styles.breakRow}>
                <Text style={[styles.breakLabel, { flex: 1, width: undefined }]} numberOfLines={1}>
                  {i + 1}. {item.name}
                </Text>
                <Text style={styles.breakCount}>{item.quantity}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <DownloadInlineButton onPress={onDownloadPress} />
    </ScrollView>
  );
}

// ── Feedback Tab ──────────────────────────────────────────────────────────────

function FeedbackTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-feedback'],
    queryFn: () => api.director.allFeedback(),
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const feedback = data?.data ?? [];

  const markRead = useMutation({
    mutationFn: (id: string) => api.director.markFeedbackRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director-feedback'] }),
  });

  const CATS: Record<string, { color: string; bg: string }> = {
    general:  { color: '#0369A1', bg: '#EBF8FF' },
    product:  { color: '#5B21B6', bg: '#EDE9FE' },
    service:  { color: '#166534', bg: '#DCFCE7' },
    app:      { color: '#854D0E', bg: '#FEF9C3' },
    complaint:{ color: '#991B1B', bg: '#FEF2F2' },
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <FlatList
      data={feedback}
      keyExtractor={f => f.id}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Feather name="message-square" size={32} color={MUTED} />
          <Text style={styles.emptyText}>No feedback yet</Text>
        </View>
      }
      renderItem={({ item: f }: { item: DirectorFeedback }) => {
        const cat = CATS[f.category] ?? { color: MUTED, bg: BG };
        return (
          <Pressable
            style={[styles.card, { backgroundColor: f.isRead ? CARD : '#F0F9FF', borderColor: f.isRead ? BORDER : BLUE + '40' }]}
            onPress={() => {
              if (!f.isRead) { Haptics.selectionAsync(); markRead.mutate(f.id); }
            }}
          >
            <View style={styles.fbHeader}>
              <View style={[styles.pill, { backgroundColor: cat.bg }]}>
                <Text style={[styles.pillText, { color: cat.color }]}>{f.category.toUpperCase()}</Text>
              </View>
              {f.rating != null && (
                <View style={styles.ratingRow}>
                  {[1,2,3,4,5].map(n => (
                    <Feather key={n} name="star" size={11} color={n <= f.rating! ? AMBER : BORDER} />
                  ))}
                </View>
              )}
              <Text style={styles.fbDate}>{fmtDate(f.createdAt)}</Text>
              {!f.isRead && <View style={[styles.dot, { backgroundColor: BLUE, width: 8, height: 8 }]} />}
            </View>
            <Text style={styles.fbMessage}>{f.message}</Text>
          </Pressable>
        );
      }}
    />
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function DirectorReportsScreen() {
  const [tab, setTab] = useState<TabKey>('Revenue');
  const [showDownload, setShowDownload] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Sub-tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: BORDER }]}>
        {TABS.map(t => (
          <Pressable
            key={t}
            style={[styles.tabBtn, tab === t && { borderBottomColor: BLUE, borderBottomWidth: 2 }]}
            onPress={() => { setTab(t); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.tabText, { color: tab === t ? BLUE : MUTED }]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'Revenue'  && <RevenueTab onDownloadPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowDownload(true); }} />}
      {tab === 'Feedback' && <FeedbackTab />}

      <DownloadReportModal visible={showDownload} onClose={() => setShowDownload(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText:   { fontSize: 14, fontWeight: '400', color: MUTED },
  tabBar:      { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1 },
  tabBtn:      { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:     { fontSize: 13, fontWeight: '600' },
  section:     { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 1.5 },
  card:        { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  statRow:     { flexDirection: 'row', gap: 8 },
  statBox:     { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center', gap: 4 },
  statVal:     { fontSize: 16, fontWeight: '700', color: TEXT },
  statLabel:   { fontSize: 10, fontWeight: '500', color: MUTED, textAlign: 'center' },
  statSub:     { fontSize: 9,  fontWeight: '400', color: MUTED, textAlign: 'center' },
  breakRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  breakLabel:  { fontSize: 11, fontWeight: '500', color: MUTED, width: 80 },
  breakCount:  { fontSize: 12, fontWeight: '700', color: TEXT, textAlign: 'right', width: 60 },
  pill:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillText:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  dot:         { width: 6, height: 6, borderRadius: 3 },
  fbHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  fbDate:      { fontSize: 11, fontWeight: '400', color: MUTED, marginLeft: 'auto' },
  fbMessage:   { fontSize: 14, fontWeight: '400', color: TEXT, lineHeight: 20 },
  ratingRow:         { flexDirection: 'row', gap: 2 },
  downloadInline:    {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: NAVY, borderRadius: 14, paddingVertical: 15,
    marginTop: 4,
  },
  downloadInlineText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

const dl = StyleSheet.create({
  container:    { flex: 1, backgroundColor: BG },
  header:       {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox:      {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: BLUE + '15', alignItems: 'center', justifyContent: 'center',
  },
  title:        { fontSize: 17, fontWeight: '700', color: TEXT },
  subtitle:     { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 1 },
  closeBtn:     {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 1 },
  preset:       {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER, backgroundColor: CARD,
  },
  presetActive: { backgroundColor: BLUE, borderColor: BLUE },
  presetText:   { fontSize: 12, fontWeight: '600', color: TEXT, lineHeight: 16 },
  dateRow:      { gap: 6 },
  dateLabel:    { fontSize: 13, fontWeight: '600', color: TEXT },
  dateInputWrap:{
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  dateInput:    { flex: 1, fontSize: 14, fontWeight: '500', color: TEXT },
  dateParsed:   { fontSize: 12, color: MUTED, fontWeight: '400', flexShrink: 1 },
  includesCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  includeText:  { fontSize: 13, fontWeight: '400', color: TEXT },
  footer:       {
    flexDirection: 'row', gap: 10, padding: 20,
    borderTopWidth: 1, backgroundColor: CARD,
  },
  cancelBtn:    {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText:   { fontSize: 15, fontWeight: '600', color: TEXT },
  downloadBtn:  {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: NAVY,
  },
  downloadText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
