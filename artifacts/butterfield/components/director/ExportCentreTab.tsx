import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { getToken } from '@/lib/api';
import {
  BG, CARD, BLUE, TEXT, MUTED, BORDER, GREEN, AMBER, PURPLE, PINK, TEAL,
  GLASS_SHADOW, RADIUS_MD, RADIUS_LG,
} from './directorColors';
import { toYMD, fmtDisplayDate } from './reportHelpers';
import ReportDateRangePicker, {
  type DateRange, type RangePreset, getPresetRange,
} from './ReportDateRangePicker';

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : 'http://localhost:80/api';

// ── Export definitions ────────────────────────────────────────────────────────
type ExportAction = 'excel' | 'soon';

interface ExportDef {
  title:   string;
  desc:    string;
  icon:    React.ComponentProps<typeof Feather>['name'];
  color:   string;
  format:  string;
  action:  ExportAction;
}

const EXPORTS: ExportDef[] = [
  {
    title:  'Business Report',
    desc:   'Full P&L — orders, revenue, GST, refunds & discounts',
    icon:   'bar-chart-2',
    color:  BLUE,
    format: 'XLSX',
    action: 'excel',
  },
  {
    title:  'Register Reports',
    desc:   'Daily session summaries with cash & card breakdown',
    icon:   'archive',
    color:  GREEN,
    format: 'CSV',
    action: 'soon',
  },
  {
    title:  'Staff Hours & Wages',
    desc:   'Clock-in / clock-out history with estimated wage costs',
    icon:   'clock',
    color:  PURPLE,
    format: 'CSV',
    action: 'soon',
  },
  {
    title:  'Wastage Log',
    desc:   'All logged wastage items with estimated cost breakdown',
    icon:   'trash-2',
    color:  AMBER,
    format: 'CSV',
    action: 'soon',
  },
  {
    title:  'Customer Data',
    desc:   'Customer list with loyalty tier and lifetime spend',
    icon:   'users',
    color:  PINK,
    format: 'CSV',
    action: 'soon',
  },
  {
    title:  'Sales by Product',
    desc:   'Product-level revenue and units sold for the period',
    icon:   'shopping-bag',
    color:  TEAL,
    format: 'CSV',
    action: 'soon',
  },
  {
    title:  'Wholesale Orders',
    desc:   'All wholesale orders with PO reference and invoice status',
    icon:   'package',
    color:  '#059669',
    format: 'CSV',
    action: 'soon',
  },
  {
    title:  'Loyalty Transactions',
    desc:   'Points earned, redeemed and rewards claimed per customer',
    icon:   'star',
    color:  '#C9A84C',
    format: 'CSV',
    action: 'soon',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function ExportCentreTab({ onDownloadPress }: { onDownloadPress: () => void }) {
  const [preset,      setPreset]      = useState<RangePreset>('month');
  const [customRange, setCustomRange] = useState<DateRange>(() => getPresetRange('month'));
  const [downloading, setDownloading] = useState(false);

  const range = useMemo<DateRange>(() =>
    preset === 'custom' ? customRange : getPresetRange(preset),
    [preset, customRange],
  );

  const handlePreset = useCallback((p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') setCustomRange(getPresetRange(p));
  }, []);

  const handleExcel = useCallback(async () => {
    setDownloading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const token    = await getToken();
      const url      = `${API_BASE}/director/reports/export?from=${range.from}&to=${range.to}`;
      const filename = `butterfield-report-${range.from}-to-${range.to}.xlsx`;

      if (Platform.OS === 'web') {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
        if (!res.ok) throw new Error(await res.text());
        const blob   = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a      = document.createElement('a');
        a.href = objUrl; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
      } else {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
        if (!res.ok) throw new Error(await res.text());
        const buf    = await res.arrayBuffer();
        const bytes  = new Uint8Array(buf);
        const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
        const cacheDir = ((FileSystem as any).cacheDirectory ?? '') as string;
        const fileUri  = cacheDir + filename;
        await FileSystem.writeAsStringAsync(fileUri, btoa(binary), { encoding: 'base64' as any });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Save Butterfield Report',
            UTI: 'com.microsoft.excel.xlsx',
          });
        } else {
          Alert.alert('File Saved', `Saved to: ${fileUri}`);
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Download Failed', e?.message ?? 'Unknown error. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [range.from, range.to]);

  const handleExport = useCallback((exp: ExportDef) => {
    if (exp.action === 'excel') {
      handleExcel();
      return;
    }
    Haptics.selectionAsync();
    Alert.alert(
      exp.title,
      'This export is coming soon. Check back in a future update.',
      [{ text: 'OK' }],
    );
  }, [handleExcel]);

  const dateLabel = `${fmtDisplayDate(range.from)} — ${fmtDisplayDate(range.to)}`;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 56 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Date range */}
      <ReportDateRangePicker
        preset={preset}
        range={range}
        onPreset={handlePreset}
        onCustomChange={setCustomRange}
      />

      {/* Selected range badge */}
      <View style={e.rangeRow}>
        <Feather name="calendar" size={13} color={MUTED} />
        <Text style={e.rangeText}>{dateLabel}</Text>
      </View>

      {/* Export rows */}
      <View style={e.listWrap}>
        <Text style={e.sectionLabel}>AVAILABLE EXPORTS</Text>
        <View style={[e.card, GLASS_SHADOW]}>
          {EXPORTS.map((exp, i) => (
            <React.Fragment key={exp.title}>
              {i > 0 && <View style={e.divider} />}
              <View style={e.row}>
                <View style={[e.iconBox, { backgroundColor: exp.color + '18' }]}>
                  <Feather name={exp.icon} size={20} color={exp.color} />
                </View>
                <View style={e.rowBody}>
                  <Text style={e.rowTitle}>{exp.title}</Text>
                  <Text style={e.rowDesc} numberOfLines={2}>{exp.desc}</Text>
                </View>
                <Pressable
                  onPress={() => handleExport(exp)}
                  disabled={downloading && exp.action === 'excel'}
                  style={[e.dlBtn, { borderColor: exp.color + '40', backgroundColor: exp.color + '12' }]}
                >
                  {downloading && exp.action === 'excel' ? (
                    <ActivityIndicator size="small" color={exp.color} />
                  ) : (
                    <>
                      <Feather name="download" size={11} color={exp.color} />
                      <Text style={[e.dlBtnText, { color: exp.color }]}>{exp.format}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      {/* Scheduled reports CTA */}
      <View style={e.ctaWrap}>
        <View style={e.ctaCard}>
          <View style={e.ctaIcon}>
            <Feather name="mail" size={20} color={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={e.ctaTitle}>Scheduled Reports</Text>
            <Text style={e.ctaDesc}>
              Auto-email weekly or monthly reports to your accountant or business email.
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => Alert.alert('Coming Soon', 'Scheduled reports will be available in a future update.')}
          style={e.ctaBtn}
        >
          <Feather name="clock" size={15} color="#fff" />
          <Text style={e.ctaBtnText}>Set Up Auto Reports</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const e = StyleSheet.create({
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rangeText: { fontSize: 12, color: MUTED, fontWeight: '500' },

  listWrap:    { paddingHorizontal: 16, paddingTop: 4 },
  sectionLabel:{
    fontSize: 11, fontWeight: '700', color: MUTED,
    letterSpacing: 1.1, marginBottom: 10, textTransform: 'uppercase',
  },
  card: {
    backgroundColor: CARD,
    borderRadius: RADIUS_LG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: TEXT },
  rowDesc:  { fontSize: 12, color: MUTED, lineHeight: 17 },
  dlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 52,
    justifyContent: 'center',
  },
  dlBtnText: { fontSize: 11, fontWeight: '700' },

  ctaWrap: { marginHorizontal: 16, marginTop: 16 },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BLUE + '0D',
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BLUE + '30',
    padding: 14,
    marginBottom: 10,
  },
  ctaIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: BLUE + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTitle: { fontSize: 14, fontWeight: '600', color: BLUE, marginBottom: 2 },
  ctaDesc:  { fontSize: 12, color: MUTED, lineHeight: 17 },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BLUE,
    borderRadius: RADIUS_MD,
    paddingVertical: 13,
  },
  ctaBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
