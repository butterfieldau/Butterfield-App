import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { type RegisterSessionReport } from '@/lib/api';

// ── Palette ───────────────────────────────────────────────────────────────────
const WHITE  = '#FFFFFF';
const DARK   = '#0F172A';
const MID    = '#475569';
const MUTED  = '#94A3B8';
const BORDER = '#E2E8F0';
const BG     = '#F8FAFC';
const BLUE   = '#1493FF';
const GREEN  = '#16A34A';
const RED    = '#D20001';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtAUD(cents: number) {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Not recorded';
  return d.toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Australia/Sydney',
  });
}

function fmtDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Z-Report Content (embeddable sections, no Modal wrapper) ──────────────────

export interface ZReportContentProps {
  report: RegisterSessionReport;
  editableNotes?: boolean;
  closeNote?: string;
  varianceNote?: string;
  onCloseNoteChange?: (v: string) => void;
  onVarianceNoteChange?: (v: string) => void;
}

export function ZReportContent({
  report,
  editableNotes,
  closeNote,
  varianceNote,
  onCloseNoteChange,
  onVarianceNoteChange,
}: ZReportContentProps) {
  const s = report.summary;
  const vc = s.varianceCents;
  const varianceColor = vc === null ? MUTED : vc === 0 ? GREEN : RED;
  const hasVariance = vc !== null && vc !== 0;

  return (
    <>
      {/* Total Sales hero — the headline figure for the session */}
      <View style={z.heroRow}>
        <View>
          <Text style={z.heroLabel}>TOTAL SALES</Text>
          <Text style={z.heroValue}>{fmtAUD(s.totalSalesCents)}</Text>
        </View>
        <View style={z.heroBreakdown}>
          <Text style={z.heroBreakdownItem}>
            <Text style={z.heroBreakdownDim}>Card  </Text>
            <Text>{fmtAUD(s.cardSalesCents)}</Text>
          </Text>
          {s.cashSalesCents > 0 && (
            <Text style={z.heroBreakdownItem}>
              <Text style={z.heroBreakdownDim}>Cash  </Text>
              <Text>{fmtAUD(s.cashSalesCents)}</Text>
            </Text>
          )}
        </View>
      </View>

      {/* Session identity */}
      <View style={z.section}>
        <View style={z.sectionLabel}>
          <Feather name="archive" size={11} color={MUTED} />
          <Text style={z.sectionLabelText}>SESSION</Text>
        </View>
        <View style={z.card}>
          <View style={z.identityRow}>
            <View style={{ flex: 1 }}>
              <Text style={z.registerName}>{report.registerName}</Text>
              {!!report.registerLocation && (
                <Text style={z.registerSub}>{report.registerLocation}</Text>
              )}
            </View>
            <View style={[z.closePill, report.autoClosed ? z.closePillAuto : z.closePillManual]}>
              <Text style={[z.closePillText, report.autoClosed ? z.closePillTextAuto : z.closePillTextManual]}>
                {report.autoClosed ? 'Auto Close' : 'Manual'}
              </Text>
            </View>
          </View>
          <View style={z.divider} />
          {([
            ['Trading Date', fmtDate(report.tradingDate)],
            ['Opened By', report.openedByName ?? 'Not recorded'],
            ['Opened At', fmtDateTime(report.openedAt)],
            ['Closed By', report.closedByName ?? (report.autoClosed ? 'Auto close' : 'Not recorded')],
            ['Closed At', fmtDateTime(report.closedAt)],
          ] as [string, string][]).map(([label, value]) => (
            <View key={label} style={z.row}>
              <Text style={z.rowLabel}>{label}</Text>
              <Text style={z.rowValue}>{value}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Sales summary */}
      <View style={z.section}>
        <View style={z.sectionLabel}>
          <Feather name="trending-up" size={11} color={MUTED} />
          <Text style={z.sectionLabelText}>SALES</Text>
        </View>
        <View style={z.card}>
          <View style={z.metricGrid}>
            <View style={z.metricBox}>
              <Text style={z.metricLabel}>CASH SALES</Text>
              <Text style={z.metricValue}>{fmtAUD(s.cashSalesCents)}</Text>
            </View>
            <View style={z.metricBox}>
              <Text style={z.metricLabel}>CARD SALES</Text>
              <Text style={z.metricValue}>{fmtAUD(s.cardSalesCents)}</Text>
            </View>
          </View>
          <View style={z.divider} />
          {([
            ['Refunds', fmtAUD(s.totalRefundsCents)],
            ['Discounts', fmtAUD(s.discountsCents)],
            ['Surcharges', fmtAUD(s.surchargesCents)],
          ] as [string, string][]).map(([label, value]) => (
            <View key={label} style={z.row}>
              <Text style={z.rowLabel}>{label}</Text>
              <Text style={z.rowValue}>{value}</Text>
            </View>
          ))}
          <View style={z.divider} />
          <View style={z.row}>
            <Text style={[z.rowLabel, z.bold]}>Total Sales</Text>
            <Text style={[z.rowValue, { fontSize: 18, fontWeight: '800', color: BLUE }]}>{fmtAUD(s.totalSalesCents)}</Text>
          </View>
        </View>
      </View>

      {/* Cash reconciliation */}
      <View style={z.section}>
        <View style={z.sectionLabel}>
          <Feather name="dollar-sign" size={11} color={MUTED} />
          <Text style={z.sectionLabelText}>CASH RECONCILIATION</Text>
        </View>
        <View style={z.card}>
          {([
            { label: 'Opening Float', value: fmtAUD(s.startingFloatCents ?? 0), indent: false },
            { label: '+ Cash Sales', value: fmtAUD(s.cashSalesCents), indent: true },
            { label: '− Cash Refunds', value: fmtAUD(s.cashRefundsCents), indent: true },
            { label: '+ Cash Added', value: fmtAUD(s.cashAddedCents), indent: true },
            { label: '− Cash Removed', value: fmtAUD(s.cashRemovedCents), indent: true },
          ] as { label: string; value: string; indent: boolean }[]).map(({ label, value, indent }) => (
            <View key={label} style={[z.row, indent && { paddingLeft: 12 }]}>
              <Text style={[z.rowLabel, indent && { color: MUTED }]}>{label}</Text>
              <Text style={[z.rowValue, indent && { color: MUTED }]}>{value}</Text>
            </View>
          ))}
          <View style={[z.divider, { marginVertical: 8 }]} />
          <View style={z.row}>
            <Text style={[z.rowLabel, z.bold]}>Expected Cash</Text>
            <Text style={[z.rowValue, z.bold]}>{fmtAUD(s.expectedCashCents)}</Text>
          </View>
          <View style={z.row}>
            <Text style={[z.rowLabel, z.bold]}>Actual Counted</Text>
            <Text style={[z.rowValue, z.bold]}>
              {s.actualCountedCashCents === null ? 'Not entered' : fmtAUD(s.actualCountedCashCents)}
            </Text>
          </View>
          <View style={[z.varianceRow, { backgroundColor: varianceColor + '18' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather
                name={vc === 0 || vc === null ? 'check-circle' : 'alert-triangle'}
                size={14}
                color={varianceColor}
              />
              <Text style={[z.rowLabel, { fontWeight: '700', color: varianceColor }]}>Variance</Text>
            </View>
            <Text style={[z.rowValue, { fontSize: 18, fontWeight: '800', color: varianceColor }]}>
              {vc === null
                ? 'N/A'
                : vc === 0
                ? '$0.00'
                : (vc > 0 ? '+' : '−') + fmtAUD(vc)}
            </Text>
          </View>
        </View>
      </View>

      {/* Notes */}
      <View style={z.section}>
        <View style={z.sectionLabel}>
          <Feather name="file-text" size={11} color={MUTED} />
          <Text style={z.sectionLabelText}>NOTES</Text>
        </View>
        <View style={z.card}>
          {editableNotes ? (
            <>
              <Text style={z.noteLabel}>Close Note</Text>
              <TextInput
                value={closeNote ?? ''}
                onChangeText={onCloseNoteChange}
                placeholder="Add a close note…"
                placeholderTextColor={MUTED}
                multiline
                style={z.noteInput}
              />
              {hasVariance && (
                <>
                  <Text style={[z.noteLabel, { marginTop: 10 }]}>Variance Note</Text>
                  <TextInput
                    value={varianceNote ?? ''}
                    onChangeText={onVarianceNoteChange}
                    placeholder="Explain the variance…"
                    placeholderTextColor={MUTED}
                    multiline
                    style={z.noteInput}
                  />
                </>
              )}
            </>
          ) : (
            <>
              {!!report.closeNote && (
                <>
                  <Text style={z.noteLabel}>Close Note</Text>
                  <Text style={z.noteValue}>{report.closeNote}</Text>
                </>
              )}
              {!!report.varianceNote && (
                <>
                  {!!report.closeNote && <View style={[z.divider, { marginVertical: 8 }]} />}
                  <Text style={z.noteLabel}>Variance Note</Text>
                  <Text style={z.noteValue}>{report.varianceNote}</Text>
                </>
              )}
              {!report.closeNote && !report.varianceNote && (
                <Text style={z.emptyNotes}>No notes recorded</Text>
              )}
            </>
          )}
        </View>
      </View>
    </>
  );
}

// ── ZReportModal (full-screen pageSheet modal) ────────────────────────────────

export interface ZReportModalProps {
  visible: boolean;
  report: RegisterSessionReport | null;
  loading?: boolean;
  onDone: () => void;
  onPrint?: () => void | Promise<void>;
  printing?: boolean;
  editableNotes?: boolean;
  closeNote?: string;
  varianceNote?: string;
  onCloseNoteChange?: (v: string) => void;
  onVarianceNoteChange?: (v: string) => void;
  onSaveNotes?: () => void;
  savingNotes?: boolean;
}

export default function ZReportModal({
  visible,
  report,
  loading,
  onDone,
  onPrint,
  printing,
  editableNotes,
  closeNote,
  varianceNote,
  onCloseNoteChange,
  onVarianceNoteChange,
  onSaveNotes,
  savingNotes,
}: ZReportModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDone}
    >
      <View style={z.root}>
        {/* Header */}
        <View style={z.header}>
          <View style={{ width: 36 }} />
          <Text style={z.headerTitle}>Z-Report</Text>
          <Pressable onPress={onDone} style={z.closeBtn} hitSlop={12}>
            <Feather name="x" size={18} color={DARK} />
          </Pressable>
        </View>

        {/* Body */}
        {loading || !report ? (
          <View style={z.center}>
            <ActivityIndicator color={BLUE} size="large" />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            <ZReportContent
              report={report}
              editableNotes={editableNotes}
              closeNote={closeNote}
              varianceNote={varianceNote}
              onCloseNoteChange={onCloseNoteChange}
              onVarianceNoteChange={onVarianceNoteChange}
            />
          </ScrollView>
        )}

        {/* Footer */}
        {!!report && (
          <View style={z.footer}>
            {!!onPrint && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onPrint();
                }}
                style={[z.footerSecondary, printing && { opacity: 0.65 }]}
                disabled={printing}
              >
                {printing
                  ? <ActivityIndicator color={BLUE} size="small" />
                  : <Feather name="printer" size={15} color={BLUE} />}
                <Text style={z.footerSecondaryText}>{printing ? 'Printing…' : 'Print Z-Report'}</Text>
              </Pressable>
            )}
            {editableNotes && !!onSaveNotes && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSaveNotes();
                }}
                style={[z.footerSecondary, savingNotes && { opacity: 0.65 }]}
                disabled={savingNotes}
              >
                {savingNotes
                  ? <ActivityIndicator color={BLUE} size="small" />
                  : <Feather name="save" size={15} color={BLUE} />}
                <Text style={z.footerSecondaryText}>{savingNotes ? 'Saving…' : 'Save Notes'}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onDone();
              }}
              style={z.footerDone}
            >
              <Text style={z.footerDoneText}>Done</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const z = StyleSheet.create({
  root:               { flex: 1, backgroundColor: '#F5F6FA' },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, backgroundColor: WHITE },
  headerTitle:        { fontSize: 17, fontWeight: '800', color: DARK },
  closeBtn:           { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  center:             { flex: 1, alignItems: 'center', justifyContent: 'center' },

  heroRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#EFF6FF', borderBottomWidth: 1, borderBottomColor: '#BFDBFE',
    paddingHorizontal: 20, paddingVertical: 18,
  },
  heroLabel:         { fontSize: 10, fontWeight: '800', color: BLUE, letterSpacing: 1.2, marginBottom: 4 },
  heroValue:         { fontSize: 32, fontWeight: '800', color: BLUE },
  heroBreakdown:     { alignItems: 'flex-end', gap: 4 },
  heroBreakdownItem: { fontSize: 13, fontWeight: '700', color: DARK },
  heroBreakdownDim:  { fontSize: 13, fontWeight: '500', color: MUTED },

  section:            { paddingHorizontal: 16, paddingTop: 16 },
  sectionLabel:       { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  sectionLabelText:   { fontSize: 10, fontWeight: '800', color: MUTED, letterSpacing: 1.4, textTransform: 'uppercase' },

  card:               { backgroundColor: WHITE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER },
  divider:            { height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginVertical: 6 },

  identityRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  registerName:       { fontSize: 16, fontWeight: '800', color: DARK },
  registerSub:        { fontSize: 12, color: MUTED, marginTop: 2 },

  closePill:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  closePillManual:    { backgroundColor: '#ECFDF5', borderColor: '#BBF7D0' },
  closePillAuto:      { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  closePillText:      { fontSize: 11, fontWeight: '700' },
  closePillTextManual: { color: '#15803D' },
  closePillTextAuto:  { color: BLUE },

  row:                { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel:           { fontSize: 13, fontWeight: '500', color: MID, flex: 1 },
  rowValue:           { fontSize: 13, fontWeight: '700', color: DARK, textAlign: 'right', flexShrink: 1 },
  bold:               { fontWeight: '700', color: DARK },

  metricGrid:         { flexDirection: 'row', gap: 8, marginBottom: 10 },
  metricBox:          { flex: 1, backgroundColor: BG, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: BORDER },
  metricLabel:        { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 4 },
  metricValue:        { fontSize: 16, fontWeight: '800', color: DARK },

  varianceRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, padding: 12, borderRadius: 10 },

  noteLabel:          { fontSize: 10, fontWeight: '800', color: MUTED, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
  noteValue:          { fontSize: 13, color: DARK, lineHeight: 19 },
  noteInput:          { backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: DARK, minHeight: 80, textAlignVertical: 'top' },
  emptyNotes:         { fontSize: 13, color: MUTED, fontStyle: 'italic' },

  footer:             { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, backgroundColor: WHITE },
  footerSecondary:    { flex: 1, minWidth: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  footerSecondaryText: { fontSize: 14, fontWeight: '700', color: BLUE },
  footerDone:         { flex: 1, minWidth: 100, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#1A2B4A' },
  footerDoneText:     { fontSize: 14, fontWeight: '800', color: WHITE },
});
