import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WHITE, BLUE, DARK, MID, MUTED, BORDER } from './types';

type PrinterStatusModalProps = {
  visible: boolean;
  onClose: () => void;
  store: {
    printerIp?: string | null;
    printerPort?: number | null;
    printerBrand?: 'epson' | 'star' | null;
    autoDrawer?: boolean | null;
    autoPrint?: boolean | null;
    drawerPin?: 0 | 1 | null;
  } | null;
  lastDrawerSuccessAt: Date | null;
  onOpenDrawer: () => Promise<void>;
  busy: boolean;
};

export default function PrinterStatusModal({
  visible,
  onClose,
  store,
  lastDrawerSuccessAt,
  onOpenDrawer,
  busy,
}: PrinterStatusModalProps) {
  const printerIp = store?.printerIp?.trim() ?? '';
  const printerPort = store?.printerPort ?? 9100;
  const brand = store?.printerBrand === 'star' ? 'Star' : 'Epson';
  const drawerPin = (store?.drawerPin ?? 0) === 1 ? 'Pin 1' : 'Pin 0';
  const lastPulse = lastDrawerSuccessAt ? lastDrawerSuccessAt.toLocaleString() : 'Not yet';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }} onPress={onClose}>
        <View
          onStartShouldSetResponder={() => true}
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: WHITE,
            borderRadius: 22,
            padding: 18,
            gap: 14,
            borderWidth: 1,
            borderColor: BORDER,
            shadowColor: DARK,
            shadowOpacity: 0.12,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="printer" size={18} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: DARK }}>Printer & Drawer</Text>
                <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Status for this Shop Display</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={MID} />
            </Pressable>
          </View>

          <View style={{ gap: 10 }}>
            {[
              ['IP Address', printerIp || 'Not configured'],
              ['Port', String(printerPort)],
              ['Brand', brand],
              ['Drawer Pin', drawerPin],
              ['Auto Drawer', store?.autoDrawer ? 'Enabled' : 'Off'],
              ['Auto Print', store?.autoPrint ? 'Enabled' : 'Off'],
              ['Last Successful Pulse', lastPulse],
            ].map(([label, value]) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }}>
                <Text style={{ fontSize: 13, color: MUTED, fontWeight: '600' }}>{label}</Text>
                <Text style={{ fontSize: 13, color: MID, fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={onOpenDrawer}
              disabled={busy || !printerIp}
              style={({ pressed }) => [
                {
                  flex: 1,
                  backgroundColor: printerIp ? BLUE : '#CBD5E1',
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                },
                (pressed || busy || !printerIp) && { opacity: 0.7 },
              ]}
            >
              {busy ? <ActivityIndicator color={WHITE} size="small" /> : <Feather name="unlock" size={16} color={WHITE} />}
              <Text style={{ color: WHITE, fontSize: 15, fontWeight: '800' }}>{busy ? 'Opening…' : 'Open Drawer'}</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 18,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: BORDER,
                  justifyContent: 'center',
                  alignItems: 'center',
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={{ color: MID, fontSize: 15, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
