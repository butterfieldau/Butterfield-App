import { StyleSheet } from 'react-native';
import { BG, BLUE, BORDER, CARD, MUTED, NAVY, RED, TEXT } from './directorColors';

export const row = StyleSheet.create({
  wrap:           { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD },
  border:         { borderBottomWidth: 1, borderBottomColor: BORDER },
  avatarImage:    { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF3FF' },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center' },
  avatarText:     { fontSize: 15, fontWeight: '700', color: BLUE },
  name:           { fontSize: 15, fontWeight: '700', color: TEXT },
  meta:           { fontSize: 12, color: MUTED },
});

export const scr = StyleSheet.create({
  searchBar:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42 },
  filterBtn:         { width: 44, height: 44, borderRadius: 12, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  filterBadge:       { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  toolBtn:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 36, borderRadius: 10, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  toolBtnActive:     { backgroundColor: '#000', borderColor: '#000' },
  toolBtnText:       { fontSize: 13, fontWeight: '600', color: MUTED },
  toolBtnTextActive: { color: '#fff' },
  chip:              { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  chipActive:        { backgroundColor: '#000', borderColor: '#000' },
  chipText:          { fontSize: 13, fontWeight: '600', color: MUTED },
  chipTextActive:    { color: '#fff' },
});

export const fp = StyleSheet.create({
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD },
  title:          { fontSize: 16, fontWeight: '700', color: TEXT },
  filterLabel:    { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  chip:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  chipActive:     { backgroundColor: '#000', borderColor: '#000' },
  chipText:       { fontSize: 13, fontWeight: '600', color: MUTED },
  chipTextActive: { color: '#fff' },
});

export const det = StyleSheet.create({
  headerBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  input:      { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT },
  actionBtn:  { backgroundColor: BLUE, borderRadius: 12, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
