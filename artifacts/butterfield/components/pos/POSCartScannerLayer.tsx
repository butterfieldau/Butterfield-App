import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
    const anyModalOpenRef = useRef(anyModalOpen);
    anyModalOpenRef.current = anyModalOpen;
    const currentTextRef  = useRef('');

    const [scanValue, setScanValue]       = useState('');
    const [scannerReady, setScannerReady] = useState(false);

    // ── Arm / disarm ─────────────────────────────────────────────────────────
    const armScanner = useCallback(() => {
      if (anyModalOpenRef.current) return;
      ignoreBlurRef.current = true;
      setScannerReady(true);
      setTimeout(() => { inputRef.current?.focus(); }, 50);
      setTimeout(() => { ignoreBlurRef.current = false; }, 350);
    }, []);

    const disarmScanner = useCallback(() => {
      ignoreBlurRef.current = true;
      setScannerReady(false);
      inputRef.current?.blur();
      setTimeout(() => { ignoreBlurRef.current = false; }, 350);
    }, []);

    // External ref — TicketPanel can call this but we no longer use it for
    // auto-arming after notes/code inputs blur.
    useImperativeHandle(ref, () => ({ focus: armScanner }), [armScanner]);

    // Hard-disarm whenever a modal opens. Do NOT re-arm when it closes —
    // re-arming automatically was what was stealing focus from other inputs.
    useEffect(() => {
      if (anyModalOpen) disarmScanner();
    }, [anyModalOpen, disarmScanner]);

    // ── Scan processing ───────────────────────────────────────────────────────
    const clean = (v: string) => v.replace(/[\n\r]/g, '').trim();
    // Require BUTTERFIELD: prefix — stops partial mid-stream payloads from
    // reaching the API before the scanner has finished sending the full code.
    const looksLikeQR = (v: string) => clean(v).startsWith('BUTTERFIELD:') && clean(v).length >= 20;

    const processScan = useCallback(async (raw: string) => {
      const value = clean(raw);
      if (!value || !looksLikeQR(value)) return;

      const now  = Date.now();
      const last = lastScanRef.current;
      if (last && last.value === value && now - last.time < 2000) {
        setScanValue('');
        armScanner();
        return;
      }
      if (scanLockRef.current) return;

      scanLockRef.current = true;
      lastScanRef.current = { value, time: now };
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      try {
        await attachCustomerToCart(value);
      } catch {
        // Banner shown inside attachCustomerToCart
      } finally {
        setScanValue('');
        // Re-arm after a scan so batch scanning works — the user explicitly
        // put the scanner in scan mode so we keep it there.
        setTimeout(() => {
          scanLockRef.current = false;
          armScanner();
        }, 400);
      }
    }, [attachCustomerToCart, armScanner]);

    const handleChangeText = useCallback((text: string) => {
      currentTextRef.current = text;
      setScanValue(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (looksLikeQR(text)) processScan(text);
      }, 150);
    }, [processScan]);

    // Use the ref, not the React state — avoids stale-closure bug where
    // onSubmitEditing fires before the batched state update commits.
    const handleSubmit = useCallback(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      processScan(currentTextRef.current);
    }, [processScan]);

    const handleBlur = useCallback(() => {
      if (ignoreBlurRef.current) return;
      setScannerReady(false);
    }, []);

    useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

    return (
      <View style={styles.wrapper}>
        {/* Zero-size on-screen input — captures Bluetooth HID scanner keystrokes.
            editable={false} when any modal is open as a hard gate — even if iOS
            somehow keeps this input focused it cannot swallow keystrokes. */}
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
          spellCheck={false}
          textContentType="none"
          caretHidden
          blurOnSubmit={false}
          submitBehavior="submit"
          showSoftInputOnFocus={false}
          keyboardType="ascii-capable"
          style={styles.hiddenInput}
        />
        <View style={styles.statusRow}>
          {/* Tap to arm (green) / tap again to disarm (grey) */}
          <Pressable
            onPress={() => scannerReady ? disarmScanner() : armScanner()}
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
            <Text style={styles.attachBtnText}>Customer</Text>
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
  statusRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' },
  scanBtn:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 5, borderRadius: 8, backgroundColor: BLUE_BG },
  scanBtnActive:     { backgroundColor: SCANNER_GREEN },
  scanBtnText:       { fontSize: 11, fontWeight: '700', color: BLUE },
  scanBtnTextActive: { color: '#fff' },
  cameraBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 5, borderRadius: 8, backgroundColor: GREY_BG },
  cameraBtnText:     { fontSize: 11, fontWeight: '700', color: MID },
  attachBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 5, borderRadius: 8, backgroundColor: GREY_BG },
  attachBtnText:     { fontSize: 11, fontWeight: '700', color: MID },
});
