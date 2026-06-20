import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { getToken } from '@/lib/api';
import { dl } from './reportStyles';
import { BLUE, BORDER, MUTED } from './directorColors';
import { toYMD, fmtDisplayDate } from './reportHelpers';

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : 'http://localhost:80/api';

interface DownloadModalProps { visible: boolean; onClose: () => void }

export default function DownloadReportModal({ visible, onClose }: DownloadModalProps) {
  const today = new Date();
  const [fromStr, setFromStr] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return toYMD(d); });
  const [toStr, setToStr] = useState(() => toYMD(today));
  const [loading, setLoading] = useState(false);

  const PRESETS = [
    { label: 'Last 7 days',  from: () => { const d = new Date(); d.setDate(d.getDate() - 7);  return toYMD(d); }, to: () => toYMD(today) },
    { label: 'Last 30 days', from: () => { const d = new Date(); d.setDate(d.getDate() - 30); return toYMD(d); }, to: () => toYMD(today) },
    { label: 'This month',   from: () => { const d = new Date(today.getFullYear(), today.getMonth(), 1); return toYMD(d); }, to: () => toYMD(today) },
    { label: 'This year',    from: () => `${today.getFullYear()}-01-01`, to: () => toYMD(today) },
  ];

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
        a.href = objUrl; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
      } else {
        const res2 = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
        if (!res2.ok) throw new Error(await res2.text());
        const buf = await res2.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const xlsxFile = new (FileSystem as any).File((FileSystem as any).Paths.cache, filename);
        xlsxFile.write(bytes);
        const fileUri = xlsxFile.uri;
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
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (e: any) {
      Alert.alert('Download Failed', e?.message ?? 'Unknown error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={dl.container}>
          <View style={dl.header}>
            <View style={dl.headerLeft}>
              <View style={dl.iconBox}><Feather name="download" size={18} color={BLUE} /></View>
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
            <View style={{ gap: 8 }}>
              <Text style={dl.sectionLabel}>QUICK RANGE</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PRESETS.map(p => (
                  <Pressable key={p.label} onPress={() => { setFromStr(p.from()); setToStr(p.to()); Haptics.selectionAsync(); }}
                    style={[dl.preset, fromStr === p.from() && toStr === p.to() && dl.presetActive]}>
                    <Text style={[dl.presetText, fromStr === p.from() && toStr === p.to() && { color: '#fff' }]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ gap: 12 }}>
              <Text style={dl.sectionLabel}>CUSTOM DATE RANGE</Text>
              <View style={dl.dateRow}>
                <Text style={dl.dateLabel}>From</Text>
                <View style={dl.dateInputWrap}>
                  <Feather name="calendar" size={15} color={MUTED} />
                  <TextInput style={dl.dateInput} value={fromStr} onChangeText={setFromStr}
                    placeholder="YYYY-MM-DD" placeholderTextColor={MUTED} keyboardType="numbers-and-punctuation" autoCorrect={false} editable={!loading} />
                  {fromStr ? <Text style={dl.dateParsed} numberOfLines={1}>{fmtDisplayDate(fromStr)}</Text> : null}
                </View>
              </View>
              <View style={dl.dateRow}>
                <Text style={dl.dateLabel}>To</Text>
                <View style={dl.dateInputWrap}>
                  <Feather name="calendar" size={15} color={MUTED} />
                  <TextInput style={dl.dateInput} value={toStr} onChangeText={setToStr}
                    placeholder="YYYY-MM-DD" placeholderTextColor={MUTED} keyboardType="numbers-and-punctuation" autoCorrect={false} editable={!loading} />
                  {toStr ? <Text style={dl.dateParsed} numberOfLines={1}>{fmtDisplayDate(toStr)}</Text> : null}
                </View>
              </View>
            </View>
          </ScrollView>
          <View style={[dl.footer, { borderTopColor: BORDER }]}>
            <Pressable onPress={onClose} style={dl.cancelBtn} disabled={loading}><Text style={dl.cancelText}>Cancel</Text></Pressable>
            <Pressable onPress={handleDownload} style={[dl.downloadBtn, loading && { opacity: 0.7 }]} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="download" size={16} color="#fff" />}
              <Text style={dl.downloadText}>{loading ? 'Generating…' : 'Download Excel'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
