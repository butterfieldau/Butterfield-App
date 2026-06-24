import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl,
  ScrollView, Text, TextInput, View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { api } from '@/lib/api';
import type { RegisterSessionReport } from '@/lib/api';
import ZReportModal from '@/components/ZReportModal';
import { sendRegisterSummaryPrint } from '@/lib/printer';
import { s } from './reportStyles';
import { BLUE, MUTED, GREEN, RED } from './directorColors';
import { toYMD, fmtDisplayDate, fmtDateTime, csvCell, buildRegisterSummaryPrintLines, buildZReportHtml } from './reportHelpers';
import ReportDateRangePicker, { type DateRange, type RangePreset, getPresetRange } from './ReportDateRangePicker';
import ReportSectionHeader from './ReportSectionHeader';
import EmptyState from './EmptyState';
import SectionLoader from './SectionLoader';
import { fmtAUD } from './reportHelpers';

function RegisterReportDetailModal({
  reportId,
  onClose,
  onSaved,
}: {
  reportId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['director-register-report', reportId],
    queryFn: () => api.director.registerReport(reportId!),
    enabled: !!reportId,
  });
  const { data: settingsData } = useQuery({
    queryKey: ['director-settings-register-print'],
    queryFn: () => api.director.settings(),
    staleTime: 60_000,
    enabled: !!reportId,
  });

  const report = data?.data ?? null;
  const [closeNote, setCloseNote] = useState('');
  const [varianceNote, setVarianceNote] = useState('');
  const [printing, setPrinting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    setCloseNote(report?.closeNote ?? '');
    setVarianceNote(report?.varianceNote ?? '');
  }, [report?.closeNote, report?.varianceNote, reportId]);

  const saveMutation = useMutation({
    mutationFn: () => api.director.updateRegisterReportNotes(reportId!, { closeNote, varianceNote }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    },
    onError: (err: any) => Alert.alert('Could Not Save Notes', err?.message ?? 'Please try again.'),
  });

  const handlePrint = useCallback(async () => {
    if (!report) return;
    const settings = settingsData?.data ?? {};
    const printerIp = settings.printerIp;
    const printerBrand = settings.printerBrand === 'star' ? 'star' : 'epson';
    if (!printerIp) {
      Alert.alert('No Printer', 'Add a printer in POS settings before printing register summaries.');
      return;
    }
    setPrinting(true);
    try {
      await sendRegisterSummaryPrint({
        title: 'Daily Register Summary',
        lines: buildRegisterSummaryPrintLines(report),
        printerBrand,
      }, printerIp, settings.printerPort ? Number(settings.printerPort) : 9100, api.director.printerBytes);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Print Failed', err?.message ?? 'Could not print this register summary.');
    } finally {
      setPrinting(false);
    }
  }, [report, settingsData?.data]);

  const handleExportPdf = useCallback(async () => {
    if (!report) return;
    setExportingPdf(true);
    try {
      const html = buildZReportHtml(report);

      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 500);
        } else {
          Alert.alert('Blocked', 'Please allow pop-ups for this site to export Z-Reports.');
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Z-Report — ${report.registerName} — ${report.tradingDate}`,
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('PDF Saved', `Saved to: ${uri}`);
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message ?? 'Could not export this Z-Report as PDF.');
    } finally {
      setExportingPdf(false);
    }
  }, [report]);

  return (
    <ZReportModal
      visible={!!reportId}
      report={report}
      loading={isLoading}
      onDone={onClose}
      onExportPdf={handleExportPdf}
      exportingPdf={exportingPdf}
      onPrint={handlePrint}
      printing={printing}
      editableNotes
      closeNote={closeNote}
      varianceNote={varianceNote}
      onCloseNoteChange={setCloseNote}
      onVarianceNoteChange={setVarianceNote}
      onSaveNotes={() => saveMutation.mutate()}
      savingNotes={saveMutation.isPending}
    />
  );
}

export default function RegisterReportsTab() {
  const qc = useQueryClient();
  const [preset, setPreset] = useState<RangePreset>('week');
  const [customRange, setCustomRange] = useState<DateRange>(() => getPresetRange('week'));
  const [registerFilter, setRegisterFilter] = useState('');
  const [staffUserId, setStaffUserId] = useState<string>('all');
  const [closeMethod, setCloseMethod] = useState<'all' | 'manual' | 'auto'>('all');
  const [variance, setVariance] = useState<'all' | 'with_variance' | 'without_variance'>('all');
  const [activity, setActivity] = useState<'all' | 'meaningful' | 'empty'>('meaningful');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const range = useMemo<DateRange>(() =>
    preset === 'custom' ? customRange : getPresetRange(preset),
    [preset, customRange],
  );

  const handlePreset = useCallback((next: RangePreset) => {
    setPreset(next);
    if (next !== 'custom') setCustomRange(getPresetRange(next));
  }, []);

  const { data: staffData } = useQuery({
    queryKey: ['director-staff-list'],
    queryFn: () => api.director.staffList(),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-register-reports', range.from, range.to, registerFilter, staffUserId, closeMethod, variance, activity],
    queryFn: () => api.director.registerReports({
      from: range.from,
      to: range.to,
      register: registerFilter.trim() || undefined,
      staffUserId: staffUserId !== 'all' ? staffUserId : undefined,
      closeMethod: closeMethod !== 'all' ? closeMethod : undefined,
      variance,
      activity,
    }),
    staleTime: 60_000,
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const reports = data?.data ?? [];
  const staffMembers = staffData?.data ?? [];

  const handleExport = useCallback(async () => {
    if (reports.length === 0) {
      Alert.alert('Nothing to Export', 'There are no register reports in this filtered view yet.');
      return;
    }
    setExporting(true);
    try {
      const header = [
        'Trading Date', 'Register', 'Location', 'Opened By', 'Closed By', 'Close Method',
        'Opening Float', 'Cash Sales', 'Card Sales', 'Total Refunds', 'Discounts', 'Surcharges',
        'Cash Added', 'Cash Removed', 'Expected Cash', 'Actual Cash', 'Variance', 'Total Sales',
        'Close Note', 'Variance Note',
      ];
      const rows = reports.map((report) => {
        const sm = report.summary;
        return [
          report.tradingDate, report.registerName, report.registerLocation ?? '',
          report.openedByName ?? '', report.closedByName ?? '',
          report.autoClosed ? 'Auto Close' : 'Manual Close',
          (sm.startingFloatCents ?? 0) / 100, sm.cashSalesCents / 100, sm.cardSalesCents / 100,
          sm.totalRefundsCents / 100, sm.discountsCents / 100, sm.surchargesCents / 100,
          sm.cashAddedCents / 100, sm.cashRemovedCents / 100, sm.expectedCashCents / 100,
          sm.actualCountedCashCents == null ? '' : sm.actualCountedCashCents / 100,
          sm.varianceCents == null ? '' : sm.varianceCents / 100,
          sm.totalSalesCents / 100, report.closeNote ?? '', report.varianceNote ?? '',
        ];
      });
      const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
      const filename = `daily-register-reports-${range.from}-to-${range.to}.csv`;

      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
      } else {
        const csvFile = new (FileSystem as any).File((FileSystem as any).Paths.cache, filename);
        csvFile.write(csv);
        const fileUri = csvFile.uri;
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Daily Register Reports', UTI: 'public.comma-separated-values-text' });
        } else {
          Alert.alert('Export Saved', `Saved to: ${fileUri}`);
        }
      }
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message ?? 'Could not export these register reports.');
    } finally {
      setExporting(false);
    }
  }, [range.from, range.to, reports]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      >
        <ReportDateRangePicker preset={preset} range={range} onPreset={handlePreset} onCustomChange={setCustomRange} />

        <View style={s.section}>
          <ReportSectionHeader title="DAILY REGISTER REPORTS" icon="archive" />
          <View style={s.card}>
            <TextInput
              value={registerFilter}
              onChangeText={setRegisterFilter}
              placeholder="Filter by register"
              placeholderTextColor={MUTED}
              style={s.filterInput}
              autoCorrect={false}
            />

            <Text style={s.filterLabel}>Staff</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterChipRow}>
              <Pressable onPress={() => setStaffUserId('all')} style={[s.filterChip, staffUserId === 'all' && s.filterChipActive]}>
                <Text style={[s.filterChipText, staffUserId === 'all' && s.filterChipTextActive]}>All Staff</Text>
              </Pressable>
              {staffMembers.map((member) => (
                <Pressable key={member.id} onPress={() => setStaffUserId(member.id)} style={[s.filterChip, staffUserId === member.id && s.filterChipActive]}>
                  <Text style={[s.filterChipText, staffUserId === member.id && s.filterChipTextActive]}>{member.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={s.filterLabel}>Close Method</Text>
            <View style={s.filterChipWrap}>
              {[{ key: 'all', label: 'All' }, { key: 'manual', label: 'Manual Close' }, { key: 'auto', label: 'Auto Close' }].map((option) => (
                <Pressable key={option.key} onPress={() => setCloseMethod(option.key as any)} style={[s.filterChip, closeMethod === option.key && s.filterChipActive]}>
                  <Text style={[s.filterChipText, closeMethod === option.key && s.filterChipTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.filterLabel}>Cash Variance</Text>
            <View style={s.filterChipWrap}>
              {[{ key: 'all', label: 'All' }, { key: 'with_variance', label: 'With Variance' }, { key: 'without_variance', label: 'No Variance' }].map((option) => (
                <Pressable key={option.key} onPress={() => setVariance(option.key as any)} style={[s.filterChip, variance === option.key && s.filterChipActive]}>
                  <Text style={[s.filterChipText, variance === option.key && s.filterChipTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.filterLabel}>Session Activity</Text>
            <View style={s.filterChipWrap}>
              {[{ key: 'meaningful', label: 'Active Only' }, { key: 'all', label: 'All' }, { key: 'empty', label: 'Empty Only' }].map((option) => (
                <Pressable key={option.key} onPress={() => { Haptics.selectionAsync(); setActivity(option.key as any); }} style={[s.filterChip, activity === option.key && s.filterChipActive]}>
                  <Text style={[s.filterChipText, activity === option.key && s.filterChipTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={s.section}>
          <ReportSectionHeader title="SESSIONS" icon="file-text" />
          {isLoading ? (
            <SectionLoader />
          ) : reports.length === 0 ? (
            <EmptyState icon="archive" text="No closed register sessions match these filters" />
          ) : (
            <View style={{ gap: 10 }}>
              {reports.map((report) => {
                const varianceCents = report.summary.varianceCents;
                const varianceTone = varianceCents == null ? MUTED : varianceCents === 0 ? GREEN : RED;
                return (
                  <Pressable key={report.id} style={s.card} onPress={() => setSelectedReportId(report.id)}>
                    <View style={s.registerReportHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.breakLabel}>{report.registerName}</Text>
                        <Text style={s.breakSub}>
                          {fmtDisplayDate(report.tradingDate)} · {report.registerLocation ?? 'Butterfield Cookies'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {report.isEmpty && (
                          <View style={s.statusPillEmpty}><Text style={s.statusPillTextEmpty}>Empty</Text></View>
                        )}
                        <View style={[s.statusPill, report.autoClosed ? s.statusPillAuto : s.statusPillManual]}>
                          <Text style={[s.statusPillText, report.autoClosed ? s.statusPillTextAuto : s.statusPillTextManual]}>
                            {report.autoClosed ? 'Auto Close' : 'Manual Close'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.registerRevRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.registerRevLabel}>TOTAL SALES</Text>
                        <Text style={s.registerRevValue}>{fmtAUD(report.summary.totalSalesCents)}</Text>
                      </View>
                      <View style={s.registerRevBreakdown}>
                        <Text style={s.registerRevBreakdownItem}>
                          <Text style={s.registerRevBreakdownDim}>Card </Text>
                          {fmtAUD(report.summary.cardSalesCents)}
                        </Text>
                        {report.summary.cashSalesCents > 0 && (
                          <Text style={s.registerRevBreakdownItem}>
                            <Text style={s.registerRevBreakdownDim}>Cash </Text>
                            {fmtAUD(report.summary.cashSalesCents)}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={s.registerReportGrid}>
                      <View style={s.registerMetricBox}>
                        <Text style={s.registerMetricBoxLabel}>Expected Cash</Text>
                        <Text style={s.registerMetricBoxValue}>{fmtAUD(report.summary.expectedCashCents)}</Text>
                      </View>
                      <View style={s.registerMetricBox}>
                        <Text style={s.registerMetricBoxLabel}>Actual Cash</Text>
                        <Text style={s.registerMetricBoxValue}>
                          {report.summary.actualCountedCashCents == null ? 'Not entered' : fmtAUD(report.summary.actualCountedCashCents)}
                        </Text>
                      </View>
                      <View style={s.registerMetricBox}>
                        <Text style={s.registerMetricBoxLabel}>Variance</Text>
                        <Text style={[s.registerMetricBoxValue, { color: varianceTone }]}>
                          {varianceCents == null ? 'Not calculated' : fmtAUD(varianceCents)}
                        </Text>
                      </View>
                    </View>
                    <View style={s.registerMetaRow}>
                      <Text style={s.breakSub}>Opened by {report.openedByName ?? 'Unknown'}</Text>
                      <Text style={s.breakSub}>{fmtDateTime(report.closedAt ?? report.openedAt)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <Pressable onPress={handleExport} style={[s.downloadBtn, exporting && { opacity: 0.7 }]} disabled={exporting}>
          {exporting ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="download" size={16} color="#fff" />}
          <Text style={s.downloadBtnText}>{exporting ? 'Exporting…' : 'Export Filtered Register Reports'}</Text>
        </Pressable>
      </ScrollView>

      <RegisterReportDetailModal
        reportId={selectedReportId}
        onClose={() => setSelectedReportId(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['director-register-reports'] });
          if (selectedReportId) qc.invalidateQueries({ queryKey: ['director-register-report', selectedReportId] });
        }}
      />
    </View>
  );
}
