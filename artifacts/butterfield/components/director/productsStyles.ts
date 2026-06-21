import { StyleSheet } from 'react-native';
import { BG, BLUE, BORDER, CARD, MUTED, NAVY, TEXT } from './directorColors';

const GREEN = '#22C55E';
const AMBER = '#F59E0B';
const RED   = '#EF4444';

export const styles = StyleSheet.create({
  headerSearchBtn:       { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  headerSearchBtnActive: { borderColor: BLUE, backgroundColor: BLUE + '10' },

  tileTabRow:     { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, backgroundColor: BG },
  tileTabBtn:     { flex: 1, minHeight: 58, borderRadius: 16, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  tileTabBtnActive: { borderColor: NAVY, backgroundColor: NAVY + '0D' },
  tileTabText:    { fontSize: 12, fontWeight: '600' as const, color: MUTED },
  tileTabTextActive: { color: NAVY },

  pillTabRow:      { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  pillTab:         { height: 34, borderRadius: 17, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  pillTabActive:   { backgroundColor: BLUE },
  pillTabText:     { fontSize: 13, fontWeight: '600' as const, color: TEXT },
  pillTabTextActive: { color: '#FFFFFF' },

  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 4, marginBottom: 0, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, height: 50 },
  searchInput: { flex: 1, fontSize: 14, height: 44 },

  statsStrip:    { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, flexWrap: 'wrap' as const },
  statBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statBadgeText: { fontSize: 12, fontWeight: '600' as const },

  filterRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 16, paddingBottom: 8 },
  filterPillRow:  { flexDirection: 'row', gap: 8, paddingLeft: 16, paddingVertical: 4 },
  filterPill:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  filterPillText: { fontSize: 12, fontWeight: '600' as const },
  filterPillCount:{ fontSize: 11, fontWeight: '700' as const },
  sortBtn:        { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sortBtnActive:  { borderColor: NAVY, backgroundColor: NAVY + '10' },

  dropPanel:        { marginHorizontal: 16, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6, marginBottom: 8 },
  dropOption:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  dropOptionActive: { backgroundColor: BG },
  dropOptionText:   { flex: 1, fontSize: 14, color: TEXT },
  dropSectionLabel: { fontSize: 11, fontWeight: '700' as const, color: MUTED, letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },

  resultCount: { fontSize: 13, paddingBottom: 8 },

  shelfCard: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12,
    backgroundColor: CARD, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 10,
  },

  emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: BLUE },

  fab: { position: 'absolute' as const, right: 20, width: 58, height: 58, borderRadius: 29, alignItems: 'center' as const, justifyContent: 'center' as const, elevation: 6, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
});

export const modal = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 },
  closeBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  title:       { flex: 1, fontSize: 17, textAlign: 'center' as const },
  saveBtn:     { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12 },
  saveBtnText: { color: '#fff', fontSize: 14 },
});

export const form = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon:   { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  sectionTitle:  { fontSize: 15 },
  fieldWrap:     { gap: 6 },
  label:         { fontSize: 12 },
  input:         { backgroundColor: BG, borderRadius: 10, paddingHorizontal: 14, paddingTop: 12, borderWidth: 1, borderColor: BORDER, fontSize: 14 },
  row2:          { flexDirection: 'row', gap: 10 },
  toggleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: BORDER },
  toggleLabel:   { fontSize: 14 },
  toggleDesc:    { fontSize: 12, marginTop: 2 },
  tagGrid:       { flexDirection: 'row', flexWrap: 'wrap' as const, gap: 8, marginTop: 4 },
});
