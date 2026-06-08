import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PosThresholds } from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#6B7280';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const BLUE   = '#1493FF';

export default function DirectorPosThresholdsScreen() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['director', 'pos-thresholds'],
    queryFn: () => api.director.posThresholds(),
  });

  const thresholds = data?.data;

  const [refundRequiresPin, setRefundRequiresPin] = useState(false);
  const [discountCents, setDiscountCents] = useState('0');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!thresholds) return;
    setRefundRequiresPin(thresholds.refundRequiresPin);
    setDiscountCents(String(thresholds.discountPinThresholdCents));
    setDirty(false);
  }, [thresholds]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: (d: Partial<PosThresholds>) => api.director.updatePosThresholds(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director', 'pos-thresholds'] });
      setDirty(false);
      Alert.alert('Saved', 'POS thresholds updated.');
    },
    onError: () => Alert.alert('Error', 'Failed to save. Please try again.'),
  });

  function handleSave() {
    const cents = parseInt(discountCents) || 0;
    save({ refundRequiresPin, discountPinThresholdCents: cents });
  }

  function centsToDollars(cents: string) {
    const n = parseInt(cents) || 0;
    return `$${(n / 100).toFixed(2)}`;
  }

  if (isLoading) {
    return (
      <DirectorStandaloneScreen title="POS Thresholds">
        <ActivityIndicator color={NAVY} style={{ marginTop: 60 }} />
      </DirectorStandaloneScreen>
    );
  }

  return (
    <DirectorStandaloneScreen title="POS Thresholds" subtitle="Manager PIN gate for sensitive POS actions">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>

          <View style={styles.infoCard}>
            <Feather name="info" size={16} color={BLUE} />
            <Text style={styles.infoText}>
              These settings control when staff must enter a manager PIN before completing a POS action.
              Set a threshold to 0 to disable that gate.
            </Text>
          </View>

          <Text style={styles.sectionLabel}>REFUND GATE</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>Require PIN for all refunds</Text>
                <Text style={styles.rowSub}>Staff must enter a manager PIN before processing any POS refund</Text>
              </View>
              <Switch
                value={refundRequiresPin}
                onValueChange={v => { setRefundRequiresPin(v); setDirty(true); }}
                trackColor={{ false: BORDER, true: RED }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>DISCOUNT GATE</Text>
          <View style={styles.card}>
            <Text style={styles.rowTitle}>Discount PIN threshold</Text>
            <Text style={styles.rowSub}>Require manager PIN when a manual discount exceeds this amount. Set to 0 to disable.</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={discountCents}
                onChangeText={v => { setDiscountCents(v.replace(/[^0-9]/g, '')); setDirty(true); }}
                keyboardType="number-pad"
                placeholder="0"
              />
              <Text style={styles.inputLabel}>cents  =  {centsToDollars(discountCents)}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, (!dirty || isPending) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!dirty || isPending}
          >
            {isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="save" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>CURRENT SETTINGS</Text>
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Feather name="shield" size={14} color={refundRequiresPin ? RED : MUTED} />
              <Text style={styles.statusText}>
                Refund PIN gate: <Text style={{ color: refundRequiresPin ? RED : GREEN }}>
                  {refundRequiresPin ? 'Required' : 'Disabled'}
                </Text>
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Feather name="percent" size={14} color={parseInt(discountCents) > 0 ? RED : MUTED} />
              <Text style={styles.statusText}>
                Discount threshold: <Text style={{ color: parseInt(discountCents) > 0 ? RED : GREEN }}>
                  {parseInt(discountCents) > 0 ? centsToDollars(discountCents) : 'Disabled'}
                </Text>
              </Text>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </DirectorStandaloneScreen>
  );
}

const styles = StyleSheet.create({
  scroll:          { padding: 16, paddingBottom: 80 },
  infoCard:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#BFDBFE' },
  infoText:        { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 19 },
  sectionLabel:    { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 0.8, marginBottom: 8, marginTop: 12 },
  card:            { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  row:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft:         { flex: 1, marginRight: 16 },
  rowTitle:        { fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 3 },
  rowSub:          { fontSize: 13, color: MUTED, lineHeight: 18 },
  inputRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  input:           { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, width: 120, color: TEXT, backgroundColor: '#F9FAFB' },
  inputLabel:      { fontSize: 15, color: MUTED },
  saveBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: NAVY, borderRadius: 14, padding: 16, marginTop: 20, marginBottom: 4 },
  saveBtnDisabled: { backgroundColor: MUTED },
  saveBtnText:     { fontSize: 16, fontWeight: '600', color: '#fff' },
  statusRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  statusText:      { fontSize: 14, color: TEXT },
});
