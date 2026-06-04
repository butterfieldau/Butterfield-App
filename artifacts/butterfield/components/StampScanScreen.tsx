import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';

const DARK  = '#0D0604';
const GREEN  = '#16A34A';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';
const WHITE  = '#FFFFFF';
const MUTED  = '#8E8E93';

const STAMP_GOAL = 6;
const SCAN_COOLDOWN_MS = 2500;

type ScanResult = {
  customerId?: string;
  customerName: string;
  customerEmail: string;
  loyaltyPoints: number;
  stampCount: number;
  freeCoffeeRewards: number;
  stampsUntilNextFreeCoffee?: number;
  recentActivity?: Array<{ id: string; description: string; createdAt: string }>;
  qrPayload?: string | null;
  earnedFree?: boolean;
  justRedeemed?: boolean;
};

export function StampScanScreen({ externalScanData = null, onExternalScanHandled }: {
  externalScanData?: string | null;
  onExternalScanHandled?: () => void;
} = {}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning]   = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [result, setResult]       = useState<ScanResult | null>(null);
  const [error, setError]         = useState<string | null>(null);
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
      const res = await api.loyalty.lookupCustomer(data);
      const {
        customerId,
        stampCount,
        freeCoffeeRewards,
        customerName,
        customerEmail,
        loyaltyPoints,
        qrPayload,
        stampsUntilNextFreeCoffee,
        recentActivity,
      } = res.data;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult({
        customerId,
        customerName,
        customerEmail,
        loyaltyPoints,
        stampCount,
        freeCoffeeRewards,
        qrPayload,
        stampsUntilNextFreeCoffee,
        recentActivity,
      });
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e?.message ?? 'Could not look up customer. Try again.');
    } finally {
      setScanning(false);
    }
  }, []);

  // Process data fed by Bluetooth HID scanner (passed from scan.tsx parent)
  useEffect(() => {
    if (!externalScanData) return;
    void handleBarcode({ data: externalScanData });
    onExternalScanHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalScanData]);

  const reset = () => {
    setResult(null);
    setError(null);
    lastScanAt.current = 0;
  };

  const addStamp = useCallback(async (force = false) => {
    if (!result) return;
    const payload = result.qrPayload ?? '';
    if (!payload) { setError('This QR code is missing a loyalty token.'); return; }
    setScanning(true);
    setError(null);
    try {
      const res = await api.loyalty.addCoffeeStamp(payload, 1, force);
      const updated = res.data;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult({
        customerId:         updated.customerId,
        customerName:       updated.customerName,
        customerEmail:      updated.customerEmail,
        loyaltyPoints:      updated.loyaltyPoints,
        stampCount:         updated.stampCount,
        freeCoffeeRewards:  updated.freeCoffeeRewards,
        qrPayload:          updated.qrPayload ?? payload,
        stampsUntilNextFreeCoffee: updated.stampsUntilNextFreeCoffee,
        recentActivity:     updated.recentActivity,
        earnedFree:         updated.earnedFree,
      });
    } catch (e: any) {
      if (e?.body?.code === 'DUPLICATE_STAMP_WINDOW' && !force) {
        Alert.alert(
          'Add another stamp?',
          'A stamp was already added for this customer in the last 30 seconds. Only continue if you have confirmed another eligible coffee purchase.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Anyway', onPress: () => void addStamp(true) },
          ],
        );
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e?.message ?? 'Could not record stamp. Try again.');
    } finally {
      setScanning(false);
    }
  }, [result]);

  const confirmRedeemFreeCoffee = useCallback(() => {
    if (!result || result.freeCoffeeRewards < 1) return;
    Alert.alert(
      'Redeem Free Coffee',
      `${result.customerName} has ${result.freeCoffeeRewards} free coffee${result.freeCoffeeRewards !== 1 ? 's' : ''} available.\n\nMark 1 as used now?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, redeem',
          style: 'destructive',
          onPress: redeemFreeCoffee,
        },
      ],
    );
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const redeemFreeCoffee = useCallback(async () => {
    if (!result) return;
    const payload = result.qrPayload ?? '';
    if (!payload) { setError('This QR code is missing a loyalty token.'); return; }
    setRedeeming(true);
    setError(null);
    try {
      const res = await api.loyalty.useFreeCoffee(payload);
      const updated = res.data;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult({
        customerId:         updated.customerId,
        customerName:       updated.customerName,
        customerEmail:      updated.customerEmail,
        loyaltyPoints:      updated.loyaltyPoints ?? 0,
        stampCount:         updated.stampCount,
        freeCoffeeRewards:  updated.freeCoffeeRewards,
        qrPayload:          updated.qrPayload ?? payload,
        stampsUntilNextFreeCoffee: updated.stampsUntilNextFreeCoffee,
        recentActivity:     updated.recentActivity,
        justRedeemed:       true,
      });
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e?.message ?? 'Could not redeem free coffee. Try again.');
    } finally {
      setRedeeming(false);
    }
  }, [result]);

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
    const displayCount  = result.earnedFree ? STAMP_GOAL : result.stampCount;
    const busy          = scanning || redeeming;

    return (
      <View style={[s.root, { paddingTop: insets.top + 20 }]}>
        <View style={[
          s.resultCard,
          result.earnedFree    && { borderColor: AMBER, borderWidth: 2 },
          result.justRedeemed  && { borderColor: GREEN, borderWidth: 2 },
        ]}>
          <View style={[s.resultIcon, {
            backgroundColor: result.justRedeemed ? GREEN : result.earnedFree ? AMBER : '#1493FF',
          }]}>
            <Feather
              name={result.justRedeemed ? 'check-circle' : result.earnedFree ? 'gift' : 'coffee'}
              size={36}
              color={WHITE}
            />
          </View>

          <Text style={s.resultHeadline}>{result.customerName}</Text>
          <Text style={s.resultSub}>{result.customerEmail}</Text>
          {!!result.customerId && <Text style={s.resultMeta}>Customer ID: {result.customerId.slice(0, 8).toUpperCase()}</Text>}

          {/* Stats row */}
          <View style={s.statsRow}>
            <View style={s.statChip}>
              <Text style={s.statLabel}>Points</Text>
              <Text style={s.statValue}>{(result.loyaltyPoints ?? 0).toLocaleString()}</Text>
            </View>
            <View style={s.statChip}>
              <Text style={s.statLabel}>Stamps</Text>
              <Text style={s.statValue}>{result.stampCount}/{STAMP_GOAL}</Text>
            </View>
            <View style={[s.statChip, result.freeCoffeeRewards > 0 && { borderColor: AMBER, borderWidth: 1 }]}>
              <Text style={s.statLabel}>Free coffees</Text>
              <Text style={[s.statValue, result.freeCoffeeRewards > 0 && { color: AMBER }]}>
                {result.freeCoffeeRewards}
              </Text>
            </View>
            <View style={s.statChip}>
              <Text style={s.statLabel}>To next free</Text>
              <Text style={s.statValue}>{result.stampsUntilNextFreeCoffee ?? Math.max(0, STAMP_GOAL - result.stampCount)}</Text>
            </View>
          </View>

          {/* Status message */}
          {result.justRedeemed ? (
            <View style={[s.bannerBox, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }]}>
              <Feather name="check-circle" size={15} color={GREEN} />
              <Text style={[s.bannerText, { color: '#166534' }]}>
                Free coffee marked as used. {result.freeCoffeeRewards} remaining.
              </Text>
            </View>
          ) : result.earnedFree ? (
            <View style={[s.bannerBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
              <Feather name="gift" size={15} color={AMBER} />
              <Text style={[s.bannerText, { color: '#92400E' }]}>
                Free coffee earned! Stamp card reset.
              </Text>
            </View>
          ) : result.freeCoffeeRewards > 0 ? (
            <View style={[s.bannerBox, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
              <Feather name="alert-circle" size={15} color="#F97316" />
              <Text style={[s.bannerText, { color: '#9A3412' }]}>
                Customer has {result.freeCoffeeRewards} free coffee{result.freeCoffeeRewards !== 1 ? 's' : ''} to redeem.
              </Text>
            </View>
          ) : (
            <Text style={s.resultSub}>Tap below to add a stamp for today's coffee.</Text>
          )}

          {/* Stamp dots */}
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

          {!result.earnedFree && !result.justRedeemed && (
            <Text style={s.dotLabel}>
              {result.stampCount} of {STAMP_GOAL} stamps · {result.stampsUntilNextFreeCoffee ?? Math.max(0, STAMP_GOAL - result.stampCount)} to go
            </Text>
          )}

          {/* Action buttons */}
          <View style={s.actionRow}>
            {/* Add stamp */}
            <Pressable
              style={[s.actionBtn, { backgroundColor: '#1493FF' }, busy && s.btnDisabled]}
              onPress={() => { void addStamp(); }}
              disabled={busy}
            >
              {scanning
                ? <ActivityIndicator color={WHITE} size="small" />
                : <Feather name="coffee" size={16} color={WHITE} />
              }
              <Text style={s.actionBtnTx}>Mark coffee purchase</Text>
            </Pressable>

            {/* Redeem free coffee — only shown when rewards > 0 */}
            {result.freeCoffeeRewards > 0 && (
              <Pressable
                style={[s.actionBtn, { backgroundColor: AMBER }, busy && s.btnDisabled]}
                onPress={confirmRedeemFreeCoffee}
                disabled={busy}
              >
                {redeeming
                  ? <ActivityIndicator color={WHITE} size="small" />
                  : <Feather name="gift" size={16} color={WHITE} />
                }
                <Text style={s.actionBtnTx}>
                  Use free coffee ({result.freeCoffeeRewards} available)
                </Text>
              </Pressable>
            )}

            {/* Scan next */}
            <Pressable
              style={[s.actionBtn, { backgroundColor: '#6B7280' }, busy && s.btnDisabled]}
              onPress={reset}
              disabled={busy}
            >
              <Feather name="maximize" size={16} color={WHITE} />
              <Text style={s.actionBtnTx}>Scan next customer</Text>
            </Pressable>
          </View>

          {result.recentActivity?.length ? (
            <View style={s.activityCard}>
              <Text style={s.activityTitle}>Recent loyalty activity</Text>
              {result.recentActivity.slice(0, 4).map((activity) => (
                <View key={activity.id} style={s.activityRow}>
                  <Text style={s.activityText} numberOfLines={1}>{activity.description}</Text>
                  <Text style={s.activityTime}>
                    {new Date(activity.createdAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {error && (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={16} color="#FCA5A5" />
              <Text style={s.errorTx}>{error}</Text>
            </View>
          )}
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
              <Text style={{ color: WHITE, fontWeight: '500', marginTop: 10 }}>Looking up customer…</Text>
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

  permTitle:  { color: WHITE, fontSize: 20, fontWeight: '700', textAlign: 'center', marginTop: 16 },
  permSub:    { color: MUTED, fontSize: 14, fontWeight: '400', textAlign: 'center', lineHeight: 20 },
  permBtn:    { backgroundColor: '#1493FF', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 13, marginTop: 8 },
  permBtnTx:  { color: WHITE, fontWeight: '700', fontSize: 15 },

  overlay:   { backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center' },
  titleRow:  { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 10 },
  titleTx:   { color: WHITE, fontSize: 17, fontWeight: '700' },

  frameWrap: { alignItems: 'center', justifyContent: 'center', width: '100%', aspectRatio: 1 },
  frame:     { width: FRAME, height: FRAME, alignItems: 'center', justifyContent: 'center' },

  corner:    { position: 'absolute', width: CORNER, height: CORNER, borderColor: WHITE },
  cornerTL:  { top: 0, left: 0,  borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W,  borderTopLeftRadius: 6 },
  cornerTR:  { top: 0, right: 0, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderTopRightRadius: 6 },
  cornerBL:  { bottom: 0, left: 0,  borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W,  borderBottomLeftRadius: 6 },
  cornerBR:  { bottom: 0, right: 0, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderBottomRightRadius: 6 },

  scanningOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderRadius: 6 },

  hint:     { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '400', textAlign: 'center', lineHeight: 22, paddingHorizontal: 32 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(239,68,68,0.18)', borderRadius: 12, padding: 14, marginHorizontal: 24, marginTop: 8 },
  errorTx:  { flex: 1, color: '#FCA5A5', fontSize: 13, fontWeight: '400', lineHeight: 20 },

  resultCard:    { backgroundColor: '#1C1C1E', borderRadius: 24, padding: 24, marginHorizontal: 16, alignItems: 'center', gap: 10, borderColor: 'transparent', borderWidth: 2 },
  resultIcon:    { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  resultHeadline:{ color: WHITE, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  resultSub:     { color: MUTED, fontSize: 14, fontWeight: '400', textAlign: 'center', lineHeight: 20 },
  resultMeta:    { color: 'rgba(255,255,255,0.58)', fontSize: 12, fontWeight: '600', textAlign: 'center' },

  statsRow:  { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 4 },
  statChip:  { flex: 1, backgroundColor: '#2B2B2E', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', gap: 2, borderColor: 'transparent', borderWidth: 1 },
  statLabel: { color: '#A1A1AA', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { color: WHITE, fontSize: 17, fontWeight: '700' },

  bannerBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12, alignSelf: 'stretch', borderWidth: 1 },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },

  dotsRow:   { flexDirection: 'row', gap: 8, marginTop: 4 },
  dot:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dotLabel:  { color: MUTED, fontSize: 13, fontWeight: '400' },

  actionRow:    { width: '100%', gap: 10, marginTop: 6 },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14 },
  actionBtnTx:  { color: WHITE, fontWeight: '700', fontSize: 15 },
  btnDisabled:  { opacity: 0.55 },
  activityCard: { width: '100%', gap: 8, marginTop: 6, backgroundColor: '#2B2B2E', borderRadius: 14, padding: 14 },
  activityTitle:{ color: WHITE, fontSize: 14, fontWeight: '700' },
  activityRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  activityText: { flex: 1, color: '#D4D4D8', fontSize: 12 },
  activityTime: { color: MUTED, fontSize: 11, fontWeight: '600' },
});
