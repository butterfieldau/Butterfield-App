import { StyleSheet } from 'react-native';
import { BG, BLUE, BORDER, CARD, GLASS_BG, GLASS_BORDER, MUTED, NAVY } from './directorColors';

const TEXT  = '#1C1C1E';
const GREEN = '#22C55E';

export const styles = StyleSheet.create({
  tabChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  tabChipText:   { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  addStrip:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  addStripLabel: { fontSize: 12, fontWeight: '500' as const },
  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  addBtnText:    { fontSize: 12, fontWeight: '600' as const },
  userCard:      { borderRadius: 14, borderWidth: 1, overflow: 'hidden' as const },
  userTop:       { flexDirection: 'row', gap: 12, padding: 14 },
  avatar:        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:    { fontSize: 16, fontWeight: '700' as const },
  nameRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName:      { fontSize: 15, fontWeight: '700' as const, color: TEXT },
  rolePill:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  rolePillText:  { fontSize: 10, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  userEmail:     { fontSize: 13, fontWeight: '400' as const, color: MUTED },
  userDate:      { fontSize: 11, fontWeight: '400' as const, color: MUTED },
  subRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, padding: 12, paddingHorizontal: 14 },
  subTitle:      { fontSize: 13, fontWeight: '600' as const, color: TEXT },
  subSub:        { fontSize: 12, fontWeight: '400' as const },
});

export const modal = StyleSheet.create({
  header:         { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 20, borderBottomWidth: 1 },
  closeBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:          { fontSize: 16, fontWeight: '700' as const },
  roleBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  roleBannerText: { flex: 1, fontSize: 13, fontWeight: '500' as const },
  sectionLabel:   { fontSize: 11, fontWeight: '600' as const, letterSpacing: 1.2, marginTop: 2 },
  inputRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12, backgroundColor: BG },
  input:          { flex: 1, fontSize: 15, fontWeight: '400' as const },
  toggleRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderRadius: 12, backgroundColor: BG },
  toggleLabel:    { fontSize: 14, fontWeight: '600' as const },
  toggleSub:      { fontSize: 12, fontWeight: '400' as const, marginTop: 2 },
  errorBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: '#FEF2F2', borderRadius: 10 },
  errorText:      { flex: 1, fontSize: 13 },
  submitBtn:      { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' as const },
  chip:           { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  chipText:       { fontSize: 13, fontWeight: '500' as const },
});

export const wdl = StyleSheet.create({
  header:          { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  closeBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:           { fontSize: 16, fontWeight: '700' as const, color: TEXT },
  statusBadge:     { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1, marginTop: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' as const },
  card:            { backgroundColor: GLASS_BG, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: GLASS_BORDER, gap: 0, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  sectionLabel:    { fontSize: 11, fontWeight: '600' as const, letterSpacing: 1.2, color: MUTED, marginBottom: 8 },
  infoRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  infoLabel:       { color: MUTED, fontWeight: '400' as const, fontSize: 13 },
  infoValue:       { color: TEXT, fontWeight: '500' as const, fontSize: 13, maxWidth: '55%', textAlign: 'right' as const },
  statusBtn:       { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  statusBtnText:   { fontSize: 13, fontWeight: '600' as const },
  fieldNote:       { fontSize: 12, fontWeight: '400' as const, color: MUTED, marginBottom: 10, lineHeight: 17 },
  fieldLabel:      { fontSize: 12, fontWeight: '600' as const, color: MUTED, marginBottom: 6 },
  inputRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12, backgroundColor: '#EFF6FF' },
  input:           { flex: 1, fontSize: 15, fontWeight: '400' as const },
  saveBtn:         { height: 54, borderRadius: 14, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' as const },
});
