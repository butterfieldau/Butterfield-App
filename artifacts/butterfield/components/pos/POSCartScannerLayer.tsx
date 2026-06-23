import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BLUE, MID } from './types';

const SCANNER_GREEN = '#22C55E';
const SCANNER_GREY  = '#9CA3AF';
const BLUE_BG       = '#EEF2FF';
const GREY_BG       = '#F3F4F6';

export interface POSCartScannerLayerRef {
  focus: () => void;
}

interface Props {
  attachCustomerToCart: (qrValue: string) => Promise<void>;
  openCameraScanner: () => void;
  anyModalOpen: boolean;
}

const POSCartScannerLayer = forwardRef<POSCartScannerLayerRef, Props>(
  function POSCartScannerLayer({ attachCustomerToCart, openCameraScanner, anyModalOpen }, ref) {
    const inputRef      = useRef<TextInput>(null);
    const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scanLockRef   = useRef(false);
    const lastScanRef   = useRef<{ value: string; time: number } | null>(null);
    // Prevents onBlur auto-refocus from stealing focus from notes/code inputs
    const ignoreBlurRef = useRef(false);

    const [scanValue, setScanValue]       = useState('');
    const [scannerReady, setScannerReady] = useState(false);

    // ── Focus helpers ─────────────────────────────────────────────────────────
    const focusScanner = useCallback((opts?: { skipModalCheck?: boolean }) => {
      if (anyModalOpen && !opts?.skipModalCheck) return;
      ignoreBlurRef.current = true;
      inputRef.current?.focus();
      Keyboard.dismiss();
      setScannerReady(true);
      setTimeout(() => { ignoreBlurRef.current = false; }, 300);
    }, [anyModalOpen]);

    useImperativeHandle(ref, () => ({ focus: () => focusScanner({ skipModalCheck: false }) }), [focusScanner]);

    // Focus when the POS screen tab gets focus
    useFocusEffect(
      useCallback(() => {
        const t = setTimeout(() => focusScanner({ skipModalCheck: false }), 100);
        return () => {
          clearTimeout(t);
          setScannerReady(false);
        };
      }, [focusScanner]),
    );

    // Refocus when a modal closes
    useEffect(() => {
      if (!anyModalOpen) {
        const t = setTimeout(() => focusScanner({ skipModalCheck: true }), 150);
        return () => clearTimeout(t);
      }
    }, [anyModalOpen, focusScanner]);

    // ── Scan processing ───────────────────────────────────────────────────────
    const clean = (v: string) => v.replace(/[\n\r]/g, '').trim();
    const looksLikeQR = (v: string) => clean(v).length >= 8;

    const processScan = useCallback(async (raw: string) => {
      const value = clean(raw);
      if (!value || !looksLikeQR(value)) return;

      // 2-second dedup — prevents duplicate scans from a single physical swipe
      const now  = Date.now();
      const last = lastScanRef.current;
      if (last && last.value === value && now - last.time < 2000) {
        setScanValue('');
        focusScanner({ skipModalCheck: false });
        return;
      }
      if (scanLockRef.current) return;

      scanLockRef.current = true;
      lastScanRef.current = { value, time: now };
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      try {
        await attachCustomerToCart(value);
      } catch {
        // Banner is shown inside attachCustomerToCart
      } finally {
        setScanValue('');
        setTimeout(() => {
          scanLockRef.current = false;
          focusScanner({ skipModalCheck: false });
        }, 400);
      }
    }, [attachCustomerToCart, focusScanner]);

    // 80ms debounce — fallback for scanners that don't send Enter/Return
    const handleChangeText = useCallback((text: string) => {
      setScanValue(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (looksLikeQR(text)) processScan(text);
      }, 80);
    }, [processScan]);

    const handleSubmit = useCallback(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      processScan(scanValue);
    }, [processScan, scanValue]);

    const handleBlur = useCallback(() => {
      setScannerReady(false);
      if (ignoreBlurRef.current || anyModalOpen) return;
      // Gently reclaim focus after other inputs blur.
      // 250ms lets any newly-focused input settle — we won't steal from it
      // because ignoreBlurRef won't be set (they don't use this guard).
      setTimeout(() => {
        if (!ignoreBlurRef.current && !anyModalOpen) focusScanner({ skipModalCheck: false });
      }, 250);
    }, [anyModalOpen, focusScanner]);

    useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

    return (
      <View style={styles.wrapper}>
        <TextInput
          ref={inputRef}
          value={scanValue}
          onChangeText={handleChangeText}
          onSubmitEditing={handleSubmit}
          onFocus={() => setScannerReady(true)}
          onBlur={handleBlur}
          autoCorrect={false}
          autoCapitalize="none"
          caretHidden
          blurOnSubmit={false}
          submitBehavior="submit"
          showSoftInputOnFocus={false}
          keyboardType="default"
          importantForAccessibility="no-hide-descendants"
          style={styles.hiddenInput}
        />
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: scannerReady ? SCANNER_GREEN : SCANNER_GREY }]} />
          <Text style={styles.statusText}>{scannerReady ? 'Scanner Ready' : 'Tap Scan QR'}</Text>
          <Pressable
            onPress={() => focusScanner({ skipModalCheck: false })}
            style={styles.scanBtn}
            hitSlop={8}
          >
            <Feather name="maximize" size={11} color={BLUE} />
            <Text style={styles.scanBtnText}>Scan QR</Text>
          </Pressable>
          <Pressable onPress={openCameraScanner} style={styles.cameraBtn} hitSlop={8}>
            <Feather name="camera" size={11} color={MID} />
            <Text style={styles.cameraBtnText}>Camera</Text>
          </Pressable>
        </View>
      </View>
    );
  },
);

export default POSCartScannerLayer;

const styles = StyleSheet.create({
  wrapper:       { width: '100%', paddingVertical: 5, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  hiddenInput:   { position: 'absolute', width: 1, height: 1, opacity: 0, left: -300, top: -300 },
  statusRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot:           { width: 7, height: 7, borderRadius: 99 },
  statusText:    { fontSize: 11, fontWeight: '600', color: MID, flex: 1 },
  scanBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: BLUE_BG },
  scanBtnText:   { fontSize: 11, fontWeight: '700', color: BLUE },
  cameraBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: GREY_BG },
  cameraBtnText: { fontSize: 11, fontWeight: '700', color: MID },
});
