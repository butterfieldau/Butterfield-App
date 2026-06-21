import { Dimensions, StyleSheet } from 'react-native';
import {
  GLASS_BG, GLASS_BORDER, GLASS_SHADOW,
  MUTED, TEXT, GREEN, RED, BORDER, BLUE,
} from './directorColors';

const SCREEN_W = Dimensions.get('window').width;
const H_PAD    = 16;
const INNER_W  = SCREEN_W - H_PAD * 2;

const KPI_COLS = 2;
const KPI_GAP  = 10;
const KPI_W    = (INNER_W - KPI_GAP * (KPI_COLS - 1)) / KPI_COLS;

const QA_COLS  = 4;
const QA_GAP   = 8;
const QA_W     = (INNER_W - QA_GAP * (QA_COLS - 1)) / QA_COLS;

export const styles = StyleSheet.create({
  revCard:       { borderRadius: 20, padding: 20, gap: 16 },
  revHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  revTitle:      { color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 1.5 },
  liveChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(34,197,94,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  liveDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  liveText:      { color: GREEN, fontSize: 10, letterSpacing: 1 },
  revRow:        { flexDirection: 'row' },
  revItem:       { flex: 1, alignItems: 'center' },
  revItemBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.12)' },
  revAmount:     { color: '#fff', fontSize: 18 },
  revLabel:      { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 3 },
  alertCard:     { borderRadius: 14, padding: 14, borderWidth: 1, gap: 6 },
  alertDotBig:   { width: 8, height: 8, borderRadius: 4 },
  alertHeading:  { fontSize: 13 },
  alertRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertRowText:  { flex: 1, fontSize: 13 },
  reviewLink:    { fontSize: 12 },
  sectionTitle:  { fontSize: 11, color: MUTED, letterSpacing: 1.5, marginBottom: 10 },
  qaGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  wastageCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  wastageTitle:  { fontSize: 13 },
  wastageSub:    { fontSize: 12, marginTop: 2 },
  activityList:  { borderRadius: 20, borderWidth: 1, overflow: 'hidden', backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, ...GLASS_SHADOW },
  activityRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  activityIcon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityTitle: { fontSize: 13 },
  activitySub:   { fontSize: 11 },
  activityTime:  { fontSize: 11 },
  emptyCard:     { alignItems: 'center', gap: 10, padding: 32, borderRadius: 20, borderWidth: 1, backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, ...GLASS_SHADOW },
  emptyText:     { fontSize: 14 },
  channelCard:   { backgroundColor: GLASS_BG, borderRadius: 16, borderWidth: 1, borderColor: GLASS_BORDER, padding: 14, ...GLASS_SHADOW },
});

export const kpi = StyleSheet.create({
  tile:     { width: KPI_W, backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, borderRadius: 16, borderWidth: 1, padding: 14, gap: 6, ...GLASS_SHADOW },
  iconBox:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative', borderWidth: 1.5 },
  alertDot: { position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  value:    { fontSize: 26, fontWeight: '700' },
  helper:   { fontSize: 11, fontWeight: '600' },
  label:    { fontSize: 11, fontWeight: '500' },
});

export const qa = StyleSheet.create({
  btn:   { width: QA_W, backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, borderRadius: 16, borderWidth: 1, padding: 10, gap: 6, alignItems: 'center', ...GLASS_SHADOW },
  icon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  label: { fontSize: 10, fontWeight: '500', textAlign: 'center' },
});
