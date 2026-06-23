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
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BLUE, MID } from './types';

const SCANNER_GREEN = '#22C55E';
const BLUE_BG       = '#EEF2FF';
const GREY_BG       = '#F3F4F6';

export interface POSCartScannerLayerRef {
  focus: () => void;
}

interface Props {
  attachCustomerToCart: (qrValue: string) => Promise<void>;
  openCameraScanner: () => void;
  onAttachCustomer: () => void;
  anyModalOpen: boolean;
}

const POSCartScannerLayer = forwardRef<POSCartScannerLayerRef, Props>(
  function POSCartScannerLayer({ attachCustomerToCart, openCameraScanner, onAttachCustomer, anyModalOpen }, ref) {
    const inputRef        = useRef<TextInput>(null);
    const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scanLockRef     = useRef(false);
    const lastScanRef     = useRef<{ value: string; time: number } | null>(null);
    const ignoreBlurRef   = useRef(false);
    // Keep anyModalOpen in a ref so focusScanner never needs it as a dep.
    // This prevents useFocusEffect from re-running every time a modal opens/closes.
    const anyModalOpenRef = useRef(anyModalOpen);
    anyModalOpenRef.current = anyModalOpen;

    const [scanValue, setScanValue]       = useState('');
    const [scannerReady, setScannerReady] = useState(false);

    // ── Focus helpers ─────────────────────────────────────────────────────────
    // Stable reference (no anyModalOpen dep) — reads the ref at call time.
    const focusScanner = useCallback((opts?: { skipModalCheck?: boolean }) => {
      if (anyModalOpenRef.current && !opts?.skipModalCheck) return;
      ignoreBlurRef.current = true;
      setScannerReady(true);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      setTimeout(() => { ignoreBlurRef.current = false; }, 350);
    }, []); // stable — intentionally no deps

    const blurScanner = useCallback(() => {
      ignoreBlurRef.current = true;
      setScannerReady(false);
      inputRef.current?.blur();
      setTimeout(() => { ignoreBlurRef.current = false; }, 350);
    }, []);

    useImperativeHandle(ref, () => ({ focus: () => focusScanner({ skipModalCheck: false }) }), [focusScanner]);

    // Arm scanner when the POS tab gains navigation focus.
    // Stable focusScanner means this only runs once — not on every modal open/close.
    useFocusEffect(
      useCallback(() => {
        const t = setTimeout(() => focusScanner({ skipModalCheck: false }), 100);
        return () => {
          clearTimeout(t);
          setScannerReady(false);
        };
      }, [focusScanner]),
    );

    // When a modal opens: hard-disarm the scanner so modal TextInputs get keystrokes.
    // When a modal closes: re-arm after a short delay.
    useEffect(() => {
      if (anyModalOpen) {
        ignoreBlurRef.current = true;
        setScannerReady(false);
        inputRef.current?.blur();
        setTimeout(() => { ignoreBlurRef.current = false; }, 350);
      } else {
        const t = setTimeout(() => focusScanner({ skipModalCheck: true }), 200);
        return () => clearTimeout(t);
      }
    }, [anyModalOpen]); // focusScanner is stable so no longer needed as dep

    // ── Scan processing ───────────────────────────────────────────────────────
    const clean = (v: string) => v.replace(/[\n\r]/g, '').trim();
    const looksLikeQR = (v: string) => clean(v).length >= 8;

    const processScan = useCallback(async (raw: string) => {
      const value = clean(raw);
      if (!value || !looksLikeQR(value)) return;

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
      if (ignoreBlurRef.current) return;
      setScannerReady(false);
    }, []);

    useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

    return (
      <View style={styles.wrapper}>
        {/* Zero-size on-screen input — captures Bluetooth HID scanner keystrokes.
            editable={false} when any modal is open: hard gate so keystrokes always
            reach modal TextInputs even if iOS somehow keeps this input focused. */}
        <TextInput
          ref={inputRef}
          value={scanValue}
          onChangeText={handleChangeText}
          onSubmitEditing={handleSubmit}
          onFocus={() => setScannerReady(true)}
          onBlur={handleBlur}
          editable={!anyModalOpen}
          autoCorrect={false}
          autoCapitalize="none"
          caretHidden
          blurOnSubmit={false}
          submitBehavior="submit"
          showSoftInputOnFocus={false}
          keyboardType="default"
          style={styles.hiddenInput}
        />
        <View style={styles.statusRow}>
          <Pressable
            onPress={() => scannerReady ? blurScanner() : focusScanner({ skipModalCheck: false })}
            style={[styles.scanBtn, scannerReady && styles.scanBtnActive]}
            hitSlop={8}
          >
            <Feather name="maximize" size={11} color={scannerReady ? '#fff' : BLUE} />
            <Text style={[styles.scanBtnText, scannerReady && styles.scanBtnTextActive]}>
              Scan QR
            </Text>
          </Pressable>

          <Pressable onPress={openCameraScanner} style={styles.cameraBtn} hitSlop={8}>
            <Feather name="camera" size={11} color={MID} />
            <Text style={styles.cameraBtnText}>Camera</Text>
          </Pressable>

          <Pressable onPress={onAttachCustomer} style={styles.attachBtn} hitSlop={8}>
            <Feather name="user-plus" size={11} color={MID} />
            <Text style={styles.attachBtnText}>Attach Customer</Text>
          </Pressable>
        </View>
      </View>
    );
  },
);

export default POSCartScannerLayer;

const styles = StyleSheet.create({
  wrapper:           { width: '100%', paddingVertical: 5, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  hiddenInput:       { position: 'absolute', width: 0, height: 0, opacity: 0 },
  statusRow:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scanBtn:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: BLUE_BG },
  scanBtnActive:     { backgroundColor: SCANNER_GREEN },
  scanBtnText:       { fontSize: 11, fontWeight: '700', color: BLUE },
  scanBtnTextActive: { color: '#fff' },
  cameraBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: GREY_BG },
  cameraBtnText:     { fontSize: 11, fontWeight: '700', color: MID },
  attachBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: GREY_BG },
  attachBtnText:     { fontSize: 11, fontWeight: '700', color: MID },
});
