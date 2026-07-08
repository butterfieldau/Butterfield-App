import { StyleSheet } from 'react-native';
import {
  TEXT, TEXT_MUTED, BORDER, SURFACE, SURFACE_RAISED,
} from './commandCenterColors';

export const styles = StyleSheet.create({
  filterChip:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  dateBar:        { flexDirection: 'row', borderBottomWidth: 1 },
  dateTab:        { flex: 1, alignItems: 'center', paddingVertical: 12 },
  dayChip:        { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, minWidth: 80 },
  orderCard:      { marginBottom: 10 },
  orderCardAccent:{ borderRadius: 16, padding: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE_RAISED },
  orderCardTop:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  orderId:        { fontSize: 14, fontWeight: '700', color: TEXT },
  printMiniBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  printMiniBtnTxt:{ color: '#fff', fontWeight: '600', fontSize: 10 },
  sectionHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  sectionHeaderText: { fontSize: 16, fontWeight: '700', color: TEXT, flex: 1 },
  emptySection:   { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyText:      { color: TEXT_MUTED, fontWeight: '400', fontSize: 14 },
  modalHeader:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  modalTitle:     { fontSize: 17, fontWeight: '700', color: TEXT },
  closeBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center' },
  section:        { backgroundColor: SURFACE_RAISED, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionLabel:   { fontSize: 11, fontWeight: '600', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusPill:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start' },
  statusPillText: { fontSize: 13, fontWeight: '600' },
  updateStatusBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  printBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, marginHorizontal: 16, marginTop: 2 },
  detailRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailText:     { color: TEXT, fontWeight: '400', fontSize: 14, lineHeight: 20 },
  itemRow:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 10, gap: 8 },
});
