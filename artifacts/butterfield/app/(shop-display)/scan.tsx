import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { StampScanScreen } from '@/components/StampScanScreen';

function useIsFocused(): boolean {
  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );
  return isFocused;
}

export default function ShopDisplayScanScreen() {
  const isFocused = useIsFocused();
  const hidInputRef = useRef<TextInput>(null);
  const hidBuffer = useRef('');
  const [externalScanData, setExternalScanData] = useState<string | null>(null);

  // Keep the hidden TextInput focused to capture Bluetooth HID scanner input.
  // BT scanners act as keyboards: they type barcode chars then send Return/Enter.
  // We use a programmatic delayed focus (NOT autoFocus) to avoid iOS 18 showing
  // the dictation/microphone bubble on tab entry.
  const focusHid = useCallback(() => {
    setTimeout(() => hidInputRef.current?.focus(), 350);
  }, []);

  useEffect(() => {
    if (isFocused) focusHid();
    // Do NOT refocus on blur — the constant focus-fighting is what triggers
    // the iOS dictation bubble. If a system gesture steals focus briefly
    // that is acceptable; the BT scanner refocuses on next keystroke anyway.
  }, [isFocused, focusHid]);

  const handleScanHandled = useCallback(() => {
    setExternalScanData(null);
    hidBuffer.current = '';
    focusHid();
  }, [focusHid]);

  if (!isFocused) return <View style={{ flex: 1 }} />;

  return (
    <>
      <StampScanScreen
        externalScanData={externalScanData}
        onExternalScanHandled={handleScanHandled}
      />

      {/*
        Hidden TextInput that captures Bluetooth HID scanner keystrokes.
        Props chosen to suppress all iOS keyboard/dictation UI:
          showSoftInputOnFocus={false} — no software keyboard
          keyboardType="ascii-capable" — disables dictation mic on iOS
          textContentType="none"       — no autofill/suggestion bar
          autoCorrect={false}          — no autocorrect bar
          spellCheck={false}           — no spellcheck underlines
          autoCapitalize="none"        — no shift
        We do NOT use autoFocus (triggers iOS 18 dictation bubble) nor
        onBlur-refocus loops (same problem). We focus programmatically
        on tab entry only.
      */}
      <TextInput
        ref={hidInputRef}
        style={{ position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' }}
        showSoftInputOnFocus={false}
        keyboardType="ascii-capable"
        textContentType="none"
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        caretHidden
        blurOnSubmit={false}
        onChangeText={(t) => { hidBuffer.current = t; }}
        onSubmitEditing={() => {
          const val = hidBuffer.current.trim();
          if (val.length > 0) setExternalScanData(val);
          hidBuffer.current = '';
          setTimeout(() => hidInputRef.current?.focus(), 600);
        }}
      />
    </>
  );
}
