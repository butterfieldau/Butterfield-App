import { StyleSheet } from 'react-native';
import {
  GLASS_BG, GLASS_BORDER,
} from './directorColors';

const MUTED_C  = '#8E8E93';
const TEXT_C   = '#1C1C1E';
const BG_C     = '#EFF6FF';
const BORDER_C = '#E5E7EB';

export const styles = StyleSheet.create({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText:     { fontSize: 14, fontWeight: '400', color: MUTED_C },
  tabBar:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1 },
  tabBtn:        { flex: 1, paddingHorizontal: 4, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:       { fontSize: 11, fontWeight: '600' },
  section:       { fontSize: 11, fontWeight: '700', color: MUTED_C, letterSpacing: 1.5, marginTop: 4 },
  card:          { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10, backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle:      { fontSize: 15, fontWeight: '600', color: TEXT_C },
  rowSub:        { fontSize: 12, fontWeight: '400', color: MUTED_C, marginTop: 2, lineHeight: 17 },
  divider:       { height: 1 },
  fieldLabel:    { fontSize: 13, fontWeight: '500', color: TEXT_C },
  input:         { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '400', backgroundColor: '#FAFAFA' },
  coordRow:      { flexDirection: 'row', gap: 10 },
  hint:          { fontSize: 12, fontWeight: '400', marginTop: -6 },
  infoBanner:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  infoBannerText:{ flex: 1, fontSize: 12, fontWeight: '400', lineHeight: 17 },
  demoRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottomWidth: 1 },
  demoPill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  demoPillText:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  demoEmail:     { fontSize: 13, fontWeight: '600', color: TEXT_C },
  demoPw:        { fontSize: 12, fontWeight: '400' },
  saveBtn:       { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:   { color: '#fff', fontSize: 16, fontWeight: '600' },
  addBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 4 },
  addBtnText:    { color: '#fff', fontSize: 15, fontWeight: '600' },
  chip:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  chipText:      { fontSize: 12, fontWeight: '500' },
  switchRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalTitle:    { fontSize: 16, fontWeight: '700', color: TEXT_C },
  modalCancel:   { fontSize: 15, fontWeight: '400' },
  modalSave:     { fontSize: 15, fontWeight: '700' },
  errorText:     { fontSize: 13, fontWeight: '400', textAlign: 'center' },
  rewardHeader:  { flexDirection: 'row', alignItems: 'flex-start' },
  rewardName:    { fontSize: 15, fontWeight: '600', color: TEXT_C },
  rewardDesc:    { fontSize: 12, fontWeight: '400', color: MUTED_C },
  rewardPts:     { fontSize: 14, fontWeight: '700' },
  rewardMeta:    { flexDirection: 'row', gap: 6 },
  rewardMetaText:{ fontSize: 11, fontWeight: '400', color: MUTED_C },
  rewardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontWeight: '600' },
  annHeader:     { flexDirection: 'row', alignItems: 'flex-start' },
  annTitle:      { fontSize: 14, fontWeight: '700', color: TEXT_C },
  annBody:       { fontSize: 13, fontWeight: '400', color: '#6B7280', lineHeight: 18 },
  annDate:       { fontSize: 11, fontWeight: '400', color: MUTED_C, marginLeft: 'auto' as any },
});
