import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';

const DARK  = '#0D0604';
const GREEN  = '#16A34A';
const AMBER  = '#F59E0B';
const WHITE  = '#FFFFFF';
const MUTED  = '#8E8E93';

const STAMP_GOAL = 6;
const SCAN_COOLDOWN_MS = 2500;

type ScanResult = {
  customerName: string;
  stampCount: number;
  earnedFree: boolean;
};

export function StampScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const lastScanAt = useRef<number>(0);

  const handleBarcode = useCallback(async ({ data }: { data: string }) => {
    const now = Date.now();
    if (now - lastScanAt.current < SCAN_COOLDOWN_MS) return;
    lastScanAt.current = now;

    if (!data.startsWith('BUTTERFIELD:')) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Not a Butterfield QR code. Ask the customer to open their Rewards card.');
      setResult(null);
      return;
    }

    setScanning(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.loyalty.scanStamp(data);
      const { stampCount, earnedFree, customerName } = res.data;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult({ customerName, stampCount, earnedFree });
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e?.message ?? 'Could not record stamp. Try again.');
    } finally {
      setScanning(false);
    }
  }, []);

  const reset = () => {
    setResult(null);
    setError(null);
    lastScanAt.current = 0;
  };

  if (!permission) {
    return <View style={s.center}><ActivityIndicator color={WHITE} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[s.center, { paddingTop: insets.top + 20 }]}>
        <Feather name="camera-off" size={48} color={MUTED} />
        <Text style={s.permTitle}>Camera access needed</Text>
        <Text style={s.permSub}>Allow camera access so you can scan customer loyalty QR codes.</Text>
        <Pressable style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnTx}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  if (result) {
    const displayCount = result.earnedFree ? STAMP_GOAL : result.stampCount;
    return (
      <View style={[s.root, { paddingTop: insets.top + 20 }]}>
        <View style={[s.resultCard, result.earnedFree && { borderColor: AMBER, borderWidth: 2 }]}>
          <View style={[s.resultIcon, { backgroundColor: result.earnedFree ? AMBER : GREEN }]}>
            <Feather name={result.earnedFree ? 'gift' : 'coffee'} size={36} color={WHITE} />
          </View>

          {result.earnedFree ? (
            <>
              <Text style={s.resultHeadline}>Free coffee earned! ☕</Text>
              <Text style={s.resultSub}>{result.customerName} has completed their stamp card.</Text>
              <Text style={s.resultSub}>Stamp card reset — ready for their next 6 coffees.</Text>
            </>
          ) : (
            <>
              <Text style={s.resultHeadline}>Stamp added ✓</Text>
              <Text style={s.resultSub}>{result.customerName}</Text>
            </>
          )}

          <View style={s.dotsRow}>
            {Array.from({ length: STAMP_GOAL }).map((_, i) => (
              <View
                key={i}
                style={[
                  s.dot,
                  i < displayCount
                    ? { backgroundColor: result.earnedFree ? AMBER : GREEN }
                    : { backgroundColor: '#E5E5EA' },
                ]}
              >
                {i < displayCount && <Feather name="coffee" size={11} color={WHITE} />}
              </View>
            ))}
          </View>

          {!result.earnedFree && (
            <Text style={s.dotLabel}>
              {result.stampCount} of {STAMP_GOAL} stamps
              {' · '}{STAMP_GOAL - result.stampCount} to go
            </Text>
          )}

          <Pressable style={s.scanAgainBtn} onPress={reset}>
            <Feather name="maximize" size={16} color={WHITE} />
            <Text style={s.scanAgainTx}>Scan next customer</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanning ? undefined : handleBarcode}
      />

      <View style={[s.overlay, { height: insets.top + 80 }]} />

      <View style={[s.titleRow, { top: insets.top + 16 }]}>
        <Feather name="maximize" size={20} color={WHITE} />
        <Text style={s.titleTx}>Scan Customer QR</Text>
      </View>

      <View style={s.frameWrap}>
        <View style={s.frame}>
          <View style={[s.corner, s.cornerTL]} />
          <View style={[s.corner, s.cornerTR]} />
          <View style={[s.corner, s.cornerBL]} />
          <View style={[s.corner, s.cornerBR]} />
          {scanning && (
            <View style={s.scanningOverlay}>
              <ActivityIndicator color={WHITE} size="large" />
              <Text style={{ color: WHITE, fontFamily: 'Inter_500Medium', marginTop: 10 }}>Recording stamp…</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[s.overlay, { flex: 1 }]}>
        {error ? (
          <View style={s.errorBox}>
            <Feather name="alert-circle" size={18} color="#FCA5A5" />
            <Text style={s.errorTx}>{error}</Text>
          </View>
        ) : (
          <Text style={s.hint}>
            Ask the customer to open{'\n'}their Rewards card and tap "My QR"
          </Text>
        )}
      </View>
    </View>
  );
}

const FRAME = 260;
const CORNER = 28;
const CORNER_W = 4;

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },
  center:  { flex: 1, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },

  permTitle:  { color: WHITE, fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center', marginTop: 16 },
  permSub:    { color: MUTED, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  permBtn:    { backgroundColor: '#40C0F2', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 13, marginTop: 8 },
  permBtnTx:  { color: WHITE, fontFamily: 'Inter_700Bold', fontSize: 15 },

  overlay:   { backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center' },
  titleRow:  { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 10 },
  titleTx:   { color: WHITE, fontSize: 17, fontFamily: 'Inter_700Bold' },

  frameWrap: { alignItems: 'center', justifyContent: 'center', width: '100%', aspectRatio: 1 },
  frame:     { width: FRAME, height: FRAME, alignItems: 'center', justifyContent: 'center' },

  corner:    { position: 'absolute', width: CORNER, height: CORNER, borderColor: WHITE },
  cornerTL:  { top: 0, left: 0,  borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W,  borderTopLeftRadius: 6 },
  cornerTR:  { top: 0, right: 0, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderTopRightRadius: 6 },
  cornerBL:  { bottom: 0, left: 0,  borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W,  borderBottomLeftRadius: 6 },
  cornerBR:  { bottom: 0, right: 0, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderBottomRightRadius: 6 },

  scanningOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderRadius: 6 },

  hint:     { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22, paddingHorizontal: 32 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(239,68,68,0.18)', borderRadius: 12, padding: 14, marginHorizontal: 24 },
  errorTx:  { flex: 1, color: '#FCA5A5', fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },

  resultCard:    { backgroundColor: '#1C1C1E', borderRadius: 24, padding: 28, marginHorizontal: 24, alignItems: 'center', gap: 10, borderColor: 'transparent', borderWidth: 2 },
  resultIcon:    { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  resultHeadline:{ color: WHITE, fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  resultSub:     { color: MUTED, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  dotsRow:       { flexDirection: 'row', gap: 8, marginTop: 8 },
  dot:           { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dotLabel:      { color: MUTED, fontSize: 13, fontFamily: 'Inter_400Regular' },
  scanAgainBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#40C0F2', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13, marginTop: 8 },
  scanAgainTx:   { color: WHITE, fontFamily: 'Inter_700Bold', fontSize: 15 },
});
